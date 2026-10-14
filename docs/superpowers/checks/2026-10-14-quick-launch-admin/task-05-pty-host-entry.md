# 任务 5 · 宿主入口 `src-main/ql-pty-host.ts` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 5 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.6 · 关联审查重点 **RF6 / RF7**（索引 R 组）
> 前置：任务 2（帧协议）；任务 4（管道名与 token 的传法）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch.ts:146-150`（`shellExe`，复用它、不复制映射表）、`:153-163`（`spawnShell`：`name:'xterm-256color'`、`cols/rows/cwd/env: process.env`，**不传 encoding**）、`:122-142`（`PtyProcess.stopGraceful`：`kill()` → 等 → `taskkill /T /F`，`:134` 用 `-PID`）；取证 `.temp/ql-admin-probe/probe7.mjs`（提权宿主里 `require('@lydell/node-pty')` = ok）、`probe8.mjs`（asar 内脚本可被硬链接 node.exe 执行）
> 索引：[00-index.md](00-index.md) 的 G1、G6、G7、K12、K13

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 4 的提交；porcelain 干净 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | 起点基线写在索引头部「测试基线」行；本任务后用例数只增不减 | ☐（原因：本环境跑 vitest 需完全访问沙箱，审批未通过 → spawn EPERM；去处：派单前主代理实测后填索引头部「测试基线」行与本行） |
| A3 | 本表引用的锚点行号属实 | 读 `quick-launch.ts:146-163` / `:122-142`；跑 `node .temp/ql-admin-probe/probe8.mjs` 复核 asar 内脚本可执行 | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-host-protocol.ts` 的 `HOST_FRAME` 与 `createFrameParser`；读 `ql-elevated.ts` 的 `HostLauncher.launch` 参数顺序 | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-pty-host.ts` | 新建：`runHost(deps)` + `require.main === module` 才自动跑 | 不 import `electron`；不 import `main.ts`；只复用 `quick-launch.ts` 的 `shellExe` | ☐ |
| B2 | `src-main/ql-pty-host.test.ts` | 新建（假 socket + 假 pty） | 真 pty / 真管道不在单测里（本环境 ConPTY 必 EPERM） | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | argv 契约 | `[node, script, pipeName, token]` —— 规格 §6.4-4 / 任务 4 C4 的 parameters 顺序 | ☐ |
| C2 | `runHost` 签名 | `runHost(deps: { connect(name: string): HostSocket; spawn: typeof pty.spawn }): void` —— plan 任务 5 签名块 | ☐ |
| C3 | `pty.spawn` 选项 | `{ name: 'xterm-256color', cols, rows, cwd, env: process.env }`，与 `quick-launch.ts:155-161` 逐字一致且**不含** `encoding` | ☐ |
| C4 | 退出码 | `EXIT` 帧的 `code` 与 `process.exit(code)` 同源 —— 规格 §6.6-5 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 5 步骤 1 的 6 条） | `npx vitest run src-main/ql-pty-host.test.ts` | 模块不存在 → 红 | ☐ |
| D2 | 实现 §6.6 的 1-9 步 | 同上 | 全绿 | ☐ |
| D3 | 本机冒烟（真 pty，预期被沙箱挡） | `node node_modules/electron/dist/node.exe dist-main/ql-pty-host.js <管道名> <token>`（管道由探针脚本建） | 出现 `EPERM … conpty-*-in` 或 `ERR{stage:'spawn'}` = **本环境预期**（规格 §2-5），输出贴 J 段；不是失败 | ☐ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | token 不符 → `ERR{stage:'token'}` 且退出码 2 | 规格 §6.6-2 | `hello_with_a_wrong_token_exits_2_and_sends_err` | ☐ |
| E2 | spawn 选项与非提权路径逐字一致（无 `encoding`） | 规格 §6.6-3 / `quick-launch.ts:155-161` | `spawn_options_match_the_non_elevated_path` | ☐ |
| E3 | 帧序 `READY → DATA → EXIT` | 规格 §6.6-4/5 / RF6 | `ready_then_data_then_exit_frame_order` | ☐ |
| E4 | `WRITE` / `RESIZE` 帧到达 pty 句柄 | 规格 §6.6-6 | `write_and_resize_frames_reach_the_pty_handle` | ☐ |
| E5 | `STOP` 帧走 `stopGraceful(timeoutSecs)` | 规格 §6.6-7 / RF6 | `stop_frame_runs_stopGraceful_with_the_given_timeout` | ☐ |
| E6 | 管道断开 = 视同 STOP（不留孤儿 ConPTY） | 规格 §6.6-8 | `socket_close_runs_the_stop_path` | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不 import `electron`（纯 Node 宿主） | 规格 §6.6-9 / 索引 K12 | ☐ |
| F2 | 新文件不含汉字字面量 | 索引 G6（`no-hardcoded.test.ts:26-28`） | ☐ |
| F3 | 终端映射只有一份（复用 `shellExe`） | 规格 §6.6-3 | ☐ |
| F4 | 不新增依赖 | 索引 G7 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-pty-host.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归 | `npx vitest run src-main/quick-launch.test.ts` | 全绿且未改该文件 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（新文件被 no-hardcoded 扫到） | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-pty-host.ts`、`src-main/ql-pty-host.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 提权 PTY 宿主入口（管道 ↔ node-pty 转发）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B2 之外没有文件被改
- [ ] C1-C4 逐字一致
- [ ] D1→D4 先红后绿 + D3 冒烟输出贴 J 段
- [ ] E1-E6 有对应测试且绿
- [ ] G1-G5 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-pty-host.test.ts` |  |
| J-2 | `node node_modules/electron/dist/node.exe dist-main/ql-pty-host.js …（冒烟）` |  |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-4 | `npm test` |  |
