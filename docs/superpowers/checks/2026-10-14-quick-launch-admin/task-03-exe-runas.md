# 任务 3 · 可执行程序的「管理员」= `runas` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 3 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.9 / §6.4-3 / §6.10 · 关联审查重点 **RF2**（索引 R 组）
> 前置：任务 1（条目里有 `admin` 可取）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/shell-execute.ts:14`（`shellExecute(file, nShow)`）、`:80-102`（真实现：`lpVerb: null` 在 `:87`、`lpParameters: null` 在 `:89`、`fMask = 0x40|0x04` 在 `:85`（本表生成时写 `:86`，实现期实测为 `:85`，差一行——见验收块）、`nShow=1` 由调用方传）、`:191-201`（`launchShellExe`，`1223` → `err.proc.uacCancelled` 在 `:194-198`）；`src-main/main.ts:1050-1072`（`spawnExeProcess`）、`main.ts:1082`（`spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId)`）；`src-main/ipc-ql.test.ts:327-349`（exe 启动的既有用例）
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G4、**K29**（第三参类型含 \`| null\`）、**K34**（\`launchShellExe\` 的 arity 口径，任务 4/6 不得加 \`parameters\`）
>
> **主代理验收（2026-10-14 20:3x，独立复跑 G 段全部命令）**：G1 → \`Test Files 2 passed (2)\` / \`Tests 34 passed (34)\`；G2 → \`Tests 24 passed (24)\`（既有 exe 用例一字未改，该文件 diff 纯新增）；G3 tsc → 无输出 \`TSC_EXIT=0\`；G4 i18n → \`4 passed (4)\` / \`18 passed (18)\`；G5 全量 → \`Test Files 49 passed (49)\` / \`Tests 847 passed (847)\`（844 + 本任务 3）。\`git diff\` 逐行核对：\`shell-execute.ts\` 只改签名 / 两处取值 / \`launchShellExe\`（\`fMask\`、\`nShow\`、\`lpDirectory\`、轮询、\`killTree\`、1223 分类一字未动）；\`main.ts\` 四处逐字 = C3（含 \`:1026\` 守卫返回类型连带加宽，否则 \`ctx.admin\` 过不了类型门）；\`:1088\` 的槽守卫仍在

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 2 的提交；porcelain 干净 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `shell-execute.ts:14` / `:80-102` / `:191-201`、`main.ts:1050-1072` / `:1082` | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `quick-launch-config.ts:14` 确认 `admin?: boolean` 已存在 | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/shell-execute.ts` | 改：`:14` 签名加可选第三参；`:87` / `:89` 取 `opts?.verb ?? null` / `opts?.parameters ?? null`；`launchShellExe` 加第三参 `verb` | `fMask` / `nShow` / `lpDirectory` / 句柄轮询 / `killTree` 一字不动 | ☑ |
| B2 | `src-main/shell-execute.test.ts` | 改：新增 2 条 + 既有 uac 用例保持 | 不改既有断言文案 | ☑ |
| B3 | `src-main/main.ts` | 改（四处，见 C3）：`qlStartContext` 类型（`:1013`）加 `admin: boolean`；`ql_start`（`:1118`）写入 `admin: entry.admin === true`；`spawnExeProcess`（`:1050`）加显式第三形参 `admin: boolean` 并据此传 `'runas'`；`:1082` 接线取槽并传参 | `:1082` 的 `qlStartContextOrThrow('spawnExe')` 调用不删；日志通道与 `[lms_launcher] ` 前缀不变；`ql_start` 其余逻辑（探测、`hasOwnProperty`、`finally` 清槽）一字不动 | ☑ |
| B4 | `src-main/ipc-ql.test.ts` | 改：新增 exe 提权形状门 | 不动其它通道用例 | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `WinShellApi.shellExecute` 新签名 | `shellExecute(file: string, nShow: number, opts?: { verb?: string \| null; parameters?: string \| null })` —— plan 任务 3 签名块 | ☑ |
| C2 | `launchShellExe` 新签名 | `launchShellExe(api: WinShellApi, exe: string, verb?: string \| null): ShellExecProcess` | ☑ |
| C3 | `main.ts` 适配器怎么取 `admin`（**已定**：索引 K16 由主代理 2026-10-14 19:2x 裁决 R-03 落定） | 取槽 + 显式形参的合并式：① `qlStartContext`（`main.ts:1013`）类型加 `admin: boolean`；② `ql_start`（`:1118`）写入 `admin: entry.admin === true`；③ `:1082` 的接线改为 `spawnExe: (exe) => { const ctx = qlStartContextOrThrow('spawnExe'); return spawnExeProcess(exe, ctx.configId, ctx.admin); }`。理由：`QlDeps.spawnExe(exe)` 签名里没有条目（`quick-launch.ts:171`），槽是「本次 start 上下文」的唯一来源；显式形参让适配器仍可单测 | ☑（口径已定，代码归实现者） |
| C4 | 落地行号（实现时填） | 口径 = C3；本行只填真实行号证据 | ☑（主代理核对过 diff 与 J-5，实现者已填真实行号，落勾归主代理：槽类型加 `admin` = `main.ts:1016`（连带：守卫 `qlStartContextOrThrow` 的返回类型同步加宽 = `:1026`，否则 `ctx.admin` 过不了类型门）；槽写入 `admin: entry.admin === true` = `:1126`；`spawnExeProcess` 显式第三形参 = `:1055`，据此传 `'runas'` = `:1063`；接线取槽并传第三实参 = `:1087-1090`（`qlStartContextOrThrow('spawnExe')` 仍在 `:1088`）。接缝侧：接口签名 = `shell-execute.ts:14-18`、真实现形参 = `:84`、`lpVerb` = `:91`、`lpParameters` = `:94`、`launchShellExe` = `:197-203`。逐 hunk 证据见 J-5 与 task-03-report.md 第 2 节） |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 3 步骤 1） | `npx vitest run src-main/shell-execute.test.ts` | 新用例红（现签名没有第三参） | ☑ |
| D2 | 实现 `shell-execute.ts` | 同上 | 全绿 | ☑ |
| D3 | 改 `main.ts` 适配器 + `ipc-ql.test.ts` 形状门 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿 | ☑ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `admin:true` → 假 api 收到 `verb === 'runas'` | 规格 §6.9 | `verb_runas_is_passed_through_to_the_shell` | ☑ |
| E2 | 无 `admin` → `verb` 与 `parameters` 都是 `null`（前置规格 E8 不变） | 规格 §4-4 / 索引 G3 / RF2 | `no_opts_keeps_verb_and_parameters_null` | ☑ |
| E3 | UAC 取消仍映射到 `err.proc.uacCancelled` 且 `{exe}` 是用户路径 | 规格 §6.10 / 前置规格 §8-K2 | 既有 uac 用例（不改文案）+ `ipc-ql` 的日志断言 | ☑ |
| E4 | `main.ts:1082` 的槽守卫仍在（不静默降级） | `main.ts:1009-1011` 的既有口径 | `ipc-ql.test.ts` 的并发/槽用例全绿 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只有 `PROC:` | 索引 G1（`shell-execute.ts:188` 注释） | ☑ |
| F2 | 不新增词典键 | 索引 G2 | ☑ |
| F3 | 不勾选路径逐字节不变 | 索引 G3 / RF2 | ☑ |
| F4 | 不改 `process.ts` / llama-server 路径 | 索引 G4 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts` | 全绿 | ☑ |
| G2 | 相邻回归（exe 启动的既有门） | `npx vitest run src-main/ipc-ql.test.ts` | `327-349` 的既有用例一字未改且绿 | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | 全绿 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/shell-execute.ts`、`src-main/shell-execute.test.ts`、`src-main/main.ts`、`src-main/ipc-ql.test.ts` | ☑ |
| H2 | commit message 逐字 | `feat: 可执行程序启动项的管理员开关走 ShellExecuteEx runas` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B4 之外没有文件被改
- [x] C1-C4 逐字一致（C4 已填）
- [x] D1→D4 先红后绿
- [x] E1-E5 有对应测试且绿
- [x] G1-G5 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/shell-execute.test.ts` | 先红（20:22:20，D1）：`❯ src-main/shell-execute.test.ts (10 tests \| 2 failed)`，两条新用例 `× verb_runas_is_passed_through_to_the_shell → expected undefined to be 'runas'`、`× no_opts_keeps_verb_and_parameters_null → expected undefined to be defined`，`Tests 2 failed \| 8 passed (10)`（既有 8 条全绿 = 红的原因是第三参缺失，不是撞坏别的）。后绿（20:22:54，D2）：`✓ src-main/shell-execute.test.ts (10 tests)`、`Test Files 1 passed (1)` / `Tests 10 passed (10)`、exit 0 |
| J-2 | `npx vitest run src-main/ipc-ql.test.ts` | 先红（20:23:32，改 main.ts 之前）：`Tests 1 failed \| 23 passed (24)`，失败行 `× exe 提权形状门… → expected [ null, null ] to deeply equal [ 'runas', null ]`（main.ts 还没传 admin）。后绿（20:24:17）：`Tests 24 passed (24)`、exit 0；其中既有 exe 用例 `exe 配置：{ tabId: null }…` 与 `exe 启动失败：前缀由 shell-execute 自带…` 都 ✓（G2：该文件 `git diff --numstat` = `39 0`，纯新增，既有用例一字未改） |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` | 无任何诊断输出；补测退出码 `TSC_EXIT=0`（R-01 / 索引 K27 的命令逐字） |
| J-4 | `npm test` | `Test Files 49 passed (49)` / `Tests 847 passed (847)`、`Duration 8.81s`、exit 0。起点实测基线是 `49 / 844`（本表 A2 的 `48 / 835` 是任务 2 落地前测的，见报告偏离 2）；本任务 +3 条（`shell-execute.test.ts` 2 条、`ipc-ql.test.ts` 1 条），只增不减 |
| J-5 | `git diff src-main/main.ts`（C4 的行号证据） | 五个 hunk，逐条对上 C3：`-let qlStartContext: { configId: string; available: Set<TerminalId> } \| null` → `+let qlStartContext: { configId: string; available: Set<TerminalId>; admin: boolean } \| null`（现 `:1016`）；`-export function qlStartContextOrThrow(seam: string): { … }` → 返回类型加 `admin: boolean`（现 `:1026`，C3 ① 的必要连带）；`-function spawnExeProcess(exe: string, configId: string \| null): {` → `+function spawnExeProcess(exe: string, configId: string \| null, admin: boolean): {`（现 `:1055`）；`-proc = launchShellExe(winShell, exe);` → `+proc = launchShellExe(winShell, exe, admin ? 'runas' : null);`（现 `:1063`）；`-spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId),` → 三行块 `const ctx = qlStartContextOrThrow('spawnExe'); return spawnExeProcess(exe, ctx.configId, ctx.admin);`（现 `:1087-1090`，守卫调用保留）；`-qlStartContext = { configId: id, available };` → `+qlStartContext = { configId: id, available, admin: entry.admin === true };`（现 `:1126`）。另两处是注释（槽的 `admin` 条目、`spawnExeProcess` 的 `admin` 形参说明）。`git diff --name-only` 只含 B 段四文件 + 主代理先于我留下的三份任务 2 文档（见报告偏离 1） |
| J-6 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts`（G1 定向） | 20:24:35：`Test Files 2 passed (2)` / `Tests 34 passed (34)`（10 + 24），exit 0 |
| J-7 | `npx vitest run src-main/i18n`（G4 三门） | 20:24:44：`✓ index.test.ts (3)` `✓ no-hardcoded.test.ts (2)` `✓ dict.test.ts (11)` `✓ key-coverage.test.ts (2)`，`Test Files 4 passed (4)` / `Tests 18 passed (18)`；`git diff` 不含 `src-main/i18n/dict.ts`（G2 零新键） |
