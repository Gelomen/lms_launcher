# 任务 6 · 主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts` 第二段） — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 6 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.7 / §6.5（读侧） · 关联审查重点 **RF4 / RF5 / RF6**（索引 R 组）
> 前置：任务 4（管道与起宿主接缝）、任务 2（帧）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch.ts:175-182`（`ShellProcess` 六个方法逐字）、`:108-115`（已退出再注册立即补发的先例）、`:29`（`POLL_MS = 100`）、`:32`（`FORCE_EXIT_WAIT_MS = 1000`）、`:122-142`（`stopGraceful` 的幂等与委托顺序）；`src-main/shell-execute.ts:124-185`（`ShellExecProcess`：100ms 轮询、`isAlive`、`terminate`）
> 索引：[00-index.md](00-index.md) 的 G1、G2、K3、K14

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 5 的提交；porcelain 干净 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `quick-launch.ts:175-182` / `:108-115` / `:122-142`、`shell-execute.ts:124-185` | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-elevated.ts` 第一段的 `WinPipeApi` / `HostLauncher`；读 `ql-host-protocol.ts` 的帧类型 | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-elevated.ts` | 追加第二段：`ElevatedPtyProcess` 类 + `startElevatedHost(...)` 工厂 | `ShellProcess` 六方法逐字；不复制 `ShellExecProcess` 的轮询 | ☐ |
| B2 | `src-main/ql-elevated.test.ts` | 追加（假接缝 + 假定时器） | 不真起进程 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 类签名 | `new ElevatedPtyProcess(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell; cols; rows; cwd; logTarget })` —— plan 任务 6 签名块 | ☐ |
| C2 | 六个方法 | `write(string)` / `resize(cols, rows)` / `onData(cb)` / `onExit(code)` / `isRunning()` / `stopGraceful(timeoutSecs): Promise<void>` —— 与 `quick-launch.ts:175-182` 逐字对齐 | ☐ |
| C3 | 两个新常量 | `POLL_READ_MS = 20`、`HOST_HANDSHAKE_TIMEOUT_MS = 15000` —— 规格 §6.5 / §6.7 | ☐ |
| C4 | `HELLO` 载荷 | `{ token, shell, cols, rows, cwd }` —— 规格 §6.5 表；argv 里没有这些 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 6 步骤 1 的 8 条） | `npx vitest run src-main/ql-elevated.test.ts` | 新用例红 | ☐ |
| D2 | 实现 | 同上 | 全绿 | ☐ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| D4 | 全量 | `npm test` | 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `HELLO` 带全五个字段 | 规格 §6.4-4 | `hello_carries_token_shell_cols_rows_cwd` | ☐ |
| E2 | `DATA` 帧转给 `onData` | 规格 §6.7 | `data_frames_are_forwarded_to_onData` | ☐ |
| E3 | 退出码优先取 `EXIT` 帧 | 规格 §6.7 / RF5 | `exit_code_prefers_the_EXIT_frame` | ☐ |
| E4 | 宿主崩溃（无 `EXIT`）回落到句柄退出码 | 规格 §6.7 / 取证 P12 | `host_crash_falls_back_to_the_handle_exit_code` | ☐ |
| E5 | 已退出后注册 `onExit` 立即补发 | `quick-launch.ts:108-115` 同口径 | `registering_onExit_after_exit_replays_immediately` | ☐ |
| E6 | `stopGraceful` 先发 STOP、再委托句柄停止 | 规格 §6.7 / RF6 | `stopGraceful_delegates_after_the_EXIT_frame` | ☐ |
| E7 | 握手超时关闭管道句柄与进程句柄 | 规格 §6.7 / RF4 | `handshake_timeout_closes_pipe_and_host` | ☐ |
| E8 | 读侧只在 `available() > 0` 时 `read()` | 规格 §6.5 / §9-R7 | `read_polling_uses_available_not_blocking_read` | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 失败文案只用既有三键，`{exe}` 是用户目标 | 规格 §6.10 / 索引 K3 | ☐ |
| F2 | 不新增日志行 | 规格 §8-K10 / 索引 K10 | ☐ |
| F3 | 不改 `ShellProcess` 接口本身 | 索引 G4 / `quick-launch.ts:175-182` | ☐ |
| F4 | 新文件不含汉字字面量 | 索引 G6 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-elevated.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（停止语义的既有门） | `npx vitest run src-main/quick-launch.test.ts src-main/shell-execute.test.ts` | 全绿且未改这两个文件 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: ElevatedPtyProcess —— 提权宿主的 ShellProcess 形状` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B2 之外没有文件被改
- [ ] C1-C4 逐字一致
- [ ] D1→D4 先红后绿
- [ ] E1-E8 有对应测试且绿
- [ ] G1-G5 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-elevated.test.ts` |  |
| J-2 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-3 | `npm test` |  |
