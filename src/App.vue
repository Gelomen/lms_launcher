<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest } from './ipc';
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';

// 全局状态（任务 8）：App 持有 logLines / state，下发给模块 3/4；启动/停止由 LaunchBar emit → App 调 invoke。
interface ServerState { running: boolean; stopping: boolean; configId: string | null }
interface LogEntry { line: string; stream: 'sys' | 'out' | 'err' }

const MAX_LINES = 500; // 全仓唯一裁剪处——LaunchBar/LogPanel 不重复实现

const logLines = ref<LogEntry[]>([]);
const state = ref<ServerState>({ running: false, stopping: false, configId: null });
const configsReloadKey = ref(0); // TemplateModule 保存/删除后 bump（ref，Vue 响应式追踪）

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

const statusText = computed((): string => {
  if (state.value.stopping) return '停止中…';
  if (state.value.running) return state.value.configId !== null ? state.value.configId + ' · 运行中' : '运行中';
  return '就绪';
});

// LaunchBar emit → App：start_server，catch 一律 errMsg + isMissing/isValidation 分类
async function doStart(configId: string): Promise<void> {
  try {
    await invoke('start_server', configId); // sys 行「启动配置 · …」由主进程发
  } catch (e) {
    const msg = errMsg(e);
    appendSys(isMissing(msg) ? '启动失败（配置缺失）· ' + msg
      : isValidation(msg) ? '启动失败（校验未过）· ' + msg
      : '启动失败 · ' + msg);
  }
}

async function doStop(): Promise<void> {
  try {
    await invoke('stop_server'); // sys 行「停止指令已发送」由主进程发；3s 后强杀
  } catch (e) {
    appendSys('停止失败 · ' + errMsg(e));
  }
}

const unsubs: Array<() => void> = [];
onMounted(async () => {
  // 事件：日志流 / 进程退出（桥 onLogLine/onProcessExit）
  unsubs.push(onLogLine((e) => appendLine(e)));
  // §4.6：托盘「退出」→ 确认后 stopGraceful + app.exit(0)（主进程 exit_app，任务 5）
  unsubs.push(onTrayExitRequest(() => {
    if (window.confirm('将停止 llama-server 并退出，确认？')) void invoke('exit_app');
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
</script>
<template>
  <main class="layout">
    <h1 class="app-title">lms_launcher</h1>
    <section class="grid">
      <div class="stack">
        <div class="card"><DirModule /></div>
        <div class="card">
          <LaunchBar :state="state" :status-text="statusText" :configs-reload-key="configsReloadKey" @start="doStart" @stop="doStop" />
        </div>
      </div>
      <div class="card"><TemplateModule @changed="onTemplateChanged" /></div>
    </section>
    <section class="log-area">
      <LogPanel :lines="logLines" />
    </section>
  </main>
</template>
