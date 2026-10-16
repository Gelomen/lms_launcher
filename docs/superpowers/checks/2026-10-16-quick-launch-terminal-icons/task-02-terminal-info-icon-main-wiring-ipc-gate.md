# 任务 2 · `TerminalInfo.icon` + `main.ts` 接线 + IPC 形状门 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 2 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.2 / §6.3 / §6.6-1 / §7.1-7 · 关联审查重点 **RF1 RF2 RF3**
> 前置：任务 1（`withTerminalIcons` 已可用并已提交）
> 索引：[00-index.md](00-index.md) 的 G1 G2 G8 G9 G10、RF1 RF2 RF3、**K6**（缓存目录）、**K7**（载荷口径 + 两处旧口径必须同步改）、**K11**（`.gitignore` 加 `cache/`）、**K12**（`ipc-ql.test.ts:279` 的放宽写法）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置任务 1 已提交 | `git log --oneline -2` | 上一条 = `feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）`；`src-main/ql-terminal-icons.ts` 已在 HEAD 里 | ☑ |
| A2 | 接线点与既有形状属实 | 读 `src-main/main.ts:1040-1042`（`detectTerminalsAsync`：`setImmediate` + `resolve(detectTerminals())`）、`:1126`（`ipcMain.handle('ql_terminals', async ...)`，**本任务不改**）、`:83-86`（`dataDir()`：打包 = exe 目录，dev = `process.cwd()`）、`:105-109`（`updateZipDir()` = `<dataDir>/downloads/` + `mkdirSync` 吞错） | 与本表引用逐字一致 | ☑ |
| A3 | 「只下发 {id,path}」的两处现存载体在位（索引 K7） | 读 `src-main/quick-launch-terminals.ts:9`（注释原文「只下发 { id, path }：标签文案由渲染端 t() 决定」）与 `src-main/ipc-ql.test.ts:279`（`expect(Object.keys(info).sort()).toEqual(['id', 'path'])`） | 两处属实 → 本任务按 C3/C4 改写；前置 spec 文件已被 `b330a5c` 删除（规格 §3-P12），**不要**去改一个不存在的文件 | ☑ |
| A4 | 测试的 cwd 已被换成临时目录（索引 K11） | 读 `src-main/ipc-ql.test.ts:168-175`（`beforeAll` 里 `mkdtempSync` + `process.cwd = () => workDir`）与 `:207-209`（`afterAll` 还原 + 删除） | 属实 → 新增用例断言的缓存目录 = `join(workDir, 'cache', 'terminal-icons')`；**不许**往仓库根写 `cache/` | ☑ |
| A5 | 探测计数门仍在（RF3 的既有牙） | 读 `src-main/ipc-ql.test.ts:34-35`（`cap.termProbes` 计数器）与 C4 那两条用例 | 属实 → 本任务不得把「探测不缓存」改成缓存 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/quick-launch-terminals.ts` | 改两处：① `:17-20` 的 `TerminalInfo` 加可选 `icon?: string`（注释指向规格 §6.1）；② `:9` 的注释按 C3 改写 | `:26-105`（`systemRoot` / 四个 detect / `whereFirstExisting`）与 `:107-118`（`detectTerminals` 四行判定 + 顺序 + 不缓存）**一字不改**（G1） | ☑ |
| B2 | `src-main/main.ts` | 新增 `terminalIconCacheDir()`（放在 `updateZipDir()`（`:105-109`）之后，同一手法）；`detectTerminalsAsync`（`:1040-1042`）改为 `resolve(withTerminalIcons(terminalIconCacheDir(), detectTerminals()))` | `:1126` 的 handler 一字不改（仍 `async`）；`dataDir()` / `configDir()` 不改；不新增 IPC 通道 | ☑ |
| B3 | `src-main/ipc-ql.test.ts` | 改 `:273-287` 里 C4 第二条的形状断言（C4 段写法）；新增一条用例（C5） | 其余用例一字不改，含「两次调用不共用数组实例」那条与 `cap.termProbes` 计数门（A5） | ☑ |
| B4 | `.gitignore` | 加一行 `cache/`（放在 `logs/` 之后同类） | 其余行一字不动 | ☑ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `TerminalInfo` 新增字段：`icon?: string`，注释 = 「该项 exe 的真实图标，PNG 的 data URL（§6.1）。取不到 = 不带这个字段。」 | 规格 §6.3 | ☑ |
| C2 | `detectTerminals()` 的返回**不带** `icon`（探测层不填，索引 K7 推论 K1）；补字段的是 `withTerminalIcons` | 规格 §6.3 | ☑ |
| C3 | `quick-launch-terminals.ts:9` 注释改成：「主进程下发 `{ id, path }`，**可选**带 `icon`（PNG data URL，由 `ql-terminal-icons.ts` 补，见 2026-10-16 规格 §6.1）；标签文案仍由渲染端 `t()` 决定」 | 规格 §6.3 / 索引 K7 | ☑ |
| C4 | `ipc-ql.test.ts:279` 的断言改成三条：必含 `id` 与 `path`；`Object.keys(info)` 里除 `id` / `path` / `icon` 外不得有别的键；若 `typeof info.icon === 'string'` 则以 `data:image/png;base64,` 开头 | 规格 §6.6-1 / 索引 K12 | ☑ |
| C5 | 新增用例名（逐字）：`terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache` —— 两次 `invoke('ql_terminals')` → 两次都有 `cmd` 项；两次该项 `icon` 逐字相等；`join(workDir, 'cache', 'terminal-icons')` 下 `readdirSync` 出现至少一个 `.png` | 规格 §7.1-7 / RF3 | ☑ |
| C6 | `terminalIconCacheDir()` = `join(dataDir(), 'cache', 'terminal-icons')` + `mkdirSync(dir, { recursive: true })` 包 try/catch 吞异常 | 规格 §6.2 | ☑ |
| C7 | 无新 IPC 通道、无新 i18n 键（`ql_terminals` 一条通道带上新字段） | 规格 §6.3 / G2 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（C4 改写 + C5 新增） | — | 只碰 B3 一个文件 | ☑ |
| D2 | 跑红取证 | `npx vitest run src-main/ipc-ql.test.ts` | 新用例红（`icon` 为 `undefined` / 缓存目录不存在）；改写后的 C4 **仍绿**（当前实现不带 `icon`）——两条输出都贴 J 段 | ☑ |
| D3 | 实现 B1/B2/B4 | — | 只碰 B1/B2/B4 三份 | ☑ |
| D4 | 跑绿 | `npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts` | 两个文件全绿 | ☑ |
| D5 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0（`icon?: string` 不破坏任何调用点） | ☑ |
| D6 | 全量 | `npm test` | `Tests 919 passed (919)`（918 + 1），exit 0 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `ql_terminals` 的 handler 仍是 `AsyncFunction`（既有断言 `handlerOf('ql_terminals').constructor.name === 'AsyncFunction'` 不得红） | 接线改成 `await withTerminalIcons(...)` 后通道形态不变 | 规格 §6.3 / 既有 `ipc-ql.test.ts` C4 第一条 | ☑ |
| E2 | 两次调用返回的数组不是同一实例、`id` / `path` 集合一致 | 探测仍不缓存（图标缓存 ≠ 探测缓存） | 规格 §5-2 / RF3 / 索引 K6 | ☑ |
| E3 | 第二次调用的 `icon` 与第一次逐字相等，且第二次不再起提取进程（缓存命中） | 磁盘缓存生效 | 规格 §7.1-7 / RF3 | ☑ |
| E4 | 载荷里除 `id` / `path` / `icon` 外无别的键；`icon` 存在时前缀逐字 | 载荷形状收窄，渲染端可依赖 | 规格 §6.3 / C4 | ☑ |
| E5 | 本机取不到某项图标时（假接缝不可用，本任务不制造）该字段缺席而非空串 | 缺席 ≠ 空串（渲染端 `v-if` 判空） | 规格 §6.1 降级 / 索引 K5 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G1：探测层四行判定 / 顺序 / 不缓存一字不动 | `git diff -U0 src-main/quick-launch-terminals.ts` 只允许 `:9` 与 `:17-20` 两处 hunk | ☑ |
| F2 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空 | ☑ |
| F3 | 索引 K11：不往仓库根写 `cache/` | `git status --porcelain` 不出现 `cache/`；`.gitignore` 已含 `cache/` | ☑ |
| F4 | G9：不 `git add`、不 commit | 收尾时 `git log --oneline -1` 仍是任务 1 的提交 | ☑ |
| F5 | G10：只碰 B1–B4 四份 | `git diff --name-only` 与该表 B 段逐字对照 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿；条数 = 原条数 + 1 | ☑ |
| G2 | 索引 V1（跨任务） | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-terminals.test.ts` | 三个文件全绿（`quick-launch.ts` 消费 `TerminalInfo.path` 的链未被带偏） | ☑ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | `Tests 919 passed (919)`，exit 0 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src-main/quick-launch-terminals.ts src-main/main.ts src-main/ipc-ql.test.ts .gitignore` | ☑ |
| H2 | commit message（逐字） | `feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）` | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1–A5 实测过（含两处旧口径载体的原文）
- [x] B1–B4 落地、无越界（G1 的 diff 只有两处 hunk）
- [x] C1–C7 与 spec §6.2/§6.3 逐字一致
- [x] D1→D6 先红后绿，J 段有真实输出
- [x] E1–E5 全部有对应断言在位
- [x] F1–F5 无越界
- [x] G1–G5 全绿，总数 919
- [x] H1–H3 由主代理执行

## J. 执行记录（实现时填）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `git log --oneline -3` / `git status --porcelain`（A1 / F4 起点） | `2175f9d feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）` ← HEAD = 任务 1 的提交；上一条 `50c9e77 docs: … check 表 …`、`5c4313d docs: … spec + plan …`（索引 K17：旧 hash 按「文档 commit」读，未改文档）。分支 `feat/quick-launch`；工作区只有两份未跟踪的 task-01 文档 → A1 属实。 |
| J-2 | 读 `main.ts:83-86` / `:105-109` / `:1040-1042` / `:1126`、`quick-launch-terminals.ts:9` / `:17-20`、`ipc-ql.test.ts:34-35` / `:87-96` / `:168-175` / `:273-287`（A2-A5） | 逐字属实：`dataDir()` 打包=exe 目录 / dev=`process.cwd()`；`updateZipDir()` = `join(dataDir(),'downloads')` + `try{mkdirSync(d,{recursive:true})}catch{}`；`detectTerminalsAsync` = `new Promise((resolve)=>{setImmediate(()=>resolve(detectTerminals()))})`；`:1126` = `ipcMain.handle('ql_terminals', async …)`；`:9` 原文「只下发 { id, path }：标签文案由渲染端 t() 决定（索引 K4 / check F4）」；`TerminalInfo` 只有 `id`/`path`；`cap.termProbes` 只计数、实现仍跑真的（`:91-94`）；`beforeAll` 把 `process.cwd` 换成 `mkdtempSync(tmpdir()/'ipc-ql-')`。 |
| J-3 | `git diff --name-only` + `git diff --stat`（D1 之后） | 只有 `src-main/ipc-ql.test.ts`（`1 file changed, 40 insertions(+), 2 deletions(-)`）→ D1「只碰 B3 一个文件」成立。改动 = `:12` 加 `readdirSync` import、`:279` 的 C4 断言按 C4 段改写、`:305-325` 新增 C5 用例（用例名逐字）。 |
| J-4 | `npx vitest run src-main/ipc-ql.test.ts`（D2 跑红） | `❯ src-main/ipc-ql.test.ts (29 tests \| 1 failed)` → `Tests 1 failed \| 28 passed (29)`，exit 1。红的是新用例：`Error: ENOENT: no such file or directory, scandir 'C:\Users\…\Temp\ipc-ql-Frv42d\cache\terminal-icons'`（`ipc-ql.test.ts:307` 的 `readdirSync(cacheDir)`）= 缓存目录不存在，正是 D2 预期的两种红之一；**改写后的 C4 仍绿**（28 passed 含它，当前实现不带 `icon`）。`29 = 原 28 + 1` 同时给出 G1 的「原条数 = 28」。措辞与表里「`icon` 为 `undefined` / 缓存目录不存在」一致（索引 K15：按实际输出记）。 |
| J-5 | `git diff -U0 src-main/quick-launch-terminals.ts` + `git diff .gitignore`（D3 之后，F1 / B4） | 前者只有两处 hunk：`@@ -9 +9,2 @@`（注释按 C3 改写）与 `@@ -19,0 +21,2 @@ export interface TerminalInfo {`（加 `/** 该项 exe 的真实图标，PNG 的 data URL（§6.1）。取不到 = 不带这个字段。 */` + `icon?: string;`）→ `:26-105` / `:107-118` 一字未动（G1 / F1）。后者只加一行 `+cache/`（在 `logs/` 之后），其余行未动。 |
| J-6 | **主代理独立复跑（验收，18:5x）**：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-terminals.test.ts src-main/ql-terminal-icons.test.ts`（= G1 + 索引 V1）；`npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 定向 = `Test Files 4 passed (4)` / `Tests 78 passed (78)`（ipc-ql 29、quick-launch 34、terminals 9、icons 6）；`TSC_EXIT=0`；全量 = `Test Files 53 passed (53)` / `Tests 919 passed (919)` exit 0 → 与 J 段自述逐字一致 |
| J-7 | 主代理核 G1 / F3 边界：`git diff -U0 -- src-main/quick-launch-terminals.ts` 里 `^@@` 的计数；`Test-Path cache` | hunk 数 = **2**（只有 `:9` 注释与 `:17-20` 接口两处）；仓库根无 `cache/`；`.gitignore` 只多一行 `cache/`（在 `logs/` 之后） |
| J-6 | `npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts`（D4 跑绿） | `Test Files 2 passed (2)` / `Tests 35 passed (35)`，exit 0（`ipc-ql.test.ts (29 tests) 7519ms` + `ql-terminal-icons.test.ts (6 tests) 1281ms`，真机冒烟 `real_powershell_seam_extracts_a_png_for_a_known_exe 1219ms` 未跳过）。新用例真起了 `powershell.exe`（真接缝，未 mock）。 |
| J-7 | 同上输出的 `[ipc-ql] detectTerminals 真实调用次数` 一行（E2 / RF3 的证据） | 红跑 = 18，绿跑 = **19**（+1 = 新用例的两次 `ql_terminals` 减去它在红跑里失败前已发生的那一次）→ 两次调用各自实测，图标缓存没有把「探测不缓存」带偏；既有「两次调用不共用数组实例」用例一字未改且仍绿。 |
| J-8 | `npx vitest run src-main/ipc-ql.test.ts`（G1 定向） | 29 条全绿（见 J-6 的 `ipc-ql.test.ts (29 tests)`）= 原 28 + 1，与 G1「条数 = 原条数 + 1」一致。 |
| J-9 | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-terminals.test.ts`（G2 / 索引 V1） | `Test Files 3 passed (3)` / `Tests 72 passed (72)`，exit 0 → `quick-launch.ts` 消费 `TerminalInfo.path` 的链未被带偏。 |
| J-10 | `npx tsc --noEmit -p tsconfig.main.json`（D5 / G3） | 无任何输出，`TSC_EXIT=0`（`icon?: string` 不破坏任何调用点）。 |
| J-11 | `npx vitest run src-main/i18n` + `git diff src-main/i18n`（G4 / F2） | `index 3` / `no-hardcoded 2` / `key-coverage 2` / `dict 11` → `Test Files 4 passed (4)` / `Tests 18 passed (18)`，exit 0；`git diff src-main/i18n` 输出 0 字符 → 未新增 i18n 键（C7 / G2）。 |
| J-12 | `npm test`（D6 / G5 全量） | `Test Files 53 passed (53)` / **`Tests 919 passed (919)`**，`NPM_TEST_EXIT=0` = 918 + 1，与 D6 / 索引 G8 的预期逐字一致，无差额需要解释。 |
| J-13 | `git status --porcelain` / `Test-Path cache` / `(Get-Content .gitignore) -contains "cache/"` / `git log --oneline -1` / `git diff package.json pnpm-lock.yaml package-lock.json`（F3 / F4 / F5 / G3） | status 只有 ` M .gitignore`、` M src-main/ipc-ql.test.ts`、` M src-main/main.ts`、` M src-main/quick-launch-terminals.ts`（全部未暂存 → 未 `git add`、未 commit、未 stash，F4/G9）+ 两份 task-01 未跟踪文档；**无 `cache/`**，仓库根 `cache/` 不存在（F3：缓存只落在测试的临时目录）；`.gitignore` 含 `cache/` 行 = True；依赖 diff = 0 字符（G3）。`git diff --name-only` = 四份，与 B 段逐字一致（F5/G10）。 |
