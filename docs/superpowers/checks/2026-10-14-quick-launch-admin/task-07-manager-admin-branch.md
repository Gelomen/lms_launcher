# 任务 7 · `QuickLaunchManager` 的 admin 分支 + `main.ts` 接线 — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 7 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.8 / §6.10 · 关联审查重点 **RF1 / RF2**（索引 R 组）
> 前置：任务 1（`e.admin`）、任务 6（`ElevatedPtyProcess`）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch.ts:166-172`（`QlDeps` 五个成员）、`:223-225`（`protected createShellProcess`）、`:232-266`（`start()` 的 shell 分支：`:238` 读 `available`、`:241` 调接缝、`:242-245` 失败不残留、`:244` 的 `err.ql.ptySpawn` 带 `shellExe(shell).exe`、`:249-253` 先转渲染端再放自动命令、`:264` `scheduleAutoCommand`）、`:322`（`stopAll`）；`src-main/quick-launch.test.ts:151-156`（唯一的 `QlDeps` 夹具，`:156` = `spawnExe:`）；`src-main/main.ts:1076-1085`（`new QuickLaunchManager(` 在 `:1076`、`spawnExe:` 在 `:1082`）、`:1002-1025`（`qlStartContextOrThrow` 槽守卫）、`:1064`（`emitLog('[lms_launcher] ' + msg, 'sys')` 的分工）
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G4、K3、K9、K10

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 6 的提交；porcelain 干净 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | 起点基线写在索引头部「测试基线」行；本任务后用例数只增不减 | ☐（原因：本环境跑 vitest 需完全访问沙箱，审批未通过 → spawn EPERM；去处：派单前主代理实测后填索引头部「测试基线」行与本行） |
| A3 | 本表引用的锚点行号属实 | 读 `quick-launch.ts:166-172` / `:223-225` / `:232-266` / `:322`、`quick-launch.test.ts:151-156`、`main.ts:1002-1025` / `:1076-1085` | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-elevated.ts` 的 `startElevatedHost` 工厂签名 | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/quick-launch.ts` | 改：`QlDeps` 加必填 `spawnElevatedShell`；加 `protected createElevatedShellProcess`；`start()` shell 分支按 `e.admin === true` 分流 | `write` / `resize` / `stop` / `stopAll` / `finalize` / `scheduleAutoCommand` 一字不动 | ☐ |
| B2 | `src-main/quick-launch.test.ts` | 改：`:151-156` 夹具补 `spawnElevatedShell` + 新增 5 条用例 | 不改既有断言文案 | ☐ |
| B3 | `src-main/main.ts` | 改：`:1076-1085` 的接线补 `spawnElevatedShell` | `:1082` 槽守卫不删；日志前缀与通道不变 | ☐ |
| B4 | `src-main/ipc-ql.test.ts` | 改：新增端到端形状门 | 不动其它通道用例 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `QlDeps` 新成员（必填） | `spawnElevatedShell(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess>` —— 规格 §6.8 | ☐ |
| C2 | 新接缝 | `protected async createElevatedShellProcess(shell, cols, rows, cwd): Promise<ShellProcess>` —— 与 `:223-225` 同一手法 | ☐ |
| C3 | 分流条件 | `e.admin === true`（不是 truthy）—— 规格 §6.8 | ☐ |
| C4 | 错误文案 | 失败仍走 `PROC: t('err.ql.ptySpawn', { exe: shellExe(shell).exe, err })` —— 规格 §6.10 / `:244` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 7 步骤 1 的 5 条 + 夹具） | `npx vitest run src-main/quick-launch.test.ts` | 夹具缺成员 → 类型/构造红；新用例红 | ☐ |
| D2 | 实现 `quick-launch.ts` | 同上 | 全绿 | ☐ |
| D3 | `main.ts` 接线 + `ipc-ql.test.ts` 形状门 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿 | ☐ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `admin:true` 走提权宿主、本地 `pty.spawn` 未被调用 | 规格 §6.8 | `admin_true_starts_through_the_elevated_host` | ☐ |
| E2 | `admin` 为假走本地 PTY（原路径不变） | 规格 §4-4 / RF2 | `admin_falsy_uses_the_plain_local_pty` | ☐ |
| E3 | 提权启动失败不残留实例 | `quick-launch.ts:242-245` 语义 | `admin_true_failure_leaves_no_instance` | ☐ |
| E4 | 自动命令在首批输出之后释放 | `quick-launch.ts:249-253` / RF1 | `admin_true_auto_command_released_after_first_output` | ☐ |
| E5 | [停止] / `stopAll` 与非提权同一调用路径 | 规格 §6.7 / RF6 | `admin_true_stop_goes_through_the_same_path` | ☐ |
| E6 | 两条提权条目并发各有独立管道与宿主 | 规格 §9-R8 | `two_elevated_entries_run_independently` | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | `QlDeps` 成员必填，不静默降级 | 规格 §6.8 / `main.ts:1009-1011` 的既有口径 | ☐ |
| F2 | 不新增日志行、`[lms_launcher] ` 前缀分工不变 | 索引 K10 / `main.ts:1064` | ☐ |
| F3 | WSL / 已提权都不特判 | 索引 K9 | ☐ |
| F4 | 不改构造签名 | 索引 G4 / `quick-launch.ts:215-217` | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（页签事件 / 自动命令 / 停止的既有门） | `npx vitest run src-main/quick-launch.test.ts` | 既有用例一字未改且绿 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/quick-launch.ts`、`src-main/quick-launch.test.ts`、`src-main/main.ts`、`src-main/ipc-ql.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 快捷启动按 admin 分流到提权 PTY 宿主` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B4 之外没有文件被改
- [ ] C1-C4 逐字一致
- [ ] D1→D4 先红后绿
- [ ] E1-E6 有对应测试且绿
- [ ] G1-G5 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/quick-launch.test.ts` |  |
| J-2 | `npx vitest run src-main/ipc-ql.test.ts` |  |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-4 | `npm test` |  |
