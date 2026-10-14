# 任务 5 · 宿主入口 `src-main/ql-pty-host.ts` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 5 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.6 · 关联审查重点 **RF6 / RF7**（索引 R 组）
> 前置：任务 2（帧协议）；任务 4（管道名与 token 的传法）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch.ts:146-150`（`shellExe`，复用它、不复制映射表）、`:153-163`（`spawnShell`：`name:'xterm-256color'`、`cols/rows/cwd/env: process.env`，**不传 encoding**）、`:122-142`（`PtyProcess.stopGraceful`：`kill()` → 等 → `taskkill /T /F`，`:134` 用 `-PID`）；取证 `.temp/ql-admin-probe/probe7.mjs`（提权宿主里 `require('@lydell/node-pty')` = ok）、`probe8.mjs`（asar 内脚本可被硬链接 node.exe 执行）
> 索引：[00-index.md](00-index.md) 的 G1、G6、G7、K12、K13、**K32**（payload 一律 string，不自己拼字节）、**K36**（硬链接 electron-as-node 连管道 EPERM）、**K41**（系统 node 作宿主时真 ConPTY 可用 → K22 已修正）、**K42**（C2 的 `unknown`）、**K43**（`ERR{stage:'pipe'}` + `exit 1`，已补进规格 §6.6 第 10 条）、**K44**（`READY.shellPid` 实测 0，任务 6 不得依赖）
>
> **主代理验收（2026-10-15 00:1x，独立复跑 G 段全部命令）**：G1 → `Test Files 1 passed (1)` / `Tests 6 passed (6)`；G2 → `Tests 27 passed (27)` 且 `git diff --stat -- src-main/quick-launch.ts src-main/quick-launch.test.ts` 空输出（一字未改）；G3 tsc → 无输出 `TSC_EXIT=0`；G4 i18n → `4 passed (4)` / `18 passed (18)`；G5 全量 → `Test Files 51 passed (51)` / `Tests 861 passed (861)`（855 + 本任务 6，测试文件 50 → 51，与索引 :7 一致）。
> **D3 由主代理亲自复跑**（`npx tsc -p tsconfig.main.json` 产出 `dist-main/ql-pty-host.js` 后 `node .temp/ql-admin-probe/probe20.cjs`）：系统 node 作宿主 → `READY{hostPid:16616,shellPid:0}` → `DATA`（真 `cmd.exe` 横幅）→ `WRITE` 回显 `PROBE20-MARKER` → `RESIZE`（`[8;30;100t`）→ `STOP` → `EXIT{code:-1073741510}`，子进程退出码 `3221225786` 与之同源（C4），退出后 `available() -> -1`（K39）。这条把 K22 的「本环境跑不了 ConPTY」修正为按进程身份区分 → 索引 K41。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 4 的提交；porcelain 干净 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `quick-launch.ts:146-163` / `:122-142`；跑 `node .temp/ql-admin-probe/probe8.mjs` 复核 asar 内脚本可执行 | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-host-protocol.ts` 的 `HOST_FRAME` 与 `createFrameParser`；读 `ql-elevated.ts` 的 `HostLauncher.launch` 参数顺序 | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-pty-host.ts` | 新建：`runHost(deps)` + `require.main === module` 才自动跑 | 不 import `electron`；不 import `main.ts`；只复用 `quick-launch.ts` 的 `shellExe` | ☑ |
| B2 | `src-main/ql-pty-host.test.ts` | 新建（假 socket + 假 pty） | 真 pty / 真管道不在单测里（本环境 ConPTY 必 EPERM） | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | argv 契约 | `[node, script, pipeName, token]` —— 规格 §6.4-4 / 任务 4 C4 的 parameters 顺序 | ☑ |
| C2 | `runHost` 签名 | `runHost(deps: { connect(name: unknown): HostSocket; spawn: typeof pty.spawn }): void` —— plan 任务 5 签名块逐字。**本表原写 `name: string` 是表的错**（`process.argv.slice(2)` 交出 `string \| undefined`，`string` 接不住）；已按 plan 改正，口径登记索引 K42 | ☑ |
| C3 | `pty.spawn` 选项 | `{ name: 'xterm-256color', cols, rows, cwd, env: process.env }`，与 `quick-launch.ts:155-161` 逐字一致且**不含** `encoding` | ☑ |
| C4 | 退出码 | `EXIT` 帧的 `code` 与 `process.exit(code)` 同源 —— 规格 §6.6-5 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 5 步骤 1 的 6 条） | `npx vitest run src-main/ql-pty-host.test.ts` | 模块不存在 → 红 | ☑ |
| D2 | 实现 §6.6 的 1-9 步 | 同上 | 全绿 | ☑ |
| D3 | 本机冒烟（真 pty，预期被沙箱挡） | `node node_modules/electron/dist/node.exe dist-main/ql-pty-host.js <管道名> <token>`（管道由探针脚本建） | 出现 `EPERM … conpty-*-in` 或 `ERR{stage:'spawn'}` = **本环境预期**（规格 §2-5），输出贴 J 段；不是失败 | ☑ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | token 不符 → `ERR{stage:'token'}` 且退出码 2 | 规格 §6.6-2 | `hello_with_a_wrong_token_exits_2_and_sends_err` | ☑ |
| E2 | spawn 选项与非提权路径逐字一致（无 `encoding`） | 规格 §6.6-3 / `quick-launch.ts:155-161` | `spawn_options_match_the_non_elevated_path` | ☑ |
| E3 | 帧序 `READY → DATA → EXIT` | 规格 §6.6-4/5 / RF6 | `ready_then_data_then_exit_frame_order` | ☑ |
| E4 | `WRITE` / `RESIZE` 帧到达 pty 句柄 | 规格 §6.6-6 | `write_and_resize_frames_reach_the_pty_handle` | ☑ |
| E5 | `STOP` 帧走 `stopGraceful(timeoutSecs)` | 规格 §6.6-7 / RF6 | `stop_frame_runs_stopGraceful_with_the_given_timeout` | ☑ |
| E6 | 管道断开 = 视同 STOP（不留孤儿 ConPTY） | 规格 §6.6-8 | `socket_close_runs_the_stop_path` | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不 import `electron`（纯 Node 宿主） | 规格 §6.6-9 / 索引 K12 | ☑ |
| F2 | 新文件不含汉字字面量 | 索引 G6（`no-hardcoded.test.ts:26-28`） | ☑ |
| F3 | 终端映射只有一份（复用 `shellExe`） | 规格 §6.6-3 | ☑ |
| F4 | 不新增依赖 | 索引 G7 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-pty-host.test.ts` | 全绿 | ☑ |
| G2 | 相邻回归 | `npx vitest run src-main/quick-launch.test.ts` | 全绿且未改该文件 | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（新文件被 no-hardcoded 扫到） | ☑ |
| G5 | 全量 | `npm test` | 全绿 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-pty-host.ts`、`src-main/ql-pty-host.test.ts` | ☑ |
| H2 | commit message 逐字 | `feat: 提权 PTY 宿主入口（管道 ↔ node-pty 转发）` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B2 之外没有文件被改
- [x] C1-C4 逐字一致
- [x] D1→D4 先红后绿 + D3 冒烟输出贴 J 段
- [x] E1-E6 有对应测试且绿
- [x] G1-G5 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-pty-host.test.ts` | 先红（`Start at 23:47:18`，实现文件不存在）：`Error: Failed to load url ./ql-pty-host … Does the file exist?` → `Test Files 1 failed (1)` / `Tests no tests`、exit 1。后绿（`Start at 23:48:39`）：`✓ src-main/ql-pty-host.test.ts (6 tests) 62ms` → `Test Files 1 passed (1)` / `Tests 6 passed (6)`、exit 0。六条用例名逐字 = plan 任务 5 的 Step 1 |
| J-2 | `npx tsc -p tsconfig.main.json`（产出 `dist-main/ql-pty-host.js`，`TSC_EXIT=0`）→ `node .temp/ql-admin-probe/probe20.cjs`（系统 node 作宿主）与 `node .temp/ql-admin-probe/probe20.cjs electron-link`（`resolveHostLink` 现建的硬链接 `node_modules/electron/dist/node.exe`，即本行字面那条） | 变体 A（系统 node）= 真管道 + 真 ConPTY 全往返：`winPipe.connect true after 40 ms` → `READY{hostPid:13868,shellPid:0}` → 真 `cmd.exe` 横幅经 `DATA` 流回 → `WRITE('echo PROBE20-MARKER\r')` 的回显出现在下一帧 → `RESIZE{100,30}` 后帧里出现 `\u001b[8;30;100t` → `STOP{timeoutSecs:3}` → `EXIT{code:-1073741510}`（`0xC000013A`）+ 子进程退出码 `3221225786`（同值的无符号表示，C4 同源）→ 读侧 `available -> -1`（`ERROR_BROKEN_PIPE 109`）。变体 B（硬链接 electron-as-node）= `child exited BEFORE the pipe was connected: {"c":1,"s":null}`，无 `[child stderr]` 一行、无崩溃栈 → 即 `ERR{stage:'pipe'}` + `process.exit(1)` 这条路径；成因见 J-7。**与索引 K22 相反**：本会话以系统 node 作宿主时 ConPTY 跑通了（K36 仍成立），已写进报告 §6 疑虑 1 请主代理裁决 |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断输出、`TSC_EXIT=0`（实现后与最终状态各跑一次，都干净）。另实测：`tsconfig.main.json` 的 `exclude` 含 `*.test.ts`，所以类型门不检查测试文件 |
| J-4 | `npm test` | `Test Files 51 passed (51)` / `Tests 861 passed (861)` / `Duration 8.86s`、exit 0。基线 50 份 / 855 条 → +1 份 / +6 条，全在 `src-main/ql-pty-host.test.ts`；与索引头部「任务 5 之后应为 51 份」一致 |
| J-5 | `npx vitest run src-main/quick-launch.test.ts`（G2 相邻回归） | `✓ src-main/quick-launch.test.ts (27 tests) 293ms` → `Tests 27 passed (27)`、exit 0；`git diff --stat -- src-main/quick-launch.ts src-main/quick-launch.test.ts` 空输出（两个文件一字未改） |
| J-6 | `npx vitest run src-main/i18n`（G4） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0（`index.test.ts` 3、`no-hardcoded.test.ts` 2、`key-coverage.test.ts` 2、`dict.test.ts` 11）。F2 的**覆盖**反证：临时在 `ql-pty-host.ts` 末尾加 `const __probeHan = '汉字';` → 该门报 `"file": "src-main/ql-pty-host.ts"` 并 `Test Files 1 failed (1)`；删掉后还原为全绿、文件字节级一致（`file restored identical: true`）→ 新文件确实在扫描集里 |
| J-7 | `node .temp/ql-admin-probe/probe21.cjs [electron-link]`（子进程 `child20.cjs` 只做 `net.connect`） | 同一个 `winPipe.createServer` 服务端：硬链接 electron-as-node → `CONNECT-ERR code=EPERM message=connect EPERM \\.\pipe\lms-ql-587e980a`、exit 1；系统 node → `CONNECTED`、exit 0。据此 J-2 变体 B 的退出码 1 是「连不上管道」，不是 `spawn` 失败。探针侧教训：`ConnectNamedPipe` 在没有客户端来时是阻塞调用（第一版卡成后台作业 `pwsh-58` / `pwsh-62`，已 `job_kill`），故 `probe20.cjs` 先看子进程是否已退出 |
| J-8 | `git status --porcelain` + `git check-ignore -v dist-main` | `?? src-main/ql-pty-host.test.ts` / `?? src-main/ql-pty-host.ts` 两行，别无其它（B 段范围，未 `git add`、未 commit，G8/G9）；`.gitignore:2: dist-*/ → dist-main`，R-01 的编译产物不脏工作区。`grep "electron\|from './main'" src-main/ql-pty-host.ts` 只命中 `:3` 的边界注释（F1） |
