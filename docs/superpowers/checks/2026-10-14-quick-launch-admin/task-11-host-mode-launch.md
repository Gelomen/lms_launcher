# 任务 11 · 宿主启动机制重做：应用 exe + 「应用入口参数」（R-19 → R-21）— check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 11 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §3-P13、P14 / §6.3 / §6.4 / §6.6-1 / §6.10 / §6.11 / §7.1 / §7.2 / §8-K2、K12、K13 / §9-R1、R10
> 前置：任务 1–10 全部已提交（任务 9/10 的真机门一路打回本机制）
> 来源（用户真机，2026-10-15 18:0x-18:4x）：「[命令行] + 管理员 → UAC 点「是」→ 不出页签、应用卡死」（任务 10 修掉卡死后变成 `handshake=exit(code=0)`）；用户手动验证「`.\node.exe "resources\app.asar\dist-main\ql-pty-host.js" …` **把应用启动了**」
> **本表是第二轮。** 第一轮（R-19：`--ql-pty-host` 开关 + `boot.ts` 转发入口 + 改 `package.json` 的 `main`）已实现、A–I 未落勾，被主代理的 **D6 本地门打回**：打包态下 `lms_launcher.exe --ql-pty-host …` → `bad option: --ql-pty-host`、退出码 9，任何应用代码都不会跑（spec §3-P14）。那一轮的工作区改动已于 2026-10-15 20:2x 全部丢弃（`git restore -- src-main build.bat package.json` + 删 `src-main/boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts`），未提交、无需 revert。它的执行记录保留在本表 J 段 J-1~J-5、J-7（作为「已打回」的历史证据，不作为本轮的勾）。
> 现状锚点（主代理 2026-10-15 20:2x 在 HEAD `4ffe34e` 上逐处读文件复核；第一轮的改动已丢弃，行号 = 任务 10 提交后的状态）：`src-main/ql-elevated.ts`：`HOST_EXE_NAME` `:32`、`HostPaths` `:82-85`（`hostDir` `:84`）、`errnoOf` `:119-123`、`resolveHostLink` `:125-156`、`createHostLauncher` `:158-188`（`hostDir` `:164`、`hostExePath` `:166-168`、`hostScriptPath` `:169-171`、`launch` `:179-186`）、`hostLauncher` `:191`、`startHost` `:353-375`（`:360-368` 就是本轮要删的 try/catch）、带 `hostlink=` 的注释 `:47` / `:385` / `:449`；`src-main/ql-elevated.test.ts`：import `resolveHostLink` `:24`、`launch_passes_runas_and_three_quoted_arguments` `:125-139`（**本轮不动**）、`host_exe_resolution_reuses_an_existing_link_only_when_size_matches` `:141-177`（删）、`launch_failures_close_both_handles` `:180-204`（场景 2 `:191-203` 改）、`hostLauncherStub` `:326-330`（**签名不变**）、五处 `not.toContain('node.exe')` `:212` / `:627` / `:714` / `:751` / `:912`；`src-main/ipc-ql.test.ts`：`:428` / `:446` / `:491-494` / `:523` / `:547`；`src-main/ql-pty-host.ts`：`main()` `:195-206` + `require.main` 自动执行块 `:208-211`（**本轮一字不改**）；`build.bat`：硬链接块 `:108`（空行）+ `:109-128`
> 测试基线（主代理 2026-10-15 18:4x 实测，HEAD 状态）：`npm test` → `Test Files 51 passed (51)` / `Tests 895 passed (895)`
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G7、K2（改回）、K12（修订）、K13（现行口径）、K20/K21/K55（作废）、K48（词表变更）、K59/K60（第一轮，作废）、**K61**、**K62**

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 10 已提交、第一轮的代码已丢弃 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 11 的文档提交；porcelain 里**没有** `src-main/*`、`build.bat`、`package.json` 的改动，也没有 `src-main/boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts` 三个未跟踪文件 | ☐ |
| A2 | 全量基线（主代理实测，子代理不重跑） | `npm test` | `Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0；本任务后只增不减（本轮预期 51 文件 / **896** 用例：删 1 条、加 2 条。原写 897 是文档算术错，见 J-18 / 索引 K63） | ☐ |
| A3 | 本表引用的锚点行号属实 | 读上表点名的每一处 | 与本表引用一致 | ☐ |
| A4 | 前置接口在（签名逐字可用） | `shell-execute.ts` 的 `shellExecute(file, nShow, opts?: {verb?, parameters?})`；`HostLauncher` 的四参 `launch(exe, script, pipeName, token)`（HEAD 已是这个形状）；`process.execPath` | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-elevated.ts` | 改：删 `HOST_EXE_NAME` `:32`、`errnoOf` `:119-123`、`resolveHostLink` `:125-156`、`HostPaths.hostDir` `:84`、`hostDir` `:164`；`hostExePath()` 换成 `return execPath();`；`startHost` 删 `:360-368` 的 try/catch；三处带 `hostlink=` 的注释 `:47` / `:385` / `:449` 改掉 | `hostScriptPath()` / `launch()` / `isAlive` / `exitCodeOf` / `winPipe` / `pipeKernel` / 握手（R-17/C8）/ 读循环 / `stopGraceful` / `startElevatedHost` 工厂签名一律不动 | ☐ |
| B2 | `build.bat` | 改：删掉 R-16 的硬链接块（`:108-128`） | 删完必须仍是**纯 ASCII + 全 CRLF + 111 行** | ☐ |
| B3 | `src-main/ql-elevated.test.ts` | 改：按 D1 清单增删；五处 `not.toContain('node.exe')` 换名 | `launch_passes_runas_and_three_quoted_arguments` `:125-139` 与 `hostLauncherStub` `:326-330` 的签名**不动**；与本次无关的既有断言一字不改 | ☐ |
| B4 | `src-main/ipc-ql.test.ts` | 改：`:491` 的假 `hostExePath` 返回值 `'node.exe'` → `'lms_launcher.exe'`（假值也要与真机一致）；**R-22 追加** `:424` 注释与 `:637` 的断言字符串（C7 ②） | 接缝与其余断言（`:428` / `:446` / `:493-494` / `:523` / `:547`）一字不动；`:424` / `:637` 只改注释与字符串，行数不变 | ☐ |
| B5 | `src-main/ql-host-protocol.ts`、`src-main/quick-launch.ts`、`package.json`、词典、渲染端、`electron-builder.yml` | **不改** | 越界即不勾。R-21 的关键收益：`package.json` 的 `main` 保持 `dist-main/main.js`，所有既有行号锚点继续有效 | ☐ |
| B5′ | `src-main/ql-pty-host.ts`、`src-main/main.ts` | **只允许 C7 ② 那 4 处注释编辑**（R-22 / K63） | 条件：只改注释文字、行数不变、不碰任何代码 token —— 这样「`main.ts` 一字未改（代码）」与「既有行号锚点继续有效」两条仍然成立。除此之外越界即不勾 | ☐ |
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
| C7 | 词表清理（**裁决 R-22 / 索引 K63 收窄 + 扩围**） | ① `git grep -n "hostlink" -- src-main` 为空；② `git grep -n "node\.exe" -- src-main` 为空。为达 ② 允许 6 处**只改注释 / 断言字符串**的编辑：`ql-pty-host.ts:2`、`ql-pty-host.ts:207`、`main.ts:1093-1094`、`main.ts:1096`、`ipc-ql.test.ts:424`、`ipc-ql.test.ts:637`（最后一条：`not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`，否则它在新机制下空转）。**硬条件**：不碰任何代码 token、**行数不变**（`git diff --numstat` 每文件增 = 删） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试 | `npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` | 新用例红（`hostExePath()` 仍去建硬链接 → `hostlink=ENOENT`；`startHost` 交出的 exe 不是 `process.execPath`）。文件级用例数：`ql-elevated.test.ts` **删** `:141-177` 整条（−1）、**加** 2 条（`host_exe_is_the_app_executable`、`start_host_passes_the_app_exe_and_script_to_launch`）→ 该文件 24 → 25；`launch_failures_close_both_handles` 的场景 2（`:191-203`）改成「`hostExePath()` 走 `paths.execPath` 接缝、`startHost` 不因路径抛」——**不新增用例**；五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`；删 `:24` 的 `resolveHostLink` import | ☐ |
| D2 | 实现 B1-B4 | 同上 | 全绿 | ☐ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净、无输出 | ☐ |
| D4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（本任务零新键） | ☐ |
| D5 | 全量 | `npm test` | 全绿；文件数仍 **51**，用例 895 → **896**（删 1 加 2），只增不减 | ☐ |
| D6 | **本地无 UAC 门**（R-21 / §9-R10，**主代理跑，子代理不打包**） | 先 `cmd /c build.bat`，再 `Start-Process dist-release\win-unpacked\lms_launcher.exe -ArgumentList '<…app.asar\dist-main\ql-pty-host.js>','\\.\pipe\x','tok' -PassThru` + `WaitForExit`；**D6′（裁决 R-22 追加）dev 布局同一条式子**：`Start-Process node_modules\electron\dist\electron.exe -ArgumentList '<仓库绝对路径>\dist-main\ql-pty-host.js','<管道名>','tok' -PassThru` | **两种布局都**不出现窗口；`ExitCode = 3`；接真实管道（`.temp/ql-admin-probe/real-pipe-run2.ps1`）时进程**活着等 HELLO**。这是「宿主入口真的被接管」的唯一直接证据，D6′ 同时补上「dev 态没有任何门」这条疑虑（报告 §7 疑虑 ①）。`%TEMP%\lms-ql-host.log` 的 `stage=pipe` 行只能在真机核对（本会话对 TEMP 是 EPERM） | ☐（**原因**：本会话起不了 app 模式，索引 K64 ④；**去处**：真机门规格 §7.2 + 第三轮的 D6 重定义） |

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
| G5 | 全量 | `npm test` | 全绿；51 文件 / 896 用例（只增不减） | ☐ |
| G6 | **本地无 UAC 门** | 见 D6 | 无窗口 / 退出码 3 / 接真管道活着等 HELLO | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts`、`src-main/ipc-ql.test.ts`、`build.bat` +（R-22）`src-main/ql-pty-host.ts`、`src-main/main.ts`（仅 C7 ② 的注释） | ☐ |
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
| J-0 | 主代理 P13 取证（2026-10-15 18:5x，规格 §3-P13） | 打包后的 `dist-release\win-unpacked\node.exe` + 写标记文件的探针：**带 `ELECTRON_RUN_AS_NODE=1` → marker=True（真 Node）**；**删掉该变量 → marker=False、进程 5s 后仍活着（= 应用模式，脚本没跑）**。旧探针自己设过该变量（`.temp/ql-admin-probe/probe1.mjs:58`、`probe2.mjs:53`），本会话环境也预置了它 → P5/P8 的「按文件名进 Node 模式」是环境变量造成的误判。用户真机手动跑 `.\node.exe <脚本>` **把应用启动了**，三次观测一致 |
| J-1 | （第一轮 R-19，**已打回**）`npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 先红 `Tests 20 failed \| 14 passed (34)`；后绿 `Test Files 3 passed (3)`、`Tests 37 passed (37)`。全文 `.temp\ql-admin-probe\red-1.txt` / `green-1.txt`。**本轮这些用例与文件都不存在**（丢弃，见 J-8） |
| J-2 | （第一轮，已打回）`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Tests 61 passed (61)` = 34 + 27，与基线逐字相同。全文 `.temp\ql-admin-probe\green-2.txt` |
| J-3 | （第一轮，已打回）`npx tsc --noEmit -p tsconfig.main.json` | `TSC_EXIT=0` |
| J-4 | （第一轮，已打回）`npx vitest run src-main/i18n` | `Test Files 4 passed (4)`、`Tests 18 passed (18)` → 零新词典键 |
| J-5 | （第一轮，已打回）`npm test` | `Test Files 52 passed (52)`、`Tests 900 passed (900)`。全文 `.temp\ql-admin-probe\green-5.txt` |
| J-6 | **D6 本地无 UAC 门（主代理 2026-10-15 19:5x-20:1x）——就是它打回了第一轮 R-19 的形状。** `cmd /c build.bat` 后依次跑 `.temp/ql-admin-probe/d6-variants2.ps1`、`d6-variants3.ps1`、`d6-variants4.ps1`、`probe-entry-run.ps1`、`real-pipe-run2.ps1`、`verify-pack.ps1` | ① `lms_launcher.exe --ql-pty-host \\.\pipe\lms-diag-a tokA` → `exit_code=9`、stderr `lms_launcher.exe: bad option: --ql-pty-host`；② `--ql-pty-host=…` → 同样 `exit_code=9`；③ `-- --ql-pty-host …` 与裸位置参数 `ql-pty-host …` → `exit_code=1`、`Cannot find module 'D:\Dev\Projects\lms_launcher\ql-pty-host'`；④ **成立的形状**：`lms_launcher.exe "<…app.asar\dist-main\ql-pty-host.js>" \\.\pipe\lms-diag-g tokG` → `exit_code=3`、stderr 空；⑤ 探针入口 → `argv=[exe, 入口, 管道名, token]`、`defaultApp:"absent"`、`versions{node:18.18.2,electron:28.3.3}`、`tmpWrite:"EPERM … lms-ql-host.log"`（沙箱对 TEMP 的 EPERM，非缺陷）；⑥ 真实管道 + 打包 exe 当宿主 → 服务端 `serverHandle=true`、客户端 `STILL-RUNNING`（活着等 HELLO）；⑦ 对照：无参数 → `exit_code=0`、无 stderr；⑧ 产物核对：`node.exe in win-unpacked present = False`、asar 里有 `\dist-main\ql-pty-host.js`、`app.asar.unpacked` 三个原生模块 True。全文 `.temp/ql-admin-probe/task11-round1-d6-evidence.md` |
| J-7 | （第一轮，已打回）`build.bat` 删块后的编码复核 | `bytes=5419 CRLF=111 LF=111 nonASCII=0 lines=111 endsWithCRLF=true`；`git diff --numstat -- build.bat` = `0  21  build.bat`。**本轮重新取证**（工作区已丢弃，需再跑一次） |
| J-8 | 丢弃第一轮工作区（主代理 2026-10-15 20:2x）：`git restore -- src-main build.bat package.json docs/superpowers/checks/…/task-11-host-mode-launch.md`；`Remove-Item src-main/boot.ts, src-main/ql-host-boot.ts, src-main/ql-host-boot.test.ts` | `git status --porcelain` 只剩 `M .superpowers/…/progress.md`、`M docs/…/plans/…`、`M docs/…/specs/…` + 两个未跟踪的 SDD 记录文件；`Select-String package.json '"main"'` → `"main": "dist-main/main.js",`；`git grep -n require.main -- src-main/ql-pty-host.ts` → `:209`（HEAD 形状在位） |
| J-9 | 本轮 D6 门（主代理，H 段提交前跑） | ☐（**原因**：本会话跑不了 app 模式 —— 删掉 `ELECTRON_RUN_AS_NODE` 后 `lms_launcher.exe` 带不带参数都在启动瞬间退出 `0x80000003`，见 J-19；而带该变量时跑的是 Node 模式，K64 ①）。**去处**：真机门（规格 §7.2）+ 第三轮的 D6 重定义） |
| J-10 | **本轮起点核对（A1 / A3 / A4）**：`git log --oneline -1`；`git status --porcelain`；`Test-Path src-main/boot.ts; Test-Path src-main/ql-host-boot.ts; Test-Path src-main/ql-host-boot.test.ts`；A3 的锚点逐处读文件复核 | `fdd30e0`（本轮文档提交）；porcelain 只有 `?? .superpowers/…/task-11r2-brief.md`（派单文件），无 `src-main/*` / `build.bat` / `package.json` 改动；三个 `Test-Path` 全 `False`。A3 锚点全部属实：`HOST_EXE_NAME` :32、`HostPaths.hostDir` :84、`errnoOf` :119-123、`resolveHostLink` :125-156、`execPath` :163、`hostDir` :164、`startHost` 的 try/catch :360-368、注释 :366/:385/:449、测试 import :24、硬链接用例 :141-177、场景 2 :191-203、五处 `not.toContain` :212/:627/:714/:751/:912、`ipc-ql.test.ts` :491、`build.bat` :108-128。A4：`shellExecute(file, nShow, opts?)` 与四参 `launch(exe, script, pipeName, token)` 都在位，未补任何东西 |
| J-11 | （额外取证，非表内要求）改动前的定向基线：`npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` | `✓ ql-elevated.test.ts (24 tests)`、`✓ ipc-ql.test.ts (27 tests)`、`Tests 51 passed (51)` → 与 A2「该文件 24」逐字一致 |
| J-12 | **D1 先改测试 + D2 跑红**：`npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts`。改动 = 删 import `resolveHostLink`（:24）；删 `host_exe_resolution_reuses_an_existing_link_only_when_size_matches`（:141-177）；加 `host_exe_is_the_app_executable` + `start_host_passes_the_app_exe_and_script_to_launch`；改写 `launch_failures_close_both_handles` 场景 2（:191-203）；五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`；夹具 `HOST_EXE` 的值换名（见 J-17）。`launch_passes_runas_and_three_quoted_arguments` 与 `hostLauncherStub` 一字未改（脚本比对 HEAD `identical=true`） | **红**（exit 1）：`❯ src-main/ql-elevated.test.ts (25 tests \| 3 failed)` —— `× host_exe_is_the_app_executable → hostlink=ENOENT`、`× start_host_passes_the_app_exe_and_script_to_launch → hostlink=ENOENT`、`× launch_failures_close_both_handles → hostlink=ENOENT`；`✓ ipc-ql.test.ts (27 tests)`；`Tests 3 failed \| 49 passed (52)`。三条栈都指旧机制：`❯ resolveHostLink src-main/ql-elevated.ts:145:13` → `❯ Object.hostExePath src-main/ql-elevated.ts:167:14`（第 2、3 条经 `Module.startHost src-main/ql-elevated.ts:363:20`） |
| J-13 | **D2 实现后跑绿 = G1 定向**：同一命令 | **绿**（exit 0）：`✓ src-main/ql-elevated.test.ts (25 tests) 94ms`、`✓ src-main/ipc-ql.test.ts (27 tests) 6501ms`、`Test Files 2 passed (2)`、`Tests 52 passed (52)`。文件级 24 → **25**（删 1 加 2）、27 → 27，与 D1 的「该文件 24 → 25」逐字一致 |
| J-14 | **D3 / G3**：`npx tsc --noEmit -p tsconfig.main.json; "TSC_EXIT=$LASTEXITCODE"` · **D4 / G4**：`npx vitest run src-main/i18n` · **G2**：`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | D3：无诊断输出、`TSC_EXIT=0`（登记：`tsconfig.main.json:15` 的 `exclude` 含 `src-main/**/*.test.ts`，既有口径未改）。D4：`Test Files 4 passed (4)`、`Tests 18 passed (18)`（index 3 / no-hardcoded 2 / dict 11 / key-coverage 2）→ 零新词典键。G2：`✓ quick-launch.test.ts (34 tests)`、`✓ ipc-ql.test.ts (27 tests)`、`Tests 61 passed (61)`，与基线逐字相同 |
| J-15 | **D5 / G5 全量**：`npm test` | `Test Files 51 passed (51)`、`Tests 896 passed (896)`（exit 0）。**文件数仍 51 ✓；用例 895 → 896（净 +1，只增不减）**。**偏离**：本表 D5/G5/A2 写的 897 与本表 D1 自己的「删 1 加 2」不自洽（895 − 1 + 2 = 896）；897 来自 plan 任务 11 步骤 1/4 的「加 3 条」。本轮按 D1 执行、未为凑数补第 3 条 → 请主代理改 A2 / D5 / G5 三处数字（或按 plan 补用例，那要先改 D1）。报告 §7-1 |
| J-16 | **C7 词表 + B2 字节复核 + 范围取证**：`git grep -n "hostlink" -- src-main`；`git grep -n "node\.exe" -- src-main`；`build.bat` 用 Node 读 buffer 删 :108-128 后复核；`git status --porcelain`；`git diff --numstat` | `hostlink`：**零命中**（`GREP_EXIT=1`）。`node.exe`：**仍 6 处命中** —— `ql-pty-host.ts:2@+/`:207`、`main.ts:1094@+/`:1096`（B5 禁改）、`ipc-ql.test.ts:424@+/`:637`（B4 限定只改 :491）→ **C7 与 B4/B5 冲突，我按 B 段停手、未越界**，请主代理裁决（报告 §7-2）。build.bat：改前 `bytes=6697 CRLF=132 nonASCII=0 lines=132` → 改后 `bytes=5419 CRLF=111 裸LF=0 nonASCII=0 lines=111 endsWithCRLF=true`（与 J-7 的 bytes/lines/nonASCII 逐字一致；J-7 的 `LF=111` 是同一批换行的另一种记法，本轮把 CRLF 与裸 LF 分开计：CRLF=111、裸 LF=0）；`git diff --numstat -- build.bat` = `0	21	build.bat`。范围：`M build.bat / M src-main/ipc-ql.test.ts / M src-main/ql-elevated.test.ts / M src-main/ql-elevated.ts` + 两个未跟踪的 SDD 记录（派单 `?? …task-11r2-brief.md`、报告 `?? …task-11r2-report.md`）；numstat = `0/21`、`1/1`、`49/55`、`10/58` = H1 的暂存范围 |
| J-17 | **C1 / C4 / E3 的「一字未改」取证**：脚本比对 `git show HEAD:<file>` 与工作区（剥注释 / 取函数体） | `HostLauncher` 成员签名（`hostExePath(): string`、`hostScriptPath(): string`、`launch(exe, script, pipeName, token): { ok; handle; win32Error }`、`isAlive(handle): boolean`、`exitCodeOf(handle): number`）→ `SIGNATURES IDENTICAL: true`；`createHostLauncher.launch` 函数体 8 行 → `identical=true`（参数串与失败时 `shell.close(r.handle)` 都在原位）；`launch_passes_runas_and_three_quoted_arguments` 14 行 → `identical=true`；`hostLauncherStub` 前 15 行 → `identical=true`；`package.json` 的 `main` HEAD 与工作区都是 `dist-main/main.js`。**注释 / 夹具层的改动登记**（B1/B3 允许的文件内，未碰签名与断言）：`ql-elevated.ts:44@+/`:46-47@+/`:80`、`ql-elevated.test.ts:8`、夹具 `HOST_EXE` 的值 `…\node.exe` → `…\lms_launcher.exe`（不换名则 C7 违反、且 E7 的五条 `not.toContain('lms_launcher.exe')` 形同空转）。报告 §7-3 |
| J-19 | **主代理的 D6 / D6′ 门（本轮，2026-10-15 21:0x-21:1x）**：`cmd /c build.bat` → 产物核对 + 两种布局的入口参数式子；关键差别是脚本里先 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 并打印 `env present = False` | 产物：`app exe present = True size=177150464`、**`node.exe in win-unpacked present = False`**、asar 内 `\\dist-main\\ql-pty-host.js` 在且无 `boot.js`/`ql-host-boot.js`、`packaged package.json main = dist-main/main.js`（这些都过）。启动门：**带该变量时** exit 3（Node 模式，K64 ①）；**删掉该变量后**打包布局与 dev 布局都 `exit dec=-2147483645`（`0x80000003`）且探针脚本**没写出 json** → 入口参数未被接管；无参数（app 模式）也是 `0x80000003` → 本会话起不了 app 模式。结构性证据与外部来源见索引 **K64** |
