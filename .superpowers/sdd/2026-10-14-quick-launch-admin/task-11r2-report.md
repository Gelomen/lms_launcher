# 任务 11（第二轮，R-21）实现报告 — 提权宿主改用「应用 exe + Electron 的应用入口参数」

> 派单：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-11r2-brief.md` · check 表：`docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md`（本轮 J 段 = J-10 起）
> 规格真相源：§3-P13/P14、§6.3、§6.4、§6.6-1、§6.10、§6.11、§7.1、§7.2、§8-K2/K12/K13、§9-R1/R10
> 起点 HEAD = `fdd30e0`（本轮的文档提交）。**未 `git add`、未 commit**，改动全部留在工作区等验收。

## 0. 结论一句话

机制已按 R-21 落地：`hostExePath()` 恒等 `process.execPath`，硬链接族（`HOST_EXE_NAME` / `errnoOf` / `resolveHostLink` / `HostPaths.hostDir` / `hostlink=`）在 `src-main` 里彻底消失，`build.bat` 的预建块删除（111 行 / 纯 ASCII / 全 CRLF）。
五道门：定向先红（3 failed，全是旧机制的 `hostlink=ENOENT`）后绿（**25 + 27 = 52**）；`tsc` 干净；i18n 4 文件 / 18 用例全绿（零新键）；相邻回归 34 + 27 = 61 全绿；全量 `npm test` = **51 文件 / 896 用例**（基线 895 → 896，净 +1）。
**两处与文档不一致，都在文档侧**：① check 表 D5/G5/A2 写的 897 与它自己 D1 的「删 1 加 2」矛盾，实际是 896；② C7 的「`node.exe` 在 `src-main` 零命中」与 B4/B5 的禁改边界冲突，剩 6 处命中全在禁改文件里。逐条见 §7。

---

## 1. 起点核对（A1-A4）

| 项 | 命令 | 真实输出 |
|---|---|---|
| A1 | `git log --oneline -1` | `fdd30e0 docs: 任务 11 第二轮 —— 宿主改用应用 exe 的「应用入口参数」（R-21，命令行开关机制作废）` |
| A1 | `git status --porcelain`（动手前） | 只有 `?? .superpowers/sdd/2026-10-14-quick-launch-admin/task-11r2-brief.md`（派单文件本身）；**没有** `src-main/*` / `build.bat` / `package.json` 的改动 |
| A1 | `Test-Path src-main/boot.ts; Test-Path src-main/ql-host-boot.ts; Test-Path src-main/ql-host-boot.test.ts` | `False` / `False` / `False`（B6 满足：第一轮的三个产物不存在，本轮也没新建） |
| A2 | 基线 | 按派单不重跑全量基线；**定向基线我跑了**（§4 门 0）：`ql-elevated.test.ts` 24 + `ipc-ql.test.ts` 27 = 51 passed，与 check 表「该文件 24」逐字一致 |
| A3 | 锚点行号逐处读文件复核 | 全部属实：`HOST_EXE_NAME` :32、`HOST_SCRIPT_NAME` :33、`HostPaths` :82-85（`hostDir` :84）、`errnoOf` :119-123、`resolveHostLink` :125-156、`createHostLauncher` :162-188（`execPath` :163、`hostDir` :164、`hostExePath` :166-168、`hostScriptPath` :169-171、`launch` :179-186）、`startHost` :353-375（try/catch :360-368）、带 `hostlink=` 的注释 :366 / :385 / :449（:47 是带 `node.exe` 的尾注释）；测试侧 import :24、`launch_passes_runas…` :125-139、硬链接用例 :141-177、`launch_failures_close_both_handles` :180-204（场景 2 :191-203）、`hostLauncherStub` :326-330、五处 `not.toContain('node.exe')` :212/:627/:714/:751/:912；`ipc-ql.test.ts` :491；`build.bat` :108（空行）+ :109-128 |
| A4 | 前置接口 | `shell-execute.ts` 的 `shellExecute(file, nShow, opts?: {verb?, parameters?})` 在位；`HostLauncher` 的四参 `launch(exe, script, pipeName, token)` 在位（HEAD 已是这个形状）；`process.execPath` 可用。未补任何东西 |

## 2. 改动范围（B1-B6）

`git diff --numstat`（本轮全部改动，四个文件，与 H1 的暂存范围逐字一致）：

```
0	21	build.bat
1	1	src-main/ipc-ql.test.ts
49	55	src-main/ql-elevated.test.ts
10	58	src-main/ql-elevated.ts
```

- **B1 `src-main/ql-elevated.ts`**：删 `HOST_EXE_NAME`（原 :32）、`errnoOf`（原 :119-123）、`resolveHostLink` 含其注释块（原 :125-156）、`HostPaths.hostDir`（原 :84）、`const hostDir = …`（原 :164）；`hostExePath()` → `return execPath();`（现 :124-126），`const execPath = () => paths?.execPath ?? process.execPath;`（现 :122）**原样保留**；`startHost` 的 try/catch（原 :360-368）删成两行 `const exe = launcher.hostExePath();` / `const script = launcher.hostScriptPath();`（现 :318-319）；三处带 `hostlink=` 的注释（原 :366 随 try/catch 一起删、:385、:449）改掉。
  **未动**（逐条核对）：`hostScriptPath()`（现 :127-129，仍 `path.join(__dirname, HOST_SCRIPT_NAME)`）、`launch()`（现 :137-144，与 HEAD 逐字节比对 `identical=true`）、`isAlive` / `exitCodeOf`、`winPipe` / `pipeKernel`、握手（R-17 的非阻塞有界等待）、读循环、`stopGraceful`、`startElevatedHost` 签名、`hostStartError`。
- **B2 `build.bat`**：删 :108（空行）+ :109-128（R-16 的硬链接块），`echo.` 仍在 `Done` 之前（现 :108）。字节级复核（Node 读 buffer，不用文本工具改写）：
  `bytes=5419 CRLF=111 裸LF=0 nonASCII=0 lines=111 endsWithCRLF=true`（改前 `bytes=6697 CRLF=132 nonASCII=0 lines=132`）；`git diff --numstat -- build.bat` = `0	21	build.bat`。
- **B3 `src-main/ql-elevated.test.ts`**：清单见 §4 门 1。
- **B4 `src-main/ipc-ql.test.ts`**：只改 :491 的字面量 `'node.exe'` → `'lms_launcher.exe'`（`numstat 1/1`）。:428 / :446 / :493-494 / :523 / :547 一字未动。
- **B5 未改**：`git status --porcelain` 里没有 `ql-pty-host.ts` / `ql-host-protocol.ts` / `main.ts` / `quick-launch.ts` / `package.json` / 词典 / 渲染端 / `electron-builder.yml` / `tsconfig*.json`。另取证：`package.json` 的 `main` 工作区值与 HEAD 都是 `dist-main/main.js`。
- **B6 不存在**：`boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts` 三个 `Test-Path` 全 `False`；本轮没有新建任何文件（`git status` 里 `??` 只有派单文件）。

## 3. 接口契约逐条取证（C1-C7）

| # | 结论 | 取证 |
|---|---|---|
| C1 | 签名一字未改 | 脚本比对 HEAD 与工作区的 `export interface HostLauncher {…}`（剥掉注释后）→ `SIGNATURES IDENTICAL: true`：`hostExePath(): string`、`hostScriptPath(): string`、`launch(exe: string, script: string, pipeName: string, token: string): { ok: boolean; handle: unknown; win32Error: number }`、`isAlive(handle: unknown): boolean`、`exitCodeOf(handle: unknown): number`（现 `src-main/ql-elevated.ts:44-53`） |
| C2 | `hostExePath() { return execPath(); }` | `src-main/ql-elevated.ts:122`（`const execPath = () => paths?.execPath ?? process.execPath;` 原样）、`:124-126`。生产语义 = 宿主 exe 恒等应用自己的 exe |
| C3 | `hostScriptPath()` 未动 | `src-main/ql-elevated.ts:127-129` = `path.join(__dirname, HOST_SCRIPT_NAME)`；`HOST_SCRIPT_NAME = 'ql-pty-host.js'` 保留在 `:32` |
| C4 | `launch` 的参数串 | `src-main/ql-elevated.ts:139-140`：`const parameters = '"' + script + '" "' + pipeName + '" "' + token + '"';` → `shell.shellExecute(exe, SW_HIDE, { verb: 'runas', parameters })`；失败时 `shell.close(r.handle)` 仍在 `:142`。与 HEAD 逐字节比对 `identical=true` |
| C5 | stage 只剩 pipe / launch | `src-main/ql-elevated.ts:89`（`stage: 'pipe' \| 'launch' \| null`）、`:316`（pipe=create）、`:323`（launch）；`:318-319` 无 try/catch；`git grep -n "hostlink" -- src-main` → 退出码 1（零命中） |
| C6 | `HostPaths` 只剩 `{ execPath?: string }` | `src-main/ql-elevated.ts:81-83` |
| C7 | 词表 | `git grep -n "hostlink" -- src-main` → **零命中**（`GREP_EXIT=1`）。**`git grep -n "node.exe" -- src-main` 仍有 6 处命中**，全部落在 B5 禁改 / B4 限定只改一行的文件里（逐条见 §7-2） |

## 4. 五道门的真实输出（D1→D5 / G1-G5）

### 门 0（额外取证，不是 check 表要求的）：改动前的定向基线

`npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts`（HEAD 状态、未改任何文件）：

```
 ✓ src-main/ql-elevated.test.ts (24 tests) 100ms
 ✓ src-main/ipc-ql.test.ts (27 tests) 6419ms
 Test Files  2 passed (2)
      Tests  51 passed (51)
```

### 门 1（D1 先改测试）+ 门 2a（D2 跑红）

测试侧改动清单（只动 `ql-elevated.test.ts` 与 `ipc-ql.test.ts`）：

1. 删 import 里的 `resolveHostLink`（原 :24）。
2. 删 `host_exe_resolution_reuses_an_existing_link_only_when_size_matches` 整条（原 :141-177，含其段注释）。
3. 加 `host_exe_is_the_app_executable`（现 :141-152）：生产侧 `createHostLauncher(api).hostExePath() === process.execPath`；接缝 `createHostLauncher(api, { execPath }).hostExePath()` 交回注入值；注入不存在的路径**也不抛**、不碰文件系统；`hostExePath()` 不调 `shellExecute`。
4. 加 `start_host_passes_the_app_exe_and_script_to_launch`（现 :154-175）：① 生产侧 `startHost` 交给 `shellExecute` 的 `application` 逐字 = `process.execPath`、`nShow = 0`、`verb='runas'`、`parameters` 逐字 = `"<path.join(__dirname,'ql-pty-host.js')>" "<pipe>" "<token>"`，且成功路径不关管道句柄；② 接缝侧 `hostExePath()` 交出的值原样进 `launch`。
5. 改写 `launch_failures_close_both_handles` 的场景 2（现 :185-196）：`hostExePath()` 走 `paths.execPath` 接缝、路径不存在也**不抛**、交出去的就是注入的那个 exe、没失败就不关管道句柄。**不新增用例。**
6. 五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`（现 :206 / :621 / :708 / :745 / :906）。
7. 夹具 `HOST_EXE` 的值（现 :35）`…\node.exe` → `…\lms_launcher.exe`（夹具值，不是断言；理由见 §7-3）。
8. `launch_passes_runas_and_three_quoted_arguments`（现 :124-138）与 `hostLauncherStub`（现 :320-326）：脚本比对 HEAD → `identical=true`（一字未改）。

`npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` → **红**（exit 1）：

```
 ❯ src-main/ql-elevated.test.ts (25 tests | 3 failed) 107ms
   × ql-elevated 第一段：… > host_exe_is_the_app_executable 5ms
     → hostlink=ENOENT
   × ql-elevated 第一段：… > start_host_passes_the_app_exe_and_script_to_launch 1ms
     → hostlink=ENOENT
   × ql-elevated 第一段：… > launch_failures_close_both_handles 1ms
     → hostlink=ENOENT
 ✓ src-main/ipc-ql.test.ts (27 tests) 6481ms
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 49 passed (52)
```

三条失败的栈都指到旧机制（红是契约，不是笔误）：

```
Error: hostlink=ENOENT
 ❯ resolveHostLink src-main/ql-elevated.ts:145:13
 ❯ Object.hostExePath src-main/ql-elevated.ts:167:14
 ❯ src-main/ql-elevated.test.ts:146:60
（第 2、3 条分别是：❯ Module.startHost src-main/ql-elevated.ts:363:20 → ❯ src-main/ql-elevated.test.ts:170:16 / :193:16）
```

### 门 2b（D2 实现后跑绿 = G1 定向）

同一命令 → **绿**（exit 0）：

```
 ✓ src-main/ql-elevated.test.ts (25 tests) 94ms
 ✓ src-main/ipc-ql.test.ts (27 tests) 6501ms
 Test Files  2 passed (2)
      Tests  52 passed (52)
```

文件级用例数：**24 → 25**（删 1 加 2）、`ipc-ql.test.ts` **27 → 27**。与 check 表 D1 的「该文件 24 → 25」逐字一致。

### 门 3（D3 / G3 类型门）

`npx tsc --noEmit -p tsconfig.main.json; "TSC_EXIT=$LASTEXITCODE"` → 无任何诊断输出，`TSC_EXIT=0`。
（登记：`tsconfig.main.json:15` 的 `exclude` 含 `src-main/**/*.test.ts` —— 既有口径，本轮没改；类型门不覆盖测试文件，测试文件由 vitest 的转译跑。）

### 门 4（D4 / G4 i18n 三门）

`npx vitest run src-main/i18n`（输出经 `Select-String` 过滤，只留结果行）→ exit 0：

```
 ✓ src-main/i18n/index.test.ts (3 tests) 61ms
 ✓ src-main/i18n/no-hardcoded.test.ts (2 tests) 57ms
 ✓ src-main/i18n/dict.test.ts (11 tests) 55ms
 ✓ src-main/i18n/key-coverage.test.ts (2 tests) 63ms
 Test Files  4 passed (4)
      Tests  18 passed (18)
```

零新词典键（F1）：本轮没有改任何词典文件（`git status` 可证）。

### 门 5（G2 相邻回归）

`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts`（同样经 `Select-String` 过滤）→ exit 0：

```
 ✓ src-main/quick-launch.test.ts (34 tests) 297ms
 ✓ src-main/ipc-ql.test.ts (27 tests) 6304ms
 Test Files  2 passed (2)
      Tests  61 passed (61)
```

与基线逐字相同（34 + 27）。

### 门 6（D5 / G5 全量）

`npm test` → exit 0：

```
 Test Files  51 passed (51)
      Tests  896 passed (896)
```

**文件数仍 51；用例 895 → 896（净 +1，只增不减 ✓）**。check 表 D5/G5/A2 写的 897 与它自己 D1 的「删 1 加 2」不自洽（895 − 1 + 2 = 896）；897 来自 plan 任务 11 步骤 1（列了 3 条新用例）与步骤 4（「删 1 条、加 3 条 → 897」）。详见 §7-1。

### D6 / G6（本地无 UAC 门）

按派单**不归我**：未跑 `cmd /c build.bat`、未跑 `.temp/ql-admin-probe/` 的三个脚本。check 表 J-9 留空给主代理。

## 5. 用例计数对比

| 范围 | 基线（HEAD） | 本轮 | 差 |
|---|---|---|---|
| `ql-elevated.test.ts` | 24 | **25** | +1（删 `host_exe_resolution_…` 1 条，加 `host_exe_is_the_app_executable` + `start_host_passes_the_app_exe_and_script_to_launch` 2 条） |
| `ipc-ql.test.ts` | 27 | 27 | 0 |
| `quick-launch.test.ts` | 34 | 34 | 0 |
| `src-main/i18n` | 18 | 18 | 0 |
| 全量文件数 | 51 | 51 | 0 |
| 全量用例数 | 895 | **896** | **+1** |

## 6. E1-E7 → 测试映射

| # | 断言 | 守它的东西（本轮实测） |
|---|---|---|
| E1 | 宿主 exe = 应用自己的 exe | `ql-elevated.test.ts:141` `host_exe_is_the_app_executable`：生产侧 `=== process.execPath`、接缝交回注入值。绿 |
| E2 | `startHost` 交出的 `exe` / `script` 逐字 | `ql-elevated.test.ts:154` `start_host_passes_the_app_exe_and_script_to_launch`（① 生产侧逐字 = `process.execPath` + `path.join(__dirname,'ql-pty-host.js')`；② 接缝值原样进 `launch`）。绿 |
| E3 | 参数串 / `SW_HIDE` / `verb='runas'` | 既有用例 `launch_passes_runas_and_three_quoted_arguments`（现 :124-138，**一字未改**，脚本比对 HEAD 相同）+ 新用例的 `parameters` 逐字断言。绿 |
| E4 | 硬链接族彻底消失 | `launch_failures_close_both_handles` 改后的场景 2（现 :185-196）+ `git grep -n "hostlink" -- src-main` 零命中 + `startHost` 只有 pipe / launch（`ql-elevated.ts:89/:316/:323`） |
| E5 | 宿主入口真的被接管 | **D6 本地无 UAC 门**（归主代理，J-9）。本轮没有替代证据，我不自证 |
| E6 | 宿主入口行为不变 | `src-main/ql-pty-host.ts` 一字未改（`git status` 里没有该文件）；`ql-pty-host.test.ts` 既有 8 条在全量里全绿 |
| E7 | 失败文案不泄漏宿主 exe | 五处 `not.toContain('lms_launcher.exe')`（现 :206 / :621 / :708 / :745 / :906）+ 夹具 `HOST_EXE` 换成 `lms_launcher.exe`（不换则这五条永远不会命中任何东西、形同空转）。绿 |

## 7. 偏离与冲突（逐条）

1. **D5/G5/A2 的「897」是文档算术错，不是实现少一条。** check 表 D1 自己写的是「删 :141-177 整条（−1）、加 2 条 → 该文件 24 → 25」，净 +1 → 895 + 1 = **896**；897 来自 plan 任务 11 步骤 1（列了 3 条新用例）与步骤 4（「删 1 条、加 3 条 → 897」）。本轮以 check 表 D1 为准（派单硬性要求「严格按 check 表 B 段」），**没有**为凑 897 补第 3 条用例。请主代理改 check 表 A2 / D5 / G5 三处数字；若要按 plan 补第 3 条，那要先改 D1（文档先行）。
2. **C7 的「`node.exe` 在 `src-main` 零命中（含注释）」与 B4/B5 的边界冲突。** 我按 B 段停手、没有越界，剩余 6 处命中：
   - `src-main/ql-pty-host.ts:2`、`:207`（注释）—— B5 禁改；
   - `src-main/main.ts:1094`、`:1096`（注释）—— B5 禁改；
   - `src-main/ipc-ql.test.ts:424`（注释）、`:637`（既有断言 `not.toContain('node.exe')`）—— B4 限定「只改 :491 这一处字面量」。
   `hostlink` 一族已 0 命中（连我自己新写的注释都没用这个 token）。要清掉这 6 处必须放宽 B4/B5，请主代理裁决。
3. **注释 / 夹具层的改动（超出派单点名的三处 `hostlink=`）**，都在 B1/B3 允许改的文件内，未触碰任何签名或断言：
   - `ql-elevated.ts:44`（`HostLauncher` 的文档注释含 `node.exe`）、`:46-47`（两行尾注释含 `node.exe` / 「硬链接」）—— 不改就违反 C7「含注释」；签名已取证逐字不变。
   - `ql-elevated.ts:80`（`HostPaths` 的注释原写「单测在临时目录真跑硬链接解析」，随 `hostDir` 删除而失真）。
   - `ql-elevated.test.ts:8`（文件头注释原写「唯一真跑的是硬链接解析：fs.linkSync / fs.statSync 在临时目录真跑一次」，随用例删除而失真）。
   - `ql-elevated.test.ts:35` 夹具 `HOST_EXE` 的值：`…\node.exe` → `…\lms_launcher.exe`。夹具值不是断言；不改它则 (a) C7 过不了，(b) E7 的五条 `not.toContain('lms_launcher.exe')` 形同空转。
4. **`ElevatedPtyProcess` 构造函数里的 try/catch 保留**（`ql-elevated.ts:397-403`），只重写了它的注释（原 :449）。理由：B1 只要求删 `startHost` 里那段（C5 的「不再有 try/catch」上下文是 `startHost` 的 stage）；构造函数这段既不在 B1 的删除清单里、也不在「不动」清单里 —— 按「严格按 B 段」取保守解：留代码、改注释。
5. **`build.bat` 字节口径与 J-7 的记法不同**：J-7（第一轮）写 `LF=111`；本轮把两类换行分开计数，`CRLF=111` 且**裸 LF = 0**（111 个换行全是 CRLF）。其余数字与第一轮记录逐字一致：`bytes=5419`、`lines=111`、`nonASCII=0`、`git diff --numstat -- build.bat` = `0	21`。
6. **`ipc-ql.test.ts:491` 的假值改动不守任何判据**（登记，不是缺陷）：该文件只断言 `seen.hostArgs.length === 1`（:547），从不断言 `exe` 的值。这处改动只是把假值改成与真机一致（B4 的口径）；E1/E2 的判据都在 `ql-elevated.test.ts` 里。

## 8. 疑虑

1. **dev 态没有被任何门覆盖。** 本轮把 `hostExePath()` 定成恒等 `process.execPath`：dev 下它是 `node_modules\electron\dist\electron.exe`，入口参数 = `dist-main\ql-pty-host.js`（`tsc` 产物）。P14 的实测是**打包态**的 `lms_launcher.exe`；dev 里 `electron .` 用的正是同一个「应用入口参数」机制，形状同源，但本轮没有 dev 门可跑（D6 用的是打包产物）。真机门 §7.2-1 会一并证到。
2. **删掉 `startHost` 的 try/catch 后，「注入的 launcher 自己抛」这条边角不再关管道句柄。** 真实实现的两个取值（`paths?.execPath ?? process.execPath`、`path.join(__dirname, …)`）都不抛，所以生产路径没有泄漏；外层 `ElevatedPtyProcess` 的 catch（:397-403）只造文案、不关句柄。这是 B1 指定删除的直接后果，登记给主代理：要补就得放宽 B1（把关闭动作挪到外层），本轮没动。
3. **E1 的「恒等」钉的是契约，不是真机 exe。** 单测里的 `process.execPath` 是跑 vitest 的 node（`D:\Dev\Runtimes\Node\node.exe`），不是应用 exe。真机语义由 D6 / §7.2 兜。

## 9. 附录：命令原文

```
> git status --porcelain
M build.bat
 M src-main/ipc-ql.test.ts
 M src-main/ql-elevated.test.ts
 M src-main/ql-elevated.ts
?? .superpowers/sdd/2026-10-14-quick-launch-admin/task-11r2-brief.md

> git diff --numstat
0	21	build.bat
1	1	src-main/ipc-ql.test.ts
49	55	src-main/ql-elevated.test.ts
10	58	src-main/ql-elevated.ts

> git grep -n "hostlink" -- src-main
（无输出，GREP_EXIT=1）

> git grep -n "node\.exe" -- src-main
src-main/ipc-ql.test.ts:424:// 不真起提权进程、不真建管道、不真解析硬链接 node.exe（那些是规格 §7.2 的打包真机门）。
src-main/ipc-ql.test.ts:637:      expect(msg).not.toContain('node.exe');
src-main/main.ts:1094:    // node.exe）+ 等 READY，返回 ShellProcess 形状。形参取名 term 是为了不遮蔽 :1 导入的 electron shell（审查 Minor #3 口径）。
src-main/main.ts:1096:    // err.ql.ptySpawn 同值），绝不是宿主 node.exe —— §7.2-4 的真机判据就是「日志一行取消原因且带的是终端名不是宿主名」。
src-main/ql-pty-host.ts:2:// 任务 5（2026-10-14-quick-launch-admin §6.6）：提权 PTY 宿主入口 —— 被 §6.4 的硬链接 node.exe 直接执行。
src-main/ql-pty-host.ts:207:// plan 任务 5：只有被 node.exe 直接执行时才自动跑（单测注入假 socket 与假 pty）。

> build.bat 字节复核（Node 读 buffer，非文本工具）
BEFORE bytes=6697 CRLF=132 nonASCII=0 lines=132
AFTER  bytes=5419 CRLF=111 裸LF=0 nonASCII=0 lines=111 endsWithCRLF=true

> Test-Path src-main/boot.ts; Test-Path src-main/ql-host-boot.ts; Test-Path src-main/ql-host-boot.test.ts
False
False
False
```
