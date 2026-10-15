# 任务 11 报告：提权宿主改用「应用自己的 exe + `--ql-pty-host` 宿主模式」（R-19 / 索引 K59）

## 0. 状态：**DONE_WITH_CONCERNS**

一句话：起提权宿主的机制从「与 electron.exe 同目录的硬链接 `node.exe` + 宿主脚本路径」换成「**应用自己的 exe**（`process.execPath`）+ `--ql-pty-host <管道名> <token>` 的宿主模式」；新增 `src-main/boot.ts` 作打包入口转发器、`src-main/ql-host-boot.ts` 作纯函数判定器，**`src-main/main.ts` 一字未改**；`build.bat` 的硬链接预建块整段删除。

| 门 | 结果 |
| --- | --- |
| G1 定向（3 文件） | `Test Files 3 passed (3)`、`Tests 37 passed (37)`，exit 0 |
| G2 相邻（quick-launch + ipc-ql） | `Tests 61 passed (61)` = 34 + 27，与基线逐字相同 |
| G3 `npx tsc --noEmit -p tsconfig.main.json` | 无输出，exit 0 |
| G4 `npx vitest run src-main/i18n` | `Tests 18 passed (18)`，零新词典键 |
| G5 `npm test` | `Test Files 52 passed (52)`、`Tests 900 passed (900)`（基线 51 / 895 → +1 文件 / +5 测试，只增不减） |
| D6 本地无 UAC 门 | **未跑**（派单禁止子代理跑打包；check 表 J-6 留空给主代理）→ 见 §6 疑虑 1 |
| E6「宿主模式真被接管」 | 同上：只能由 D6 / §7.2-1 真机门证 |

先红后绿是真的（§2），不是「实现完再补测试」。

---

## 1. 改动文件与真实行号

| 文件 | 动作 | 关键位置（改后真实行号） | 契约 |
| --- | --- | --- | --- |
| `src-main/ql-host-boot.ts` | **新建** 24 行 | `:19` `export function parseHostMode(argv: string[]): { pipeName: string; token: string } \| null`；`:20-24` 取**第一个**标志下标 `i` → `argv[i+1]` / `argv[i+2]`，缺失或空 → `null`；`:17` 未导出的 `HOST_MODE_FLAG` | C1 |
| `src-main/boot.ts` | **新建** 17 行 | `:12` `import { parseHostMode } from './ql-host-boot';`；`:14` `const req = parseHostMode(process.argv);`；`:15-17` 命中 → `require('./ql-pty-host').hostMain([req.pipeName, req.token])`；`:18-19` 未命中 → `require('./main')` | C2 |
| `src-main/ql-host-boot.test.ts` | **新建** 53 行 | `:11` / `:24` / `:41` 三条用例（名字逐字见 §4） | E1 / E2 |
| `package.json` | 改 **1 行** | `:5` `"main": "dist-main/boot.js"`（原 `dist-main/main.js`）。scripts / dependencies / devDependencies 一字未动 | C3 / F4 |
| `src-main/ql-pty-host.ts` | 改（+18 / -5） | `:202-214` 新增 `export function hostMain(argv: string[]): void`（原 `main()` 的函数体：`:204-208` 装配真 net + 真 pty，`:210-213` `writeTrace(argv[0] ?? '', 'fatal', …)` + `process.exit(4)`）；`:216-218` `main()` 只剩 `hostMain(process.argv.slice(2))`；`:222-224` `require.main === module` 块原样；**`runHost`（`:88-190`）与帧协议一行未改** | C4 / C8 |
| `src-main/ql-elevated.ts` | 改（+48 / -68） | `:34` `const HOST_MODE_FLAG = '--ql-pty-host';`（删 `HOST_EXE_NAME` / `HOST_SCRIPT_NAME`）；`:51-58` `HostLauncher` 新签名（删 `hostScriptPath`，加 `hostParameters(pipeName, token)`，`launch` 只两参）；`:86` 删 `HostPaths`；`:118-126` 删 `errnoOf` + `resolveHostLink`，加 `isDevLayout()`；`:135-168` `createHostLauncher(shell)`：`:137-139` `hostExePath() { return process.execPath; }`、`:140-149` 参数串逐字 + dev 前缀、`:157-163` `shell.shellExecute(this.hostExePath(), SW_HIDE, {verb:'runas', parameters})` + 保留防御性 `shell.close`；`:334-352` `startHost` 删路径解析那一步（原 `:339-348`），`:345` 直接 `launcher.launch(pipeName, token)`，抛错时 `:347` `pipe.close(pipeHandle)` 后原样 rethrow；`:364` / `:428` 注释去掉 `hostlink=` 字样 | C5 / C6 / C7 |
| `src-main/ql-elevated.test.ts` | 改（+109 / -74） | `:37` `HOST_EXE` 换成应用 exe（含空格路径）、删 `HOST_SCRIPT`；`:126-144` `host_parameters_carry_the_flag_pipe_and_token`；`:146-201` `start_host_no_longer_resolves_a_hard_link`；`:203-223` `dev_mode_prepends_the_absolute_app_path`；删 `host_exe_resolution_reuses_an_existing_link_only_when_size_matches`；`:225-243` `launch_failures_close_both_handles` 去掉硬链接场景；`:363-378` `hostLauncherStub` 按 C5 换签名；`:462-…` `hello_carries_*` 断言 `toHaveLength(2)`；`:816` 管道名取 `launched[0][0]`；五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')` | E3 / E4 / E5 |
| `src-main/ql-pty-host.test.ts` | 改（+30 / -2） | `:49-58` `vi.mock('node:net')` 增 `netConnectSeen`（记录 connect 实参）；`:378-392` `host_main_takes_explicit_argv`；既有 8 条一字未改 | E7 |
| `src-main/ipc-ql.test.ts` | 改（+12 / -9） | `:428` `hostArgs` 类型 → `{ pipeName, token }`；`:446` 原函数捕获改 `hostParameters`；`:491-497` 三个覆盖按 C5 换签名；`:526` 还原同步；`:640` 宿主名换 `lms_launcher.exe`；`:547` `hostArgs.length === 1` 未动 | C5 / C8 |
| `build.bat` | 删 **21 行**（`0 21 build.bat`） | 原 `:108-128`（空行 + R-16 硬链接预建块：6 行 rem + `if exist … node.exe` + `pushd` / `mklink /H` / `if errorlevel` / `popd`）。改后 `:107` = `)`、`:108` = `echo.`、`:111` = `exit /b 0`，共 111 行 | C9 / F5 |
| `docs/superpowers/checks/…/task-11-host-mode-launch.md` | 改 7 行 | J-1…J-5、J-7 填真实输出；J-6 写成 `☐（原因 + 去处）`。A-I 段的勾**未动**（留给主代理） | J 段 |

**未改（B8 / C8 / F3 核对）**：`src-main/main.ts`（不在 `git diff --name-only` 里）、`src-main/quick-launch.ts`、`src-main/ql-host-protocol.ts`、`src-main/shell-execute.ts`、两份词典、渲染进程、`electron-builder.yml`、`tsconfig.main.json`。`winPipe` / `pipeKernel` / 握手（任务 10 的非阻塞轮询）/ 读循环 / `stopGraceful` / `startElevatedHost` 工厂签名在 `ql-elevated.ts` 的 diff 里一行未出现。

---

## 2. TDD：先红后绿（真实输出）

### 2.1 红（19:37，实现前）

`npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts`

```text
 ❯ src-main/ql-host-boot.test.ts (0 test)
 ❯ src-main/ql-pty-host.test.ts (9 tests | 1 failed) 84ms
   × … > host_main_takes_explicit_argv 4ms
     → hostMain is not a function
 ❯ src-main/ql-elevated.test.ts (25 tests | 19 failed) 95ms
   × … > host_parameters_carry_the_flag_pipe_and_token 4ms
     → launcher.hostParameters is not a function
   × … > start_host_no_longer_resolves_a_hard_link 1ms
     → launcher.hostScriptPath is not a function
   × … > dev_mode_prepends_the_absolute_app_path 1ms
     → launcher.hostParameters is not a function
 …
 FAIL  src-main/ql-host-boot.test.ts [ src-main/ql-host-boot.test.ts ]
 Error: Failed to load url ./ql-host-boot (resolved id: ./ql-host-boot) in …/src-main/ql-host-boot.test.ts. Does the file exist?
 Test Files  3 failed (3)
      Tests  20 failed | 14 passed (34)
     Errors  11 errors
```

红的是**新用例与接缝形状**（缺模块、缺 `hostMain`、缺 `hostParameters`），不是既有行为被改坏：ql-pty-host 的既有 8 条、ql-elevated 的 6 条（管道服务端那组不碰起宿主）此时仍是绿的。全文：`.temp\ql-admin-probe\red-1.txt`。

### 2.2 绿（19:43，实现后）

```text
 ✓ src-main/ql-host-boot.test.ts (3 tests) 65ms
 ✓ src-main/ql-pty-host.test.ts (9 tests) 61ms
 ✓ src-main/ql-elevated.test.ts (25 tests) 71ms
 Test Files  3 passed (3)
      Tests  37 passed (37)
```

全文：`.temp\ql-admin-probe\green-1.txt`。

---

## 3. 接口契约逐条核对（C1-C8）

| 契约 | 实现 | 取证 |
| --- | --- | --- |
| C1 `parseHostMode` 只一个导出、不 import electron / `./ql-pty-host`、无副作用、按位置不按下标 | `ql-host-boot.ts:19` | `node -e "…require('./dist-main/ql-host-boot.js')"` → `exports=parseHostMode`（**只有这一个键**）；`parseHostMode(['C:\app\lms_launcher.exe','--disable-gpu','--ql-pty-host','\\\\.\pipe\lms-ql-1a2b3c4d','tok123','--no-sandbox'])` → `{"pipeName":"\\\\.\pipe\lms-ql-1a2b3c4d","token":"tok123"}`；缺参 → `null`；无标志 → `null`。文件里 `import` 一行都没有 |
| C2 `boot.ts` 命中只 `hostMain`、绝不 `require('./main')`；未命中 `require('./main')`；不 import electron | `boot.ts:14-19` | 编译产物 `dist-main/boot.js:12-19`（`npx tsc -p tsconfig.main.json` 落盘后读文件）：先 `require("./ql-host-boot")`，命中分支只 `require('./ql-pty-host')`，else 分支只 `require('./main')`；两分支都惰性 require，宿主模式不加载 main.js、正常启动不加载 node-pty |
| C3 `package.json` 只改 `"main"` 一行 | `package.json:5` | `git diff --numstat -- package.json` = `1 1 package.json`；diff 只有那一行 |
| C4 `hostMain(argv)` = 原 `main()` 的体（保留 `stage='fatal'` + `exit(4)`）；`main() = hostMain(process.argv.slice(2))`；`require.main` 块未动；`runHost` 与帧协议一行未改 | `ql-pty-host.ts:202-224` | `git diff -U1 src-main/ql-pty-host.ts`：改动只在注释与 `:195-219` 这一段；`runHost`（`:88-190`）不在任何 hunk 里。既有 8 条（帧序 / READY / EXIT / 退出码 / 留痕）仍绿 |
| C5 `HostLauncher` 新形状五成员 | `ql-elevated.ts:51-58` | `host_parameters_carry_the_flag_pipe_and_token` 断 `hostExePath() === process.execPath`；`start_host_no_longer_resolves_a_hard_link` 断 `launch` 只被调一次、实参 `toHaveLength(2)`；`ipc-ql.test.ts:491-497` 的假接缝按同形状替换 |
| C6 参数串逐字 + `launch` 的 Win32 形状不变（`SW_HIDE` / `runas` / 防御性 `close`） | `ql-elevated.ts:140-149`、`:157-166` | `hostParameters(PIPE, TOKEN)` 逐字 `"--ql-pty-host" "<管道名>" "<token>"`；`shellExecute(process.execPath, 0, {verb:'runas', parameters})` 三处实参逐条断言；dev 分支见 E4 |
| C7 `startHost` 删路径解析步、只剩 `'pipe' \| 'launch'` 两个 stage；`hostlink` 一族彻底消失 | `ql-elevated.ts:334-352` | `start_host_no_longer_resolves_a_hard_link` 断 `calls).toEqual(['launch'])`（不再调 `hostExePath` / `hostParameters`）、两个 stage 各一次、抛错时原样 rethrow 且 `pipe.close` 已调；**`git grep -n hostlink -- src-main` → 无输出（exit 1）** |
| C8 `main.ts` 一字不改；管道 / 握手 / 读循环 / `stopGraceful` / 工厂签名不变；`quick-launch.ts` 等六个文件不变；零新词典键；错误前缀只有 `PROC:` | — | `git diff --name-only` 不含 `main.ts` 等；G2 的 61 条与 G4 的 18 条全绿；`git grep -n "PROC:" src-main/ql-elevated.ts` 的三处前缀与任务 10 相同，本次没有新增抛出点 |
| C9 `build.bat` 删块后纯 ASCII + 全 CRLF + `echo.` 结构不破 | `build.bat`（111 行） | `bytes=5419 CRLF=111 LF=111 nonASCII=0 lines=111 endsWithCRLF=true`；`git diff --numstat -- build.bat` = `0 21 build.bat`（只删不改） |

---

## 4. E1-E7 → 守它的测试（名字与 check 表逐字一致）

| # | 测试 / 取证 | 位置 | 结果 |
| --- | --- | --- | --- |
| E1 | `parses_the_flag_at_any_position` | `ql-host-boot.test.ts:11` | 绿：标志在首 / 夹在 Chromium 开关之间 / 无 `argv[0]` / 尾部还有开关 / 重复标志取第一个，五种排布都解析对 |
| E2 | `returns_null_when_arguments_are_missing` | `ql-host-boot.test.ts:24` | 绿：只有标志、只有一项、空字符串、以及「重复标志导致把标志本身当参数」的退化排布 → `null`（另加 `:41` `returns_null_when_the_flag_is_absent`：空前缀相似 `--ql-pty-host-x` / `x--ql-pty-host` 不误判） |
| E3 | `host_parameters_carry_the_flag_pipe_and_token` | `ql-elevated.test.ts:126` | 绿：`hostExePath() === process.execPath`、参数串逐字、`shellExecute(exe, 0, {verb:'runas', parameters})` |
| E4 | `dev_mode_prepends_the_absolute_app_path` | `ql-elevated.test.ts:203` | 绿：把 `process.defaultApp = true` + 相对且含空格的 `argv[1]` 换进去（跑完还原），断前缀是 `"<绝对应用目录>" `（`path.isAbsolute` 断言为真） |
| E5 | `start_host_no_longer_resolves_a_hard_link` + `git grep hostlink` 为空 | `ql-elevated.test.ts:146` | 绿：只调 `launch`、实参两项、两个 stage、抛错原样交且关管道；`git grep -n hostlink -- src-main` → **无输出**（连注释与测试里都没有） |
| E6 | D6 本地无 UAC 门（无窗口 + 退出码 3 + 留痕 `stage=pipe`） | check 表 J-6 | **未跑**（见 §6 疑虑 1） |
| E7 | `ql-pty-host.test.ts` 既有 8 条 + 新增 `host_main_takes_explicit_argv` | `ql-pty-host.test.ts:378` | 绿：把 `process.argv` 摆成「dev 布局 + 标志在 index 2 + 尾部 Chromium 开关」，断 `net.connect` 的实参是**入参**里的管道名（不是 `argv[2]` 的标志本身）、`exitCodes` 为 `[4]`、留痕行尾 `stage=fatal err=socket boom`。旧形状（只读 `process.argv`）在这条红 |

---

## 5. 回归门真实输出与计数对比

| 门 | 命令 | 真实输出（摘要） |
| --- | --- | --- |
| G1 | `npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | `Test Files 3 passed (3)` / `Tests 37 passed (37)`（3 + 9 + 25），exit 0 |
| G2 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Test Files 2 passed (2)` / `Tests 61 passed (61)` = **34 + 27**，与基线逐字相同 |
| G3 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出，`TSC_EXIT=0` |
| G4 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 / no-hardcoded 2 / dict 11 / key-coverage 2）→ 零新键；`boot.ts` / `ql-host-boot.ts` 过「字符串字面量无汉字」扫描 |
| G5 | `npm test` | `Test Files 52 passed (52)` / `Tests 900 passed (900)`，exit 0 |

**计数对比（G5）**：基线 **51 文件 / 895 测试** → 现在 **52 文件 / 900 测试**。差值可逐项对上：`ql-host-boot.test.ts` 新文件 +3；`ql-pty-host.test.ts` 8 → 9（+1）；`ql-elevated.test.ts` 24 → 25（删 1 条硬链接解析用例、加 2 条）。只增不减。

**额外取证（不在门内，供主代理参考）**：`npx tsc -p tsconfig.main.json`（落盘 `dist-main/`，在 gitignore 内）exit 0，产物 `dist-main/boot.js` 与 `dist-main/ql-host-boot.js` 的 CJS 形状见 §3 C1 / C2 行。

---

## 6. 偏离逐字契约之处、理由与替代方案

1. **`hostMain` 里多了一行 `process.argv.splice(2, process.argv.length - 2, argv[0], argv[1])`（`ql-pty-host.ts:203`）** —— 超出「`hostMain` = 原 `main()` 的函数体」的字面口径。
   - 理由：C8 要求 `runHost` 一行不改，而 `runHost` 在 `ql-pty-host.ts:88-89` 自己读 `process.argv.slice(2)`。宿主模式下的 `process.argv` 形状不由我们定：dev 布局是 `electron.exe "<应用目录>" --ql-pty-host <管道名> <token>`（`argv[2]` 是标志、`argv[3]` 才是管道名），打包布局里 Chromium 还会追加自己的开关。不改写就违反 spec §6.6-1「管道名与 token 由 `hostMain` 的入参决定」。
   - 替代方案 A（只用入参写留痕、不改 `process.argv`）：dev 布局必错（把 `--ql-pty-host` 当管道名去 connect），打包布局按下标也不稳。
   - 替代方案 B（给 `runHost` 加形参）：违反 C8「`runHost` 一行不改」。
   - 这条偏离由 E7 的新用例守住：旧形状在 `netConnectSeen` 上红。
2. **`--ql-pty-host` 字面量在 `ql-host-boot.ts:17` 与 `ql-elevated.ts:34` 各一份**。C1 规定 `ql-host-boot.ts`「只此一个导出」，不能把常量导出给 `ql-elevated.ts` 用。两处都有互指注释；E1（解析）与 E3（拼参数）会同时红，等于把「两边一致」钉在测试里。
3. **删掉了导出的 `HostPaths` 接口**（任务 4 为硬链接解析加的额外导出）与 `createHostLauncher` 的第二形参：它只服务 `resolveHostLink`，随硬链接族整体退场；C5 的新 `HostLauncher` 形状里也没有它。
4. **`startHost` 的抛错路径改为「`pipe.close(pipeHandle)` 后原样 rethrow」**（原实现是 `hostExePath()` 抛的 `hostlink=…` 被原样 rethrow）。语义相同（不留管道句柄、不带前缀），但触发条件从「路径解析失败」变成「起宿主本身抛错」——这是 C7 删掉解析步之后唯一剩下的可能抛错点（例如 koffi 绑定失败）。原 `launch_failures_close_both_handles` 的场景 2 因此搬到 `start_host_no_longer_resolves_a_hard_link` 的 ③，断言一字未弱化。
5. **五处 `not.toContain('node.exe')` 改为 `not.toContain('lms_launcher.exe')`**（`ql-elevated.test.ts` 五处、`ipc-ql.test.ts:640` 一处）。守卫的语义不变（§7.2-4：失败文案里不得出现**宿主名**），但宿主名换了，仍要有牙 → 用真实宿主名（打包产物名）。
6. **`boot.ts` 没有单测**。它是「require 哪个模块」的接线，单测里真 `require('./main')` 会拉起 electron。替代取证：编译产物 `dist-main/boot.js:12-19` 逐行核对（§3 C2）+ 主代理的 D6 / §7.2-1 真机门。
7. **`docs/…/task-11-host-mode-launch.md` 的 J 段被填**（7 行），A-I 段的 `☐` 一个没动（按派单：勾是主代理验收用的）。

---

## 7. 疑虑（不阻塞，但请主代理在验收时看一眼）

1. **E6 / D6 未跑，check 表 J-6 留空**（写成 `☐（原因 + 去处）`）。派单明确禁止子代理跑 `build.bat` 与打包 exe。本任务的核心断言「应用 exe 带 `--ql-pty-host` 时**被接管成宿主、没有又起一遍应用**」只有真机门能证：期望是无窗口、退出码 3、`%TEMP%\lms-ql-host.log` 出现 `stage=pipe`。真机门顺手请确认两件事：(a) 参数串在打包布局下被 Shell 原样送达（引号不被吞）；(b) 用户环境里若**全局**设了 `ELECTRON_RUN_AS_NODE`，会不会把提权起来的 electron 拽进 Node 模式 —— P13 的实测说「不继承」，但那次观测是在本会话环境里做的。
2. **`src-main/main.ts:1094` 与 `:1096` 的注释仍写「宿主 node.exe」**，现在过时了。C8 / F3 要求 `main.ts` 一字不改，所以我没动。若要清掉，需要主代理先放宽 F3 到「仅注释可改」并同步 check 表（三份文档同 commit）。
3. **dev 分支依赖 `electron .` 这种起法**：`package.json:9` 的 `dev:electron` 确实是 `… electron .`，与 `path.resolve(process.argv[1])` 的假设一致（已核对）。若有人改用 `electron dist-main/boot.js` 起 dev，`argv[1]` 就是脚本而不是应用目录，前缀会错 —— 那种起法不在 spec §6.4-1 的两种布局里，我没有为它加处理。
4. **`hostMain` 改写全局 `process.argv` 的尾部**（偏离 1 的必然结果）。当前 `src-main/` 里读 `process.argv` 的只有三处：`boot.ts`（在改写之前）、`ql-elevated.ts` 的 dev 分支（只在主进程侧调用）、`ql-pty-host.ts` 的 `runHost`（正是这次改写的目标）。宿主进程里不会调 `hostParameters`，所以现在没有互相干扰；将来若宿主里要读自己的命令行开关，得记得 `argv[2..]` 已被规范化。
5. **`dist-main/` 被我 `npx tsc -p tsconfig.main.json` 写过一次**（gitignore 内，不影响 `git status`）。主代理跑 `build.bat` 时会重新生成，无残留风险。

---

## 8. 范围自检（真实输出）

`git status --porcelain`（写本报告之前）：

```text
 M .superpowers/sdd/2026-10-14-quick-launch-admin/progress.md
 M build.bat
 M docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md
 M package.json
 M src-main/ipc-ql.test.ts
 M src-main/ql-elevated.test.ts
 M src-main/ql-elevated.ts
 M src-main/ql-pty-host.test.ts
 M src-main/ql-pty-host.ts
?? .superpowers/sdd/2026-10-14-quick-launch-admin/task-11-brief.md
?? src-main/boot.ts
?? src-main/ql-host-boot.test.ts
?? src-main/ql-host-boot.ts
```

`git diff --numstat`：

```text
12	0	.superpowers/sdd/2026-10-14-quick-launch-admin/progress.md
0	21	build.bat
7	7	docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md
1	1	package.json
12	9	src-main/ipc-ql.test.ts
109	74	src-main/ql-elevated.test.ts
48	68	src-main/ql-elevated.ts
30	2	src-main/ql-pty-host.test.ts
18	5	src-main/ql-pty-host.ts
```

- **`src-main/main.ts` 不在改动列表里**（F3 / C8 成立）。
- `.superpowers/…/progress.md`（`M`）与 `.superpowers/…/task-11-brief.md`（`??`）**不是我改的**：它们在我接手前就在工作区里（派单 A1 已登记），我一行未动。
- `docs/…/task-11-host-mode-launch.md` 的 7 行 = J 段填写（派单要求）。
- 其余 8 个文件全在 check 表 B 段列出的范围内；`git grep -n hostlink -- src-main` 无输出。
- 未 `git add`、未 commit、未 push。
