# 任务 11 · 宿主启动机制重做：应用 exe + 「应用入口参数」（R-19 → R-21）— check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 11 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §3-P13、P14 / §6.3 / §6.4 / §6.6-1 / §6.10 / §6.11 / §7.1 / §7.2 / §8-K2、K12、K13 / §9-R1、R10
> 前置：任务 1–10 全部已提交（任务 9/10 的真机门一路打回本机制）
> 来源（用户真机，2026-10-15 18:0x-18:4x）：「[命令行] + 管理员 → UAC 点「是」→ 不出页签、应用卡死」（任务 10 修掉卡死后变成 `handshake=exit(code=0)`）；用户手动验证「`.\\node.exe "resources\\app.asar\\dist-main\\ql-pty-host.js" …` **把应用启动了**」
> **本表是第二轮。** 第一轮（R-19：`--ql-pty-host` 开关 + `boot.ts` 转发入口 + 改 `package.json` 的 `main`）已实现、A–I 未落勾，被主代理的 **D6 本地门打回**：打包态下 `lms_launcher.exe --ql-pty-host …` → `bad option: --ql-pty-host`、退出码 9，任何应用代码都不会跑（spec §3-P14）。那一轮的工作区改动已于 2026-10-15 20:2x 全部丢弃（`git restore -- src-main build.bat package.json` + 删 `src-main/boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts`），未提交、无需 revert。它的执行记录保留在本表 J 段 J-1~J-5、J-7（作为「已打回」的历史证据，不作为本轮的勾）。
> 现状锚点（主代理 2026-10-15 20:2x 在 HEAD `4ffe34e` 上逐处读文件复核；第一轮的改动已丢弃，行号 = 任务 10 提交后的状态）：`src-main/ql-elevated.ts`：`HOST_EXE_NAME` `:32`、`HostPaths` `:82-85`（`hostDir` `:84`）、`errnoOf` `:119-123`、`resolveHostLink` `:125-156`、`createHostLauncher` `:158-188`（`hostDir` `:164`、`hostExePath` `:166-168`、`hostScriptPath` `:169-171`、`launch` `:179-186`）、`hostLauncher` `:191`、`startHost` `:353-375`（`:360-368` 就是本轮要删的 try/catch）、带 `hostlink=` 的注释 `:47` / `:385` / `:449`；`src-main/ql-elevated.test.ts`：import `resolveHostLink` `:24`、`launch_passes_runas_and_three_quoted_arguments` `:125-139`（**本轮不动**）、`host_exe_resolution_reuses_an_existing_link_only_when_size_matches` `:141-177`（删）、`launch_failures_close_both_handles` `:180-204`（场景 2 `:191-203` 改）、`hostLauncherStub` `:326-330`（**签名不变**）、五处 `not.toContain('node.exe')` `:212` / `:627` / `:714` / `:751` / `:912`；`src-main/ipc-ql.test.ts`：`:428` / `:446` / `:491-494` / `:523` / `:547`；`src-main/ql-pty-host.ts`：`main()` `:195-206` + `require.main` 自动执行块 `:208-211`（**本轮一字不改**）；`build.bat`：硬链接块 `:108`（空行）+ `:109-128`
> 测试基线（主代理 2026-10-15 18:4x 实测，HEAD 状态）：`npm test` → `Test Files 51 passed (51)` / `Tests 895 passed (895)`
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G7、K2（改回）、K12（修订）、K13（现行口径）、K20/K21/K55（作废）、K48（词表变更）、K59/K60（第一轮，作废）、**K61**、**K62**

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 10 已提交、第一轮的代码已丢弃 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 11 的文档提交；porcelain 里**没有** `src-main/*`、`build.bat`、`package.json` 的改动，也没有 `src-main/boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts` 三个未跟踪文件 | ☐ |
| A2 | 全量基线（主代理实测，子代理不重跑） | `npm test` | `Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0；本任务后只增不减（本轮预期 51 文件 / 897 用例：删 1 条、加 2 条） | ☐ |
| A3 | 本表引用的锚点行号属实 | 读上表点名的每一处 | 与本表引用一致 | ☐ |
| A4 | 前置接口在（签名逐字可用） | `shell-execute.ts` 的 `shellExecute(file, nShow, opts?: {verb?, parameters?})`；`HostLauncher` 的四参 `launch(exe, script, pipeName, token)`（HEAD 已是这个形状）；`process.execPath` | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-elevated.ts` | 改：删 `HOST_EXE_NAME` `:32`、`errnoOf` `:119-123`、`resolveHostLink` `:125-156`、`HostPaths.hostDir` `:84`、`hostDir` `:164`；`hostExePath()` 换成 `return execPath();`；`startHost` 删 `:360-368` 的 try/catch；三处带 `hostlink=` 的注释 `:47` / `:385` / `:449` 改掉 | `hostScriptPath()` / `launch()` / `isAlive` / `exitCodeOf` / `winPipe` / `pipeKernel` / 握手（R-17/C8）/ 读循环 / `stopGraceful` / `startElevatedHost` 工厂签名一律不动 | ☐ |
| B2 | `build.bat` | 改：删掉 R-16 的硬链接块（`:108-128`） | 删完必须仍是**纯 ASCII + 全 CRLF + 111 行** | ☐ |
| B3 | `src-main/ql-elevated.test.ts` | 改：按 D1 清单增删；五处 `not.toContain('node.exe')` 换名 | `launch_passes_runas_and_three_quoted_arguments` `:125-139` 与 `hostLauncherStub` `:326-330` 的签名**不动**；与本次无关的既有断言一字不改 | ☐ |
| B4 | `src-main/ipc-ql.test.ts` | 改：`:491` 的假 `hostExePath` 返回值 `'node.exe'` → `'lms_launcher.exe'`（假值也要与真机一致） | 只改这一处字面量；`:428` / `:446` / `:493-494` / `:523` / `:547` 的接缝与断言不动 | ☐ |
| B5 | `src-main/ql-pty-host.ts`、`src-main/ql-host-protocol.ts`、`src-main/main.ts`、`src-main/quick-launch.ts`、`package.json`、词典、渲染端、`electron-builder.yml` | **不改** | 越界即不勾。R-21 的关键收益：`package.json` 的 `main` 保持 `dist-main/main.js`、`main.ts` 一字不改，所有既有行号锚点继续有效 | ☐ |
| B6 | `src-main/boot.ts`、`src-main/ql-host-boot.ts`、`src-main/ql-host-boot.test.ts` | **不得存在** | 第一轮的产物；本轮不得新建（R-21 / 索引 K61） | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `HostLauncher` 签名 = HEAD 的形状，一字不改 | `hostExePath(): string`、`hostScriptPath(): string`、`launch(exe: string, script: string, pipeName: string, token: string): { ok: boolean; handle: unknown; win32Error: number }`、`isAlive(handle: unknown): boolean`、`exitCodeOf(handle: unknown): number` | ☐ |
| C2 | `hostExePath()` 的实现 | `hostExePath() { return execPath(); }`，其中 `const execPath = () => paths?.execPath ?? process.execPath;`（`:163` 原样保留，它是本轮唯一的测试接缝）。生产语义：**宿主 exe 恒等应用自己的 exe** | ☐ |
| C3 | `hostScriptPath()` | `path.join(__dirname, HOST_SCRIPT_NAME)` 一字不改（`HOST_SCRIPT_NAME = 'ql-pty-host.js'` `:33` 保留）——它现在同时是「应用入口参数」的值 | ☐ |
| C4 | `launch` 的参数串 | `const parameters = '"' + script + '" "' + pipeName + '" "' + token + '"';` → `shell.shellExecute(exe, SW_HIDE, { verb: 'runas', parameters })`；失败时防御性 `shell.close(r.handle)` 保留（`:179-186` 一字不改即满足） | ☐ |
| C5 | `startHost` 的 stage | 只剩 `'pipe' \| 'launch'`：管道建不出来 → `stage:'pipe'`（`pipe=create`）；`ShellExecuteEx` 失败 → `stage:'launch'`（`win32=1223` = UAC 取消）。**不再有 try/catch**（`hostExePath` / `hostScriptPath` 都不再抛），`hostlink=` 族不存在 | ☐ |
| C6 | `HostPaths` | 只剩 `{ execPath?: string }`；`hostDir` 删除（它只为硬链接服务） | ☐ |
| C7 | 词表清理 | `git grep -n "hostlink" -- src-main` 与 `git grep -n "node\.exe" -- src-main` 都为空（含注释） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试 | `npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` | 新用例红（`hostExePath()` 仍去建硬链接 → `hostlink=ENOENT`；`startHost` 交出的 exe 不是 `process.execPath`）。文件级用例数：`ql-elevated.test.ts` **删** `:141-177` 整条（−1）、**加** 2 条（`host_exe_is_the_app_executable`、`start_host_passes_the_app_exe_and_script_to_launch`）→ 该文件 24 → 25；`launch_failures_close_both_handles` 的场景 2（`:191-203`）改成「`hostExePath()` 走 `paths.execPath` 接缝、`startHost` 不因路径抛」——**不新增用例**；五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`；删 `:24` 的 `resolveHostLink` import | ☐ |
| D2 | 实现 B1-B4 | 同上 | 全绿 | ☐ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净、无输出 | ☐ |
| D4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（本任务零新键） | ☐ |
| D5 | 全量 | `npm test` | 全绿；文件数仍 **51**，用例 895 → **897**（删 1 加 2），只增不减 | ☐ |
| D6 | **本地无 UAC 门**（R-21 / §9-R10，**主代理跑，子代理不打包**） | 先 `cmd /c build.bat`，再 `Start-Process dist-release\\win-unpacked\\lms_launcher.exe -ArgumentList '<…app.asar\\dist-main\\ql-pty-host.js>','\\\\.\\pipe\\x','tok' -PassThru` + `WaitForExit` | 不出现窗口；`ExitCode = 3`；接真实管道（`.temp/ql-admin-probe/real-pipe-run2.ps1`）时进程**活着等 HELLO**。这是「宿主入口真的被接管」的唯一直接证据。`%TEMP%\\lms-ql-host.log` 的 `stage=pipe` 行只能在真机核对（本会话对 TEMP 是 EPERM） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试 / 取证守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 宿主 exe = 应用自己的 exe：生产单例 `hostLauncher.hostExePath() === process.execPath`；接缝 `createHostLauncher(shell, {execPath}).hostExePath()` 返回注入值 | 规格 §6.4-1 / C2 | `ql-elevated.test.ts`：`host_exe_is_the_app_executable` | ☐ |
| E2 | `startHost` 交给 `launch` 的 `exe` / `script` 逐字 = `process.execPath` / `path.join(__dirname,'ql-pty-host.js')` | 规格 §6.4-1 / C2/C3 | `ql-elevated.test.ts`：`start_host_passes_the_app_exe_and_script_to_launch` | ☐ |
| E3 | 参数串逐字 = `"<script>" "<pipe>" "<token>"`（三个都加引号）、`nShow = SW_HIDE`、`verb='runas'` | 规格 §6.4-1 / C4 | 既有用例 `launch_passes_runas_and_three_quoted_arguments`（`:125-139`，本轮不动即守） | ☐ |
| E4 | 硬链接族彻底消失：`startHost` 只有 `pipe` / `launch` 两个 stage；`hostlink` / `node.exe` 在 `src-main` 里零命中 | 规格 §6.10 / §6.4-2 | `launch_failures_close_both_handles`（改后的场景 2）+ `git grep` 取证（C7） | ☐ |
| E5 | 「宿主入口真的被接管、没有又起一遍应用」 | 规格 §9-R10 | **D6 本地无 UAC 门**（无窗口 + 退出码 3 + 接真管道活着等 HELLO）；第一轮打回它的取证在 J-6 | ☐ |
| E6 | 宿主入口行为不变（帧序 / 退出码 / 留痕与任务 10 一致） | 规格 §6.6 / R-18 | `ql-pty-host.ts` **一字不改**（B5）+ `ql-pty-host.test.ts` 既有 8 条不变即守 | ☐ |
| E7 | 失败文案不泄漏宿主 exe（用户那一行的目标才是 `{exe}`） | 规格 §6.10 / 裁决 R-07 | 五处 `not.toContain('lms_launcher.exe')`（`:212` / `:627` / `:714` / `:751` / `:912`） | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只用 `PROC:`；**零新词典键**（G1 / G2） | 索引 G1 / G2 | ☐ |
| F2 | 帧协议 / `ql-host-protocol.ts` / `HELLO`→`READY` 流程一行不改 | 索引 G3 | ☐ |
| F3 | `main.ts` 与 `package.json` 一字不改（既有行号锚点全部继续有效；不改打包入口） | 规格 §6.4-3 | ☐ |
| F4 | 不新增依赖、不改依赖段 | 索引 G7 | ☐ |
| F5 | `build.bat` 删块后仍是**纯 ASCII + 全 CRLF**（逐字节复核） | 规格 §6.11 + 任务 9 口径 | ☐ |
| F6 | 不新增 extraFile、不改 `electron-builder.yml`（宿主脚本仍随 `dist-main/**` 进 asar） | 索引 G7 / 规格 §6.11 | ☐ |
| F7 | 不新建 `boot.ts` / `ql-host-boot.ts` / `parseHostMode` / `hostMain`；不改 `ql-pty-host.ts` | 规格 §6.4-3 / 索引 K61 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` | 全绿（25 + 27） | ☐ |
| G2 | 相邻回归（提权路径的调用方） | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 全绿（34 + 27） | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | 全绿；51 文件 / 897 用例（只增不减） | ☐ |
| G6 | **本地无 UAC 门** | 见 D6 | 无窗口 / 退出码 3 / 接真管道活着等 HELLO | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts`、`src-main/ipc-ql.test.ts`、`build.bat` | ☐ |
| H2 | commit message 逐字 | `fix: 提权宿主改用应用 exe 的应用入口参数启动（R-21，硬链接与命令行开关机制退场）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B4 之外没有文件被改（B5 / B6 确认未动 / 不存在）
- [ ] C1-C7 逐字一致
- [ ] D1→D6 先红后绿 + D6 本地门通过
- [ ] E1-E7 有对应测试或取证且绿
- [ ] G1-G6 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-0 | 主代理 P13 取证（2026-10-15 18:5x，规格 §3-P13） | 打包后的 `dist-release\\win-unpacked\\node.exe` + 写标记文件的探针：**带 `ELECTRON_RUN_AS_NODE=1` → marker=True（真 Node）**；**删掉该变量 → marker=False、进程 5s 后仍活着（= 应用模式，脚本没跑）**。旧探针自己设过该变量（`.temp/ql-admin-probe/probe1.mjs:58`、`probe2.mjs:53`），本会话环境也预置了它 → P5/P8 的「按文件名进 Node 模式」是环境变量造成的误判。用户真机手动跑 `.\\node.exe <脚本>` **把应用启动了**，三次观测一致 |
| J-1 | （第一轮 R-19，**已打回**）`npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 先红 `Tests 20 failed \\| 14 passed (34)`；后绿 `Test Files 3 passed (3)`、`Tests 37 passed (37)`。全文 `.temp\\ql-admin-probe\\red-1.txt` / `green-1.txt`。**本轮这些用例与文件都不存在**（丢弃，见 J-8） |
| J-2 | （第一轮，已打回）`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Tests 61 passed (61)` = 34 + 27，与基线逐字相同。全文 `.temp\\ql-admin-probe\\green-2.txt` |
| J-3 | （第一轮，已打回）`npx tsc --noEmit -p tsconfig.main.json` | `TSC_EXIT=0` |
| J-4 | （第一轮，已打回）`npx vitest run src-main/i18n` | `Test Files 4 passed (4)`、`Tests 18 passed (18)` → 零新词典键 |
| J-5 | （第一轮，已打回）`npm test` | `Test Files 52 passed (52)`、`Tests 900 passed (900)`。全文 `.temp\\ql-admin-probe\\green-5.txt` |
| J-6 | **D6 本地无 UAC 门（主代理 2026-10-15 19:5x-20:1x）——就是它打回了第一轮 R-19 的形状。** `cmd /c build.bat` 后依次跑 `.temp/ql-admin-probe/d6-variants2.ps1`、`d6-variants3.ps1`、`d6-variants4.ps1`、`probe-entry-run.ps1`、`real-pipe-run2.ps1`、`verify-pack.ps1` | ① `lms_launcher.exe --ql-pty-host \\\\.\\pipe\\lms-diag-a tokA` → `exit_code=9`、stderr `lms_launcher.exe: bad option: --ql-pty-host`；② `--ql-pty-host=…` → 同样 `exit_code=9`；③ `-- --ql-pty-host …` 与裸位置参数 `ql-pty-host …` → `exit_code=1`、`Cannot find module 'D:\\Dev\\Projects\\lms_launcher\\ql-pty-host'`；④ **成立的形状**：`lms_launcher.exe "<…app.asar\\dist-main\\ql-pty-host.js>" \\\\.\\pipe\\lms-diag-g tokG` → `exit_code=3`、stderr 空；⑤ 探针入口 → `argv=[exe, 入口, 管道名, token]`、`defaultApp:"absent"`、`versions{node:18.18.2,electron:28.3.3}`、`tmpWrite:"EPERM … lms-ql-host.log"`（沙箱对 TEMP 的 EPERM，非缺陷）；⑥ 真实管道 + 打包 exe 当宿主 → 服务端 `serverHandle=true`、客户端 `STILL-RUNNING`（活着等 HELLO）；⑦ 对照：无参数 → `exit_code=0`、无 stderr；⑧ 产物核对：`node.exe in win-unpacked present = False`、asar 里有 `\\dist-main\\ql-pty-host.js`、`app.asar.unpacked` 三个原生模块 True。全文 `.temp/ql-admin-probe/task11-round1-d6-evidence.md` |
| J-7 | （第一轮，已打回）`build.bat` 删块后的编码复核 | `bytes=5419 CRLF=111 LF=111 nonASCII=0 lines=111 endsWithCRLF=true`；`git diff --numstat -- build.bat` = `0  21  build.bat`。**本轮重新取证**（工作区已丢弃，需再跑一次） |
| J-8 | 丢弃第一轮工作区（主代理 2026-10-15 20:2x）：`git restore -- src-main build.bat package.json docs/superpowers/checks/…/task-11-host-mode-launch.md`；`Remove-Item src-main/boot.ts, src-main/ql-host-boot.ts, src-main/ql-host-boot.test.ts` | `git status --porcelain` 只剩 `M .superpowers/…/progress.md`、`M docs/…/plans/…`、`M docs/…/specs/…` + 两个未跟踪的 SDD 记录文件；`Select-String package.json '"main"'` → `"main": "dist-main/main.js",`；`git grep -n require.main -- src-main/ql-pty-host.ts` → `:209`（HEAD 形状在位） |
| J-9 | 本轮 D6 门（主代理，H 段提交前跑） | ☐（原因：要等本轮的 `build.bat` 产物；脚本与预期输出已在 J-6 ④⑤⑥⑧ 取证，去处：H 段前由主代理补） |
