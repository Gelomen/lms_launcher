<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest, onWinMaxChanged, onUpdateDownloadProgress, onTrayUpdateRequest, onTraySettingsRequest, onQlData, onQlExit, type DownloadUpdateResult, type RunUpdateResult } from './ipc';
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
import GpuModule from './modules/GpuModule.vue';
import QuickLaunch from './modules/QuickLaunch.vue';
import { LOG_TABS, QL_TAB_PREFIX, qlTabId, type LogTabId, type LogTabItem } from './modules/log-tabs';
import { truncateByWidth } from './util/truncate';
// 类型只有一份真源（主进程配置层），与 QuickLaunch.vue:13 同一先例：import type 在构建期被擦除
import type { QuickLaunchEntry, QuickLaunchList } from './src-main/quick-launch-config';
import ConfirmDialog from './components/ConfirmDialog.vue';
import UpdateModal from './modules/UpdateModal.vue';
import SettingsModal from './modules/SettingsModal.vue';
import { t, errFromIpc, errTextOf, type ErrFields } from './i18n';

// frameless winbar：最小化 / 最大化(还原) / 关闭 三键（自绘，替代系统标题栏）
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faWindowMinimize, faXmark } from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faWindowMaximize, faWindowRestore } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
// logo：单一真源 src-main/icon.ico（用户已验收的像素，与任务栏图标同源；vite 输出为静态资源）
import logoUrl from '../src-main/icon.ico?url';
config.autoGenerateCss = true;
// 用户偏好 regular 优先：最大化/还原用 regular（fr）；最小化/关闭保留 solid（LaunchBar 同原则）
library.add(faWindowMinimize, faWindowMaximize, faWindowRestore, faXmark, faGithub);
const byPrefixAndName = { fat: { 'window-minimize': faWindowMinimize, 'window-maximize': faWindowMaximize, 'window-restore': faWindowRestore } };

// 全局状态（任务 8）：App 持有 logLines / state，下发给模块 3/4；启动/停止由 LaunchBar emit → App 调 invoke。
interface ServerState { running: boolean; stopping: boolean; configId: string | null; starting?: boolean }
interface LogEntry { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }

const MAX_LINES = 500; // 全仓唯一裁剪处——LaunchBar/LogPanel 不重复实现
// 日志按 tab 分桶（stream 判据路由：sys → launcher；out/err → llama-server）。每桶独立裁剪，互不挤占。
const logBuckets = ref<Record<LogTabId, LogEntry[]>>({ launcher: [], 'llama-server': [] });
const state = ref<ServerState>({ running: false, stopping: false, configId: null });
const configsReloadKey = ref(0); // TemplateModule 保存/删除后 bump（ref，Vue 响应式追踪）
// 正在运行的 llama-server 配置 id（运行态唯一来源 = 上方 state，C1 与 QuickLaunch 的 qlStates 下发同构）：
// TemplateModule 据此比对 editingId → 编辑运行中的模板时弹窗 [删除] 禁用 + tooltip（QuickLaunchModal I-1 镜像，2026-10-19）。
const runningConfigId = computed(() => (state.value.running || state.value.stopping) ? state.value.configId : null);
const exitConfirm = ref(false); // 共用二次确认：托盘「退出」/ 更新 ready 后「重启应用」→ 同一 ConfirmDialog（规格 2026-09-01-update-modal §D）
const exitAction = ref<'exit' | 'run_update'>('exit'); // 确认框 confirm 时的动作分流
const version = ref(''); // 顶栏版本号（get_version IPC → app.getVersion；获取失败静默，不显示）

// 自动更新（规格 2026-09-01-update-modal）：检查更新弹窗 + 七态状态机（App 持有，UpdateModal 纯 props 驱动）
type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
const updateOpen = ref(false); // 弹窗开关；入口统一（托盘「检查更新」/ 顶栏「有新版本!」→ 只开弹窗，不 re-check）
const settingsOpen = ref(false); // 设置弹窗（2026-10-01 update-proxy-settings）：托盘「设置」→ SettingsModal
// 2026-10-05 i18n 响应性修复：错误文案存「key(+params) / 原文」三通道，渲染时 t() 翻译（切语言即时重译）
const updateState = ref<{ phase: UpdatePhase; version: string; pct: number } & ErrFields>({
  phase: 'idle', version: '', pct: 0,
});
// 清空错误三通道（对象展开用；显式置 undefined 保持字段形状稳定）
const NO_ERR: ErrFields = { errorKey: undefined, errorParams: undefined, errorRaw: undefined };
// 状态行：恒单行，数据驱动便于扩展（UpdateModal items 契约）
// llama.cpp 更新由 UpdateModal 内部管理，不再作为信号项传入
// 2026-09-18：localVersion 随 items 下发（= 顶栏版本号，onMounted 经 get_version 取得）——
// UpdateModal 在 idle/checking 态中段显示，打开弹窗即见当前版本（此前该区间默认空白）
const updateItems = computed(() => [
  { name: t('app.brand'), localVersion: version.value, ...updateState.value },
]);
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
const GITHUB_URL = 'https://github.com/Gelomen/lms_launcher';
// winbar GitHub 徽标：经 open_external IPC 用默认浏览器打开（主进程协议白名单校验）；失败静默（无 UI 后果）
function onOpenGithub(): void { void invoke('open_external', GITHUB_URL).catch(() => {}); }

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
  appendSys(r.ok ? t('log.dirvalid.ok', { dir: r.dir }) : t('log.dirvalid.missing', { dir: r.dir }));
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
    appendSys(isMissing(msg) ? t('log.app.start.missing', { msg })
      : isValidation(msg) ? t('log.app.start.invalid', { msg })
      : t('log.app.start.fail', { msg }), ['llama-server']);
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
    appendSys(t('log.app.start.fail', { msg: errMsg(e) }), ['llama-server']);
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
    appendSys(t('log.app.exit', { code: e.code }), ['llama-server']);
  }));
  // 快捷启动（任务 13）：两个事件桥各订阅一次 —— 页签输出按 tabId 派发、进程退出只回落运行态
  unsubs.push(onQlData((e) => onQlDataEvent(e)));
  unsubs.push(onQlExit((e) => onQlExitEvent(e)));
  // 会话恢复：窗口重载时读一次主进程状态（进程可能仍在跑）
  try {
    const s = await invoke<ServerState>('get_state');
    state.value = { running: s.running, stopping: s.stopping, configId: s.configId };
  } catch { /* 首次启动无状态可恢复 */ }
  // 重载复原（规格 §7.6）：主进程仍持有 PTY → 为运行中的 shell 配置重建空页签
  await restoreTerminals();
  // 顶栏版本号：package.json 的 version（主进程 app.getVersion）；非 Electron/IPC 异常 → 静默不显示
  try {
    version.value = await invoke<string>('get_version');
  } catch { /* 版本号缺失不影响应用 */ }
  // 启动时静默检查更新：available → 初始 phase=available（顶栏「有新版本!」按钮 + 弹窗行同步）；失败静默（主进程已写日志）
  try {
    const r = await invoke<UpdateCheckResult>('check_update');
    if (r.available) {
      updateState.value = { phase: 'available', version: r.version, pct: 0 };
      appendSys(t('log.app.update.available', { version: r.version }));
    }
  } catch { /* 检查失败不阻塞启动 */ }
  // 下载进度事件 → 状态机 downloading + pct
  unsubs.push(onUpdateDownloadProgress((e) => {
    updateState.value = { ...updateState.value, phase: 'downloading', pct: e.pct };
  }));
  // 入口统一：托盘「检查更新」→ 只开弹窗，零自动检查（2026 契约：LMS 行静默检查仅 onMounted 一次；
  // 网络检查一律由用户手动点击「检查更新」/「重试」触发——弹窗打开不重查、不重置行状态，
  // 避免覆盖按钮/进度并把 llama.cpp 下拉重置回配置默认值（用户反馈的「重开就重查」bug 的终局）。
  unsubs.push(onTrayUpdateRequest(() => {
    updateOpen.value = true;
  }));
  // 设置（2026-10-01 update-proxy-settings）：托盘「设置」→ SettingsModal
  unsubs.push(onTraySettingsRequest(() => { settingsOpen.value = true; }));
});

// llama.cpp 更新完成事件
function onLlamaComplete(success: boolean, error?: string): void {
  if (success) {
    appendSys(t('log.app.llama.done'));
  } else {
    appendSys(t('log.app.llama.fail', { err: error ?? t('update.err.unknown') }));
  }
}
onUnmounted(() => { for (const u of unsubs) u(); });

function onTemplateChanged(): void {
  configsReloadKey.value += 1; // bump → LaunchBar watch 重新 load()
}

// ---------- 自动更新（规格 2026-09-01-update-modal）：七态状态机 + 弹窗 ----------
async function runCheck(): Promise<void> {
  updateState.value = { ...updateState.value, phase: 'checking', ...NO_ERR };
  let r: UpdateCheckResult;
  try {
    r = await invoke<UpdateCheckResult>('check_update');
  } catch {
    lastFailure.value = 'check';
    updateState.value = { phase: 'error', version: updateState.value.version, pct: 0, errorKey: 'update.err.app.checkUnknown' };
    return;
  }
  if (r.available) {
    lastFailure.value = 'check'; // 非失败动作不清空也无妨，保持显式
    appendSys(t('log.app.update.available', { version: r.version }));
    updateState.value = { phase: 'available', version: r.version, pct: 0 };
    return;
  }
  switch (r.status) {
    case 'up-to-date':
      appendSys(t('log.app.update.latest'));
      updateState.value = { phase: 'up-to-date', version: r.version ?? '', pct: 0 };
      break;
    case 'error':
      lastFailure.value = 'check';
      updateState.value = { phase: 'error', version: '', pct: 0, errorKey: 'update.err.app.checkNetwork' };
      break;
    case 'dev':
      lastFailure.value = 'check';
      updateState.value = { phase: 'error', version: '', pct: 0, errorKey: 'update.err.app.dev' };
      break;
  }
}

async function runDownload(): Promise<void> {
  updateState.value = { ...updateState.value, phase: 'downloading', pct: 0, ...NO_ERR };
  appendSys(t('log.app.update.dlStart'));
  let r: DownloadUpdateResult;
  try {
    r = await invoke<DownloadUpdateResult>('download_update');
  } catch {
    lastFailure.value = 'download';
    updateState.value = { ...updateState.value, phase: 'error', errorKey: 'update.err.app.downloadUnknown' };
    return;
  }
  if (r.ok) {
    appendSys(t('log.app.update.dlDone'));
    updateState.value = { ...updateState.value, phase: 'ready', ...NO_ERR };
    return;
  }
  // 「尚无更新任务」= 渲染端状态机与主进程下载任务失步 → 回落 idle 并自动重新 check（重新同步）
  if (r.code === 'no-update-task') {
    updateState.value = { phase: 'idle', version: updateState.value.version, pct: 0 };
    void runCheck();
    return;
  }
  lastFailure.value = 'download';
  // 日志按事件发生时的语言落定（历史日志不随语言变）：用同一份三通道字段解析出可读原因
  const errFields = errFromIpc(r, 'update.err.unknown');
  appendSys(t('log.app.update.dlFail', { reason: errTextOf(errFields, 'update.err.unknown') }));
  updateState.value = { ...updateState.value, phase: 'error', ...errFields };
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
// finally 复位对话框（主进程 app.exit / spawn 更新脚本后窗口即销毁，此复位是防御性）。
// run_update 失败（更新脚本/更新包缺失、计划任务启动失败）→ 主进程**结构化返回** { ok:false, errorKey }：
// 渲染端走三通道存 key、渲染时翻译（切语言即时重译）；只有意外异常才落 errorRaw 原文透传（不可译技术消息）。
function onExitConfirmed(): void {
  const action = exitAction.value;
  const closeDialog = (): void => { exitConfirm.value = false; };
  if (action !== 'run_update') {
    invoke('exit_app').catch(() => { /* 退出失败无 UI 后果 */ }).finally(closeDialog);
    return;
  }
  invoke<RunUpdateResult>('run_update')
    .then((r) => {
      // 成功路径：主进程 app.exit(0) 直接终止进程，不会走到这里；r.ok === false 才是失败
      if (r.ok) return;
      const fields = errFromIpc(r, 'update.err.unknown');
      appendSys(t('log.app.update.runFail', { err: errTextOf(fields, 'update.err.unknown') }));
      updateState.value = { ...updateState.value, phase: 'ready', ...fields };
    })
    .catch((e) => {
      appendSys(t('log.app.update.runFail', { err: errMsg(e) }));
      updateState.value = { ...updateState.value, phase: 'ready', errorRaw: errMsg(e) };
    })
    .finally(closeDialog);
}

// §D 共用退出确认 @close（[取消]/遮罩）：复位开关与动作；run_update 入口取消时保持 ready 态
function onExitClose(): void {
  exitConfirm.value = false;
  exitAction.value = 'exit';
}

// ---------- 快捷启动（任务 13）：终端页签状态 / 数据路由 / 重载复原（规格 §9.2 / §7.5 / §7.6）----------
// 进程与页签的所有权在 App：卡片只接收 states（任务 11 的 props），ql-data / ql-exit 也只订阅一次。
interface QlProcState { running: boolean; stopping: boolean }
// name：建页签当时的那份配置名（修复轮 B · Minor 2）。页签文案此前每次回查 qlConfigs 只读镜像，
// 条目被删除（已停止的条目可以删）后镜像里没有它 → 页签名退化成配置 id。名字因此随页签存一份。
interface QlTabRef { id: string; configId: string; name: string }
interface TerminalViewHandle { fit: (force?: boolean) => void; focus: () => void }

const qlTabs = ref<QlTabRef[]>([]);
const qlStates = ref<Record<string, QlProcState>>({});
const terminalSinks = new Map<string, (data: string) => void>();
// 页签文案的构造方是 App（索引 K26(2)：截断归构造方，LogPanel 不二次截断），所以这里要配置名；
// 复原时还要按 type 过滤（索引 K11(5)：ql_states 的 running 不区分 shell/exe）。
// 列表数据的所有权仍在卡片（索引 K29）：这里只留一份只读镜像，卡片 changed 时刷新。
const qlConfigs = ref<Record<string, QuickLaunchEntry>>({});
// 激活态归 App（索引 K27(1)）：经 v-model:active 下发；启动 / 新建 / 复原时置为对应终端页签
const activeTabId = ref<string>(LOG_TABS[0].id);
const terminalViews = new Map<string, TerminalViewHandle>();
const qlStarting = new Set<string>(); // 索引 K14(2)：ql_start 带最坏约 9s 的终端探测，重复点击只发一次

const TAB_LABEL_BUDGET = 16; // 规格 §11-1：页签的宽度预算 16（列表行 30 在卡片侧）

// 两种页签共存（规格 §9.1）：静态两页签仍由 LOG_TABS 生成（label === fullLabel ⇒ LogPanel 不挂 title），
// 终端页签追加在后。closeDisabled = 该配置仍在运行 / 停止中（R3：那时关页签会留下孤儿 PTY）。
const logTabItems = computed<LogTabItem[]>(() => {
  const statics: LogTabItem[] = LOG_TABS.map((tab) => ({
    id: tab.id, label: tab.label, fullLabel: tab.label, kind: 'text', closable: false, closeDisabled: false,
  }));
  const terminals: LogTabItem[] = qlTabs.value.map((tab) => {
    // Minor 2：文案取页签自己存的 name（构造方 = 下面的 openTerminalTab），不回查镜像；
    // 镜像只用于 type 过滤（索引 K11(5)）。截断仍在这里做（索引 K26(2)：LogPanel 不二次截断）。
    const full = tab.name;
    const s = qlStates.value[tab.configId];
    return {
      id: tab.id,
      label: truncateByWidth(full, TAB_LABEL_BUDGET),
      fullLabel: full,
      kind: 'terminal',
      closable: true,
      closeDisabled: !!s && (s.running || s.stopping),
      configId: tab.configId,
    };
  });
  return [...statics, ...terminals];
});

function hasTerminalTab(configId: string): boolean {
  return qlTabs.value.some((t) => t.id === qlTabId(configId));
}

// 建页签（已存在则不重复建）+ 自动激活（规格 §9.2）。返回值 = 是不是「同一页签再次启动」
function openTerminalTab(configId: string): boolean {
  const restart = hasTerminalTab(configId);
  if (!restart) {
    // 名字来源 = qlConfigs 只读镜像（卡片 changed 时刷新；restoreTerminals 先刷镜像再建页签）。
    // 镜像此刻缺项只影响这一份文案的兜底（= 配置 id），此后不再随镜像变化（Minor 2）。
    const name = qlConfigs.value[configId]?.name ?? configId;
    qlTabs.value = [...qlTabs.value, { id: qlTabId(configId), configId, name }];
  }
  activeTabId.value = qlTabId(configId);
  return restart;
}

function clearQlState(configId: string): void {
  const next = { ...qlStates.value };
  delete next[configId];
  qlStates.value = next;
}

// 数据路由（规格 §9.2）：TerminalTabView 挂载时经 LogPanel 把 sink 交上来，卸载时注销。
// 注册发生在该页签自己的 onMounted 里，所以此刻 getCurrentInstance() 就是那个页签 —— 顺手记下它
// expose 出来的 fit / focus（索引 K23(2)：任务 13 改不到该组件，只能用它暴露的接口）。
function registerTerminalSink(id: string, sink: (data: string) => void): void {
  terminalSinks.set(id, sink);
  const exposed = (getCurrentInstance() as unknown as { exposed?: TerminalViewHandle } | null)?.exposed;
  if (exposed && typeof exposed.fit === 'function' && typeof exposed.focus === 'function') {
    terminalViews.set(id, exposed);
  }
}

function unregisterTerminalSink(id: string): void {
  terminalSinks.delete(id);
  terminalViews.delete(id);
}

// 按 tabId 派发；未知 tabId 直接忽略（防竞态：页签已关、主进程的输出还在推）
function onQlDataEvent(e: { tabId: string; data: string }): void {
  terminalSinks.get(e.tabId)?.(e.data);
}

// 索引 K2：需要 configId 处一律按前缀反解，不新增 API
function configIdOfTab(tabId: string): string {
  return tabId.slice(QL_TAB_PREFIX.length);
}

// 索引 M8：没有页签（含 exe 配置）就没有可写的终端；停止中也不发（PTY 已 kill）
function terminalWritable(configId: string): boolean {
  const s = qlStates.value[configId];
  return hasTerminalTab(configId) && !!s && s.running && !s.stopping;
}

function onTerminalInput(tabId: string, data: string): void {
  const configId = configIdOfTab(tabId);
  if (!terminalWritable(configId)) return;
  invoke('ql_write', configId, data).catch(() => { /* 写入失败无界面后果 */ });
}

function onTerminalResize(tabId: string, cols: number, rows: number): void {
  const configId = configIdOfTab(tabId);
  // 主进程对「没有实例 / 非 shell」的 resize 抛 STATE:（quick-launch.ts:297-301）→ 与 write 同一道守卫
  if (!terminalWritable(configId)) return;
  invoke('ql_resize', configId, cols, rows).catch(() => { /* 下一次 fit 会补报 */ });
}

// 页签文案 / type 镜像：卡片 changed（保存 / 删除 / 复制）后刷新；失败只影响文案（用配置 id 兜底）
async function refreshQlConfigs(): Promise<void> {
  try {
    const list = await invoke<QuickLaunchList>('ql_list');
    qlConfigs.value = list?.items ?? {};
  } catch { /* ql_list 正常不抛（规格 §5.2），真错误由卡片自己的错误区显示 */ }
}

// 点卡片的 [启动]（规格 §7.5）：shell 返回 tabId → 建页签 + 激活 + fit + 聚焦；
// exe 返回 null → 不建页签，只有行按钮变红（E7）
async function doQlStart(configId: string): Promise<void> {
  if (qlStarting.has(configId)) return; // 索引 K14(2)：单飞
  qlStarting.add(configId);
  // 修复轮 B · I-2：ql_start 带最坏 ≈9s 的终端探测，在途期间界面必须给反馈（旧行为 = 按钮毫无变化）。
  // 复用既有的「正在停止」视觉语言：QuickLaunch.vue:171 的 stopping 分支（红底 + 半角三点 + 禁用），
  // 与 LaunchBar.vue:129 逐字一致（索引 K30(1)）——不新增 CSS 类、不新增 i18n 键。
  // 成功分支：try 内的赋值把 stopping 置回 false（进程真退出由 ql-exit 事件负责清空）；
  // 失败分支：catch 里既有的 clearQlState 兜住，不会卡在「...」。
  qlStates.value = { ...qlStates.value, [configId]: { running: true, stopping: true } };
  try {
    const r = await invoke<{ tabId: string | null }>('ql_start', configId);
    qlStates.value = { ...qlStates.value, [configId]: { running: true, stopping: false } };
    if (r?.tabId) {
      const restart = openTerminalTab(configId);
      await nextTick(); // 新页签要先挂载，fit / focus 才有对象
      const view = terminalViews.get(qlTabId(configId));
      // 索引 K24(1)：fit 默认不重报尺寸。新建页签的首报由页签挂载自己完成（再去重会吞掉重复），
      // 而「同一页签再次启动」时主进程把 PTY 重建为 80×24、容器尺寸没变，必须强制重报（索引 K11(2)）
      view?.fit(restart);
      view?.focus();
    }
  } catch {
    clearQlState(configId); // 失败回落绿 [启动]；原因行由主进程的 sys 日志负责，渲染端不重复
  } finally {
    qlStarting.delete(configId);
  }
}

async function doQlStop(configId: string): Promise<void> {
  if (qlStates.value[configId]?.stopping) return;
  qlStates.value = { ...qlStates.value, [configId]: { running: true, stopping: true } }; // 行按钮 → 红「...」禁用
  try {
    await invoke('ql_stop', configId);
  } catch { /* 不停在「...」：按已停止处理 */ }
  clearQlState(configId); // 页签保留（规格 §7.5），[x] 转可用（R3）
}

// 进程退出（规格 §7.5）：运行态清空、页签保留（用户决策）
function onQlExitEvent(e: { configId: string; code: number }): void {
  clearQlState(e.configId);
}

// 页签 [x]（规格 §7.5）：running || stopping 时不关；关掉当前激活页签后由 v-model:active 回写，不留空白面板
function onTerminalClose(tabId: string): void {
  const tab = qlTabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  const s = qlStates.value[tab.configId];
  if (s && (s.running || s.stopping)) return;
  qlTabs.value = qlTabs.value.filter((t) => t.id !== tabId);
  unregisterTerminalSink(tabId); // 页签卸载时也会注销，这里不依赖卸载时机
}

// 窗口重载复原（规格 §7.6）：主进程仍持有 PTY → 为运行中的配置重建**空**页签（历史不回放，F5）。
// 先取 ql_list 再取 ql_states：running 里混着 exe 配置（索引 K11(5) / M7），只给 shell 建页签。
async function restoreTerminals(): Promise<void> {
  await refreshQlConfigs();
  let states: Record<string, QlProcState> = {};
  try {
    states = (await invoke<Record<string, QlProcState>>('ql_states')) ?? {};
  } catch {
    return; // 主进程不可达：没有可复原的终端
  }
  // 运行态整表下发（exe 配置重载后行按钮也应是红的），页签只给 shell 建
  qlStates.value = states;
  const restored = Object.keys(states).filter((configId) => {
    const s = states[configId];
    return !!s && (s.running || s.stopping) && qlConfigs.value[configId]?.type === 'shell';
  });
  for (const configId of restored) openTerminalTab(configId);
  if (restored.length === 0) return;
  await nextTick();
  // 索引 K11(2)：重载后 xterm 是新建的，尺寸必须再报一次；索引 K24(1)：这条路径显式强制重报
  for (const configId of restored) terminalViews.get(qlTabId(configId))?.fit(true);
}

function onQlChanged(): void {
  void refreshQlConfigs();
}
</script>
<template>
  <!-- winbar = App 第二根节点（.layout 之外，fragment 双根）：满宽贴窗口边缘，关闭键贴右缘；整条为拖动区（app-region） -->
    <header class="winbar">
      <div class="winbar__brand">
        <img class="winbar__logo" :src="logoUrl" alt="" draggable="false" />
        <span class="winbar__name">{{ t('app.brand') }}</span>
        <span v-if="version" class="winbar__version">v{{ version }}</span>
        <!-- 自动更新（2026-09-01-update-modal §E）：有新版本 → 圆角紫底按钮；点击只打开检查更新弹窗 -->
        <button
          v-if="updateState.phase === 'available'"
          type="button"
          class="update-pill tip-down"
          :data-tooltip="t('app.update.tip.available', { version: updateState.version })"
          @click="updateOpen = true">{{ t('app.update.pill.available') }}</button>
        <button
          v-else-if="updateState.phase === 'downloading'"
          type="button"
          class="update-pill update-pill--busy tip-down"
          :data-tooltip="t('app.update.tip.downloading', { pct: updateState.pct })"
          @click="updateOpen = true">{{ t('app.update.pill.downloading', { pct: updateState.pct }) }}</button>
        <!-- 2026-10-05：下载完成（ready）→ 按钮保持显示 -->
        <button
          v-else-if="updateState.phase === 'ready'"
          type="button"
          class="update-pill tip-down"
          :data-tooltip="t('app.update.tip.ready', { version: updateState.version })"
          @click="updateOpen = true">{{ t('app.update.pill.ready') }}</button>
      </div>
      <div class="winbar__controls">
        <!-- GitHub 键保留项目公共 tooltip（tip-down 向下定位，同 .update-pill）；三键 tooltip 已移除（2026-09-23：英文 "Close" 的 ::after 未变换盒越过窗口右缘 → 横向滚动条顶出边距），仅留 aria-label -->
        <button class="winbtn winbtn--github tip-down" :data-tooltip="t('app.winbar.github')" :aria-label="t('app.winbar.github')" @click="onOpenGithub"><FontAwesomeIcon :icon="['fab','github']" /></button>
        <button class="winbtn" :aria-label="t('app.winbar.minimize')" @click="onWinMinimize"><FontAwesomeIcon :icon="byPrefixAndName.fat['window-minimize']" /></button>
        <button class="winbtn" :aria-label="maximized ? t('app.winbar.restore') : t('app.winbar.maximize')" @click="onWinToggleMax"><FontAwesomeIcon :icon="maximized ? byPrefixAndName.fat['window-restore'] : byPrefixAndName.fat['window-maximize']" /></button>
        <button class="winbtn winbtn--close" :aria-label="t('app.winbar.close')" @click="onWinClose"><FontAwesomeIcon :icon="['fas','xmark']" /></button>
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
      <div class="card"><TemplateModule :running-config-id="runningConfigId" @changed="onTemplateChanged" /></div>
      <!-- 快捷启动（2026-10-10）：第 3 列，GPU 卡顺移到第 4 列（规格 §4）。卡片自持列表与弹窗（索引 K29），
           App 只下发运行态 states、接 start/stop/changed —— 进程与页签的所有权在 App（规格 §9.2） -->
      <div class="card"><QuickLaunch :states="qlStates" @start="doQlStart" @stop="doQlStop" @changed="onQlChanged" /></div>
      <!-- 系统 GPU（2026-09 挪位）：模板卡片右侧的独立列，与模板卡顶对齐 -->
      <!-- card--gpu：裁切容器，切卡动画屏外层内容裁在卡片边框处（用户 2026-09-10 指定） -->
      <div class="card card--gpu"><GpuModule /></div>
    </section>
    <section class="log-area">
      <!-- 两种页签共存（规格 §9.1）：tabs 由 App 构造（含截断后的短名，索引 K26(2)）；
           active 归 App（索引 K27(1)）→ v-model:active 真回写；四个透传口是终端的数据路由（规格 §9.2） -->
      <LogPanel :tabs="logTabItems" :buckets="logBuckets" v-model:active="activeTabId"
        :register="registerTerminalSink" :unregister="unregisterTerminalSink"
        :on-input="onTerminalInput" :on-resize="onTerminalResize"
        @clear="onLogClear" @close="onTerminalClose" />
    </section>
    <!-- §D 共用退出确认：托盘「退出」(exit_app) 与 更新 ready 后「重启应用」(run_update) 共享；exitAction 分流 -->
    <ConfirmDialog :open="exitConfirm" :title="t('app.exit.title')" :message="t('app.exit.message')" tone="primary"
      :confirm-text="t('common.exit')" @confirm="onExitConfirmed" @close="onExitClose" />
    <!-- 检查更新弹窗（七态由 updateState 驱动；action 事件由 onUpdateAction 分流） -->
    <!-- llama.cpp 更新区域由 UpdateModal 内部管理（Task 7）；此处仅添加 llama event handlers -->
    <UpdateModal :open="updateOpen" :items="updateItems"
      @action="onUpdateAction" @close="() => (updateOpen = false)"
      @llama-complete="onLlamaComplete" />
    <!-- 设置弹窗（2026-10-01 update-proxy-settings）：托盘「设置」入口；close/saved 均关弹窗 -->
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" @saved="settingsOpen = false" />
  </main>
</template>
