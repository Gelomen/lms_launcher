# 审查包 · 任务 6（IPC 接线）

BASE = 8ac9fa9（HEAD 未变：按 K5 实现者不提交）。已跟踪文件的改动在下面的 git diff 里；
新建的 src-main/ipc-ql.test.ts 是**未跟踪**文件，git diff 不显示，故附全文（--no-index 对 /dev/null）。

主代理已独立核过（供你参考，不是结论）：定向 6 文件 `114 passed`、`tsc` exit 0、i18n 硬门 `22 passed`、
`git diff --stat HEAD -- src-main/process.ts src-main/process.test.ts` 为空、范围只含 B1-B5。
另外三条「像偏离其实不是」的事实：(1) `QuickLaunchManager.start()`（quick-launch.ts:232-294）函数体内**没有任何 await**，
所以 main.ts:1011 的 `qlStartContext` 槽在单线程事件循环里只覆盖一次 start()；(2) `onSysLine` 的 `[lms_launcher] ` 前缀
是既有约定（llama-check.ts:23-26）；(3) `const { dialog } = await import('electron')` 是既有写法（main.ts:341/:349），
且 `app.dialog.filterModel` / `app.dialog.filterJinja` 确实在主进程词典里（main.ts:354/:356 在用）。

## git status --porcelain（方括号定界）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-06-ipc-wiring.md
 M src-main/main.ts
 M src-main/preload.ts
 M src/App.test.ts
 M src/ipc.ts
?? src-main/ipc-ql.test.ts
```

## git diff HEAD（已跟踪文件：main.ts / preload.ts / src/ipc.ts / src/App.test.ts）

```diff
diff --git a/src-main/main.ts b/src-main/main.ts
index c0cd215..f483f80 100644
--- a/src-main/main.ts
+++ b/src-main/main.ts
@@ -1,4 +1,4 @@
-import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron';
+import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard } from 'electron';
 import { trayTooltipText } from './tray-tooltip';
 import { applyLang, getLang, t, resolveSystemLang, type Lang } from './i18n';
 // 2026-10-05 i18n 响应性修复：可译错误经 IPC 传 key（渲染端渲染时翻译，切语言即时重译；见 src/i18n.ts errTextOf）
@@ -14,6 +14,11 @@ import { ProcessState } from './process';
 import { startGpuStats } from './gpu-stats';
 import { checkLlamaInstall, installCheckMessage } from './llama-check';
 import { execSync, spawnSync } from 'node:child_process';
+import { homedir } from 'node:os';
+// 快捷启动卡片（2026-10-10-quick-launch-card 任务 6）：配置层（任务 3）/ 探测层（任务 4）/ 进程管理层（任务 5）→ IPC
+import { qlLoad, qlSave, qlDelete, type QuickLaunchEntry, type QuickLaunchList, type TerminalId } from './quick-launch-config';
+import { detectTerminals, type TerminalInfo } from './quick-launch-terminals';
+import { QuickLaunchManager } from './quick-launch';
 
 // 更新调度任务名（schtasks）：2026-09-05 探针矩阵（.temp/decisive4~11）证明本机 Electron 子进程
 // 无论 detached / 非 detached / cmd 包裹 / windowsHide / 双叉 / VBS 均无法既真正执行脚本又
@@ -975,6 +980,149 @@ ipcMain.handle('get_llama_update_config', (): { success: true; config: LlamaUpda
   return { success: true, config: cfg.update ?? {} };
 });
 
+// ---------- 快捷启动（规格 2026-10-10 §5–§8）----------
+// 已定口径 K8（同 quick-launch-config.ts:31-40 / quick-launch.ts:18-25）：err.ql.* 词典键在任务 8 才落地，
+// key-coverage.test.ts:39-41 的 KEY_CALL 只认「t('字面量')」→ 这里用常量映射传 key，不写字面量。
+// 错误前缀只用索引 G7 的五种；本段自己产生的只有 VALIDATION:（配置不存在），其余前缀由被调层自带。
+const QL_IPC_ERR = {
+  notFound: 'err.ql.notFound', // 占位符 {id}（任务 8 表 D7 + 占位符注）
+} as const;
+// 对话框过滤器名（规格 §8「.exe 过滤」）。主进程词典里没有这个键：任务 8 表 C9 的 ql.dialog.filterExe
+// 落在渲染端词典（src/i18n.ts），B2 只往主进程词典加 err.ql.*。这里按主进程命名空间取
+// app.dialog.filterExe（与 :349/:351 的 app.dialog.filterModel / filterJinja 同组），同样走常量映射
+// → key-coverage 扫不到、词典落地前对话框里显示原始 key。已作为疑虑写进任务 6 报告。
+const QL_IPC_LABEL = {
+  filterExe: 'app.dialog.filterExe',
+} as const;
+
+// 快捷启动 yaml（规格 §5.1）：与三份模板 yaml 同目录，但**不进 yamlPaths() 的三元组**——
+// 该函数在多处按位置解构（const [p] / const [, , p]），加第四项会让所有解构错位。
+function qlYamlPath(): string { return join(configDir(), 'quick_launch.yaml'); }
+
+/**
+ * 本次 ql_start 的上下文，供下面两个「构造期注入的同步回调」共用：
+ *   • configId —— QlDeps.spawnExe(exe) 的签名里没有 configId（任务 5 C4 逐字），
+ *     而索引 K13 要求 launch(exe, [], configId)；
+ *   • available —— QuickLaunchManager 的 terminalAvailable(id) 是同步回调，而索引 K10-3 要求
+ *     终端探测（最坏 3×3s）不在主进程里同步阻塞，所以由 handler 先 await 再把结果交给它。
+ * QuickLaunchManager.start() 的 exe 分支在同一个同步 tick 内调用 spawnExe（其前无 await），
+ * 所以这个槽只覆盖一次 start()，finally 里清空，不跨请求残留状态。
+ */
+let qlStartContext: { configId: string; available: Set<TerminalId> } | null = null;
+
+/**
+ * 终端探测的异步包装（索引 K10-3）：先让出一拍再跑探测，使排队中的窗口/托盘事件先被处理。
+ * 探测本身是同步的（quick-launch-terminals.ts 用 spawnSync，规格 §6.1 钉死），最坏 3×3s ≈ 9s；
+ * 规格 §6.1 明确「不跨调用缓存」，所以每次调用都实测。
+ */
+function detectTerminalsAsync(): Promise<TerminalInfo[]> {
+  return new Promise((resolve) => { setImmediate(() => resolve(detectTerminals())); });
+}
+
+/**
+ * exe 类型的进程适配器（索引 K13 / 规格 §7.3）：**每个配置一个新 ProcessState**，
+ * 绝不复用 :59 的 ps 单例——它只持一个 child 与 runningConfigId，会与 llama-server 撞车。
+ * process.ts 本期一行都不改（索引 G4），故按效果满足 §7.3 的「无终端、输出丢弃」：
+ * 其 stdio 是 ["ignore","pipe","pipe"]（process.ts:33），适配器必须 takePipes()（:62）后把
+ * 两路 .resume() 排空丢弃，否则管道写满会阻塞子进程。错误前缀由 ProcessState 自带
+ * （:28 STATE: / :46 PROC:），与索引 K11(4) 一致，这里不再包前缀。
+ * launch() 的函数体内没有 await，调用返回时子进程已 spawn → takePipes() 可同步取到管道；
+ * 其同步失败先接住，takePipes 报错时优先抛原始错误（保留 STATE:/PROC: 原文）。
+ */
+function spawnExeProcess(exe: string, configId: string | null): {
+  onExit(cb: (code: number) => void): void;
+  stopGraceful(s: number): Promise<void>;
+  isRunning(): boolean;
+} {
+  const p = new ProcessState();
+  let launchError: unknown = null;
+  void p.launch(exe, [], configId).catch((e) => { launchError = e; });
+  try {
+    const { stdout, stderr } = p.takePipes();
+    stdout.resume();
+    stderr.resume();
+  } catch (e) {
+    throw launchError instanceof Error ? launchError : e;
+  }
+  return {
+    onExit(cb) {
+      p.onExit((code, error) => {
+        // 启动失败（ENOENT 等）的 PROC 文本进日志区：exe 类型没有页签（与 :326-331 的 llama-server 同模式）
+        if (error) emitLog(error, 'sys');
+        cb(code);
+      });
+    },
+    stopGraceful: (s: number) => p.stopGraceful(s),
+    isRunning: () => p.isRunning(),
+  };
+}
+
+// 一配置一实例的终端进程管理（规格 §7）。两个事件按 §8 逐字下发；exe 类型没有页签，
+// 其反馈走既有日志通道 emitLog(line,'sys')，不新建通道（计划 步骤 3 / check E4）。
+const ql = new QuickLaunchManager(
+  {
+    onData: (tabId, data) => { mainWin()?.webContents.send('ql-data', { tabId, data }); },
+    onExit: (configId, code) => { mainWin()?.webContents.send('ql-exit', { configId, code }); },
+    onSysLine: (_configId, line) => emitLog('[lms_launcher] ' + line, 'sys'),
+    homedir: () => homedir(),
+    spawnExe: (exe) => spawnExeProcess(exe, qlStartContext?.configId ?? null),
+  },
+  (id) => qlStartContext?.available.has(id) ?? false,
+);
+
+// ---------- 快捷启动 IPC（规格 §8 的 12 个通道，名称/参数/返回逐字） ----------
+ipcMain.handle('ql_list', (): QuickLaunchList => qlLoad(qlYamlPath()));
+// §5.3-4「终端当前可用」只在保存路径成立 → 每次保存实测（索引 K10-3：走异步包装，不缓存）
+ipcMain.handle('ql_save', async (_e, id: string | null, entry: QuickLaunchEntry): Promise<string> => {
+  const available = (await detectTerminalsAsync()).map((t) => t.id);
+  return qlSave(qlYamlPath(), id, entry, available);
+});
+// id 不存在 → VALIDATION:（quick-launch-config.ts:159 的 qlDelete 自带，占位符 {id}）
+ipcMain.handle('ql_delete', (_e, id: string): void => {
+  qlDelete(qlYamlPath(), id);
+});
+// 规格 §6.1：每次调用实时探测、不跨调用缓存；handler 必须异步（索引 K10-3，最坏 ≈9s）
+ipcMain.handle('ql_terminals', async (): Promise<TerminalInfo[]> => await detectTerminalsAsync());
+// 规格 §7.5 的「配置存在」这一层不在进程管理层（任务 5 的 start 只拿到 entry），所以在这里查
+ipcMain.handle('ql_start', async (_e, id: string): Promise<{ tabId: string | null }> => {
+  const entry = qlLoad(qlYamlPath()).items[id];
+  if (!entry) throw new Error('VALIDATION: ' + t(QL_IPC_ERR.notFound, { id }));
+  const available = new Set((await detectTerminalsAsync()).map((t) => t.id));
+  qlStartContext = { configId: id, available };
+  try {
+    return await ql.start(id, entry);
+  } finally {
+    qlStartContext = null;
+  }
+});
+// 幂等：quick-launch.ts:311 的 stop() 对未运行的配置直接返回
+ipcMain.handle('ql_stop', async (_e, id: string): Promise<void> => {
+  await ql.stop(id);
+});
+ipcMain.handle('ql_write', (_e, id: string, data: string): void => {
+  ql.write(id, data);
+});
+ipcMain.handle('ql_resize', (_e, id: string, cols: number, rows: number): void => {
+  ql.resize(id, cols, rows);
+});
+ipcMain.handle('ql_states', (): Record<string, { running: boolean; stopping: boolean }> => ql.states());
+// .exe 过滤对话框（照 :343-355 的 open_file_dialog 模式）：取消 / 无窗口 → null，不抛错（check E5）
+ipcMain.handle('ql_pick_exe', async (): Promise<string | null> => {
+  const { dialog } = await import('electron');
+  const win = mainWin();
+  if (!win) return null;
+  const res = await dialog.showOpenDialog(win, {
+    properties: ['openFile'],
+    filters: [{ name: t(QL_IPC_LABEL.filterExe), extensions: ['exe'] }],
+  });
+  return res.canceled ? null : res.filePaths[0];
+});
+// 终端页签的复制/粘贴（规格 §8：file:// 下 navigator.clipboard 不可靠）
+ipcMain.handle('clipboard_read', (): string => clipboard.readText());
+ipcMain.handle('clipboard_write', (_e, text: string): void => {
+  clipboard.writeText(text);
+});
+
 // ---------- app lifecycle ----------
 app.whenReady().then(() => {
   // configs/ 兜底（2026-10-06）：随包已带该目录；用户误删后在此补建，否则后续保存会 ENOENT
diff --git a/src-main/preload.ts b/src-main/preload.ts
index 75e7eee..f7e1c72 100644
--- a/src-main/preload.ts
+++ b/src-main/preload.ts
@@ -57,4 +57,16 @@ contextBridge.exposeInMainWorld('lms', {
     ipcRenderer.on('gpu-stats', listener);
     return () => ipcRenderer.removeListener('gpu-stats', listener);
   },
+  // 快捷启动（规格 2026-10-10 §8）：终端页签的 PTY 输出与进程退出。照 :5-9 的 onLogLine 模式，
+  // 返回 removeListener 清理函数 → 重复订阅/退订不叠加（check E3）
+  onQlData: (cb: (e: { tabId: string; data: string }) => void) => {
+    const listener = (_e: unknown, payload: { tabId: string; data: string }) => cb(payload);
+    ipcRenderer.on('ql-data', listener);
+    return () => ipcRenderer.removeListener('ql-data', listener);
+  },
+  onQlExit: (cb: (e: { configId: string; code: number }) => void) => {
+    const listener = (_e: unknown, payload: { configId: string; code: number }) => cb(payload);
+    ipcRenderer.on('ql-exit', listener);
+    return () => ipcRenderer.removeListener('ql-exit', listener);
+  },
 });
diff --git a/src/App.test.ts b/src/App.test.ts
index 95b8a5e..ab5ae41 100644
--- a/src/App.test.ts
+++ b/src/App.test.ts
@@ -28,6 +28,10 @@ const gpuStatsHandlers: Array<(e: { gpus: unknown[] }) => void> = [];
 const startupLlamaCheckHandlers: Array<(e: { status: string; dir: string }) => void> = [];
 // llama.cpp 更新进度事件桥（Task 8）：UpdateModal 内通过 ipc.onLlamaUpdateProgress 订阅
 const llamaUpdateProgressHandlers: Array<(e: { percent: number; stage: string }) => void> = [];
+// 快捷启动（任务 6）：ql-data / ql-exit 事件桥。任务 6 只接线不驱动（渲染端订阅在任务 13），
+// 这里按既有「捕获再驱动」的写法登记，供任务 9-13 的用例使用。
+const qlDataHandlers: Array<(e: { tabId: string; data: string }) => void> = [];
+const qlExitHandlers: Array<(e: { configId: string; code: number }) => void> = [];
 vi.mock('./ipc', () => ({
   invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
   errMsg: (e: unknown): string => (e as Error).message,
@@ -44,6 +48,9 @@ vi.mock('./ipc', () => ({
   onGpuStats: (fn: (e: { gpus: unknown[] }) => void) => { gpuStatsHandlers.push(fn); return () => {} },
   // 启动检测事件桥（2026-11）：DirModule onMounted 无条件订阅；App 级测试不驱动该事件（no-op 注册）
   onStartupLlamaCheck: (fn: (e: { status: string; dir: string }) => void) => { startupLlamaCheckHandlers.push(fn); return () => {}; },
+  // 快捷启动事件桥（任务 6）：真实实现在 src/ipc.ts + preload.ts，本文件只登记捕获（任务 13 驱动）
+  onQlData: (fn: (e: { tabId: string; data: string }) => void) => { qlDataHandlers.push(fn); return () => {}; },
+  onQlExit: (fn: (e: { configId: string; code: number }) => void) => { qlExitHandlers.push(fn); return () => {}; },
 }));
 
 const { t: i18nText } = await import('./i18n');
@@ -1077,3 +1084,17 @@ describe('i18n / App 外壳（Slice 1）', () => {
     w.unmount();
   });
 });
+
+// ===== 任务 6：快捷启动 IPC 接线（计划 :266-274）=====
+// 前两条断言逐字照计划 :269-273。本文件顶部的 vi.mock('./ipc') 会接管 './ipc'，
+// 只断 mock 里的键就成了自证，所以再加一条走 vi.importActual 的**真实模块**断言（E1）。
+describe('快捷启动 IPC 封装（任务 6）', () => {
+  it('ipc 模块导出终端相关封装', async () => {
+    const mod = await import('./ipc');
+    expect(typeof mod.onQlData).toBe('function');
+    expect(typeof mod.onQlExit).toBe('function');
+    const real = await vi.importActual<typeof import('./ipc')>('./ipc');
+    expect(typeof real.onQlData).toBe('function');
+    expect(typeof real.onQlExit).toBe('function');
+  });
+});
diff --git a/src/ipc.ts b/src/ipc.ts
index 605c971..bb0b2fb 100644
--- a/src/ipc.ts
+++ b/src/ipc.ts
@@ -26,6 +26,9 @@ declare global {
       onGpuStats: (cb: (e: { gpus: GpuStats[] }) => void) => () => void;
       onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => () => void;
       onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => () => void;
+      // 快捷启动（规格 2026-10-10 §8 的事件）：ql-data = 终端页签的 PTY 输出；ql-exit = 进程退出
+      onQlData: (cb: (e: { tabId: string; data: string }) => void) => () => void;
+      onQlExit: (cb: (e: { configId: string; code: number }) => void) => () => void;
     };
   }
 }
@@ -106,3 +109,14 @@ export function onGpuStats(cb: (e: { gpus: GpuStats[] }) => void): () => void {
 export function onStartupLlamaCheck(cb: (e: { status: string; dir: string }) => void): () => void {
   return window.lms.onStartupLlamaCheck(cb);
 }
+
+// 快捷启动（规格 2026-10-10-quick-launch-card-design §8 的两个事件）：
+// ql-data = 终端页签的 PTY 输出（tabId = 'ql:<configId>'）；ql-exit = 进程退出（页签保留、按钮回落）。
+// 返回 preload 的 removeListener 清理函数（照 onLogLine 的用法），订阅方卸载时调用它。
+export function onQlData(cb: (e: { tabId: string; data: string }) => void): () => void {
+  return window.lms.onQlData(cb);
+}
+
+export function onQlExit(cb: (e: { configId: string; code: number }) => void): () => void {
+  return window.lms.onQlExit(cb);
+}
```

## 新增未跟踪文件全文：src-main/ipc-ql.test.ts（347 行）

```diff
+++ b/src-main/ipc-ql.test.ts
@@ -0,0 +1,347 @@
+// src-main/ipc-ql.test.ts
+// 任务 6 的 D6a 自动化形状门（check 表 B5 / 索引 K12(2) 授权本文件）。
+// 做法：vi.mock('electron') 捕获 main.ts 在模块作用域注册的 ipcMain.handle 处理器，直接调用，
+// 断「通道名 / 参数 / 返回形状」与规格 §8（specs/2026-10-10-quick-launch-card-design.md:199-219）逐字一致。
+// 这里只测**接线**：QuickLaunchManager 自身的状态机在 src-main/quick-launch.test.ts（任务 5）已测。
+// 附带两件事：
+//   • 事件载荷（C12）：真起一个 cmd 配置，断 ql-data / ql-exit 的载荷形状（规格 §8 事件表）；
+//   • preload 的两个订阅（check E3）：清理后不再收到 → 重复订阅不叠加。
+// 范围：不改 src-main/process.ts（索引 G4），不新增通道（check F4）。
+import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+
+type Handler = (event: unknown, ...args: unknown[]) => unknown;
+type Listener = (event: unknown, payload: unknown) => void;
+
+const cap = vi.hoisted(() => ({
+  handlers: new Map<string, Handler>(),
+  /** 主进程 → 渲染端的 send（webContents.send） */
+  sends: [] as Array<{ channel: string; payload: unknown }>,
+  /** BrowserWindow.getAllWindows() 的返回值：放一个假窗口才能观察事件载荷 */
+  windows: [] as unknown[],
+  dialogResult: { canceled: true, filePaths: [] as string[] },
+  dialogOptions: null as Record<string, unknown> | null,
+  clipboardText: 'seed-from-clipboard',
+  clipboardWrites: [] as string[],
+  /** preload 侧 ipcRenderer 的订阅表（check E3 的判据） */
+  listeners: new Map<string, Listener[]>(),
+  /** contextBridge.exposeInMainWorld('lms', api) 捕获的 API */
+  exposed: {} as Record<string, unknown>,
+}));
+
+vi.mock('electron', () => ({
+  app: {
+    requestSingleInstanceLock: () => true,
+    // whenReady 的回调体不是本文件的判据（建窗口 / 托盘 / GPU 采样 / 读仓库 yaml / 跑 schtasks）：
+    // 返回永不 resolve 的 promise，让它整段不执行。通道注册在模块作用域，不受影响。
+    whenReady: () => new Promise<void>(() => { /* 永不 resolve */ }),
+    on: () => { /* second-instance / will-quit / activate：本文件不触发 */ },
+    exit: () => { /* 单实例锁失败路径：本文件走 else 分支 */ },
+    getLocale: () => 'zh-CN',
+    getVersion: () => '0.0.0-test',
+    isPackaged: false,
+  },
+  BrowserWindow: { getAllWindows: () => cap.windows },
+  ipcMain: {
+    handle: (name: string, fn: Handler) => { cap.handlers.set(name, fn); },
+  },
+  Tray: class { setToolTip(): void { /* noop */ } setContextMenu(): void { /* noop */ } on(): void { /* noop */ } },
+  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => { /* whenReady 内，未执行 */ } },
+  nativeImage: { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) },
+  shell: { openExternal: async () => { /* 本文件不驱动 open_external */ } },
+  clipboard: {
+    readText: () => cap.clipboardText,
+    writeText: (s: string) => { cap.clipboardText = s; cap.clipboardWrites.push(s); },
+  },
+  dialog: {
+    showOpenDialog: async (_win: unknown, options: Record<string, unknown>) => {
+      cap.dialogOptions = options;
+      return cap.dialogResult;
+    },
+  },
+  contextBridge: {
+    exposeInMainWorld: (_name: string, api: Record<string, unknown>) => { Object.assign(cap.exposed, api); },
+  },
+  ipcRenderer: {
+    invoke: async () => undefined,
+    on: (channel: string, fn: Listener) => {
+      const arr = cap.listeners.get(channel) ?? [];
+      arr.push(fn);
+      cap.listeners.set(channel, arr);
+    },
+    removeListener: (channel: string, fn: Listener) => {
+      const arr = cap.listeners.get(channel) ?? [];
+      cap.listeners.set(channel, arr.filter((x) => x !== fn));
+    },
+  },
+}));
+
+// 两个被测模块：main.ts 注册 12 个通道，preload.ts 注册 2 个事件订阅
+import './main';
+import './preload';
+
+/** 取某个通道的处理器（未注册即失败，对应 check E2「漏一个 → 渲染端 invoke 报 no handler」） */
+function handlerOf(name: string): Handler {
+  const fn = cap.handlers.get(name);
+  if (!fn) throw new Error('NO_HANDLER_REGISTERED: ' + name);
+  return fn;
+}
+/** 模拟渲染端 invoke：ipcMain.handle 的监听器签名是 (event, ...args) */
+function invoke(name: string, ...args: unknown[]): unknown {
+  return handlerOf(name)(undefined, ...args);
+}
+/**
+ * 同步处理器（ql_delete 等）直接调用会**同步 throw**，而真 IPC 里那是一次 reject。
+ * 用它把两种处理器归一成 Promise，错误断言才能统一写 rejects.toThrow。
+ */
+async function invokeRejects(name: string, ...args: unknown[]): Promise<unknown> {
+  return handlerOf(name)(undefined, ...args);
+}
+/** 模拟主进程 webContents.send → 触发 preload 侧已注册的监听器 */
+function fire(channel: string, payload: unknown): void {
+  for (const fn of cap.listeners.get(channel) ?? []) fn({}, payload);
+}
+function listenerCount(channel: string): number {
+  return (cap.listeners.get(channel) ?? []).length;
+}
+function sendsOf(channel: string): unknown[] {
+  return cap.sends.filter((s) => s.channel === channel).map((s) => s.payload);
+}
+async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
+  const deadline = Date.now() + ms;
+  while (Date.now() < deadline) {
+    if (cond()) return;
+    await new Promise((r) => setTimeout(r, 100));
+  }
+  throw new Error('TIMEOUT waiting for ' + what);
+}
+
+const CHANNELS = [
+  'ql_list', 'ql_save', 'ql_delete', 'ql_terminals', 'ql_start', 'ql_stop',
+  'ql_write', 'ql_resize', 'ql_states', 'ql_pick_exe', 'clipboard_read', 'clipboard_write',
+] as const;
+
+let realCwd = '';
+let workDir = '';
+beforeAll(() => {
+  // main.ts 的 dataDir() 在非打包态取 process.cwd()（main.ts:75-78）→ 换掉它，
+  // 免得 ql_save / ql_delete 往仓库的 configs/ 写 quick_launch.yaml（check G3 的范围门）。
+  // 不用 process.chdir：vitest 在 worker 线程里跑，那里 chdir 不可用。
+  realCwd = process.cwd();
+  workDir = mkdtempSync(join(tmpdir(), 'ipc-ql-'));
+  mkdirSync(join(workDir, 'configs'));
+  process.cwd = () => workDir;
+  cap.windows.push({
+    webContents: {
+      send: (channel: string, payload: unknown) => { cap.sends.push({ channel, payload }); },
+      isLoading: () => false,
+    },
+  });
+});
+afterAll(() => {
+  process.cwd = () => realCwd;
+  cap.windows.length = 0;
+  rmSync(workDir, { recursive: true, force: true });
+});
+
+describe('C 段 · 通道注册（check C1-C11 / E2 / F1 / F4）', () => {
+  it('规格 §8 的 12 个通道全部注册', () => {
+    for (const name of CHANNELS) expect(cap.handlers.has(name), 'missing channel: ' + name).toBe(true);
+  });
+
+  it('没有规格外的 ql_* 通道（F4：不加 ql_restart 之类）', () => {
+    const got = [...cap.handlers.keys()].filter((n) => n.startsWith('ql_')).sort();
+    expect(got).toEqual([...CHANNELS].filter((n) => n.startsWith('ql_')).sort());
+  });
+});
+
+describe('C1/C2/C3 · ql_list / ql_save / ql_delete', () => {
+  it('ql_list：文件缺失 → { items:{}, invalid:[] }（规格 §5.2，不抛 MISSING）', () => {
+    expect(invoke('ql_list')).toEqual({ items: {}, invalid: [] });
+  });
+
+  it('ql_save(id=null, entry) → 最终 id（string，前缀 ql）；条目只含该类型字段', async () => {
+    const id = await invoke('ql_save', null, { name: '形状门 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', exe: 'ignored.exe' });
+    expect(typeof id).toBe('string');
+    expect(String(id)).toMatch(/^ql[0-9a-z]+$/);
+    const list = invoke('ql_list') as { items: Record<string, unknown>; invalid: string[] };
+    expect(list.invalid).toEqual([]);
+    expect(list.items[String(id)]).toEqual({ name: '形状门 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI' });
+  });
+
+  it('ql_save 空名 → VALIDATION:（前缀只用索引 G7 的五种）', async () => {
+    await expect(invokeRejects('ql_save', null, { name: '  ', type: 'shell', shell: 'cmd', cmd: 'x' })).rejects.toThrow(/^VALIDATION:/);
+  });
+
+  it('ql_delete → undefined；再删同 id → VALIDATION:（不存在，不是 MISSING）', async () => {
+    const id = String(await invoke('ql_save', 'qlshapedel', { name: '形状门 删除', type: 'exe', exe: 'notepad.exe' }));
+    expect(id).toBe('qlshapedel');
+    expect(invoke('ql_delete', id)).toBeUndefined();
+    expect((invoke('ql_list') as { items: Record<string, unknown> }).items[id]).toBeUndefined();
+    await expect(invokeRejects('ql_delete', id)).rejects.toThrow(/^VALIDATION:/);
+  });
+});
+
+describe('C4 · ql_terminals（索引 K10-3：异步、不缓存）', () => {
+  it('handler 是 async 函数，返回 Promise', async () => {
+    expect(handlerOf('ql_terminals').constructor.name).toBe('AsyncFunction');
+    const p = invoke('ql_terminals');
+    expect(typeof (p as Promise<unknown>).then).toBe('function');
+    await p;
+  });
+
+  it('返回 TerminalInfo[]：只含 {id,path}、id ∈ 四个终端；两次调用不共用数组实例（不缓存）', async () => {
+    const a = (await invoke('ql_terminals')) as Array<Record<string, unknown>>;
+    const b = (await invoke('ql_terminals')) as Array<Record<string, unknown>>;
+    for (const r of [a, b]) {
+      expect(Array.isArray(r)).toBe(true);
+      for (const info of r) {
+        expect(Object.keys(info).sort()).toEqual(['id', 'path']);
+        expect(['pwsh', 'powershell', 'cmd', 'wsl']).toContain(info.id);
+        expect(typeof info.path).toBe('string');
+      }
+    }
+    expect(a).not.toBe(b);
+    // 本机基线（规格 §6.3）：cmd 必然可用
+    expect(a.some((t) => t.id === 'cmd')).toBe(true);
+  });
+});
+
+describe('C5-C9 + C12 · ql_start / ql_write / ql_resize / ql_states / ql_stop + 两个事件', () => {
+  const SHELL_ID = 'qlshape01';
+
+  it('ql_start 未知 id → VALIDATION:（「配置存在」这层由接线自己查）', async () => {
+    await expect(invokeRejects('ql_start', 'qlnope')).rejects.toThrow(/^VALIDATION:/);
+  });
+
+  it('shell 配置：{ tabId: "ql:<id>" }；ql_states 形状；write/resize 返回 undefined；stop 幂等；两个事件载荷逐字', async () => {
+    const savedId = await invoke('ql_save', SHELL_ID, { name: '形状门 shell 运行', type: 'shell', shell: 'cmd', cmd: 'echo QLSHAPE' });
+    expect(savedId).toBe(SHELL_ID);
+
+    const res = await invoke('ql_start', SHELL_ID);
+    expect(res).toEqual({ tabId: 'ql:' + SHELL_ID });
+    expect(invoke('ql_states')).toEqual({ [SHELL_ID]: { running: true, stopping: false } });
+
+    // 输出 → ql-data { tabId, data }（规格 §8 事件表）
+    await waitFor(() => sendsOf('ql-data').length > 0, 20000, 'cmd.exe 的 ql-data');
+    const dataEvents = sendsOf('ql-data') as Array<Record<string, unknown>>;
+    for (const e of dataEvents) {
+      expect(Object.keys(e).sort()).toEqual(['data', 'tabId']);
+      expect(e.tabId).toBe('ql:' + SHELL_ID);
+      expect(typeof e.data).toBe('string');
+    }
+
+    expect(invoke('ql_write', SHELL_ID, 'echo X\r')).toBeUndefined();
+    expect(invoke('ql_resize', SHELL_ID, 100, 30)).toBeUndefined();
+
+    await expect(invoke('ql_stop', SHELL_ID)).resolves.toBeUndefined();
+    expect(invoke('ql_states')).toEqual({});
+    await expect(invoke('ql_stop', SHELL_ID)).resolves.toBeUndefined(); // 再停一次：幂等，不抛错
+
+    // 退出 → ql-exit { configId, code }
+    await waitFor(() => sendsOf('ql-exit').length > 0, 10000, 'ql-exit');
+    for (const e of sendsOf('ql-exit') as Array<Record<string, unknown>>) {
+      expect(Object.keys(e).sort()).toEqual(['code', 'configId']);
+      expect(e.configId).toBe(SHELL_ID);
+      expect(typeof e.code).toBe('number');
+    }
+  }, 60000);
+
+  it('exe 配置：{ tabId: null }；每配置一个新 ProcessState，且不动 llama-server 的 ps 单例（索引 K13）', async () => {
+    await invoke('ql_save', 'qlshape02', { name: '形状门 exe A', type: 'exe', exe: 'notepad.exe' });
+    await invoke('ql_save', 'qlshape03', { name: '形状门 exe B', type: 'exe', exe: 'notepad.exe' });
+
+    const a = await invoke('ql_start', 'qlshape02');
+    expect(a).toEqual({ tabId: null });
+    // 若复用 main.ts:59 的 ps 单例，第二次 launch 会抛 STATE:（process.ts:28）
+    const b = await invoke('ql_start', 'qlshape03');
+    expect(b).toEqual({ tabId: null });
+
+    expect(invoke('ql_states')).toEqual({
+      qlshape02: { running: true, stopping: false },
+      qlshape03: { running: true, stopping: false },
+    });
+    // 既有 get_state 通道读的是 ps 单例：快捷启动的 exe 不得污染它
+    expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });
+
+    await invoke('ql_stop', 'qlshape02');
+    await invoke('ql_stop', 'qlshape03');
+    expect(invoke('ql_states')).toEqual({});
+  }, 30000);
+
+  it('exe 启动失败：前缀由 ProcessState 自带（索引 K11(4)），并经既有日志通道反馈（check E4）', async () => {
+    await invoke('ql_save', 'qlshape04', { name: '形状门 badexe', type: 'exe', exe: 'no-such-exe-zzz.exe' });
+    const res = await invoke('ql_start', 'qlshape04');
+    expect(res).toEqual({ tabId: null }); // 启动失败是异步的（child.on('error')），start 本身已返回
+    await waitFor(
+      () => cap.sends.some((s) => s.channel === 'log-line' && /^PROC:/.test(String((s.payload as { line?: string }).line ?? ''))),
+      5000, 'PROC: 日志行',
+    );
+    const logLines = sendsOf('log-line') as Array<{ line: string; stream: string }>;
+    expect(logLines.some((l) => l.stream === 'sys' && /^PROC:/.test(l.line))).toBe(true);
+    await invoke('ql_stop', 'qlshape04');
+  }, 30000);
+});
+
+describe('C10 · ql_pick_exe（.exe 过滤；取消 → null，不抛错）', () => {
+  it('取消对话框 → null，且过滤器是 .exe', async () => {
+    cap.dialogResult = { canceled: true, filePaths: [] };
+    await expect(invoke('ql_pick_exe')).resolves.toBeNull();
+    const filters = (cap.dialogOptions as { filters?: Array<{ extensions: string[] }> }).filters;
+    expect(filters?.[0].extensions).toEqual(['exe']);
+  });
+
+  it('选中 → 返回路径字符串', async () => {
+    cap.dialogResult = { canceled: false, filePaths: ['D:\\Tools\\LM Studio.exe'] };
+    await expect(invoke('ql_pick_exe')).resolves.toBe('D:\\Tools\\LM Studio.exe');
+  });
+});
+
+describe('C11 · clipboard_read / clipboard_write', () => {
+  it('clipboard_read → string；clipboard_write → undefined 且随后读得到', () => {
+    expect(typeof invoke('clipboard_read')).toBe('string');
+    expect(invoke('clipboard_write', 'ZHW with ASCII')).toBeUndefined();
+    expect(cap.clipboardWrites).toEqual(['ZHW with ASCII']);
+    expect(invoke('clipboard_read')).toBe('ZHW with ASCII');
+  });
+});
+
+describe('E3 · preload 的两个事件订阅（照 onLogLine 的 removeListener 模式）', () => {
+  it('onQlData / onQlExit 已暴露；清理后不再收到（重复订阅不叠加）', () => {
+    // 先取成带类型的局部变量：`x as T(cb)` 这种写法在 as 后面直接跟调用括号时会被解析成别的东西
+    const subData = cap.exposed.onQlData as unknown as (cb: (e: unknown) => void) => () => void;
+    const subExit = cap.exposed.onQlExit as unknown as (cb: (e: unknown) => void) => () => void;
+    expect(typeof subData).toBe('function');
+    expect(typeof subExit).toBe('function');
+
+    const gotData: unknown[] = [];
+    const gotExit: unknown[] = [];
+    const offData = subData((e) => gotData.push(e));
+    const offExit = subExit((e) => gotExit.push(e));
+    expect(typeof offData).toBe('function'); // 返回的是清理函数
+    expect(listenerCount('ql-data')).toBe(1);
+    expect(listenerCount('ql-exit')).toBe(1);
+
+    fire('ql-data', { tabId: 'ql:c1', data: 'hi' });
+    fire('ql-exit', { configId: 'c1', code: 0 });
+    expect(gotData).toEqual([{ tabId: 'ql:c1', data: 'hi' }]);
+    expect(gotExit).toEqual([{ configId: 'c1', code: 0 }]);
+
+    offData();
+    offExit();
+    expect(listenerCount('ql-data')).toBe(0);
+    expect(listenerCount('ql-exit')).toBe(0);
+    fire('ql-data', { tabId: 'ql:c1', data: 'again' });
+    expect(gotData.length).toBe(1); // 已清理 → 不再收到
+
+    // 再订阅两次并各自清理：计数回到 0，既不叠加也不残留
+    const off2 = subData(() => { /* noop */ });
+    const off3 = subData(() => { /* noop */ });
+    expect(listenerCount('ql-data')).toBe(2);
+    off2();
+    off3();
+    expect(listenerCount('ql-data')).toBe(0);
+  });
+});
```
