<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest, onWinMaxChanged } from './ipc';
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

// frameless winbar：最小化 / 最大化(还原) / 关闭 三键（自绘，替代系统标题栏）
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faMinus, faMaximize, faMinimize, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
config.autoGenerateCss = true;
library.add(faMinus, faMaximize, faMinimize, faXmark);

// 全局状态（任务 8）：App 持有 logLines / state，下发给模块 3/4；启动/停止由 LaunchBar emit → App 调 invoke。
interface ServerState { running: boolean; stopping: boolean; configId: string | null; starting?: boolean }
interface LogEntry { line: string; stream: 'sys' | 'out' | 'err' }

const MAX_LINES = 500; // 全仓唯一裁剪处——LaunchBar/LogPanel 不重复实现

const logLines = ref<LogEntry[]>([]);
const state = ref<ServerState>({ running: false, stopping: false, configId: null });
const configsReloadKey = ref(0); // TemplateModule 保存/删除后 bump（ref，Vue 响应式追踪）
const exitConfirm = ref(false); // §4.6：托盘「退出」→ ConfirmDialog（主题化二次确认），替代系统 window.confirm

// frameless winbar 状态与 handler
const maximized = ref(false);
function onWinMinimize(): void { invoke('win_minimize'); }
function onWinToggleMax(): void { invoke('win_maximize'); }
function onWinClose(): void { invoke('win_close'); } // 隐藏到托盘，不退出

function appendLine(e: LogEntry): void {
  logLines.value.push(e);
  if (logLines.value.length > MAX_LINES) {
    logLines.value.splice(0, logLines.value.length - MAX_LINES); // 裁最旧
  }
}

// sys 行统一 [lms_launcher] 前缀（主进程已发的不重复加）
function appendSys(line: string): void {
  appendLine({ line: line.startsWith('[lms_launcher]') ? line : '[lms_launcher] ' + line, stream: 'sys' });
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
      : '启动失败 · ' + msg);
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
    appendSys('停止失败 · ' + errMsg(e));
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
  // §4.6：托盘「退出」→ ConfirmDialog（tone=primary）；用户点[确认]才 exit_app（主进程 stopGraceful + app.exit(0)，任务 5）
  unsubs.push(onTrayExitRequest(() => {
    exitConfirm.value = true; // 主题化对话框；取消/遮罩/ESC 由 @close 复位
  }));
  unsubs.push(onProcessExit((e) => {
    state.value = { ...state.value, running: false, stopping: false };
    appendSys('进程退出 code=' + e.code);
  }));
  // 会话恢复：窗口重载时读一次主进程状态（进程可能仍在跑）
  try {
    const s = await invoke<ServerState>('get_state');
    state.value = { running: s.running, stopping: s.stopping, configId: s.configId };
  } catch { /* 首次启动无状态可恢复 */ }
});
onUnmounted(() => { for (const u of unsubs) u(); });

function onTemplateChanged(): void {
  configsReloadKey.value += 1; // bump → LaunchBar watch 重新 load()
}

// §4.6：ConfirmDialog @confirm → exit_app；finally 复位对话框（主进程 app.exit 后窗口即销毁，此复位是防御性）
function onExitConfirmed(): void {
  invoke('exit_app').finally(() => { exitConfirm.value = false; });
}
</script>
<template>
  <main class="layout">
    <header class="winbar">
      <span class="winbar__title">lms_launcher</span>
      <div class="winbar__controls">
        <button class="winbtn" aria-label="最小化" title="最小化" @click="onWinMinimize"><FontAwesomeIcon :icon="['fas','minus']" /></button>
        <button class="winbtn" :aria-label="maximized ? '还原' : '最大化'" :title="maximized ? '还原' : '最大化'" @click="onWinToggleMax"><FontAwesomeIcon :icon="maximized ? ['fas','minimize'] : ['fas','maximize']" /></button>
        <button class="winbtn winbtn--close" aria-label="关闭" title="关闭" @click="onWinClose"><FontAwesomeIcon :icon="['fas','xmark']" /></button>
      </div>
    </header>
    <section class="grid">
      <div class="stack">
        <div class="card"><DirModule /></div>
        <div class="card">
          <LaunchBar :state="state" :configs-reload-key="configsReloadKey" @start="doStart" @stop="doStop" />
        </div>
      </div>
      <div class="card"><TemplateModule @changed="onTemplateChanged" /></div>
    </section>
    <section class="log-area">
      <LogPanel :lines="logLines" />
    </section>
    <!-- §4.6：托盘「退出」二次确认（方案 B：LM Studio 式紧凑对话框；tone=primary 蓝） -->
    <ConfirmDialog :open="exitConfirm" title="退出程序" message="将停止 llama-server 并退出，是否确认？" tone="primary"
      @confirm="onExitConfirmed" @close="() => (exitConfirm = false)" />
  </main>
</template>
