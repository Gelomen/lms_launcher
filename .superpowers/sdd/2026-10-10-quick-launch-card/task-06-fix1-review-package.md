# 修复轮 1 审查包 · 任务 6（IPC 接线）

FIX_BASE = 8ac9fa9（上一轮完整审查所看到的 HEAD；期间只有主代理的 docs 提交 6e4b085 / 6581374，不含源码）。
按 K5 实现者不 commit，源码改动在工作区。

**怎么读这份 diff**：`src-main/main.ts` 是已跟踪文件，但「上一轮审查看到的状态」本身是未提交的工作区内容，git 里没有那个 blob。
所以下面第一段 diff 是**新增块的新旧对比**：左 = 上一轮审查包里 main.ts 的全部新增行（149 行），右 = 当前的全部新增行（180 行）。
main.ts 里未被新增的行两轮都相同（`git diff HEAD --stat` = 180 insertions / 1 deletion，那 1 处删除是既有 import 行的改写）。
第二段 diff 是 `src-main/ipc-ql.test.ts`（未跟踪）的旧全文（347 行）vs 当前全文。

## git status --porcelain（方括号定界）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-06-ipc-wiring.md
 M src-main/main.ts
 M src-main/preload.ts
 M src/App.test.ts
 M src/ipc.ts
?? src-main/ipc-ql.test.ts
```

## 修复 diff 1：src-main/main.ts 的新增块（左 = 上一轮看到的，右 = 当前）

```diff
diff --git a/.superpowers/sdd/2026-10-10-quick-launch-card/task-06-prev-main-added.txt b/.superpowers/sdd/2026-10-10-quick-launch-card/task-06-new-main-added.txt
index 1ee7de7..4f2577d 100644
--- a/.superpowers/sdd/2026-10-10-quick-launch-card/task-06-prev-main-added.txt
+++ b/.superpowers/sdd/2026-10-10-quick-launch-card/task-06-new-main-added.txt
@@ -29,11 +29,29 @@ function qlYamlPath(): string { return join(configDir(), 'quick_launch.yaml'); }
  *     而索引 K13 要求 launch(exe, [], configId)；
  *   • available —— QuickLaunchManager 的 terminalAvailable(id) 是同步回调，而索引 K10-3 要求
  *     终端探测（最坏 3×3s）不在主进程里同步阻塞，所以由 handler 先 await 再把结果交给它。
- * QuickLaunchManager.start() 的 exe 分支在同一个同步 tick 内调用 spawnExe（其前无 await），
+ * QuickLaunchManager.start() 在调用这两个回调之前没有任何 await（quick-launch.ts:236-276），
  * 所以这个槽只覆盖一次 start()，finally 里清空，不跨请求残留状态。
+ * 任务 6 审查重要 #2：这条不变量原先只写在注释里，代码不钉它——槽为 null 时两处
+ * `?? 默认值` 会**静默降级**（configId 变 null → 污染 get_state 的 runningConfigId 语义；
+ * 或让 shell 启动抛误导性的 err.ql.terminalGone）。现在由 qlStartContextOrThrow() 变成显式失败。
  */
 let qlStartContext: { configId: string; available: Set<TerminalId> } | null = null;
 
+/**
+ * 重要 #2 的守卫：上面两个构造期回调只能在 ql_start 设置 qlStartContext 的那个同步窗口里被调用；
+ * 不变量被破坏时立刻抛 STATE:（索引 G7 五种前缀之一），不静默降级。
+ * 消息不走 t()：这是「接线内部不变量被破坏」的程序员断言，正常路径永不到达，而 err.ql.* 的键由
+ * 任务 8 逐字界定（索引 K8/K9），不在本任务擅自加词典键。
+ * 导出只为让 src-main/ipc-ql.test.ts 能钉住这条守卫（修复轮 1 的反向自检）；生产路径除 ql_start
+ * 外没有别的调用方。
+ */
+export function qlStartContextOrThrow(seam: string): { configId: string; available: Set<TerminalId> } {
+  if (!qlStartContext) {
+    throw new Error('STATE: ql_start context is missing at ' + seam + ' (called outside ql_start)');
+  }
+  return qlStartContext;
+}
+
 /**
  * 终端探测的异步包装（索引 K10-3）：先让出一拍再跑探测，使排队中的窗口/托盘事件先被处理。
  * 探测本身是同步的（quick-launch-terminals.ts 用 spawnSync，规格 §6.1 钉死），最坏 3×3s ≈ 9s；
@@ -50,8 +68,13 @@ function detectTerminalsAsync(): Promise<TerminalInfo[]> {
  * 其 stdio 是 ["ignore","pipe","pipe"]（process.ts:33），适配器必须 takePipes()（:62）后把
  * 两路 .resume() 排空丢弃，否则管道写满会阻塞子进程。错误前缀由 ProcessState 自带
  * （:28 STATE: / :46 PROC:），与索引 K11(4) 一致，这里不再包前缀。
- * launch() 的函数体内没有 await，调用返回时子进程已 spawn → takePipes() 可同步取到管道；
- * 其同步失败先接住，takePipes 报错时优先抛原始错误（保留 STATE:/PROC: 原文）。
+ * launch() 的函数体内没有 await，调用返回时子进程已 spawn、state 已是 running（process.ts:32-58），
+ * 所以随后同步 takePipes() 取得到管道；ENOENT 一类是异步 child.on('error') →
+ * onExit(-1, 'PROC: …')（process.ts:37-47），promise 不 reject。
+ * 任务 6 审查 Minor #1：原先「先接住 launch 的同步失败、takePipes 报错时优先抛它」是**死代码**——
+ * .catch 的回调是微任务，而 takePipes 的 catch 块在同一同步帧就跑完（launchError 此刻必为 null）；
+ * 且新建实例的 state 必为 'ready'，process.ts:28 的 STATE: 分支到不了。两种前缀都属 G7、行为无影响，
+ * 但注释夸大了 → 删掉该变量，下面的 .catch 只为兜住这条到不了的路径、不产生 unhandled rejection。
  */
 function spawnExeProcess(exe: string, configId: string | null): {
   onExit(cb: (code: number) => void): void;
@@ -59,15 +82,10 @@ function spawnExeProcess(exe: string, configId: string | null): {
   isRunning(): boolean;
 } {
   const p = new ProcessState();
-  let launchError: unknown = null;
-  void p.launch(exe, [], configId).catch((e) => { launchError = e; });
-  try {
-    const { stdout, stderr } = p.takePipes();
-    stdout.resume();
-    stderr.resume();
-  } catch (e) {
-    throw launchError instanceof Error ? launchError : e;
-  }
+  void p.launch(exe, [], configId).catch(() => { /* 见上：真机上到不了；只为不产生 unhandled rejection */ });
+  const { stdout, stderr } = p.takePipes();
+  stdout.resume();
+  stderr.resume();
   return {
     onExit(cb) {
       p.onExit((code, error) => {
@@ -89,16 +107,19 @@ const ql = new QuickLaunchManager(
     onExit: (configId, code) => { mainWin()?.webContents.send('ql-exit', { configId, code }); },
     onSysLine: (_configId, line) => emitLog('[lms_launcher] ' + line, 'sys'),
     homedir: () => homedir(),
-    spawnExe: (exe) => spawnExeProcess(exe, qlStartContext?.configId ?? null),
+    spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId),
   },
-  (id) => qlStartContext?.available.has(id) ?? false,
+  (id) => qlStartContextOrThrow('terminalAvailable').available.has(id),
 );
 
 // ---------- 快捷启动 IPC（规格 §8 的 12 个通道，名称/参数/返回逐字） ----------
 ipcMain.handle('ql_list', (): QuickLaunchList => qlLoad(qlYamlPath()));
-// §5.3-4「终端当前可用」只在保存路径成立 → 每次保存实测（索引 K10-3：走异步包装，不缓存）
+// §5.3-4「终端当前可用」只在保存 shell 条目时成立 → 只对 shell 实测（索引 K10-3：异步包装、不缓存）。
+// 索引 K15(2) / 审查重要 #1：available 只在 quick-launch-config.ts:104-107 的 shell 分支被读，
+// 所以 exe 条目传 [] —— 保存一个 exe 配置不再付最坏 3×3s 的主进程阻塞。
+// （(info) => info.id：不遮蔽 :3 导入的 i18n t()，审查 Minor #3）
 ipcMain.handle('ql_save', async (_e, id: string | null, entry: QuickLaunchEntry): Promise<string> => {
-  const available = (await detectTerminalsAsync()).map((t) => t.id);
+  const available = entry?.type === 'shell' ? (await detectTerminalsAsync()).map((info) => info.id) : [];
   return qlSave(qlYamlPath(), id, entry, available);
 });
 // id 不存在 → VALIDATION:（quick-launch-config.ts:159 的 qlDelete 自带，占位符 {id}）
@@ -107,11 +128,21 @@ ipcMain.handle('ql_delete', (_e, id: string): void => {
 });
 // 规格 §6.1：每次调用实时探测、不跨调用缓存；handler 必须异步（索引 K10-3，最坏 ≈9s）
 ipcMain.handle('ql_terminals', async (): Promise<TerminalInfo[]> => await detectTerminalsAsync());
-// 规格 §7.5 的「配置存在」这一层不在进程管理层（任务 5 的 start 只拿到 entry），所以在这里查
+// 规格 §7.5 的「配置存在」这一层不在进程管理层（任务 5 的 start 只拿到 entry），所以在这里查。
+// 审查 Minor #2：items 是普通对象（quick-launch-config.ts:122），items['constructor'] / 'toString' /
+// '__proto__' 走原型链会取到真值 → 通过「配置存在」这层后在 quick-launch.ts:293 抛 typeInvalid
+// （前缀对、消息错）。与配置层同一口径用 hasOwnProperty（quick-launch-config.ts:161）。
 ipcMain.handle('ql_start', async (_e, id: string): Promise<{ tabId: string | null }> => {
-  const entry = qlLoad(qlYamlPath()).items[id];
-  if (!entry) throw new Error('VALIDATION: ' + t(QL_IPC_ERR.notFound, { id }));
-  const available = new Set((await detectTerminalsAsync()).map((t) => t.id));
+  const items = qlLoad(qlYamlPath()).items;
+  if (!Object.prototype.hasOwnProperty.call(items, id)) {
+    throw new Error('VALIDATION: ' + t(QL_IPC_ERR.notFound, { id }));
+  }
+  const entry = items[id];
+  // 索引 K15(2) / 审查重要 #1：available 只在 quick-launch.ts:238 的 shell 分支被读
+  // → 启动 exe 配置不付探测代价（entry 已在手上，无需再判一次）
+  const available = entry.type === 'shell'
+    ? new Set((await detectTerminalsAsync()).map((info) => info.id))
+    : new Set<TerminalId>();
   qlStartContext = { configId: id, available };
   try {
     return await ql.start(id, entry);
```

## 修复 diff 2：src-main/ipc-ql.test.ts（左 = 上一轮看到的 347 行，右 = 当前）

```diff
@@ -29,6 +29,8 @@ const cap = vi.hoisted(() => ({
   listeners: new Map<string, Listener[]>(),
   /** contextBridge.exposeInMainWorld('lms', api) 捕获的 API */
   exposed: {} as Record<string, unknown>,
+  /** detectTerminals 的**真实调用次数**：修复轮 1 · 重要 #1（索引 K15(2)）的证据计数器 */
+  termProbes: 0,
 }));
 
 vi.mock('electron', () => ({
@@ -78,9 +80,32 @@ vi.mock('electron', () => ({
   },
 }));
 
-// 两个被测模块：main.ts 注册 12 个通道，preload.ts 注册 2 个事件订阅
-import './main';
+// 修复轮 1 · 重要 #1（索引 K15(2)）：给 detectTerminals 包一层**只计数**的壳，实现仍走原模块
+// （语义不变：每次实测、不跨调用缓存，规格 §6.1）。用它钉「保存/启动 exe 配置不付探测代价」。
+vi.mock('./quick-launch-terminals', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('./quick-launch-terminals')>();
+  return {
+    ...actual,
+    detectTerminals: () => {
+      cap.termProbes += 1;
+      return actual.detectTerminals();
+    },
+  };
+});
+
+// 两个被测模块：main.ts 注册 12 个通道，preload.ts 注册 2 个事件订阅。
+// main 用命名空间导入：修复轮 1 · 重要 #2 的守卫（qlStartContextOrThrow）从模块上取——
+// 取不到（= 守卫退回 `?? 默认值` 的静默降级）时相关用例必须红，而不是整文件报错。
+import * as mainModule from './main';
 import './preload';
+import { ProcessState } from './process';
+
+/** main.ts 里强制 qlStartContext 不变量的守卫（重要 #2）；不存在 → undefined */
+const GUARD_EXPORT = 'qlStartContextOrThrow';
+function guardOf(): ((seam: string) => { configId: string; available: Set<unknown> }) | undefined {
+  return (mainModule as Record<string, unknown>)[GUARD_EXPORT] as
+    ((seam: string) => { configId: string; available: Set<unknown> }) | undefined;
+}
 
 /** 取某个通道的处理器（未注册即失败，对应 check E2「漏一个 → 渲染端 invoke 报 no handler」） */
 function handlerOf(name: string): Handler {
@@ -140,7 +165,21 @@ beforeAll(() => {
     },
   });
 });
-afterAll(() => {
+// 本文件里真起过进程的配置 id（cmd.exe / notepad.exe）。afterAll 兜底停一遍：
+// 某条用例在 ql_stop 之前抛错时，不让它们活到 worker 退出（修复轮 1 · Minor #8）。
+const KNOWN_STARTED_IDS = [
+  'qlshape01', 'qlshape02', 'qlshape03', 'qlshape04',
+  'qlfixexe01', 'qlfixsh01', 'qlconc01', 'qlconc02',
+];
+
+afterAll(async () => {
+  // 顺序：先停进程（要 cwd 吗？不要——stopGraceful 只 kill/taskkill），再还原 cwd、删临时目录。
+  // 吞异常：兜底清理不是判据；未启动的 id 走 quick-launch.ts:334 的直接 return。
+  for (const id of KNOWN_STARTED_IDS) {
+    try { await handlerOf('ql_stop')(undefined, id); } catch { /* 已停 / 未启动 */ }
+  }
+  // 证据：本文件对 detectTerminals 的真实调用次数（修复轮 1 · 重要 #1 的前后对比靠它）
+  console.log('[ipc-ql] detectTerminals 真实调用次数 =', cap.termProbes);
   process.cwd = () => realCwd;
   cap.windows.length = 0;
   rmSync(workDir, { recursive: true, force: true });
@@ -285,6 +324,115 @@ describe('C5-C9 + C12 · ql_start / ql_write / ql_resize / ql_states / ql_stop +
   }, 30000);
 });
 
+// ---------- 修复轮 1（任务 6 审查：重要 #1 / 重要 #2 / Minor #2）----------
+
+describe('修复轮 1 · 重要 #1（索引 K15(2)）：exe 分支不付终端探测的代价', () => {
+  it('ql_save：exe 条目不调 detectTerminals；shell 条目仍实测（对照，规格 §5.3-4）', async () => {
+    const beforeExe = cap.termProbes;
+    const id = String(await invoke('ql_save', 'qlfixexe01', { name: '修复 exe 不探测', type: 'exe', exe: 'notepad.exe' }));
+    expect(id).toBe('qlfixexe01');
+    // available 只在 quick-launch-config.ts:104-107 的 shell 分支被读 → exe 保存不得付 3×3s
+    expect(cap.termProbes, '保存 exe 配置不得调用 detectTerminals').toBe(beforeExe);
+
+    const beforeShell = cap.termProbes;
+    const sid = String(await invoke('ql_save', 'qlfixsh01', { name: '修复 shell 对照', type: 'shell', shell: 'cmd', cmd: 'echo FIX' }));
+    expect(sid).toBe('qlfixsh01');
+    // 对照组：shell 的「终端可用」校验必须仍然实测（规格 §5.3-4 / 索引 K14(2)）
+    expect(cap.termProbes, '保存 shell 配置仍必须实测').toBe(beforeShell + 1);
+  });
+
+  it('ql_start：exe 配置不调 detectTerminals；shell 配置仍实测（对照，规格 §7.5）', async () => {
+    const beforeExe = cap.termProbes;
+    expect(await invoke('ql_start', 'qlfixexe01')).toEqual({ tabId: null });
+    // quick-launch.ts:238 的 isTerminalAvailable 只在 shell 分支被调 → exe 启动不付探测代价
+    expect(cap.termProbes, '启动 exe 配置不得调用 detectTerminals').toBe(beforeExe);
+    await invoke('ql_stop', 'qlfixexe01');
+
+    const beforeShell = cap.termProbes;
+    expect(await invoke('ql_start', 'qlfixsh01')).toEqual({ tabId: 'ql:qlfixsh01' });
+    // 对照组：shell 启动前的「终端仍可用」（规格 §7.5）仍要实测
+    expect(cap.termProbes, '启动 shell 配置仍必须实测').toBe(beforeShell + 1);
+    await invoke('ql_stop', 'qlfixsh01');
+  }, 30000);
+});
+
+describe('修复轮 1 · Minor #2：ql_start 的「配置存在」不走原型链', () => {
+  // items 是普通对象（quick-launch-config.ts:122）→ items['constructor'] 取到真值，
+  // 会通过「配置存在」这层，然后在 quick-launch.ts:293 抛 typeInvalid：前缀对、消息错。
+  // 配置层自己对此是防住的（quick-launch-config.ts:161 用 hasOwnProperty）→ 接线对齐同一口径。
+  for (const key of ['constructor', 'toString', '__proto__']) {
+    it(`ql_start('${key}') → VALIDATION: 且消息是 notFound，不是 typeInvalid`, async () => {
+      let msg = '';
+      try {
+        await invokeRejects('ql_start', key);
+      } catch (e) {
+        msg = e instanceof Error ? e.message : String(e);
+      }
+      expect(msg).toMatch(/^VALIDATION:/);
+      // 词典未落地（K8）→ t() 原样返回 key（dict.ts:577），所以消息里就是 key 名本身
+      expect(msg).toContain('err.ql.notFound');
+      expect(msg).not.toContain('err.ql.typeInvalid');
+    });
+  }
+});
+
+describe('修复轮 1 · 重要 #2：qlStartContext 槽的不变量由代码强制', () => {
+  it('main.ts 导出守卫：不在 ql_start 里（槽为 null）时立刻抛 STATE:，不静默降级', () => {
+    const guard = guardOf();
+    expect(typeof guard, '重要 #2 的守卫必须存在（改回 ?? 默认值 就退回静默降级）').toBe('function');
+    // 此刻没有任何 ql_start 在飞 → 槽必为 null；两个构造期回调若被调用必须炸，
+    // 而不是把 configId 变成 null（污染 get_state 的 runningConfigId 语义）或抛误导性的 terminalGone。
+    expect(() => (guard as (s: string) => unknown)('probe')).toThrow(/^STATE:/);
+  });
+
+  it('两个 exe 配置并发 ql_start：launch(exe, [], configId) 各归各，且 spawnExe 处槽必然非空且属于本次', async () => {
+    const guard = guardOf();
+    const calls: Array<{ args: string[]; configId: string | null; ctxOk: boolean }> = [];
+    const original = ProcessState.prototype.launch;
+    // 观察点 = K13 要求的那次调用本身：process.ts:27 的第三参数就是 runningConfigId 的来源。
+    ProcessState.prototype.launch = function (
+      this: ProcessState, exe: string, args: string[], configId: string | null, cwd?: string,
+    ): Promise<void> {
+      let ctxOk = false;
+      try {
+        const ctx = guard ? guard('probe') : undefined;
+        ctxOk = !!ctx && ctx.configId === configId; // 串到别的请求 / 槽为 null → false
+      } catch {
+        ctxOk = false;
+      }
+      calls.push({ args, configId, ctxOk });
+      return original.call(this, exe, args, configId, cwd);
+    } as typeof ProcessState.prototype.launch;
+
+    try {
+      await invoke('ql_save', 'qlconc01', { name: '修复 并发 A', type: 'exe', exe: 'notepad.exe' });
+      await invoke('ql_save', 'qlconc02', { name: '修复 并发 B', type: 'exe', exe: 'notepad.exe' });
+
+      const [a, b] = await Promise.all([invoke('ql_start', 'qlconc01'), invoke('ql_start', 'qlconc02')]);
+      expect(a).toEqual({ tabId: null });
+      expect(b).toEqual({ tabId: null });
+
+      // 各自的 configId 不串（顺序 = 两次 invoke 的顺序：两个 handler 各自同步跑完再让出）
+      expect(calls.map((c) => c.configId)).toEqual(['qlconc01', 'qlconc02']);
+      // 索引 K13 逐字：launch(exe, [], configId)
+      for (const c of calls) expect(c.args).toEqual([]);
+      // 每次 spawnExe 读到的槽就是本次启动的（槽为 null 或串到另一条 → false）
+      expect(calls.map((c) => c.ctxOk)).toEqual([true, true]);
+
+      expect(invoke('ql_states')).toEqual({
+        qlconc01: { running: true, stopping: false },
+        qlconc02: { running: true, stopping: false },
+      });
+      // 既有 get_state 读的是 main.ts:59 的 ps 单例：两条快捷启动 exe 不得污染它
+      expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });
+    } finally {
+      ProcessState.prototype.launch = original;
+      await invoke('ql_stop', 'qlconc01');
+      await invoke('ql_stop', 'qlconc02');
+    }
+  }, 30000);
+});
+
 describe('C10 · ql_pick_exe（.exe 过滤；取消 → null，不抛错）', () => {
   it('取消对话框 → null，且过滤器是 .exe', async () => {
     cap.dialogResult = { canceled: true, filePaths: [] };
```

## 主代理独立跑的两次变异探针（不是实现者的自述）

```
A) 把 :1119 的 entry.type === 'shell' 改成 true（exe 也探测）
   → 2 failed：「ql_start：exe 配置不调 detectTerminals；shell 配置仍实测（对照）」+「两个 exe 配置并发 ql_start…」
B) 把 :1025 的 if (!qlStartContext) 改成 if (false)（去掉 STATE 守卫，回到静默降级）
   → 1 failed：「main.ts 导出守卫：不在 ql_start 里（槽为 null）时立刻抛 STATE:，不静默降级」
两次还原后文件字节级一致（SHA-256 741C8B2D07CA766E8337705862C7EA15316E1562C3A952F1E107CD47A85B1C21）
主代理复跑：6 文件 121 passed / tsc exit 0 / i18n 22 passed / process.ts 与 process.test.ts 的 diff 为空 / 范围只含 B1-B5
```
