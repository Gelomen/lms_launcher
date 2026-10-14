# 任务 3 · 可执行程序的「管理员」= `runas` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 3 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.9 / §6.4-3 / §6.10 · 关联审查重点 **RF2**（索引 R 组）
> 前置：任务 1（条目里有 `admin` 可取）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/shell-execute.ts:14`（`shellExecute(file, nShow)`）、`:80-102`（真实现：`lpVerb: null` 在 `:87`、`lpParameters: null` 在 `:89`、`fMask = 0x40|0x04` 在 `:86`、`nShow=1` 由调用方传）、`:191-201`（`launchShellExe`，`1223` → `err.proc.uacCancelled` 在 `:194-198`）；`src-main/main.ts:1050-1072`（`spawnExeProcess`）、`main.ts:1082`（`spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId)`）；`src-main/ipc-ql.test.ts:327-349`（exe 启动的既有用例）
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G4

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 2 的提交；porcelain 干净 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `shell-execute.ts:14` / `:80-102` / `:191-201`、`main.ts:1050-1072` / `:1082` | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `quick-launch-config.ts:14` 确认 `admin?: boolean` 已存在 | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/shell-execute.ts` | 改：`:14` 签名加可选第三参；`:87` / `:89` 取 `opts?.verb ?? null` / `opts?.parameters ?? null`；`launchShellExe` 加第三参 `verb` | `fMask` / `nShow` / `lpDirectory` / 句柄轮询 / `killTree` 一字不动 | ☐ |
| B2 | `src-main/shell-execute.test.ts` | 改：新增 2 条 + 既有 uac 用例保持 | 不改既有断言文案 | ☐ |
| B3 | `src-main/main.ts` | 改：`spawnExeProcess` 取当前条目的 `admin` 并传 `runas` | `:1082` 的槽守卫接线不删；日志通道与 `[lms_launcher] ` 前缀不变 | ☐ |
| B4 | `src-main/ipc-ql.test.ts` | 改：新增 exe 提权形状门 | 不动其它通道用例 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `WinShellApi.shellExecute` 新签名 | `shellExecute(file: string, nShow: number, opts?: { verb?: string \| null; parameters?: string \| null })` —— plan 任务 3 签名块 | ☐ |
| C2 | `launchShellExe` 新签名 | `launchShellExe(api: WinShellApi, exe: string, verb?: string \| null): ShellExecProcess` | ☐ |
| C3 | `main.ts` 适配器怎么取 `admin` | 两种实现任选其一，选定后写进本表 C4 并在 J 段留证据：(a) `spawnExeProcess(exe, configId, admin)` 由 `:1082` 的接线传；(b) 从 `qlStartContextOrThrow` 的槽里取当前 entry | ☐ |
| C4 | 选定结果（实现时填） | —— | ☐（实现时填：选定 (a) 还是 (b) + 代码行号） |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 3 步骤 1） | `npx vitest run src-main/shell-execute.test.ts` | 新用例红（现签名没有第三参） | ☐ |
| D2 | 实现 `shell-execute.ts` | 同上 | 全绿 | ☐ |
| D3 | 改 `main.ts` 适配器 + `ipc-ql.test.ts` 形状门 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿 | ☐ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `admin:true` → 假 api 收到 `verb === 'runas'` | 规格 §6.9 | `verb_runas_is_passed_through_to_the_shell` | ☐ |
| E2 | 无 `admin` → `verb` 与 `parameters` 都是 `null`（前置规格 E8 不变） | 规格 §4-4 / 索引 G3 / RF2 | `no_opts_keeps_verb_and_parameters_null` | ☐ |
| E3 | UAC 取消仍映射到 `err.proc.uacCancelled` 且 `{exe}` 是用户路径 | 规格 §6.10 / 前置规格 §8-K2 | 既有 uac 用例（不改文案）+ `ipc-ql` 的日志断言 | ☐ |
| E4 | `main.ts:1082` 的槽守卫仍在（不静默降级） | `main.ts:1009-1011` 的既有口径 | `ipc-ql.test.ts` 的并发/槽用例全绿 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只有 `PROC:` | 索引 G1（`shell-execute.ts:188` 注释） | ☐ |
| F2 | 不新增词典键 | 索引 G2 | ☐ |
| F3 | 不勾选路径逐字节不变 | 索引 G3 / RF2 | ☐ |
| F4 | 不改 `process.ts` / llama-server 路径 | 索引 G4 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（exe 启动的既有门） | `npx vitest run src-main/ipc-ql.test.ts` | `327-349` 的既有用例一字未改且绿 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/shell-execute.ts`、`src-main/shell-execute.test.ts`、`src-main/main.ts`、`src-main/ipc-ql.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 可执行程序启动项的管理员开关走 ShellExecuteEx runas` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B4 之外没有文件被改
- [ ] C1-C4 逐字一致（C4 已填）
- [ ] D1→D4 先红后绿
- [ ] E1-E5 有对应测试且绿
- [ ] G1-G5 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/shell-execute.test.ts` |  |
| J-2 | `npx vitest run src-main/ipc-ql.test.ts` |  |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-4 | `npm test` |  |
