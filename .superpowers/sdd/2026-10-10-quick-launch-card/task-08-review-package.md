# 审查包 · 任务 8（i18n 词条，中英）

BASE = 32ead61（HEAD；按 K5 实现者不提交，改动在工作区）。
第一段是五个代码/测试文件的完整 diff；第二段是 `src-main/i18n/dict.ts` 的 diff（+124 行，全是新键，单独放以免淹没调用点的改动）。

主代理已独立核过（供参考，不是结论）：`src-main/i18n + src/i18n.test.ts` = `5 files / 25 passed`；`quick-launch / quick-launch-config / ipc-ql / App / terminals / process` = `6 files / 124 passed`；`tsc` exit 0；E6 三条 grep 全部 0 命中；`git grep "ql\.dialog"` 的 4 处命中**全在 docs**（计划/索引/check 表里对已作废键的说明），代码里没有。
主代理自己跑的两次变异探针（证明 K8 收尾确实把键纳入了硬门）：
```
A) 把词典 err.ql.nameDup 的 zh 值里的 {name} 改成 {nme} → 恰 1 红：「调用点传的占位符名与词典取值里的 {name} 双向一致」
B) 删掉 err.ql.ptySpawn 的 zh 条目 → 2 红：「全部字面量 t()/hasKey()/errTextOf()/errFromIpc() 的 key 在 zh 与 en 词典中都存在」+「zh 与 en 的 key 集合完全一致」
两次还原后 dict.ts 字节级一致（SHA 前缀 8D92EBB75D36F6A3）
```
主代理另核实：字面量 `t('err.ql.` 调用点共 17 处 = 生产代码 15（`main.ts:1112` 1、`quick-launch-config.ts` 8、`quick-launch.ts` 6）+ `ipc-ql.test.ts:376-377` 2（E7 的新断言）。实现者报的「16 处」= 生产 15 + `app.dialog.filterExe` 1，与 K20 更正后的拆分一致。

## git status --porcelain（方括号定界）

```
 M src-main/i18n/dict.ts
 M src-main/ipc-ql.test.ts
 M src-main/main.ts
 M src-main/quick-launch-config.ts
 M src-main/quick-launch.ts
 M src/i18n.test.ts
```

## git diff HEAD（调用点 + 测试）

```diff
diff --git a/src-main/ipc-ql.test.ts b/src-main/ipc-ql.test.ts
index 2698050..6568af5 100644
--- a/src-main/ipc-ql.test.ts
+++ b/src-main/ipc-ql.test.ts
@@ -11,6 +11,7 @@ import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
 import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
 import { tmpdir } from 'node:os';
 import { join } from 'node:path';
+import { t } from './i18n'; // 任务 8 E7（索引 K16(2)）：词典已落地，断言必须按译文写
 
 type Handler = (event: unknown, ...args: unknown[]) => unknown;
 type Listener = (event: unknown, payload: unknown) => void;
@@ -369,9 +370,11 @@ describe('修复轮 1 · Minor #2：ql_start 的「配置存在」不走原型
         msg = e instanceof Error ? e.message : String(e);
       }
       expect(msg).toMatch(/^VALIDATION:/);
-      // 词典未落地（K8）→ t() 原样返回 key（dict.ts:577），所以消息里就是 key 名本身
-      expect(msg).toContain('err.ql.notFound');
-      expect(msg).not.toContain('err.ql.typeInvalid');
+      // 任务 8 E7（索引 K16(2)）：err.ql.* 已进词典，消息里是译文而不是 key 名。
+      // 期望值仍由 t() 现算（本文件默认 zh），所以「notFound 而不是 typeInvalid」这条判据不变；
+      // key-coverage.test.ts:24 的 walk() 排除 .test.ts，测试里写字面量 key 不触「调用点 ↔ 词典」门。
+      expect(msg).toContain(t('err.ql.notFound', { id: key }));
+      expect(msg).not.toContain(t('err.ql.typeInvalid', { type: key }));
     });
   }
 });
diff --git a/src-main/main.ts b/src-main/main.ts
index aeed019..4494c9a 100644
--- a/src-main/main.ts
+++ b/src-main/main.ts
@@ -986,19 +986,12 @@ ipcMain.handle('get_llama_update_config', (): { success: true; config: LlamaUpda
 });
 
 // ---------- 快捷启动（规格 2026-10-10 §5–§8）----------
-// 已定口径 K8（同 quick-launch-config.ts:31-40 / quick-launch.ts:18-25）：err.ql.* 词典键在任务 8 才落地，
-// key-coverage.test.ts:39-41 的 KEY_CALL 只认「t('字面量')」→ 这里用常量映射传 key，不写字面量。
 // 错误前缀只用索引 G7 的五种；本段自己产生的只有 VALIDATION:（配置不存在），其余前缀由被调层自带。
-const QL_IPC_ERR = {
-  notFound: 'err.ql.notFound', // 占位符 {id}（任务 8 表 D7 + 占位符注）
-} as const;
-// 对话框过滤器名（规格 §8「.exe 过滤」）。主进程词典里没有这个键：任务 8 表 C9 的 ql.dialog.filterExe
-// 落在渲染端词典（src/i18n.ts），B2 只往主进程词典加 err.ql.*。这里按主进程命名空间取
-// app.dialog.filterExe（与 :349/:351 的 app.dialog.filterModel / filterJinja 同组），同样走常量映射
-// → key-coverage 扫不到、词典落地前对话框里显示原始 key。已作为疑虑写进任务 6 报告。
-const QL_IPC_LABEL = {
-  filterExe: 'app.dialog.filterExe',
-} as const;
+// err.ql.notFound / app.dialog.filterExe 已由任务 8 写进词典（src-main/i18n/dict.ts），所以这里写成字面量
+// t()：索引 K8 的收尾（K20(2)）——key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量，:44 还会把调用点
+// 传的参数名与词典取值里的 {占位符} 双向比对（notFound→{id}，任务 8 表 D7）。
+// 对话框过滤器名取主进程词典的 app.dialog.filterExe（规格 §8「.exe 过滤」；与 :349/:351 的
+// app.dialog.filterModel / filterJinja 同组，索引 K14——ql_pick_exe 无参数、对话框在主进程渲染）。
 
 // 快捷启动 yaml（规格 §5.1）：与三份模板 yaml 同目录，但**不进 yamlPaths() 的三元组**——
 // 该函数在多处按位置解构（const [p] / const [, , p]），加第四项会让所有解构错位。
@@ -1116,7 +1109,7 @@ ipcMain.handle('ql_terminals', async (): Promise<TerminalInfo[]> => await detect
 ipcMain.handle('ql_start', async (_e, id: string): Promise<{ tabId: string | null }> => {
   const items = qlLoad(qlYamlPath()).items;
   if (!Object.prototype.hasOwnProperty.call(items, id)) {
-    throw new Error('VALIDATION: ' + t(QL_IPC_ERR.notFound, { id }));
+    throw new Error('VALIDATION: ' + t('err.ql.notFound', { id }));
   }
   const entry = items[id];
   // 索引 K15(2) / 审查重要 #1：available 只在 quick-launch.ts:238 的 shell 分支被读
@@ -1149,7 +1142,7 @@ ipcMain.handle('ql_pick_exe', async (): Promise<string | null> => {
   if (!win) return null;
   const res = await dialog.showOpenDialog(win, {
     properties: ['openFile'],
-    filters: [{ name: t(QL_IPC_LABEL.filterExe), extensions: ['exe'] }],
+    filters: [{ name: t('app.dialog.filterExe'), extensions: ['exe'] }],
   });
   return res.canceled ? null : res.filePaths[0];
 });
diff --git a/src-main/quick-launch-config.ts b/src-main/quick-launch-config.ts
index a548725..d248a9b 100644
--- a/src-main/quick-launch-config.ts
+++ b/src-main/quick-launch-config.ts
@@ -19,30 +19,15 @@ const TERMINAL_IDS: readonly TerminalId[] = ['pwsh', 'powershell', 'cmd', 'wsl']
 const NAME_MAX = 64;
 const FILE_LABEL = 'quick_launch.yaml';
 
-// 已定口径 K8（check F3）：err.ql.* 词典键要到任务 8 才落地。key-coverage.test.ts:39-41 的 KEY_CALL
-// 只认「t('字面量')」，写死字面量就报「词典缺键」；这里用常量映射传 key（正则不匹配 → 该守护跳过），
-// 任务 8 落地词典后再把调用点改回字面量 t()。错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
-// key 名与计划 :301 / 任务 8 表 D1–D11 逐字一致（索引 K9 / check C6），占位符名见任务 8 表 D 段注：
+// 错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
+// err.ql.* 已由任务 8 写进词典（src-main/i18n/dict.ts），所以这里一律改回「字面量 key 的 t() 调用」：
+// 索引 K8 的收尾（K20(2)）——key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量，:44 还会把调用点传的
+// 参数名与词典取值里的 {占位符} **双向**比对，比原来的常量映射更强。
+// key 名与计划 :301 / 任务 8 表 D1–D11 逐字一致（索引 K9 / check C6），占位符名与 dict.ts 逐字一致：
 // nameTooLong→{max}、nameDup→{name}、typeInvalid→{type}、terminalMissing→{terminal}、notFound→{id}，
 // nameRequired / cmdRequired / exeRequired 无占位符。
 // YAML 与 id 格式**不建 err.ql.* 同义键**（索引 K9）：复用词典既有的 err.config.yamlLoadFail /
-// err.config.yamlEmpty / err.config.idFormat（dict.ts:220-226 / :500-506）。词典里已有这三个键，
-// 所以它们写成字面量 t()——key-coverage 的占位符双向比对（:44 / :131-151）正好守护 {name}/{msg} 拼写。
-const QL_ERR = {
-  nameRequired: 'err.ql.nameRequired',
-  nameTooLong: 'err.ql.nameTooLong',
-  nameDup: 'err.ql.nameDup',
-  typeInvalid: 'err.ql.typeInvalid',
-  terminalMissing: 'err.ql.terminalMissing',
-  cmdRequired: 'err.ql.cmdRequired',
-  exeRequired: 'err.ql.exeRequired',
-  notFound: 'err.ql.notFound',
-} as const;
-
-// 参数是「词典 key 本身」（QL_ERR 的取值），不是 QL_ERR 的属性名：变量传 key → key-coverage 跳过
-function invalidError(key: string, params?: Record<string, string | number>): Error {
-  return new Error('VALIDATION: ' + t(key, params));
-}
+// err.config.yamlEmpty / err.config.idFormat（dict.ts 的 err.config.*）——同样是字面量 t()。
 
 function isTerminalId(value: unknown): value is TerminalId {
   return typeof value === 'string' && (TERMINAL_IDS as readonly string[]).includes(value);
@@ -99,22 +84,22 @@ function normalizeEntry(raw: unknown): QuickLaunchEntry | null {
 function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]): QuickLaunchEntry {
   const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
   const name = typeof e.name === 'string' ? e.name.trim() : '';
-  if (name.length === 0) throw invalidError(QL_ERR.nameRequired);
-  if (name.length > NAME_MAX) throw invalidError(QL_ERR.nameTooLong, { max: NAME_MAX });
+  if (name.length === 0) throw new Error('VALIDATION: ' + t('err.ql.nameRequired'));
+  if (name.length > NAME_MAX) throw new Error('VALIDATION: ' + t('err.ql.nameTooLong', { max: NAME_MAX }));
   if (e.type === 'shell') {
     if (!isTerminalId(e.shell) || !available.includes(e.shell)) {
-      throw invalidError(QL_ERR.terminalMissing, { terminal: String(e.shell ?? '') });
+      throw new Error('VALIDATION: ' + t('err.ql.terminalMissing', { terminal: String(e.shell ?? '') }));
     }
     const cmd = typeof e.cmd === 'string' ? e.cmd.trim() : '';
-    if (cmd.length === 0) throw invalidError(QL_ERR.cmdRequired);
+    if (cmd.length === 0) throw new Error('VALIDATION: ' + t('err.ql.cmdRequired'));
     return { name, type: 'shell', shell: e.shell, cmd };
   }
   if (e.type === 'exe') {
     const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
-    if (exe.length === 0) throw invalidError(QL_ERR.exeRequired);
+    if (exe.length === 0) throw new Error('VALIDATION: ' + t('err.ql.exeRequired'));
     return { name, type: 'exe', exe };
   }
-  throw invalidError(QL_ERR.typeInvalid, { type: String(e.type ?? '') });
+  throw new Error('VALIDATION: ' + t('err.ql.typeInvalid', { type: String(e.type ?? '') }));
 }
 
 /** 加载（规格 §5.2）：缺失/空 → 空表；YAML 坏或顶层非对象 → YAML:；单条非法 → 跳过该条、id 收进 invalid。 */
@@ -147,7 +132,7 @@ export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry,
       && typeof (raw as Record<string, unknown>)['name'] === 'string'
       ? ((raw as Record<string, unknown>)['name'] as string).trim()
       : '';
-    if (otherName === clean.name) throw invalidError(QL_ERR.nameDup, { name: clean.name });
+    if (otherName === clean.name) throw new Error('VALIDATION: ' + t('err.ql.nameDup', { name: clean.name }));
   }
   const finalId = id === null ? suggestConfigId(Object.keys(map), 'ql') : id;
   map[finalId] = clean;
@@ -158,7 +143,7 @@ export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry,
 /** 删除（规格 §8）：id 不存在 → VALIDATION:（文件不存在同样是「不存在」，不是 MISSING）。 */
 export function qlDelete(path: string, id: string): void {
   const map = readRawMap(path);
-  if (!Object.prototype.hasOwnProperty.call(map, id)) throw invalidError(QL_ERR.notFound, { id });
+  if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error('VALIDATION: ' + t('err.ql.notFound', { id }));
   delete map[id];
   writeFileSync(path, dump(map));
 }
diff --git a/src-main/quick-launch.ts b/src-main/quick-launch.ts
index 1325f2e..917ae87 100644
--- a/src-main/quick-launch.ts
+++ b/src-main/quick-launch.ts
@@ -9,20 +9,13 @@ import * as pty from '@lydell/node-pty';
 import { t } from './i18n';
 import type { QuickLaunchEntry, TerminalId } from './quick-launch-config';
 
-// 已定口径 K8（同 src-main/quick-launch-config.ts:22-40）：err.ql.* 词典键在任务 8 才落地，
-// 这里用常量映射传 key（key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量 → 跳过），
-// 任务 8 落地词典后再改回字面量 t()。key 名与任务 8 表 D8/D9/D10/D6/D7/D3 逐字一致；
-// 占位符：terminalGone→{terminal}、ptySpawn→{exe}{err}、notFound→{id}、typeInvalid→{type}、
-// alreadyRunning / exeRequired 无占位符（与任务 3 已落地的同名键占位符一致）。
 // 错误前缀只有 VALIDATION: / STATE: / PROC:（索引 G7）。
-const QL_ERR = {
-  notFound: 'err.ql.notFound',
-  terminalGone: 'err.ql.terminalGone',
-  alreadyRunning: 'err.ql.alreadyRunning',
-  ptySpawn: 'err.ql.ptySpawn',
-  exeRequired: 'err.ql.exeRequired',
-  typeInvalid: 'err.ql.typeInvalid',
-} as const;
+// err.ql.* 已由任务 8 写进词典（src-main/i18n/dict.ts），所以这里一律改回「字面量 key 的 t() 调用」：
+// 索引 K8 的收尾（K20(2)）——key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量，:44 还会把调用点传的
+// 参数名与词典取值里的 {占位符} 双向比对。key 名与任务 8 表 D8/D9/D10/D6/D3 逐字一致；
+// 占位符与 dict.ts 逐字一致：terminalGone→{terminal}、ptySpawn→{exe}{err}、typeInvalid→{type}，
+// alreadyRunning / exeRequired 无占位符。
+// 复用词典既有键（索引 K9）：err.proc.noChild / log.launcher.start.cmd / log.app.exit，不建同义键。
 
 // 规格 §7.3：TERM 名固定 xterm-256color；start() 不带尺寸（任务 6 的 ql_resize 会立刻校正），
 // 故用 80x24 兜底，保证首帧之前 PTY 尺寸不会是 0。
@@ -149,7 +142,7 @@ export class PtyProcess {
 /** 终端 id → 可执行文件与参数（C3）。返回副本，调用方改数组不会污染映射表。 */
 export function shellExe(shell: TerminalId): { exe: string; args: string[] } {
   const found = SHELL_EXE[shell];
-  if (!found) throw new Error('VALIDATION: ' + t(QL_ERR.terminalGone, { terminal: String(shell ?? '') }));
+  if (!found) throw new Error('VALIDATION: ' + t('err.ql.terminalGone', { terminal: String(shell ?? '') }));
   return { exe: found.exe, args: [...found.args] };
 }
 
@@ -230,13 +223,13 @@ export class QuickLaunchManager {
 
   /** 启动（规格 §7.5）：shell → { tabId: 'ql:<configId>' }；exe → { tabId: null }。失败不残留状态。 */
   async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }> {
-    if (this.instances.has(configId)) throw new Error('STATE: ' + t(QL_ERR.alreadyRunning));
+    if (this.instances.has(configId)) throw new Error('STATE: ' + t('err.ql.alreadyRunning'));
     const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
 
     if (e.type === 'shell') {
       const shell = e.shell;
       if (!shell || !this.isTerminalAvailable(shell)) {
-        throw new Error('VALIDATION: ' + t(QL_ERR.terminalGone, { terminal: String(shell ?? '') }));
+        throw new Error('VALIDATION: ' + t('err.ql.terminalGone', { terminal: String(shell ?? '') }));
       }
       const tabId = QL_TAB_PREFIX + configId;
       let proc: ShellProcess;
@@ -245,7 +238,7 @@ export class QuickLaunchManager {
         proc = this.createShellProcess(shell, DEFAULT_COLS, DEFAULT_ROWS, this.deps.homedir());
       } catch (err) {
         // §12.4：spawn 失败不残留状态——还没进 Map，直接上抛
-        throw new Error('PROC: ' + t(QL_ERR.ptySpawn, { exe: shellExe(shell).exe, err: messageOf(err) }));
+        throw new Error('PROC: ' + t('err.ql.ptySpawn', { exe: shellExe(shell).exe, err: messageOf(err) }));
       }
       const inst: Instance = {
         kind: 'shell', proc, tabId, stopping: false, exited: false, exitCode: null, auto: null,
@@ -271,7 +264,7 @@ export class QuickLaunchManager {
 
     if (e.type === 'exe') {
       const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
-      if (!exe) throw new Error('VALIDATION: ' + t(QL_ERR.exeRequired));
+      if (!exe) throw new Error('VALIDATION: ' + t('err.ql.exeRequired'));
       // 规格 §7.3：可执行程序不用 PTY。不 catch：ProcessState.launch 的 STATE:/PROC: 原样上抛。
       const proc = this.deps.spawnExe(exe);
       const inst: Instance = {
@@ -290,7 +283,7 @@ export class QuickLaunchManager {
       return { tabId: null };
     }
 
-    throw new Error('VALIDATION: ' + t(QL_ERR.typeInvalid, { type: String(e.type ?? '') }));
+    throw new Error('VALIDATION: ' + t('err.ql.typeInvalid', { type: String(e.type ?? '') }));
   }
 
   /** 键盘输入（§8 ql_write） */
diff --git a/src/i18n.test.ts b/src/i18n.test.ts
index 39e16f7..7dcc3cc 100644
--- a/src/i18n.test.ts
+++ b/src/i18n.test.ts
@@ -40,3 +40,52 @@ describe('renderer i18n', () => {
     }
   });
 });
+
+// 任务 8（2026-10-10-quick-launch-card）：快捷启动 / 交互终端词条的落地门。
+// check 表 task-08 E1（字面量断言）+ E5（对 TerminalId 四个值的枚举断言）。
+// 为什么两条都要：key-coverage.test.ts:39-41 的 KEY_CALL 只认「t('字面量')」，
+// 拼接式 t('ql.term.' + id) 被跳过（该表 A3 / F5）——本文件是那条缺口的唯一兜底；
+// 而 key-coverage 的 walk()（:24）排除 .test.ts，所以这里用动态 key 不会触门。
+// TerminalId 是封闭集合（规格 §3）：用 Record<TerminalId, …> 让「新增第五种终端」在类型层
+// 就要求补一条断言，做法照 src-main/i18n/err-keys.ts + dict.test.ts:63-68。
+import type { TerminalId } from '../src-main/quick-launch-config';
+
+// 四个 id 来自规格 §6.1；en 取值逐字来自计划 任务 8 步骤 3 / check 表 C3
+const TERM_IDS: Record<TerminalId, true> = { pwsh: true, powershell: true, cmd: true, wsl: true };
+const TERM_LABEL_EN: Record<TerminalId, string> = {
+  pwsh: 'PowerShell 7 (pwsh)',
+  powershell: 'Windows PowerShell',
+  cmd: 'Command Prompt (cmd)',
+  wsl: 'WSL',
+};
+
+describe('快捷启动词条（任务 8 · check E1）', () => {
+  it('ql.title 已落地，不是键名本身（中英两侧）', () => {
+    applyLangLocal('zh');
+    expect(t('ql.title')).not.toBe('ql.title');
+    applyLangLocal('en');
+    expect(t('ql.title')).not.toBe('ql.title');
+  });
+
+  it('四个终端标签的 en 取值逐字（check C3 / 计划 步骤 3）', () => {
+    applyLangLocal('en');
+    expect(t('ql.term.powershell')).toBe('Windows PowerShell');
+    expect(t('ql.term.pwsh')).toBe('PowerShell 7 (pwsh)');
+    expect(t('ql.term.cmd')).toBe('Command Prompt (cmd)');
+    expect(t('ql.term.wsl')).toBe('WSL');
+  });
+});
+
+describe('终端标签枚举（任务 8 · check E5 / F5 兜底）', () => {
+  // 动态 key：兜的正是「源码若写成 t('ql.term.' + id) 则 key-coverage 扫不到」那条缺口（该表 A3）
+  it('TerminalId 每个值在 zh/en 词典都有 ql.term.<id>，且不是键名本身 / en 逐字', () => {
+    for (const id of Object.keys(TERM_IDS) as TerminalId[]) {
+      const key = 'ql.term.' + id;
+      applyLangLocal('zh');
+      expect(t(key), key + '(zh)').not.toBe(key);
+      applyLangLocal('en');
+      expect(t(key), key + '(en)').not.toBe(key);
+      expect(t(key), key + '(en)').toBe(TERM_LABEL_EN[id]);
+    }
+  });
+});
```

## git diff HEAD -- src-main/i18n/dict.ts（新键全文）

```diff
diff --git a/src-main/i18n/dict.ts b/src-main/i18n/dict.ts
index bda996c..6e1abe3 100644
--- a/src-main/i18n/dict.ts
+++ b/src-main/i18n/dict.ts
@@ -140,6 +140,50 @@ export const dict = {
     // 空态去全角括号（2026-10-03 用户指定；「中文布局冻结」唯一获批例外）
     'log.empty.missing': '暂无日志',
     'log.link.tip': 'Ctrl + Click 打开链接',
+    // 快捷启动卡片 + 交互终端页签（2026-10-10-quick-launch-card 任务 8，规格 §10 / check 表 C1-C8、C10）
+    // 终端标签只在渲染端 t()（check F3 / 规格 §6.1）；en 取值逐字来自计划 任务 8 步骤 3。
+    // 占位符名是下游（任务 9/11/13）调用点的口径，改这里必须同步改调用点：
+    //   ql.invalid→{n}、ql.terminal.count→{cur}{total}、ql.modal.delete.message→{name}、
+    //   ql.log.exit→{name}、ql.log.fail→{name}{msg}。
+    'ql.title': '快捷启动',
+    'ql.empty.none': '暂无启动项',
+    'ql.invalid': '{n} 条配置无效，已跳过',
+    'ql.tab.closeBlocked': '终端运行中，请先停止再关闭',
+    'ql.btn.new': '新建启动项',
+    'ql.btn.copy': '复制',
+    'ql.btn.edit': '编辑',
+    'ql.btn.start': '启动',
+    'ql.btn.stop': '停止',
+    'ql.btn.closeTab': '关闭页签',
+    'ql.term.pwsh': 'PowerShell 7 (pwsh)',
+    'ql.term.powershell': 'Windows PowerShell',
+    'ql.term.cmd': '命令提示符 (cmd)',
+    'ql.term.wsl': 'WSL',
+    'ql.terminal.clear': '清空终端',
+    'ql.terminal.searchPlaceholder': '查找终端输出…',
+    'ql.terminal.searchPrev': '上一个匹配',
+    'ql.terminal.searchNext': '下一个匹配',
+    'ql.terminal.count': '{cur} / {total}',
+    'ql.modal.newTitle': '新建启动项',
+    'ql.modal.editTitle': '编辑启动项',
+    'ql.modal.name': '名字',
+    'ql.modal.type': '类型',
+    'ql.modal.type.shell': '命令行',
+    'ql.modal.type.exe': '可执行程序',
+    'ql.modal.terminal': '终端',
+    'ql.modal.terminal.loading': '探测中…',
+    'ql.modal.cmd': '命令',
+    'ql.modal.exe': '程序路径',
+    'ql.modal.btn.pick': '选择文件',
+    'ql.modal.btn.save': '保存',
+    'ql.modal.btn.delete': '删除',
+    'ql.modal.delete.title': '删除启动项',
+    'ql.modal.delete.message': '确定删除启动项「{name}」吗？',
+    'ql.err.nameRequired': '名字不能为空',
+    'ql.err.nameTaken': '名字已存在',
+    'ql.err.running': '该启动项正在运行',
+    'ql.log.exit': '快捷启动 · {name} · 终端已退出',
+    'ql.log.fail': '快捷启动 · {name} · 启动失败：{msg}',
     'update.title': '检查更新',
     'update.close': '关闭弹窗',
     'update.btn.check': '检查更新',
@@ -255,6 +299,23 @@ export const dict = {
     'err.proc.spawnFail': '{exe} 启动失败: {err}',
     'err.proc.noChild': '无子进程',
     'err.proc.noPipe': 'stdout/stderr 管道未打开',
+    // 快捷启动的错误消息（任务 8，check 表 D1-D11 / 规格 §5.3、§7.5）：
+    // 前缀由调用点自带（VALIDATION: / STATE: / PROC:，索引 G7）。
+    // YAML / id 格式两类复用上面的 err.config.*（索引 K9），不建 err.ql.* 同义键。
+    // 占位符名与调用点逐字一致（key-coverage.test.ts:44 双向比对）：
+    //   nameTooLong→{max}、nameDup→{name}、typeInvalid→{type}、terminalMissing/terminalGone→{terminal}、
+    //   notFound→{id}、ptySpawn→{exe}{err}；nameRequired/cmdRequired/exeRequired/alreadyRunning 无占位符。
+    'err.ql.nameRequired': '名字不能为空',
+    'err.ql.nameTooLong': '名字过长（最多 {max} 个字符）',
+    'err.ql.nameDup': '名字「{name}」已存在',
+    'err.ql.typeInvalid': '类型「{type}」无效（须为 shell 或 exe）',
+    'err.ql.terminalMissing': '终端「{terminal}」不可用',
+    'err.ql.cmdRequired': '命令不能为空',
+    'err.ql.exeRequired': '可执行程序路径不能为空',
+    'err.ql.notFound': '快捷启动配置 "{id}" 不存在',
+    'err.ql.alreadyRunning': '该快捷启动已在运行',
+    'err.ql.terminalGone': '终端「{terminal}」已不可用',
+    'err.ql.ptySpawn': '{exe} 终端启动失败: {err}',
     'log.app.start.missing': '启动失败（配置缺失）· {msg}',
     'log.app.start.invalid': '启动失败（校验未过）· {msg}',
     'log.app.start.fail': '启动失败 · {msg}',
@@ -280,6 +341,7 @@ export const dict = {
     'app.winbar.close': '关闭',
     'app.dialog.filterModel': '模型文件',
     'app.dialog.filterJinja': 'Jinja 模板文件',
+    'app.dialog.filterExe': '可执行程序文件',
     'common.unknown': '未知',
     'common.unknownError': '未知错误',
     'common.unknownReason': '未知原因'
@@ -420,6 +482,50 @@ export const dict = {
     'log.search.nextMatch': 'Next match',
     'log.empty.missing': 'no logs',
     'log.link.tip': 'Ctrl + Click to open link',
+    // Quick Launch card + interactive terminal tab (task 8 of 2026-10-10-quick-launch-card,
+    // spec §10 / check C1-C8, C10). Terminal labels are renderer-only (check F3 / spec §6.1).
+    // Placeholder names are the contract for the call sites in tasks 9/11/13 - change both sides together:
+    //   ql.invalid->{n}, ql.terminal.count->{cur}{total}, ql.modal.delete.message->{name},
+    //   ql.log.exit->{name}, ql.log.fail->{name}{msg}.
+    'ql.title': 'Quick Launch',
+    'ql.empty.none': 'No quick launch entries',
+    'ql.invalid': '{n} invalid entries skipped',
+    'ql.tab.closeBlocked': 'Terminal is running. Stop it before closing.',
+    'ql.btn.new': 'New entry',
+    'ql.btn.copy': 'Copy',
+    'ql.btn.edit': 'Edit',
+    'ql.btn.start': 'Start',
+    'ql.btn.stop': 'Stop',
+    'ql.btn.closeTab': 'Close tab',
+    'ql.term.pwsh': 'PowerShell 7 (pwsh)',
+    'ql.term.powershell': 'Windows PowerShell',
+    'ql.term.cmd': 'Command Prompt (cmd)',
+    'ql.term.wsl': 'WSL',
+    'ql.terminal.clear': 'Clear',
+    'ql.terminal.searchPlaceholder': 'Search terminal...',
+    'ql.terminal.searchPrev': 'Previous match',
+    'ql.terminal.searchNext': 'Next match',
+    'ql.terminal.count': '{cur} / {total}',
+    'ql.modal.newTitle': 'New quick launch entry',
+    'ql.modal.editTitle': 'Edit quick launch entry',
+    'ql.modal.name': 'Name',
+    'ql.modal.type': 'Type',
+    'ql.modal.type.shell': 'Command line',
+    'ql.modal.type.exe': 'Executable',
+    'ql.modal.terminal': 'Terminal',
+    'ql.modal.terminal.loading': 'Detecting...',
+    'ql.modal.cmd': 'Command',
+    'ql.modal.exe': 'Program path',
+    'ql.modal.btn.pick': 'Select file',
+    'ql.modal.btn.save': 'Save',
+    'ql.modal.btn.delete': 'Delete',
+    'ql.modal.delete.title': 'Delete quick launch entry',
+    'ql.modal.delete.message': 'Delete entry "{name}"?',
+    'ql.err.nameRequired': 'Name is required',
+    'ql.err.nameTaken': 'This name is already used',
+    'ql.err.running': 'This entry is running',
+    'ql.log.exit': 'Quick Launch · {name} · terminal exited',
+    'ql.log.fail': 'Quick Launch · {name} · start failed: {msg}',
     'update.title': 'Check for updates',
     'update.close': 'Close dialog',
     'update.btn.check': 'Check',
@@ -535,6 +641,23 @@ export const dict = {
     'err.proc.spawnFail': '{exe} failed to start: {err}',
     'err.proc.noChild': 'No child process',
     'err.proc.noPipe': 'stdout/stderr pipe not open',
+    // Quick Launch error messages (task 8, check D1-D11 / spec §5.3, §7.5).
+    // The prefix (VALIDATION: / STATE: / PROC:, index G7) comes from the call site.
+    // YAML and id-format errors reuse err.config.* above (index K9) - no err.ql.* synonyms.
+    // Placeholder names match the call sites verbatim (key-coverage.test.ts:44 compares both ways):
+    //   nameTooLong->{max}, nameDup->{name}, typeInvalid->{type}, terminalMissing/terminalGone->{terminal},
+    //   notFound->{id}, ptySpawn->{exe}{err}; nameRequired/cmdRequired/exeRequired/alreadyRunning have none.
+    'err.ql.nameRequired': 'Name is required',
+    'err.ql.nameTooLong': 'Name too long (max {max} characters)',
+    'err.ql.nameDup': 'Name "{name}" already exists',
+    'err.ql.typeInvalid': 'Invalid type "{type}" (must be shell or exe)',
+    'err.ql.terminalMissing': 'Terminal "{terminal}" is not available',
+    'err.ql.cmdRequired': 'Command is required',
+    'err.ql.exeRequired': 'Executable path is required',
+    'err.ql.notFound': 'Quick launch entry "{id}" not found',
+    'err.ql.alreadyRunning': 'This quick launch entry is already running',
+    'err.ql.terminalGone': 'Terminal "{terminal}" is no longer available',
+    'err.ql.ptySpawn': 'Failed to start terminal {exe}: {err}',
     'log.app.start.missing': 'Launch failed (missing config) · {msg}',
     'log.app.start.invalid': 'Launch failed (validation error) · {msg}',
     'log.app.start.fail': 'Launch failed · {msg}',
@@ -560,6 +683,7 @@ export const dict = {
     'app.winbar.close': 'Close',
     'app.dialog.filterModel': 'Model files',
     'app.dialog.filterJinja': 'Jinja template files',
+    'app.dialog.filterExe': 'Executable files',
     'common.unknown': 'unknown',
     'common.unknownError': 'unknown error',
     'common.unknownReason': 'unknown reason'
```
