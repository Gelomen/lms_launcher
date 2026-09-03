<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest, onWinMaxChanged, onUpdateDownloadProgress, onTrayUpdateRequest } from './ipc';
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
import { LOG_TABS, type LogTabId } from './modules/log-tabs';
import ConfirmDialog from './components/ConfirmDialog.vue';
import UpdateModal from './modules/UpdateModal.vue';

// frameless winbar：最小化 / 最大化(还原) / 关闭 三键（自绘，替代系统标题栏）
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faWindowMinimize, faXmark } from '@fortawesome/free-solid-svg-icons';
import { faWindowMaximize, faWindowRestore } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
// logo：单一真源 src-main/icon.ico（用户已验收的像素，与任务栏图标同源；vite 输出为静态资源）
import logoUrl from '../src-main/icon.ico?url';
config.autoGenerateCss = true;
// 用户偏好 regular 优先：最大化/还原用 regular（fr）；最小化/关闭保留 solid（LaunchBar 同原则）
library.add(faWindowMinimize, faWindowMaximize, faWindowRestore, faXmark);
const byPrefixAndName = { fat: { 'window-minimize': faWindowMinimize, 'window-maximize': faWindowMaximize, 'window-restore': faWindowRestore } };

// 全局状态（任务 8）：App 持有 logLines / state，下发给模块 3/4；启动/停止由 LaunchBar emit → App 调 invoke。
interface ServerState { running: boolean; stopping: boolean; configId: string | null; starting?: boolean }
interface LogEntry { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }

const MAX_LINES = 500; // 全仓唯一裁剪处——LaunchBar/LogPanel 不重复实现
// 日志按 tab 分桶（stream 判据路由：sys → launcher；out/err → llama-server）。每桶独立裁剪，互不挤占。
const logBuckets = ref<Record<LogTabId, LogEntry[]>>({ launcher: [], 'llama-server': [] });
const state = ref<ServerState>({ running: false, stopping: false, configId: null });
const configsReloadKey = ref(0); // TemplateModule 保存/删除后 bump（ref，Vue 响应式追踪）
const exitConfirm = ref(false); // 共用二次确认：托盘「退出」/ 更新 ready 后「重启应用」→ 同一 ConfirmDialog（规格 2026-09-01-update-modal §D）
const exitAction = ref<'exit' | 'run_update'>('exit'); // 确认框 confirm 时的动作分流
const version = ref(''); // 顶栏版本号（get_version IPC → app.getVersion；获取失败静默，不显示）

// 自动更新（规格 2026-09-01-update-modal）：检查更新弹窗 + 七态状态机（App 持有，UpdateModal 纯 props 驱动）
type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
const updateOpen = ref(false); // 弹窗开关；入口统一（托盘「检查更新」/ 顶栏「有新版本!」→ 只开弹窗，不 re-check）
const updateState = ref<{ phase: UpdatePhase; version: string; pct: number; errorText: string }>({
  phase: 'idle', version: '', pct: 0, errorText: '',
});
// 状态行：恒单行，数据驱动便于扩展（UpdateModal items 契约）
const updateItems = computed(() => [{ name: 'LMS 启动器', ...updateState.value }]);
// 最近一次失败类型：error 态「重试」据此分流（check 失败→重发 check；download 失败→重发 download）
const lastFailure = ref<'check' | 'download'>('check');
// check_update IPC 返回类型（与 main.ts UpdateCheckResult 一致）
type UpdateCheckResult =
  | { available: true; status: 'update-available'; version: string }
  | { available: false; status: 'up-to-date'; version?: string }
  | { available: false; status: 'error' }
  | { available: false; status: 'dev' };

// frameless winbar 状态与 handler
const maximized = ref(false);
function onWinMinimize(): void { invoke('win_minimize'); }
function onWinToggleMax(): void { invoke('win_maximize'); }
function onWinClose(): void { invoke('win_close'); } // 隐藏到托盘，不退出

function bucketOf(stream: LogEntry['stream']): LogTabId {
  return stream === 'sys' ? 'launcher' : 'llama-server';
}

function trimBucket(arr: LogEntry[]): void {
  if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES); // 裁最旧，仅本桶
}

function appendLine(e: LogEntry): void {
  const id = bucketOf(e.stream);
  logBuckets.value[id].push(e);
  trimBucket(logBuckets.value[id]);
  // echoTabs（规格 2026-08-31-sys-log-dual-echo §2.1）：主桶之外，对每个已注册且非主桶的
  // tab id 再写一份并各自独立裁剪；未知 id 静默忽略（主/渲染端版本不一致时不崩）
  for (const t of e.echoTabs ?? []) {
    if (t === id || !logBuckets.value[t]) continue;
    logBuckets.value[t].push(e);
    trimBucket(logBuckets.value[t]);
  }
}

// [清空日志]（2026-08-28）：LogPanel @clear 携带 tab id → 只清空该桶（splice(0) 原地清空，
// 保持 ref 数组身份；另一桶不受影响）。日志仅存在于渲染端内存，无 IPC 需触碰。
function onLogClear(tab: LogTabId): void {
  logBuckets.value[tab].splice(0);
}

// sys 行统一 [lms_launcher] 前缀（主进程已发的不重复加）→ launcher 桶
function appendSys(line: string, echoTabs?: string[]): void {
  appendLine({ line: line.startsWith('[lms_launcher]') ? line : '[lms_launcher] ' + line, stream: 'sys', ...(echoTabs ? { echoTabs } : {}) });
}

// DirModule emit → App：目录卡片校验结果（✓/✗）同步写一条「目录校验」sys 行进 launcher 桶（不带括号，与启动检测行同风格）
function onDirValidated(r: { ok: boolean; dir: string }): void {
  appendSys(r.ok ? '目录校验 · llama-server.exe 已找到：' + r.dir : '目录校验 · 未找到 llama-server.exe：' + r.dir);
}

// LaunchBar emit → App：start_server，catch 一律 errMsg + isMissing/isValidation 分类
async function doStart(configId: string): Promise<void> {
  state.value = { ...state.value, starting: true }; // start_server 在途：单按钮（绿[启动]）禁用防重复点击
  try {
    await invoke('start_server', configId); // sys 行「启动配置 · …」由主进程发
    // 本地 state 跟上：running 置 true + 持有 configId——否则单按钮切红 [停止] 的判据缺失，
    // 且下拉锁定逻辑拿不到运行中配置
    state.value = { ...state.value, running: true, stopping: false, starting: false, configId };
  } catch (e) {
    const msg = errMsg(e);
    appendSys(isMissing(msg) ? '启动失败（配置缺失）· ' + msg
      : isValidation(msg) ? '启动失败（校验未过）· ' + msg
      : '启动失败 · ' + msg, ['llama-server']);
    // 启动失败自动恢复绿 [启动]：进程侧已回落 ready，但「启动成功」的分支没跑过 get_state，
    // 此处按主进程权威状态刷新（若启动后进程已即刻退出——端口占用等——也会落到 ready）
    try {
      const s = await invoke<ServerState>('get_state');
      state.value = { running: s.running, stopping: s.stopping, configId: s.configId };
    } catch { /* 主进程不可达时维持原状态 */ }
  }
}

async function doStop(): Promise<void> {
  // 先置 stopping——单按钮随即变红「...」并禁用（防重复点击）；
  // process-exit 落地时 running/stopping 一并复位
  state.value = { ...state.value, stopping: true };
  try {
    await invoke('stop_server'); // sys 行「停止指令已发送」由主进程发；3s 后强杀
    // stopGraceful 返回即视为服务确实停止：立即恢复绿 [启动]。
    // 强杀路径下 process-exit 事件可能稍晚落地（其复位幂等），不能干等它。
    state.value = { running: false, stopping: false, configId: state.value.configId };
  } catch (e) {
    appendSys('停止失败 · ' + errMsg(e), ['llama-server']);
    state.value = { ...state.value, stopping: false }; // 失败回落，不卡在「...」
    // 主进程状态可能已自行回落 ready（stopGraceful 幂等）→ 按权威状态恢复绿 [启动]
    try {
      const s = await invoke<ServerState>('get_state');
      state.value = { running: s.running, stopping: s.stopping, configId: s.configId };
    } catch { /* 主进程不可达时维持原状态 */ }
  }
}

const unsubs: Array<() => void> = [];
onMounted(async () => {
  // 事件：日志流 / 进程退出（桥 onLogLine/onProcessExit）
  unsubs.push(onLogLine((e) => appendLine(e)));
  unsubs.push(onWinMaxChanged((e) => { maximized.value = e.maximized; }));
  // §D 共用退出确认：托盘「退出」→ exitAction='exit' → ConfirmDialog；[确认]才 invoke exit_app
  unsubs.push(onTrayExitRequest(() => {
    exitAction.value = 'exit';
    exitConfirm.value = true; // 主题化对话框；取消/遮罩/ESC 由 @close 复位
  }));
  unsubs.push(onProcessExit((e) => {
    state.value = { ...state.value, running: false, stopping: false };
    appendSys('进程退出 code=' + e.code, ['llama-server']);
  }));
  // 会话恢复：窗口重载时读一次主进程状态（进程可能仍在跑）
  try {
    const s = await invoke<ServerState>('get_state');
    state.value = { running: s.running, stopping: s.stopping, configId: s.configId };
  } catch { /* 首次启动无状态可恢复 */ }
  // 顶栏版本号：package.json 的 version（主进程 app.getVersion）；非 Electron/IPC 异常 → 静默不显示
  try {
    version.value = await invoke<string>('get_version');
  } catch { /* 版本号缺失不影响应用 */ }
  // 启动时静默检查更新：available → 初始 phase=available（顶栏「有新版本!」按钮 + 弹窗行同步）；失败静默（主进程已写日志）
  try {
    const r = await invoke<UpdateCheckResult>('check_update');
    if (r.available) {
      updateState.value = { phase: 'available', version: r.version, pct: 0, errorText: '' };
      appendSys('检查更新 · 发现新版本 v' + r.version);
    }
  } catch { /* 检查失败不阻塞启动 */ }
  // 下载进度事件 → 状态机 downloading + pct
  unsubs.push(onUpdateDownloadProgress((e) => {
    updateState.value = { ...updateState.value, phase: 'downloading', pct: e.pct };
  }));
  // §E 入口统一：托盘「检查更新」→ 只开弹窗（不再 re-check、不弹旧确认框）
  unsubs.push(onTrayUpdateRequest(() => { updateOpen.value = true; }));
});
onUnmounted(() => { for (const u of unsubs) u(); });

function onTemplateChanged(): void {
  configsReloadKey.value += 1; // bump → LaunchBar watch 重新 load()
}

// ---------- 自动更新（规格 2026-09-01-update-modal）：七态状态机 + 弹窗 ----------
async function runCheck(): Promise<void> {
  updateState.value = { ...updateState.value, phase: 'checking', errorText: '' };
  let r: UpdateCheckResult;
  try {
    r = await invoke<UpdateCheckResult>('check_update');
  } catch {
    lastFailure.value = 'check';
    updateState.value = { phase: 'error', version: updateState.value.version, pct: 0, errorText: '检查更新时发生未知错误，请稍后重试。' };
    return;
  }
  if (r.available) {
    lastFailure.value = 'check'; // 非失败动作不清空也无妨，保持显式
    appendSys('检查更新 · 发现新版本 v' + r.version);
    updateState.value = { phase: 'available', version: r.version, pct: 0, errorText: '' };
    return;
  }
  switch (r.status) {
    case 'up-to-date':
      appendSys('检查更新 · 当前已是最新版本');
      updateState.value = { phase: 'up-to-date', version: r.version ?? '', pct: 0, errorText: '' };
      break;
    case 'error':
      lastFailure.value = 'check';
      updateState.value = { phase: 'error', version: '', pct: 0, errorText: '无法连接更新服务器或解析版本信息，请稍后重试。' };
      break;
    case 'dev':
      lastFailure.value = 'check';
      updateState.value = { phase: 'error', version: '', pct: 0, errorText: '开发模式不检查更新' };
      break;
  }
}

async function runDownload(): Promise<void> {
  updateState.value = { ...updateState.value, phase: 'downloading', pct: 0, errorText: '' };
  appendSys('开始下载新版本…');
  let r: { ok: boolean; reason?: string };
  try {
    r = await invoke<{ ok: boolean; reason?: string }>('download_update');
  } catch {
    lastFailure.value = 'download';
    updateState.value = { ...updateState.value, phase: 'error', errorText: '更新下载时发生未知错误，请稍后重试。' };
    return;
  }
  if (r.ok) {
    appendSys('新版本下载完成');
    updateState.value = { ...updateState.value, phase: 'ready', errorText: '' };
    return;
  }
  // 「尚无更新任务」= 渲染端状态机与主进程下载任务失步 → 回落 idle 并自动重新 check（重新同步）
  if (r.reason && r.reason.includes('尚无更新任务')) {
    updateState.value = { phase: 'idle', version: updateState.value.version, pct: 0, errorText: '' };
    void runCheck();
    return;
  }
  lastFailure.value = 'download';
  appendSys('更新下载失败 · ' + (r.reason ?? '未知错误'));
  updateState.value = { ...updateState.value, phase: 'error', errorText: r.reason ?? '未知错误' };
}

// UpdateModal @action：check / download / retry / restart（restart 走共用退出确认框）
function onUpdateAction(_index: number, kind: string): void {
  if (kind === 'check') {
    void runCheck();
  } else if (kind === 'download') {
    void runDownload();
  } else if (kind === 'retry') {
    if (lastFailure.value === 'download') void runDownload();
    else void runCheck();
  } else if (kind === 'restart') {
    exitAction.value = 'run_update'; // §D：复用「退出程序」ConfirmDialog
    exitConfirm.value = true;
  }
}

// §D 共用退出确认 @confirm：按 exitAction 分流（'exit' → exit_app；'run_update' → run_update）。
// finally 复位对话框（主进程 app.exit / spawn update.exe 后窗口即销毁，此复位是防御性）
function onExitConfirmed(): void {
  const action = exitAction.value;
  invoke(action === 'run_update' ? 'run_update' : 'exit_app')
    .finally(() => { exitConfirm.value = false; });
}

// §D 共用退出确认 @close（[取消]/遮罩）：复位开关与动作；run_update 入口取消时保持 ready 态
function onExitClose(): void {
  exitConfirm.value = false;
  exitAction.value = 'exit';
}
</script>
<template>
  <!-- winbar = App 第二根节点（.layout 之外，fragment 双根）：满宽贴窗口边缘，关闭键贴右缘；整条为拖动区（app-region） -->
    <header class="winbar">
      <div class="winbar__brand">
        <img class="winbar__logo" :src="logoUrl" alt="" draggable="false" />
        <span class="winbar__name">LMS 启动器</span>
        <span v-if="version" class="winbar__version">v{{ version }}</span>
        <!-- 自动更新（2026-09-01-update-modal §E）：有新版本 → 圆角紫底按钮；点击只打开检查更新弹窗 -->
        <button
          v-if="updateState.phase === 'available'"
          type="button"
          class="update-pill"
          :title="'发现新版本 v' + updateState.version + '，点击查看并安装'"
          @click="updateOpen = true">有新版本!</button>
        <button
          v-else-if="updateState.phase === 'downloading'"
          type="button"
          class="update-pill update-pill--busy"
          disabled>下载中 {{ updateState.pct }}%</button>
      </div>
      <div class="winbar__controls">
        <button class="winbtn" aria-label="最小化" title="最小化" @click="onWinMinimize"><FontAwesomeIcon :icon="byPrefixAndName.fat['window-minimize']" /></button>
        <button class="winbtn" :aria-label="maximized ? '还原' : '最大化'" :title="maximized ? '还原' : '最大化'" @click="onWinToggleMax"><FontAwesomeIcon :icon="maximized ? byPrefixAndName.fat['window-restore'] : byPrefixAndName.fat['window-maximize']" /></button>
        <button class="winbtn winbtn--close" aria-label="关闭" title="关闭" @click="onWinClose"><FontAwesomeIcon :icon="['fas','xmark']" /></button>
      </div>
  </header>
  <main class="layout">
    <section class="grid">
      <div class="stack">
        <div class="card"><DirModule @validated="onDirValidated" /></div>
        <div class="card">
          <LaunchBar :state="state" :configs-reload-key="configsReloadKey" @start="doStart" @stop="doStop" />
        </div>
      </div>
      <div class="card"><TemplateModule @changed="onTemplateChanged" /></div>
    </section>
    <section class="log-area">
      <LogPanel :buckets="logBuckets" @clear="onLogClear" />
    </section>
    <!-- §D 共用退出确认：托盘「退出」(exit_app) 与 更新 ready 后「重启应用」(run_update) 共享；exitAction 分流 -->
    <ConfirmDialog :open="exitConfirm" title="退出程序" message="将停止 llama-server 并退出，是否确认？" tone="primary"
      @confirm="onExitConfirmed" @close="onExitClose" />
    <!-- 检查更新弹窗（七态由 updateState 驱动；action 事件由 onUpdateAction 分流） -->
    <UpdateModal :open="updateOpen" :items="updateItems"
      @action="onUpdateAction" @close="() => (updateOpen = false)" />
  </main>
</template>
