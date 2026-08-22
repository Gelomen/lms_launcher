### 任务 5：IPC 接线（main.ts 补全 + preload.ts + src/ipc.ts）

**文件：**
- 重写：`src-main/main.ts`（加 AppState + 11 个 ipcMain.handle + 日志读取端）
- 重写：`src-main/preload.ts`（contextBridge 完整桥）
- 创建：`src/ipc.ts`（渲染端封装，替代 @tauri-apps/api）

本任务对应 Rust `lib.rs` 的 AppState + 11 个 Tauri 命令 + 日志读取线程。Electron 侧 `ipcMain.handle` 替代 `#[tauri::command]`，`win.webContents.send` 替代 `app.emit_all`。错误语义完全不变——主进程 throw 的 Error message 带「分类: 描述」前缀，渲染端按前缀分类展示（规格 §6），前端判定代码零改动。

**IPC 契约（前端可见）：**

| 命令 | 参数 | 返回 | 错误前缀 |
|---|---|---|---|
| get_app_config | — | AppConfig | — |
| save_llama_dir | dir: string | void | IO |
| validate_dir | dir: string | boolean | — |
| get_params | — | ParamsFile | VALIDATION |
| get_configs | — | ConfigsMap | MISSING / YAML |
| save_config | id, desc, values | void | VALIDATION |
| delete_config | id | void | VALIDATION |
| get_state | — | { running, stopping, configId } | — |
| start_server | configId: string | string（摘要） | VALIDATION / MISSING |
| stop_server | — | void | — |
| exit_app | — | void（杀进程后退出） | — |

**事件：**
- `log-line` → { line: string, stream: "sys" | "out" | "err" }
- `process-exit` → { code: number }
- `tray-exit-request` → {}（任务 9 托盘「退出」确认后触发，渲染端确认后调 exit_app）

- [ ] **步骤 1：main.ts 补全（AppState + 11 个 handler + 日志读取端）**

整体重写 `src-main/main.ts`（保留任务 1 的 createWindow 骨架，加 IPC 层）：

~~~ ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry } from './config';
import type { AppConfig, ParamsFile, ConfigsMap } from './config';
import { prepareLaunch, summarize } from './build';
import { ProcessState } from './process';

// ---------- AppState ----------
const ps = new ProcessState();

// 数据目录：打包后 = exe 所在目录（portable 解压目录，可写）；dev-time = 项目 cwd
function dataDir(): string {
  if (app.isPackaged) return process.execPath ? join(process.execPath, "..") : process.cwd();
  return process.cwd();
}
function yamlPaths(): [string, string, string] {
  const d = dataDir();
  return [join(d, 'lms_launch.yaml'), join(d, 'llama_params.yaml'), join(d, 'llama_launch_configs.yaml')];
}

// ---------- 日志事件 ----------
function mainWin(): BrowserWindow | null {
  const ws = BrowserWindow.getAllWindows();
  return ws.length > 0 ? ws[0] : null;
}
type StreamName = 'sys' | 'out' | 'err';
function emitLog(line: string, stream: StreamName): void {
  const win = mainWin();
  if (win) win.webContents.send("log-line", { line, stream });
}

// ---------- 窗口 ----------
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launch',
    width: 980, height: 720, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('./preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
}

// ---------- IPC 命令（11 个） ----------
ipcMain.handle('get_app_config', (): AppConfig => {
  const [p] = yamlPaths();
  return appConfigLoad(p);
});
ipcMain.handle('save_llama_dir', (_e, dir: string): void => {
  const [p] = yamlPaths();
  appConfigSave(p, { llama_dir: dir.trim() });
});
ipcMain.handle('validate_dir', (_e, dir: string): boolean => {
  return existsSync(join(dir, 'llama-server.exe'));
});
ipcMain.handle('get_params', (): ParamsFile => {
  const [, p] = yamlPaths();
  return paramsLoad(p);
});
ipcMain.handle('get_configs', (): ConfigsMap => {
  const [, , p] = yamlPaths();
  return configsLoad(p); // MISSING: / YAML: 由 config 层抛出，原样传给渲染端
});
ipcMain.handle('save_config', (_e, id: string, desc: string | null, values: Record<string, string>): void => {
  const [, , p] = yamlPaths();
  saveConfigEntry(p, id, desc ?? undefined, values);
});
ipcMain.handle('delete_config', (_e, id: string): void => {
  const [, , p] = yamlPaths();
  deleteConfigEntry(p, id);
});
ipcMain.handle('get_state', () => {
  return { running: ps.isRunning(), stopping: ps.state === "stopping", configId: ps.runningConfigId };
});
// start_server：启动前完整校验（MISSING/VALIDATION 由 build 层抛出），成功后订阅日志流 + 注册退出回调；
// onExit 每次 launch 覆盖（旧进程回调随 close 失效），close 后 state 自动回落 ready
ipcMain.handle('start_server', async (_e, configId: string): Promise<string> => {
  const [appCfgP, pfP, cfgP] = yamlPaths();
  const appCfg = appConfigLoad(appCfgP);
  if (appCfg.llama_dir.trim().length === 0) throw new Error('VALIDATION: 未配置 llama.cpp 目录');
  const pf = paramsLoad(pfP);
  const configs = configsLoad(cfgP); // MISSING: / YAML: 透传
  const args = prepareLaunch(appCfg.llama_dir.trim(), pf, configs, configId); // MISSING: / VALIDATION: 透传
  const summary = summarize(configs[configId], pf);
  await ps.launch(args[0], args.slice(1), configId);
  emitLog("[lms_launch] 启动配置 · " + summary, "sys");
  const { stdout, stderr } = ps.takePipes();
  stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "out"));
  });
  stderr.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "err"));
  });
  ps.onExit((code) => {
    const win = mainWin();
    if (win) win.webContents.send("process-exit", { code });
  });
  return summary;
});
ipcMain.handle('stop_server', async (): Promise<void> => {
  await ps.stopGraceful(3);
  emitLog('[lms_launch] 停止指令已发送', 'sys');
});
ipcMain.handle('exit_app', async (): Promise<void> => {
  await ps.stopGraceful(3);
  app.exit(0);
});
// ---------- app lifecycle ----------
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
~~~

实现要点（执行者）：
1. **dataDir() 打包语义**：electron-builder portable 模式下 exe 自解压到临时目录、app.asar 与 exe 同级——`process.execPath` 的父目录（join(process.execPath, "..")）即可写的数据目录。dev-time 用 cwd（yaml 文件生成在项目根，与 Rust 版 src-tauri fallback 行为一致：dev 数据文件不污染 exe 目录）。
2. **ps.onExit 重复挂**：每次 start_server 都调 `ps.onExit`——ProcessState 的 onExitCb 是单值字段，重复调用覆盖（旧进程回调随 close 已失效），无需清理。close 后 state 回落 ready，drainExit 值保留到下次 launch 清空。

- [ ] **步骤 2：preload.ts 重写（contextBridge 完整桥）**

~~~ ts
import { contextBridge, ipcRenderer } from 'electron';
// 渲染端只能看到这个白名单 API（contextIsolation 下无 Node 直权）
contextBridge.exposeInMainWorld('lms', {
  invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(cmd, ...args),
  onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => {
    const listener = (_e: unknown, payload: { line: string; stream: 'sys' | 'out' | 'err' }) => cb(payload);
    ipcRenderer.on('log-line', listener);
    return () => ipcRenderer.removeListener('log-line', listener);
  },
  onProcessExit: (cb: (e: { code: number }) => void) => {
    const listener = (_e: unknown, payload: { code: number }) => cb(payload);
    ipcRenderer.on('process-exit', listener);
    return () => ipcRenderer.removeListener('process-exit', listener);
  },
  onTrayExitRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-exit-request', listener);
    return () => ipcRenderer.removeListener('tray-exit-request', listener);
  },
});
~~~

- [ ] **步骤 3：src/ipc.ts（渲染端封装，替代 @tauri-apps/api）**

~~~ ts
// 渲染端 IPC 封装——window.lms 由 preload 注入（contextIsolation 下唯一通道）
declare global {
  interface Window {
    lms: {
      invoke: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => () => void;
      onProcessExit: (cb: (e: { code: number }) => void) => () => void;
      onTrayExitRequest: (cb: () => void) => () => void;
    };
  }
}

export function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  return window.lms.invoke(cmd, ...args) as Promise<T>;
}

export function onLogLine(cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void): () => void {
  return window.lms.onLogLine(cb);
}

export function onProcessExit(cb: (e: { code: number }) => void): () => void {
  return window.lms.onProcessExit(cb);
}

export function onTrayExitRequest(cb: () => void): () => void {
  return window.lms.onTrayExitRequest(cb);
}

export const isMissing = (msg: string): boolean => msg.startsWith("MISSING:");
export const isValidation = (msg: string): boolean => msg.startsWith("VALIDATION:");
~~~

- [ ] **步骤 4：tsc 类型检查（main + preload）**

执行者先把 `tsconfig.main.json` 加一行 `"exclude": ["src-main/**/*.test.ts"]`（vitest 自行 transpile 测试，主进程构建不含测试）。然后运行：

~~~ powershell
npx tsc -p tsconfig.main.json --noEmit
~~~

预期：无 TS error。

- [ ] **步骤 5：IPC probe 手动验证**

临时改 `src/App.vue` 为 probe 按钮：

~~~ vue
<script setup lang="ts">
import { invoke } from './ipc';
async function probe(): Promise<void> {
  console.log('app_config =', await invoke('get_app_config'));
  console.log('params =', await invoke('get_params'));
  console.log('configs =', await invoke('get_configs').catch((e: unknown) => String(e)));
  console.log('state =', await invoke('get_state'));
}
</script>
<template>
  <main class="layout"><h1>lms_launch 骨架</h1><button @click="probe">probe</button></main>
</template>
~~~

运行 `npm run dev`，等窗口起来后点 probe 按钮。预期 console：
- `app_config = {llama_dir: ""}`
- `params = {params: {m: "-m", ...}, required: ["m"]}`（cwd/ 下首次自动生成 llama_params.yaml）
- `configs = "MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）"`（error 透传为字符串）
- `state = {running: false, stopping: false, configId: null}`

~~~ vue（验证后还原 App.vue 为任务 6 的布局骨架，见任务 6 步骤 1）~~~

- [ ] **步骤 6：全量测试回归**

~~~ powershell
npx vitest run
~~~

预期：19 PASS。

- [ ] **步骤 7：Commit**

~~~ bash
git add src-main/main.ts src-main/preload.ts src-main/tsconfig.json src/ipc.ts src/App.vue
git commit -m "feat: IPC 接线——11 个命令 + log-line/process-exit/tray-exit-request 事件 + preload 桥"
~~~

---
