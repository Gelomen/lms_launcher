# 任务 11 第三轮报告 —— 应用 exe + `--ql-host` 开关 + `boot.js` 入口分流（R-23）

> 派单：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-11r3-brief.md`
> 真相源：spec §6.4（R-23 九条）/ §3-P13·P14·P15 / §6.5 / §6.6 / §6.10；plan 任务 11（第三轮）步骤 0-6 + 全局约束 G1-G9；
> check 表 `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md`（A-I 逐行照做；J 段 J-1…J-19 未动，本轮从 **J-20** 追加到 **J-28**）。

## 0. 状态：**DONE_WITH_CONCERNS**

一句话：新增 `src-main/boot.ts` 作打包入口（按 `--ql-host` 分流），`package.json` 的 `main` 改指 `dist-main/boot.js`，`ql-pty-host.ts` 的取参改成「先找开关、取其后两个，找不到才 `slice(2)`」的双形状，`ql-elevated.ts` 只把 `parameters` 换成 `'--ql-host "<管道名>" "<token>"'`；第二轮（R-21）的六处改动**原样保留**、未重做、未回退。

| 门 | 实测结果 |
|---|---|
| D2 先红 | `Test Files 3 failed (3)`、`Tests 4 failed \| 31 passed (35)`、`VITEST_EXIT=1`（红全落在新增/改动的 4 条 + `boot.test.ts` 的 `Failed to load url ./boot`） |
| G1 定向（3 文件） | `Test Files 3 passed (3)`、`Tests 38 passed (38)` = **3 + (8+2) + 25**，与 G1 的条数预期逐字一致，`VITEST_EXIT=0` |
| G2 相邻（quick-launch + ipc-ql） | `Tests 61 passed (61)` = 34 + 27，与基线逐字相同 |
| G3 `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0` |
| G4 `npx vitest run src-main/i18n` | `Tests 18 passed (18)`（index 3 / no-hardcoded 2 / dict 11 / key-coverage 2），零新词典键 |
| G5 `npm test` | `Test Files 52 passed (52)`、`Tests 901 passed (901)`、`NPM_TEST_EXIT=0` = 896 + 3（`boot.test.ts`）+ 2（`ql-pty-host.test.ts`）→ **与 D5/G5 预期逐字一致，不需要登记计数偏离** |
| D6 真机门 / G6 产物核对 | **未跑**：派单禁止子代理跑 `build.bat` / 打包 / 启动应用，且本会话起不了 app 模式（`0x80000003`，K64 ④）→ 见 §8 |

先红后绿是真的（§4），不是「实现完再补测试」。命令与真实输出已逐条落进 check 表 J-20…J-28；长输出全文落盘在 `.temp/ql-admin-probe/r3-*.txt`（gitignore 内）。

## 1. A 段 · 起点核对

| 项 | 命令 | 真实输出摘要 | 结论 |
|---|---|---|---|
| A1 | `git log --oneline -1`；`git status --porcelain` | HEAD = `6cd1159 docs: 宿主启动机制第三次修正 R-23…`；porcelain 只有派单允许的六个 `M`（`build.bat`、`src-main/ipc-ql.test.ts`、`src-main/main.ts`、`src-main/ql-elevated.test.ts`、`src-main/ql-elevated.ts`、`src-main/ql-pty-host.ts`）+ `?? …task-11r3-brief.md` | 起点 = 当前工作区，第二轮改动在位。**表里 A1 写的 HEAD `3e9a499` 已过时**（那是 R-23 文档提交之前），派单与本表头部都指 `6cd1159` → 按派单执行，已登记 J-20 |
| A2 | 逐处读 `ql-elevated.ts` / `ql-pty-host.ts` | 锚点全部属实：`ql-elevated.ts:44`、`:46-47`、`:124-128`、`:139`、`:140`、`:318-320`；`ql-pty-host.ts:86-89`、`:195`、`:202`、`:209` | 本轮要改的就是它们的参数拼法，未提前动 |
| A3 | 读测试夹具 | `ql-pty-host.test.ts:147-148` 与 `:352-355`（dev 形状）、`ql-elevated.test.ts:135` 与 `:166`（钉 `parameters`）、`ipc-ql.test.ts:491`（假 `hostExePath`） | 与表一致；`ipc-ql.test.ts:491` 的注释「不真解析硬链接」是旧话（B6 禁改，见 §7-4） |
| A4 | `Select-String package.json '"main"'` | 改前逐字 `  "main": "dist-main/main.js",`；`git status` 里**没有** `package.json` | K66 这次没踩，无需 `git restore` |
| A5 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` | task-01…10 全 `裸☐=0`、`I段 -[ ]=0`、`CENSUS_EXIT=0`；本表 `☑=0 裸☐=42 I段 -[ ]=7 H2=未提交` | 前置任务已提交；本表未验收（符合预期，勾由主代理落） |

## 2. B 段 · 改动范围（改后真实行号）

| 文件 | 动作 | 关键位置（改后真实行号） | 契约 |
|---|---|---|---|
| `src-main/boot.ts` | **新建** 36 行 | `:13` `const HOST_FLAG = '--ql-host';`；`:20-26` `export function bootMain(argv: string[], load: (name: string) => unknown): void` —— 命中 → `load('./ql-pty-host')` 后调 `.main()`；否则 → `load('./main.js')`；`:34-36` 模块顶层单次调用（外面套了一个运行时条件，理由见 §7-1） | C3 / C6 |
| `package.json` | 改 **1 行** | `:5` `"main": "dist-main/boot.js"`（原 `dist-main/main.js`）；`git diff --numstat` = `1 1 package.json`，scripts / dependencies / devDependencies / allowScripts 一字未动 | B2 / G7 的 R-23 唯一例外 |
| `src-main/ql-pty-host.ts` | 改（本轮 +11 / -4） | `:89-93` 新增 `hostArgvPair()`（C1 的三行逐字）；`:100` `runHost` 改用它；`:213` `main()` 的 catch 用**同一取法**；注释 `:2-3`、`:97`、`:218`。**`main()` 导出（`:206`）、`require.main === module` 块（`:220`）、帧协议、退出码 2/1/3/4（`:133`、`:149`、`:196`、`:214`）一字未改** | C1 / C5 |
| `src-main/ql-elevated.ts` | 改（本轮 1 行代码 + 3 处注释） | `:140` `const parameters = '--ql-host "' + pipeName + '" "' + token + '"';`；注释 `:44`、`:47`、`:138-139`。**`hostExePath()`（`:124-126`）/ `hostScriptPath()`（`:127-129`）/ `launch()` 其余部分（含失败时 `shell.close(r.handle)`）/ `startHost()`（`:311-326`）/ `ElevatedPtyProcess` 一字未改** | C2 / C5 |
| `src-main/ql-pty-host.test.ts` | 加 **2 条**（`77 0`） | `:238-276` `host_flag_in_the_middle_of_argv_yields_the_two_arguments`；`:278-313` `missing_values_after_the_flag_fail_as_pipe_with_exit_3`；夹具 `:147-148`、`:429-430` 一字未动（`77 0` = 只增不改） | D1 / E3 / E4 / E5 |
| `src-main/ql-elevated.test.ts` | 改 **2 条断言串** | `:135`、`:167` 钉 C2 的串；相邻注释同步（`:134`、`:155-156`）。**条数 25 不变** | D1 / E6 |
| `src-main/boot.test.ts` | **新建** 3 条 | `:31` `host_flag_loads_only_the_host_entry`、`:41` `no_host_flag_loads_only_the_app_entry`、`:53` `the_arguments_after_the_flag_reach_the_host_untouched` | D1 / E1-E3 |
| `build.bat`、`src-main/main.ts`、`quick-launch.ts`、`shell-execute.ts`、`ipc-ql.test.ts`、`ql-host-protocol.ts`、词典、渲染端、`electron-builder.yml`、`tsconfig.main.json` | **未改** | `git diff --numstat` 对这些路径为空；`build.bat` = `0 21`、`main.ts` = `3 3`，都是第二轮保留的原样 | B6 |

范围自检（J-26）：`git status --porcelain` 与 `git diff --numstat` 只含 B1-B6 列出的文件；`git grep -n hostlink -- src-main` 零命中（`GREP_EXIT=1`）。

## 3. C 段 · 接口契约（逐条）

- **C1 双形状取参**：`ql-pty-host.ts:89-93` 逐字含 `const i = process.argv.indexOf('--ql-host');` 与 `const args = i >= 0 ? process.argv.slice(i + 1, i + 3) : process.argv.slice(2);`，再取 `args[0]` / `args[1]`。两处调用点：`:100`（`runHost`）与 `:213`（`main()` 的 catch 取留痕用的管道名）—— 同一套取法。缺参数不猜、不补默认值：交回 `undefined`，由 `:196` 的 `fail('pipe', …, 3)` 收尾（守测试 `ql-pty-host.test.ts:278-313`：实测 `exitCodes == [3]`、`ERR.stage == 'pipe'`，无未捕获异常）。
- **C2 参数串**：`ql-elevated.ts:140` 逐字 `const parameters = '--ql-host "' + pipeName + '" "' + token + '"';`。`application` 仍取 `launcher.hostExePath()` = `process.execPath`（`:124-126` 未改），`verb = 'runas'`、`nShow = SW_HIDE`（`:141-143` 未改）。两条测试钉住（`ql-elevated.test.ts:135`、`:167`），实测绿。
- **C3 接缝**：签名与两条分支逐字（`boot.ts:20-26`）；「模块顶层只调用它一次」也成立（`:34-36`），但外面套了 `if (process.versions.electron)` —— 本轮唯一超出 C3 逐字的改动，取证与备选见 §7-1，请主代理裁。
- **C4 分流在取单实例锁之前**：取证 `git grep -n requestSingleInstanceLock -- src-main` → 生产侧只有 `src-main/main.ts:58`（另一处是 `ipc-ql.test.ts:40` 的假实现）。`boot.js` 在宿主分支不 `require` `main.js` → 不执行 `main.ts` 的顶层 → 不取锁、不建窗口（P15 的 `handshake=exit(code=0)` 正是撞锁）。产物侧对照见 J-27（`dist-main/boot.js:20-26` 两个分支各自只加载一个入口）；真机侧只能由 D6 证。
- **C5 不改的契约**：帧协议文件 `ql-host-protocol.ts` 不在 diff 里；退出码一族仍在位（`:133` token→2、`:149` spawn→1、`:196` pipe→3、`:214` fatal→4）；留痕文件名与格式未改（`:26`、`:35-51`）；`HostLauncher` 五成员签名（`ql-elevated.ts:46-52`）与 `startHost`（`:311-326`）未改；`ElevatedPtyProcess` 未改；`main.ts` 的 IPC 接线本轮零改动。
- **C6 入口只有一处**：`boot.ts` 里 `require(` 只出现在顶层那一行（`:35`），`load(` 只有两处（`:21`、`:24`）；`ql-pty-host.js` 字面量只在 `ql-elevated.ts:32`（`HOST_SCRIPT_NAME`）与 `hostScriptPath()`（`:127-129`）；`boot.ts` 不含 electron 的 import（`git grep` 零命中）。
- **C7 词表**：`hostlink` 零命中（J-26）。

## 4. D 段 · TDD 步骤门

- **D1 先改测试**：见 §2 的三行测试改动（新建 `boot.test.ts` 3 条 / `ql-pty-host.test.ts` +2 / `ql-elevated.test.ts` 改 2 条断言串）。
- **D2 跑红**：`npx vitest run src-main/boot.test.ts src-main/ql-pty-host.test.ts src-main/ql-elevated.test.ts` → `Test Files 3 failed (3)`、`Tests 4 failed \| 31 passed (35)`、`VITEST_EXIT=1`。四条红逐字：① `expected [ '--disable-gpu' ] to deeply equal [ '\\.\\pipe\\lms-ql-1a2b3c4d' ]`；② `expected [ '--ql-host' ] to deeply equal [ undefined ]`；③④ 两条 `parameters` 旧串（`Received: "C:\\Program Files\\…\\ql-pty-host.js" …`）。`boot.test.ts` 是 `Failed to load url ./boot … Does the file exist?`（模块还不存在）。既有 8 + 23 条仍绿 → 红没有溢出到无关用例。全文 `.temp/ql-admin-probe/r3-red-1.txt`。
- **D3 实现**：见 §2。
- **D4 跑绿 + 定向**：同一命令 → `Test Files 3 passed (3)`、`Tests 38 passed (38)`（= G1）。全文 `.temp/ql-admin-probe/r3-green-1.txt`。
- **D5 全量**：`npm test` → `Test Files 52 passed (52)`、`Tests 901 passed (901)`。全文 `.temp/ql-admin-probe/r3-green-5.txt`。
- **D6 真机门**：**未跑** → §8。

## 5. E 段 · 必须钉住的行为断言 → 守它的测试

| 断言 | 守它的测试（真实行号） | 实测 |
|---|---|---|
| E1 有开关 → 不加载 `main.js` | `boot.test.ts:31`：`expect(loaded).toEqual(['./ql-pty-host'])` + `not.toContain('./main.js')` + `mainCalls == ['./ql-pty-host']` | 绿；产物侧对照 J-27；真机侧只能 D6 |
| E2 无开关 → 与今天一致 | `boot.test.ts:41`：`loaded == ['./main.js']`、`mainCalls == []`；G2 的 61 条一字不变 | 绿 |
| E3 两个参数原样到达宿主 | `boot.test.ts:53`（`seen == snapshot`：开关与两个参数不被解析、不重排）+ `ql-pty-host.test.ts:238-276`（`connectArgs == [PIPE]`；HELLO 的 token 比对才通 → 顺序不错位；前后都有别的 Chromium 开关也不错位） | 绿 |
| E4 缺参数不崩 | `ql-pty-host.test.ts:278-313`：`connectArgs == [undefined]` → `ERR{stage:'pipe'}`、`exitCodes == [3]`、留痕行后缀 `stage=pipe err=connect ENOENT …`，测试本身无未捕获异常 | 绿 |
| E5 无开关仍可用（dev 直跑） | 夹具 `ql-pty-host.test.ts:147-148`、`:429-430` 保持 dev 形状未动（`77 0`），该文件 10 条全绿 | 绿 |
| E6 参数串里没有脚本路径 | `ql-elevated.test.ts:135` 钉的是 `'--ql-host "<管道名>" "<token>"'`（不含 `ql-pty-host.js`）；`hostlink` 词表零命中 | 绿 |
| E7 提权失败文案不变 | `ql-elevated.test.ts` 的 `host_exe_is_the_app_executable` 未改仍绿；`ipc-ql.test.ts:637` 的 `not.toContain('lms_launcher.exe')` 在 G2 的 61 条里仍绿 | 绿 |

## 6. F / G 段

- **F1**（不新增依赖、不改词典）：`package.json` 只改 `main` 一行；G4 的 18 条绿。
- **F2**（不碰 `main.ts` / `quick-launch.ts` / 渲染端）：见 §2 最后一行。
- **F3**（开关两处字面量互指）：`boot.ts:13` 与 `ql-elevated.ts:140` 同为 `--ql-host`，两处注释互指（`boot.ts:12`、`ql-elevated.ts:139`）。
- **F4**（词表）：`hostlink` 零命中。
- **F5**（真管道 / 真提权不进单测）：本轮没有新增任何真跑管道或真 `runas` 的用例。
- **F6 / G1-G5**：见 §0、§4，全部实测通过。
- **G6 产物核对**：**未跑**（派单禁止）。只留编译侧对照（J-27）：`npx tsc -p tsconfig.main.json` → `TSC_EMIT_EXIT=0`，`dist-main/boot.js` 与 `dist-main/ql-pty-host.js` 都在，`boot.js` 两个分支各自只 `require` 一个入口。请主代理按 G6 的三条命令实测。

## 7. 需要主代理裁决的点

1. **`boot.ts` 顶层调用套了 `if (process.versions.electron)`（本轮唯一超出 C3 逐字的改动）**。取证（J-21 实测）：vitest 的加载器里 `require` 存在但**解析不了同目录的 .ts**（`Cannot find module './ql-host-protocol'`）→ 照 C3 裸写会让 `boot.test.ts` 在 import 阶段就炸；而 `ql-pty-host.ts:220` 的 `require.main === module` 手法在这里不可靠：实测 `require.main` 在 vitest 下是 `undefined`，Electron 28 本身也把 `require.main` / `process.mainModule` 留成 `undefined`（electron/electron#40501），用它作条件的真机后果是「应用一行代码都不跑」，而这条门本机跑不了（K64 ④）。`process.versions.electron` 在 dev（`electron .`）与打包（`app.asar` 入口）下都成立、在跑测试的纯 Node 下不成立。备选：`!process.env.VITEST`（实测 `VITEST=true`，可行，但会把「从测试环境里起的应用」也挡掉）。请裁：接受 / 换条件 / 或要求把顶层调用挪出可被 import 的模块（那要新增文件，越 B 段）。
2. **`launch(exe, script, pipeName, token)` 的 `script` 与 `hostScriptPath()` 现在「交而不使用」**：R-23 的参数串不含脚本路径，但 B4 / C5 明确要求签名与 `startHost` 一字不改，所以保留了 `startHost:319-320` 的取值与传参。若要清掉这个死参数，需同时改 C5 与 B4。
3. **spec 落后于代码（SDD 缺陷，我未越 B 段）**：① spec §6.6 标题与 §6.6-1 仍写「由应用 exe 的『应用入口参数』直接执行」与「`pipeName` / `token` = `process.argv.slice(2)` 的前两位」—— 与 §6.4-2/4 的开关形状冲突；② §6.11 与 §7.1/§7.2 仍写「`package.json` 的 `main` 保持 `dist-main/main.js`」—— 与 §6.4-1 冲突；③ 索引 K2 / K13 的口径行仍停在 R-21。按 AGENTS.md「偏离 spec：先改 spec / plan / check 表（同一 commit）再改代码」，这三处应由主代理在同一提交里同步。
4. **注释残留在 B6 禁改的文件里**：`ipc-ql.test.ts:491` 的「不真解析硬链接（真机门 §7.2-1）」、`main.ts:1093-1094` 的「应用入口参数 = 宿主脚本」，都与 R-23 不符；按 B6 没动。
5. **留痕行在缺参数时会写 `pipe=undefined`**：`writeTrace` 的既有行为（`ql-pty-host.ts:44` 直接拼），C5 要求留痕格式不变 → 未改。主进程侧的合并只认 `pipe=` 与本实例管道名一致的行（K57），无害。
6. **本表 J-13（第二轮那行，第 120 行）有一个不成对的反引号**（反引号计数 49）：AGENTS.md 自检的表格完整性相关。按「J-1…J-19 只读、不改、不删」没动，留给主代理。本轮新增 J-20…J-28 已逐行自检：列数 = 3、反引号成对。
7. **本表 A1 的 HEAD 值（`3e9a499`）已过时**，实际起点是 `6cd1159`（= 派单写的值）。已在 J-20 登记，未改表。

## 8. 没做到的项 / 交付清单

- **D6 真机门**（未跑；原因：本会话起不了 app 模式，`0x80000003`，K64 ④）：机制的最终判据在 spec §7.2 —— 请用户在 `cmd /c build.bat` 的那一次构建里逐条回报：1 提权终端起得来（页签出现）、2 输入可用、3 提权 exe 起得来、4 无多余黑控制台窗口、5 UAC 标题是「LMS 启动器」、6 取消 UAC → 一行「以管理员权限启动失败」且无堆栈、7 提权终端 [停止] 杀进程树、8 不勾管理员的条目与今天一致、9 前置 feature 的 E1-E7、10 宿主连不上管道时 15s 内报错并带 `exit(code=N)` 或 `trace=…`。
- **G6 产物核对**（未跑，派单禁止）：三条命令 —— asar 内 `\dist-main\ql-pty-host.js` 与 `\dist-main\boot.js` 都在、`Test-Path …\win-unpacked\node.exe` = `False`、包内 `package.json` 的 `main` = `dist-main/boot.js`。
- 我这边**没有**跑 `build.bat`、没有打包、没有启动应用。

## 9. 工作区状态

未 `git add`、未 commit、未 push（G8）。改动清单（`git status --porcelain`）：`M build.bat`（第二轮保留）、`M package.json`、`M src-main/ipc-ql.test.ts`（第二轮保留）、`M src-main/main.ts`（第二轮保留）、`M src-main/ql-elevated.test.ts`、`M src-main/ql-elevated.ts`、`M src-main/ql-pty-host.test.ts`、`M src-main/ql-pty-host.ts`、`?? src-main/boot.ts`、`?? src-main/boot.test.ts`；文档侧：check 表 append-only 追加 9 行（`git diff --numstat` = `9 0`）+ 本报告。
