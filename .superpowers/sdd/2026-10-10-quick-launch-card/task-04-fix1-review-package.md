# 修复轮 1 审查包 · 任务 4

FIX_BASE = fdc2770（上一轮审查的 HEAD 之后的 docs 提交）。两个源码文件是**未跟踪**文件，git diff 不显示，故用上一轮审查包里的旧测试全文与当前文件做 --no-index 对比。
实现文件 src-main/quick-launch-terminals.ts **本轮零改动**：主代理实测 Get-FileHash = 8BFDE9E37D2875B95CED44ED4529D004556F1E96F1523B084FDA1E3717A5E125，与实现者所报哈希一致；其全文已在上一轮审查包中，未重复附上。

## git status --porcelain（方括号定界）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md
?? src-main/quick-launch-terminals.test.ts
?? src-main/quick-launch-terminals.ts
```

## 修复 diff：src-main/quick-launch-terminals.test.ts（左 = 上一轮审查看到的 30 行，右 = 当前 180 行）

```diff
diff --git a/.superpowers/sdd/2026-10-10-quick-launch-card/task-04-prev-test.ts.txt b/src-main/quick-launch-terminals.test.ts
index 853aada..d35db9b 100644
--- a/.superpowers/sdd/2026-10-10-quick-launch-card/task-04-prev-test.ts.txt
+++ b/src-main/quick-launch-terminals.test.ts
@@ -1,13 +1,103 @@
 // src-main/quick-launch-terminals.test.ts
 // 任务 4：终端探测（pwsh / powershell / cmd / wsl），只返回可用项。
 // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §6.1 / §6.2 / §6.3 / §12.3
-// 三个用例逐字取自计划 §任务 4 步骤 1；对应 check 表 E1 / E2 / E3。
-// E4–E7（只返回可用项 / wsl 三条件 / pwsh where.exe / 固定路径回退）靠实现结构钉住，
-// 证据行号见 .superpowers/sdd/2026-10-10-quick-launch-card/task-04-report.md。
-import { describe, it, expect } from 'vitest';
+// E1 / E2 / E3 = 计划 §任务 4 步骤 1 的三个用例逐字（真机，未改动）。
+// E8 / E9 = 索引 K10 补的注入式回归用例（任务 4 审查 Important #1）：本机永远观察不到「wsl 可用」
+//   （规格 §6.3），where.exe 的三态也无法在真机稳定复现 → 不注入就永远验证不到 §6.1 的 wsl / pwsh 两行。
+//   注入只替换 node:child_process 的 spawnSync（未装脚本时委托真实实现，故 E3 的行为不变）；
+//   C1-C3 的导出签名一字未改；不 mock node:fs——「文件是否存在」走真实 fs：
+//   存在的文件取 process.execPath（跑 vitest 的 node 可执行文件，必然存在），不存在的取 MISSING_PATH 常量。
+// E4 / E7 的代码结构证据行号见 .superpowers/sdd/2026-10-10-quick-launch-card/task-04-report.md。
+import { describe, it, expect, vi, afterEach } from 'vitest';
 import { existsSync } from 'node:fs';
 import { parseWslDistroOutput, detectTerminals } from './quick-launch-terminals';
 
+// ─────────────────────────────────────────────────────────────────────────────
+// E8 / E9 的注入通道：必须在被测模块加载前就位，所以用 vi.hoisted + vi.mock
+// （仓库既有写法，见 src-main/llama-update-download.test.ts:4-35）。
+// ─────────────────────────────────────────────────────────────────────────────
+type SpawnOpts = { encoding?: string; windowsHide?: boolean; timeout?: number; [k: string]: unknown };
+type FakeResult = { status: number; stdout?: Buffer };
+type FakeScript = (cmd: string, args: readonly string[], opts: SpawnOpts) => FakeResult;
+
+const spawnHub = vi.hoisted(() => ({
+  impl: null as unknown as FakeScript | null,
+  calls: [] as { cmd: string; args: readonly string[]; opts: SpawnOpts }[],
+}));
+
+vi.mock('node:child_process', async () => {
+  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
+  return {
+    ...actual,
+    spawnSync: (cmd: string, args?: readonly string[], opts?: SpawnOpts) => {
+      const a = args ?? [];
+      const o = opts ?? {};
+      spawnHub.calls.push({ cmd, args: a, opts: o });
+      if (!spawnHub.impl) {
+        return (actual.spawnSync as unknown as (c: string, ar: readonly string[], op: SpawnOpts) => unknown)(cmd, a, o);
+      }
+      const r = spawnHub.impl(cmd, a, o);
+      // 按调用方请求的 encoding 交付：真机 spawnSync 的语义是「原始字节按 encoding 解码」，
+      // 所以实现里的 encoding 被改成 'utf-8' 时这里给出按 utf-8 解码的文本，不替实现兜底。
+      const raw = r.stdout ?? Buffer.alloc(0);
+      const stdout = !o.encoding || o.encoding === 'buffer' ? raw : raw.toString(o.encoding as BufferEncoding);
+      return { status: r.status, signal: null, output: [], pid: 0, stdout, stderr: Buffer.alloc(0) };
+    },
+  };
+});
+
+const REAL_PATH = process.execPath; // 必然存在的文件
+const MISSING_PATH = 'C:\\ql-t4-inject\\no-such-file.exe'; // 必然不存在的文件
+
+function utf16leBytes(text: string): Buffer { return Buffer.from(text, 'utf16le'); }
+function utf8Bytes(text: string): Buffer { return Buffer.from(text, 'utf-8'); }
+
+// 假进程脚本：where.exe 按查询名分派，'<exe> -l -q' 走 wslList；未登记的调用一律「查不到」（退出码 1）
+function scriptWith(handlers: {
+  wherePwsh?: FakeResult;
+  whereWslExe?: FakeResult;
+  wslList?: FakeResult;
+}): FakeScript {
+  const notFound: FakeResult = { status: 1, stdout: Buffer.alloc(0) };
+  return (cmd, args) => {
+    if (String(cmd).toLowerCase().endsWith('where.exe')) {
+      const name = String(args[0] ?? '');
+      if (name === 'pwsh') return handlers.wherePwsh ?? notFound;
+      if (name === 'wsl.exe') return handlers.whereWslExe ?? notFound;
+      return notFound;
+    }
+    if (args[0] === '-l' && args[1] === '-q') return handlers.wslList ?? notFound;
+    return notFound;
+  };
+}
+
+// 注入 → 重置模块缓存 → 动态 import 被测模块 → 探测
+async function detectWithInjectedSpawn(script: FakeScript) {
+  if (!existsSync(REAL_PATH) || existsSync(MISSING_PATH)) {
+    throw new Error('夹具路径不成立：REAL_PATH=' + existsSync(REAL_PATH) + ' MISSING_PATH=' + existsSync(MISSING_PATH));
+  }
+  spawnHub.impl = script;
+  spawnHub.calls = [];
+  vi.resetModules();
+  const mod = await import('./quick-launch-terminals');
+  return mod.detectTerminals();
+}
+
+function whereCalls(name: string) {
+  return spawnHub.calls.filter(
+    (c) => String(c.cmd).toLowerCase().endsWith('where.exe') && String(c.args[0] ?? '') === name,
+  );
+}
+function wslQueryCalls() {
+  return spawnHub.calls.filter((c) => c.args[0] === '-l' && c.args[1] === '-q');
+}
+
+afterEach(() => {
+  spawnHub.impl = null;
+  spawnHub.calls = [];
+  vi.resetModules();
+});
+
 describe('quick-launch-terminals.ts', () => {
 
   // E1（规格 §12.3）：wsl -l -q 的 UTF-16LE 输出 → 发行版名数组
@@ -28,3 +118,63 @@ describe('quick-launch-terminals.ts', () => {
     expect(existsSync(cmd!.path)).toBe(true);
   });
 });
+
+describe('E8 · wsl 三条件链（注入假 spawnSync；check E8 / 索引 K10）', () => {
+  // 夹具：where.exe wsl.exe 命中一个真实存在的文件 → 三条件的第一条成立
+  const wslExeFound: FakeResult = { status: 0, stdout: utf8Bytes(REAL_PATH + '\r\n') };
+
+  it('① wsl.exe 存在但 wsl -l -q 退出码非 0 → 数组里没有 wsl', async () => {
+    const found = await detectWithInjectedSpawn(
+      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 1, stdout: utf16leBytes('') } }),
+    );
+    expect(whereCalls('wsl.exe')).toHaveLength(1); // 前提：wsl.exe 确实被定位到（否则「无 wsl」是空断言）
+    expect(wslQueryCalls()).toHaveLength(1); // 前提：确实跑了 wsl -l -q
+    expect(found.map((t) => t.id)).not.toContain('wsl');
+  });
+
+  it('② 退出码 0 但解析结果为空 → 数组里没有 wsl', async () => {
+    const found = await detectWithInjectedSpawn(
+      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 0, stdout: utf16leBytes('\r\n\r\n') } }),
+    );
+    expect(wslQueryCalls()).toHaveLength(1);
+    expect(found.map((t) => t.id)).not.toContain('wsl');
+  });
+
+  it('③ 退出码 0 且有发行版 → 有 wsl 且 path = 该 wsl.exe', async () => {
+    const found = await detectWithInjectedSpawn(
+      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 0, stdout: utf16leBytes('Ubuntu\r\nDebian\r\n') } }),
+    );
+    const wsl = found.filter((t) => t.id === 'wsl');
+    expect(wsl).toHaveLength(1); // 规格 §6.2：只列默认发行版一项，不枚举
+    expect(wsl[0].path).toBe(REAL_PATH); // path = 定位到的那个 wsl.exe
+    const call = wslQueryCalls()[0];
+    expect(call.opts.windowsHide).toBe(true); // check F1
+    expect(call.opts.timeout).toBe(3000); // check F1：单项 3s
+    expect(call.opts.encoding).toBe('buffer'); // 规格 §6.1：wsl -l -q 输出是 UTF-16LE，必须按 buffer 取原始字节
+  });
+});
+
+describe('E9 · where.exe 判定（注入假 spawnSync；check E9 / 索引 K10）', () => {
+  it('① where.exe 退出码非 0 → pwsh 不可用', async () => {
+    const found = await detectWithInjectedSpawn(scriptWith({ wherePwsh: { status: 1, stdout: Buffer.alloc(0) } }));
+    expect(whereCalls('pwsh')).toHaveLength(1);
+    expect(found.map((t) => t.id)).not.toContain('pwsh');
+  });
+
+  it('② 退出码 0 但首行指向不存在的文件 → pwsh 不可用（不回退第二行）', async () => {
+    const found = await detectWithInjectedSpawn(
+      scriptWith({ wherePwsh: { status: 0, stdout: utf8Bytes(MISSING_PATH + '\r\n' + REAL_PATH + '\r\n') } }),
+    );
+    expect(whereCalls('pwsh')).toHaveLength(1);
+    expect(found.map((t) => t.id)).not.toContain('pwsh'); // 规格 §6.1「首行为存在的文件」：第二行存在也不用
+  });
+
+  it('③ 首行存在 → 用该路径', async () => {
+    const found = await detectWithInjectedSpawn(
+      scriptWith({ wherePwsh: { status: 0, stdout: utf8Bytes(REAL_PATH + '\r\n' + MISSING_PATH + '\r\n') } }),
+    );
+    const pwsh = found.filter((t) => t.id === 'pwsh');
+    expect(pwsh).toHaveLength(1);
+    expect(pwsh[0].path).toBe(REAL_PATH);
+  });
+});
```

## 同期 check 表 diff（docs 记录，不属于代码范围）

```diff
diff --git a/docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md b/docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md
index 385dc25..58e58d2 100644
--- a/docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md
+++ b/docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md
@@ -16,5 +16,5 @@
 |---|---|---|---|---|
 | B1 | `src-main/quick-launch-terminals.ts` | 新建 | 只做探测与解析，不 spawn PTY | ☑ |
-| B2 | `src-main/quick-launch-terminals.test.ts` | 新建 | 计划给出的 3 个用例 **+ 索引 K10 补的 E8/E9 两条回归用例**（任务 4 审查 Important #1 裁定补，见该轮审查与 K10） | ☐ |
+| B2 | `src-main/quick-launch-terminals.test.ts` | 新建 | 计划给出的 3 个用例 **+ 索引 K10 补的 E8/E9 两条回归用例**（任务 4 审查 Important #1 裁定补，见该轮审查与 K10） | ☑ |
 
 ## C. 接口契约（逐字一致）
@@ -46,6 +46,6 @@
 | E6 | `pwsh` 判定用 `where.exe pwsh` 退出码 0 且首行是存在的文件 |  | 规格 §6.1 | ☑ |
 | E7 | `powershell` / `cmd` 用固定路径存在性判定（`%SystemRoot%\System32\...` / `%ComSpec%` 回退） |  | 规格 §6.1 | ☑ |
-| E8 | wsl 三条件链回归（注入假 `spawnSync`，不改 C1-C3 签名）：① `wsl.exe` 存在但 `wsl -l -q` 退出码非 0 → 数组里无 `wsl`；② 退出码 0 但解析结果为空 → 无 `wsl`；③ 退出码 0 且有发行版 → 有 `wsl` 且 `path` = 该 `wsl.exe` | 本机永远观察不到「wsl 可用」（规格 §6.3 / §12.10），故只能靠注入 | 任务 4 审查 Important #1 + 索引 K10；行为本身出处仍是规格 §6.1 wsl 行 | ☐ |
-| E9 | `where.exe` 判定回归（同上注入）：① 退出码非 0 → 该项不可用；② 退出码 0 但首行指向不存在的文件 → 该项不可用（不回退第二行）；③ 首行存在 → 用该路径 |  | 任务 4 审查 Important #1 + 索引 K10；出处规格 §6.1 pwsh 行 | ☐ |
+| E8 | wsl 三条件链回归（注入假 `spawnSync`，不改 C1-C3 签名）：① `wsl.exe` 存在但 `wsl -l -q` 退出码非 0 → 数组里无 `wsl`；② 退出码 0 但解析结果为空 → 无 `wsl`；③ 退出码 0 且有发行版 → 有 `wsl` 且 `path` = 该 `wsl.exe` | 本机永远观察不到「wsl 可用」（规格 §6.3 / §12.10），故只能靠注入 | 任务 4 审查 Important #1 + 索引 K10；行为本身出处仍是规格 §6.1 wsl 行 | ☑ |
+| E9 | `where.exe` 判定回归（同上注入）：① 退出码非 0 → 该项不可用；② 退出码 0 但首行指向不存在的文件 → 该项不可用（不回退第二行）；③ 首行存在 → 用该路径 |  | 任务 4 审查 Important #1 + 索引 K10；出处规格 §6.1 pwsh 行 | ☑ |
 
 ## F. 本任务相关的硬约束
@@ -77,5 +77,5 @@
 ## I. 完成判据
 
-- [x] E1-E7 有测试或代码证据（E1-E3 = 用例；E4-E7 = 代码结构，行号见报告）
+- [x] E1-E9 有测试或代码证据（E1-E3 = 用例；E4-E7 = 代码结构 + 真机反证，行号见报告；E8/E9 = 注入式用例，索引 K10 补登记）
 - [x] D4 本机结果 = `powershell / cmd / pwsh`（无 wsl），输出记入 J
 - [x] G1-G3 通过
@@ -99,2 +99,11 @@
 | G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出；`TSC_EXIT=0` | 类型门无错 |
 | G3 | `git diff --name-only`；`git status --porcelain` | 前者只含本表 `docs/…/task-04-terminal-detection.md`（填 J 段所致）；后者 = `?? src-main/quick-launch-terminals.test.ts` 与 `?? src-main/quick-launch-terminals.ts`（报告写在 `.superpowers/`，被 gitignore，不进 status） | **代码**改动范围 = B1 + B2，无越界；未 `git add`、未 commit |
+| 修复轮 1 · 补 E8/E9（B2 边界） | 只改 `src-main/quick-launch-terminals.test.ts`：E1-E3 三个用例逐字未动（脚本逐行比对 = 字节一致）；新增注入通道 `:19-47`（`vi.hoisted` + `vi.mock('node:child_process')`，未装脚本时委托真实 `spawnSync`，故 E3 行为不变）、夹具与脚本 `:49-99`（不 mock `node:fs`：存在的文件取 `process.execPath`、不存在的取 `MISSING_PATH`）、E8 三个用例 `:122-155`、E9 三个用例 `:157-180`。实现文件 `src-main/quick-launch-terminals.ts` 一字未改（C1-C3 签名与探测语义不变，未加注入参数） | 9 tests collected | 按 K10 (2) 注入假 `spawnSync` 即可，无需改导出签名 |
+| 修复轮 1 · G1 定向 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `✓ src-main/quick-launch-terminals.test.ts (9 tests) 168ms` / `Test Files 1 passed (1)` / `Tests 9 passed (9)`（exit 0） | E1/E2/E3 真机用例 + E8①②③ + E9①②③ 全绿 |
+| 修复轮 1 · 相邻回归 | `npx vitest run src-main/quick-launch-terminals.test.ts src-main/quick-launch-config.test.ts` | `Test Files 2 passed (2)` / `Tests 28 passed (28)`（exit 0；config 用例打印的 `[i18n] missing key: err.ql.*` 是任务 3 既有现象，用例仍全绿，与本任务无关） | 相邻文件无回归 |
+| 修复轮 1 · G2 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出；`TSC_EXIT=0` | 通过 |
+| 反向自检 A（E8 的回归保护） | 临时把 `:89` 改成 `if (distros.length > 0) return null;` → 跑定向 → 还原 | `Tests 2 failed / 7 passed (9)`（exit 1）：E8② `expected [ 'powershell', 'cmd', 'wsl' ] to not include 'wsl'`；E8③ `expected [] to have a length of 1 but got +0` | 判定写反即红 → E8 确有回归保护（原三条用例在此变异下仍全绿） |
+| 反向自检 B（encoding） | 临时把 `:84` 改成 `encoding: 'utf-8',` → 跑定向 → 还原 | `Tests 1 failed / 8 passed (9)`（exit 1）：E8③ `expected 'utf-8' to be 'buffer'`（由 `:153` 的选项断言抓出）。注：数组级断言在 ASCII 发行版名下经「utf-8 解码 + 剥 NUL」仍成立，所以必须钉住请求的 `encoding` 才守得住这一行 | encoding 被改即红 |
+| 修复轮 1 · 还原后重跑 | 定向 + 相邻 + `npx tsc -p tsconfig.main.json --noEmit` | `Tests 9 passed (9)` / `Tests 28 passed (28)` / `TSC_EXIT=0`；`Get-FileHash src-main/quick-launch-terminals.ts` = `8BFDE9E37D2875B95CED44ED4529D004556F1E96F1523B084FDA1E3717A5E125`，`:84` / `:89` 已复原 | 全绿；实现文件未被改动 |
+| 修复轮 1 · G3 范围 | `git status --porcelain`；`git diff --name-only`；`git rev-parse --short HEAD` | `?? src-main/quick-launch-terminals.test.ts`、`?? src-main/quick-launch-terminals.ts`；`git diff --name-only` 只含本表；HEAD 仍 `fdc2770` | 改动范围 = B1 + B2 + 本表 J 段；未 `git add`、未 commit |
+| 修复轮 1 · 「E3 行为不变」取证 | 临时建 `src-main/ql-t4-tmp-delegation.test.ts`（跑完即删）：同样的 mock 形态但 `impl = null`，断言 `detectTerminals()` 仍走真实实现 | `SEEN_CALLS= ["where.exe pwsh","where.exe wsl.exe","C:\\Windows\\System32\\wsl.exe -l -q"]` / `IDS= ["powershell","cmd","pwsh"]`（1 passed，exit 0） | 未装脚本时委托真实 `spawnSync` → E3 真机用例的行为与改动前一致；顺带独立复现 D4 基线（无 wsl）与 F6 的固定路径回退分支（`where.exe wsl.exe` 未命中 → 走 `%SystemRoot%\System32\wsl.exe`） |
```
