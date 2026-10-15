# 任务 11 · 宿主启动机制重做：应用 exe + `--ql-host` 开关 + 入口分流（R-19 → R-21 → **R-23**，第三轮）— check 表

> 真相源：spec §6.4（R-23 / 索引 **K65**）、§3-P13/P14/P15、索引 K59-K65；plan 任务 11（第三轮）。
> 三轮结论一句话：**硬链接**（P13）与**「应用入口参数」**（P15 + K64 的 `default_app.asar` 结构性证据）都被否掉；**开关 + 入口分流**（R-19 的形状）恢复，因为它当初被打回的理由（P14 的 `bad option`）是 Node 模式的现象（K64 ①③）。
> **本地无 UAC 门取消**（K64 ④：本会话起不了 app 模式，`0x80000003`）→ 机制判据在真机门（spec §7.2）。

## A. 起点核对（动手前）

| # | 项 | 取证命令 / 位置 | 勾 |
|---|---|---|---|
| A1 | 起点 = **当前工作区**（第二轮 R-21 的改动**保留**，用户 2026-10-15 21:3x 决定） | `git status --porcelain` 只允许：`build.bat`、`src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts`、`src-main/ipc-ql.test.ts`、`src-main/main.ts`、`src-main/ql-pty-host.ts`；HEAD = `3e9a499` | ☐ |
| A2 | 既有接缝与取值点（本轮要改的就是它们的**参数拼法**） | `ql-elevated.ts:46-47`（`HostLauncher` 两行注释）、`:124-128`（`hostExePath()` / `hostScriptPath()`）、`:139`（`const parameters = '"' + script + '" "' + pipeName + '" "' + token + '"';`）、`:140`（`shell.shellExecute(exe, SW_HIDE, { verb: 'runas', parameters })`）、`:318-319`（`startHost` 取两值）；`ql-pty-host.ts:86-89`（`runHost` 从 `process.argv.slice(2)` 取 `[管道名, token]`）、`:195`（`export function main()`，K58）、`:202`（留痕取 `process.argv.slice(2)[0]`）、`:209`（`require.main === module` 自动入口） | ☐ |
| A3 | 测试夹具现状（要同步改的地方） | `ql-pty-host.test.ts:147-150` 与 `:352-355`（喂 `process.argv = [argv0, <脚本>, PIPE, TOKEN]` 后还原）；`ql-elevated.test.ts` 的 `launch_passes_runas_and_three_quoted_arguments` 与 `start_host_passes_the_app_exe_and_script_to_launch`（钉 `parameters` 字符串）；`ipc-ql.test.ts:491` 的假 `hostExePath` | ☐ |
| A4 | `package.json` 当前 `"main": "dist-main/main.js"`（本轮改成 `dist-main/boot.js`）；它被 `npx asar extract-file` 误覆盖过（该命令无视第三个参数、往 CWD 写）→ 改前先 `git diff -- package.json` 确认干净 | `Select-String package.json '"main"'` | ☐ |
| A5 | 前置任务 1-10 已提交；第二轮未提交、保留 | `git log --oneline -1` = `3e9a499`；`tick-census.mjs` 对 task-01…10 全 `裸☐=0` | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | 勾 |
|---|---|---|---|---|
| B1 | `src-main/boot.ts`（**新建**） | 入口分流：`process.argv` 含 `--ql-host` → 调宿主入口的 `main()`；否则 → `require('./main.js')`。导出可测接缝 `bootMain(argv, load)`（`load` 是唯一副作用出口，K58 同一手法），模块顶层只调用它一次 | 不 import `electron`、不读管道、不解析参数内容（参数原样交给宿主）；字符串字面量全 ASCII（`i18n/no-hardcoded.test.ts:15-28`） | ☐ |
| B2 | `package.json` | 只改 `"main"` → `"dist-main/boot.js"` | 其余字段一字不动（G7 的 R-23 例外，plan 全局约束已登记） | ☐ |
| B3 | `src-main/ql-pty-host.ts` | `runHost` 的 argv 取值改成 C1 的「先找 `--ql-host`，取其后两个；找不到才用 `slice(2)`」；`:202` 的留痕取管道名同一套取法 | `main()` 导出、`:209` 的 `require.main === module` 块、帧协议、退出码 2/1/3/4（R-18 / K57）**一字不改** | ☐ |
| B4 | `src-main/ql-elevated.ts` | 只改 `:139` 的 `parameters` 拼法（C2）+ `:46-47` 注释里「应用入口参数」的说法 | `hostExePath()` / `hostScriptPath()` / `startHost()` / `launch()` 其余部分 / `ElevatedPtyProcess` 一字不改（第二轮已定的形状保留） | ☐ |
| B5 | `src-main/ql-pty-host.test.ts`、`src-main/ql-elevated.test.ts`、`src-main/boot.test.ts`（新建） | 按 D1 改 | 只动 D1 列出的用例与夹具 | ☐ |
| B6 | `src-main/main.ts`、`quick-launch.ts`、`shell-execute.ts`、`ipc-ql.test.ts`、`build.bat`、词典、渲染端、`electron-builder.yml` | **不改**（`build.bat` 保留第二轮已删的状态；`main.ts` 保留第二轮那 3 行注释改动） | 越界即不勾 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | 勾 |
|---|---|---|---|
| C1 | `runHost` 的 argv 取法（双形状） | `const i = process.argv.indexOf('--ql-host'); const args = i >= 0 ? process.argv.slice(i + 1, i + 3) : process.argv.slice(2); const pipeName = args[0]; const hostToken = args[1];` —— 有开关走开关形状（app 模式），没有就退回 dev 直接跑的 `slice(2)`（既有单测与 `require.main` 入口不破）。缺参数 → 走 `fail('pipe', …, 3)`，不抛未捕获异常 | ☐ |
| C2 | `launch()` 交出的参数串 | `const parameters = '--ql-host "' + pipeName + '" "' + token + '"';`（管道名与 token 各带引号，与既有断言同风格；`application` 仍是 `launcher.hostExePath()` = `process.execPath`，`nShow = SW_HIDE`、`verb = 'runas'`） | ☐ |
| C3 | `boot.ts` 的接缝 | `export function bootMain(argv: string[], load: (name: string) => unknown): void`；`argv.includes('--ql-host')` → `load('./ql-pty-host')` 后调其 `main()`；否则 `load('./main.js')`。模块顶层：`bootMain(process.argv, (name) => require(name))` | ☐ |
| C4 | 分流必须在取单实例锁之前 | `boot.js` 不加载 `main.js` 时，`main.ts` 里的 `requestSingleInstanceLock` 不会被执行（P15 的 `exit 0` 就是撞锁） | ☐ |
| C5 | 不改的契约 | 帧协议（`type:u8\|len:u32LE\|payload`、`HELLO=0x01` …）、退出码 token=2 / spawn=1 / pipe=3 / fatal=4、留痕文件 `%TEMP%\\lms-ql-host.log`、`hostExePath()` / `hostScriptPath()` 签名、`main.ts` 的 IPC 接线 | ☐ |
| C6 | i18n | 无新键；`boot.ts` 的字符串字面量全 ASCII | ☐ |

## D. TDD 步骤门

| # | 步 | 命令 | 预期 | 勾 |
|---|---|---|---|---|
| D1 | 先改测试 | 新建 `src-main/boot.test.ts`（**3 条**：含开关只加载宿主、不含开关只加载 `./main.js`、开关后两个参数原样到达宿主）；`ql-pty-host.test.ts` 加 **2 条**（`--ql-host` 在 argv 中间也取对两个参数；只有 `--ql-host` 没有值 → `stage=pipe` 退出码 3）；`ql-elevated.test.ts` 把钉 `parameters` 的两条断言改成 C2 的串（**条数不变**）；`ql-pty-host.test.ts:147-150` / `:352-355` 的夹具保持 dev 形状以证兼容 | 新用例先红 | ☐ |
| D2 | 跑红 | `npx vitest run src-main/boot.test.ts src-main/ql-pty-host.test.ts src-main/ql-elevated.test.ts` | 失败集中在新增/改动的用例 | ☐ |
| D3 | 实现 | 按 B1-B4 | 定向转绿 | ☐ |
| D4 | 定向 + 相邻 | `npx vitest run src-main/boot.test.ts src-main/ql-pty-host.test.ts src-main/ql-elevated.test.ts`；`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 前者全绿；后者 `Tests 61 passed (61)` 不变 | ☐ |
| D5 | 类型门 + i18n + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n`；`npm test` | `TSC_EXIT=0}`；i18n `Tests 18 passed (18)`；全量 **52 文件 / 901 用例**（896 + 3 + 2；实测不同就登记真值并同步 A2/D5/G5 与本行） | ☐ |
| D6 | ~~本地无 UAC 门~~ → **真机门**（K64 ④） | 主代理：`cmd /c build.bat` + 产物核对（`app.asar\\dist-main\\boot.js` 与 `ql-pty-host.js` 在包里、包内无 `node.exe`、`main = dist-main/boot.js`）。用户：按 spec §7.2 逐条，重点 [命令行] + [管理员权限] **出页签**、UAC 标题「LMS 启动器」 | 产物核对由主代理填 J 段；真机条目由用户回报 | ☐（**原因**：本会话起不了 app 模式，`0x80000003`，K64 ④；**去处**：spec §7.2 真机门） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 守它的测试 | 勾 |
|---|---|---|---|---|
| E1 | argv 里有 `--ql-host` 时**不加载** `./main.js`（不取单实例锁、不建窗口） | spec §6.4-1 / P15 | `boot.test.ts` ① | ☐ |
| E2 | argv 里没有 `--ql-host` 时行为与今天完全一致（只加载 `./main.js`） | G3「不勾选的路径逐字节不变」 | `boot.test.ts` ② | ☐ |
| E3 | 宿主拿到的两个参数 = 主进程交出的管道名与 token，顺序不错位、前面有别的参数也不错位 | spec §6.4-2 / K2 | `boot.test.ts` ③ + `ql-pty-host.test.ts` 新增① | ☐ |
| E4 | 缺参数不崩：只有 `--ql-host` 没有值 → `stage=pipe`、退出码 3 | §6.6-10 / R-18 | `ql-pty-host.test.ts` 新增② | ☐ |
| E5 | dev 直接跑脚本（无开关）仍可用 | `ql-pty-host.ts:209` 的 `require.main` 入口 | `ql-pty-host.test.ts` 既有夹具不改 | ☐ |
| E6 | 起宿主的调用仍是 `runas` + `SW_HIDE` + `process.execPath`（UAC 显示应用自己） | spec §6.4-2 / §7.2-1 | `ql-elevated.test.ts` 既有两条（改串） | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | 勾 |
|---|---|---|---|
| F1 | 不新增依赖、不改 `package.json` 依赖段（`main` 字段是 R-23 唯一例外） | plan G7 | ☐ |
| F2 | 不并行派单；子代理不 `git add` / 不 commit | AGENTS.md 第 4 步 | ☐ |
| F3 | 不引入 cmd 包装、不额外打包 exe、不用环境变量 | spec §6.4-7（K12 修订） | ☐ |
| F4 | 失败路径不新增日志行；`{err}` 词表不变（无 `hostlink=`） | §6.10 / K48 | ☐ |
| F5 | 本会话不跑 app 模式（起不来，`0x80000003`）；任何「本地验证过 app 模式」的说法都是假的 | K64 ④ | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | 勾 |
|---|---|---|---|---|
| G1 | 定向 | `npx vitest run src-main/boot.test.ts src-main/ql-pty-host.test.ts src-main/ql-elevated.test.ts` | 全绿；条数 = 3 + (8+2) + 25 | ☐ |
| G2 | 相邻 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Tests 61 passed (61)` | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0`（`tsconfig.main.json:15` 的 `exclude` 含测试文件，既有口径） | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | `Tests 18 passed (18)` | ☐ |
| G5 | 全量 | `npm test` | 全绿；**52 文件 / 901 用例**（只增不减） | ☐ |
| G6 | 产物核对（不启动 app） | `cmd /c build.bat` 之后：`npx asar list <win-unpacked>\\resources\\app.asar` 过滤 `boot` / `ql-pty-host` / `main.js`；`Test-Path <win-unpacked>\\node.exe`；在 scratch 目录里解出 `package.json` 看 `main` 字段 | `\\dist-main\\boot.js` 与 `\\dist-main\\ql-pty-host.js` 都在包里；包内**无** `node.exe`；`main = dist-main/boot.js`。**注意**：`npx asar extract-file` 会往 CWD 写 `package.json`，必须在 scratch 目录里跑（索引 K66） | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | 勾 |
|---|---|---|---|
| H1 | 暂存范围 | `src-main/boot.ts`、`src-main/boot.test.ts`、`package.json`、`src-main/ql-pty-host.ts`、`src-main/ql-pty-host.test.ts`、`src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts` + 第二轮保留的 `build.bat`、`src-main/ipc-ql.test.ts`、`src-main/main.ts` | ☐ |
| H2 | commit message（逐字） | `fix: 提权宿主由应用入口按 --ql-host 开关分流启动（R-23，入口参数机制退场）` | ☐ |
| H3 | 勾完整性 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` 退出码 0，本表 `裸☐=0`、`I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] `boot.ts` 的分流被 `boot.test.ts` 三条钉住（E1/E2/E3）
- [ ] `runHost` 双形状取参被 G1 钉住（C1/E3/E4/E5）
- [ ] `parameters` 串与 `runas`/`SW_HIDE`/`process.execPath` 被既有两条改串后的用例钉住（C2/E6）
- [ ] G1-G5 全绿且数字与 D5/G5 登记一致
- [ ] G6 产物核对由主代理实测填 J 段
- [ ] 真机门（D6）已把清单交付用户，回报到达后填 J 段
- [ ] H1-H3 由主代理执行

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
