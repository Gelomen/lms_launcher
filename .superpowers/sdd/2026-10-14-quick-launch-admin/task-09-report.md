# 任务 9 · 可自动化部分 — 子代理执行报告

> 执行范围：plan 任务 9 的**可自动化部分**（步骤 1 的 `build.bat` 改动 + 回归门 G1/G2/G3 + C3 真机清单逐字抽取 + 产物核对命令）。
> **不**跑 `build.bat`（plan 步骤 2 明写「主代理」）、**不**跑真机门、**不** `git add` / commit、**不**落 check 表 A-I 段的勾。

## 0 状态

**完成**（本任务交我做的四项全部做完）：

| 项 | 结果 |
|---|---|
| B1 `build.bat` 预建硬链接步骤 | 已插入，`+21` 行，只改这一个文件；三条语义（新建 / 已存在跳过 / 失败只警告）已用逐字复制的块实测 |
| G1 `npm test` | `Test Files 51 passed (51)` / `Tests 888 passed (888)`，exit 0 —— 与主代理给的基线逐字相同，用例数无变化 |
| G2 `npx tsc --noEmit -p tsconfig.main.json` | 无任何输出，exit 0 |
| G3 `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`，exit 0 |
| C3 真机清单逐字 | 见本报告第 5 节（规格 §7.2 九条 + 前置 feature E1-E7 + 本表 E7/E8），逐字抄自源文件，未改写 |

**留给主代理 / 用户**：D1（跑 `build.bat`）、D2/G4（产物核对，命令见第 6 节）、D3-D4（把第 5 节清单交用户并回收回报）、真机门 E1-E8、H1-H3（暂存 / commit / 普查）。

**工作区状态**：`git status --porcelain` = `M build.bat`（仅此一项）；未 `git add`、未 commit。check 表只填了 J 段（J-5 / J-6 / J-7 / J-8），A-I 段的 `☐` 一个都没动。

## 1 起点核对（A 段取证，按分工不落勾）

| 项 | 实测 |
|---|---|
| A1 HEAD / 工作区 | 起点 `git log --oneline -1` = `920e7eb docs(checks): 任务 8 验收落勾 + K54（Electron 版本误读）+ 任务 9 真机门 E8`；`git status --porcelain` 起点为空（干净）；分支 `feat/quick-launch-admin`。**注意**：派单里写的起点 hash 是 `20c28a2`，该对象存在（`git cat-file -t 20c28a2` = `commit`，标题与 HEAD 逐字相同，父提交同为 `37fea42`），但 `git branch --contains 20c28a2` 为空 → 它是被 amend 取代的旧对象，不在任何分支上。A1 的口径（HEAD = 任务 8 的验收落勾提交）成立，只是 hash 换了。 |
| A3 锚点行号 | 改前实测 `build.bat`：`:102` = `:pack_done`、`:104-107` = 清理旧 portable 产物的块、`:108` = `echo.`、`:109` = Done 行、`:111` = `exit /b 0`；`electron-builder.yml`：`files` `:5-11`、`asarUnpack` `:18-21`。与本表「现状锚点」一致。 |
| A4 宿主脚本会被产出 | `tsconfig.main.json:9` `outDir: "dist-main"` + `:14` `include: ["src-main/**/*.ts"]`（`:15` 只排 `*.test.ts` / `test-utils.ts`）→ `src-main/ql-pty-host.ts`（8206 B）产出 `dist-main/ql-pty-host.js`（9535 B，实测在盘上）；`electron-builder.yml:7` 的 `dist-main/**` 把它送进 asar，`:10-11` 只排 test 产物 → 契约成立。 |
| B2 `electron-builder.yml` | **未改**。实测 `asarUnpack` `:19-21` 三条齐全：`**/node_modules/@lydell/**`、`**/node_modules/koffi/**`、`**/node_modules/@koromix/**` —— 没有发现「没覆盖」的偏离，因此无需报告异常，也不触发 §9-R1 的回退。 |

## 2 B1：`build.bat` 的真实行号与完整插入块

**改动**：`git diff --stat` → `build.bat | 21 +++++++++++++++++++++`，`1 file changed, 21 insertions(+)`（0 删除、0 修改）。

- 插入位置：新文件 **`:108`（空行）– `:128`（块尾的 `)`）**，即原 `:107`（清理块的 `)`）之后、原 `:108` 的 `echo.` 之前 —— 与规格 §6.11「在 `:102`（`:pack_done`）之后、`:109` 的 Done 之前」及本表 B1「`:107` 之后插入」一致。
- 顺移：原 `:108` `echo.` → **`:129`**；原 `:109` Done → **`:130`**；原 `:110` 启动提示 → **`:131`**；原 `:111` `exit /b 0` → **`:132`**。文件总行数 111 → **132**。
- 编码实测：改后 `build.bat` 仍是**纯 ASCII**（`nonAsciiCount=0`）、全 CRLF（`CRLF=132` / `bareLF=0`）—— 没有引入 `§` 等非 ASCII 字节，避免 cmd 代码页下的显示问题。

插入块逐字（现文件 `:109`–`:128`）：

```bat
rem ---- pre-create the node.exe hard link the elevated PTY host needs (2026-10-14 quick-launch-admin 6.11) ----
rem The elevated terminal runs a plain Node script through <win-unpacked>\node.exe, a HARD LINK to
rem lms_launcher.exe - 0 extra bytes; Electron enters Node mode by the executable name, not by an env var.
rem The link MUST sit next to the exe, otherwise the host dies with 0xC0000135 STATUS_DLL_NOT_FOUND.
rem A failure here is a warning only: resolveHostLink re-creates the link at first use (spec 6.4-1), and an
rem existing node.exe is left alone - it may be the user's own file (spec 9-R5).
rem Same rule as the note above at :91-92 - no unescaped closing parenthesis inside these echo lines.
if exist "dist-release\win-unpacked\node.exe" (
  echo [build] node.exe hard link already present in win-unpacked - leaving it alone.
) else (
  pushd "dist-release\win-unpacked"
  mklink /H "node.exe" "lms_launcher.exe" >NUL
  if errorlevel 1 (
    echo [build] WARNING: could not create the node.exe hard link - the elevated terminal
    echo         will create it itself the first time it starts.
  ) else (
    echo [build] Created node.exe hard link for the elevated PTY host.
  )
  popd
)
```

对照本表 B1 / C1 与规格 §6.11 的逐字要求：

| 要求 | 落在哪 |
|---|---|
| C1 预建命令逐字：在 `win-unpacked` 目录内 `mklink /H "node.exe" "lms_launcher.exe"` | `:119` `pushd "dist-release\win-unpacked"` + `:120` `mklink /H "node.exe" "lms_launcher.exe" >NUL`（命令本体逐字一致；`>NUL` 只吞 mklink 的成功回显，失败时 mklink 自己的错误走 stderr 仍会打出来，便于诊断） |
| 已存在则跳过 | `:116-117` `if exist "dist-release\win-unpacked\node.exe" ( echo … leaving it alone. )` |
| `mklink` 失败只警告不中断（运行时 `resolveHostLink` 会自建，规格 §6.4-1） | `:121-123` 只 `echo [build] WARNING: …`，无 `exit /b`、无 `goto`；`:127` `popd` 后继续走到 `:129-132` 的 Done |
| F3：echo 行里不得出现未转义的 `)'` | 新增的 4 条 echo 行（`:117` / `:122` / `:123` / `:125`）**零括号**；块内也没有带 `）` 的 rem 行。带括号的 rem 行都在块外（`:109-115`），与既有 `build.bat:9`（`taskkill /T`）、`:11`、`:60`（`darwin/…`）同风格，cmd 的 `rem` 吃掉整行，不受影响 |
| F2：硬链接必须在 exe 同目录 | 用 `pushd` 进 `win-unpacked` 后以裸文件名建链，链接与 `lms_launcher.exe` 同目录（`probe5` B 段：不同目录 → `0xC0000135 STATUS_DLL_NOT_FOUND`，已写进 `:112` 的注释） |
| D1 预期「新增步骤打印『已创建 / 已存在 node.exe』」 | `:125`（已创建）/ `:117`（已存在）两条互斥回显 |

### 2.1 块语义实测（不跑 `build.bat`，用逐字复制的块跑三场景）

取证件：`.temp/ql-admin-task09/harness.bat`（`.temp/` 被 `.gitignore:4` 的 `.*/` 忽略，不污染工作区）。构造方式：从 `build.bat` 读出 `:109`–`:128` **逐字**拼进一个临时 bat（`cd /d` 到临时根目录，块后加 `echo TAIL-REACHED` 与 `exit /b 0`），在临时根下造 `dist-release\win-unpacked\lms_launcher.exe`（14 B 假文件）后 `cmd /c harness.bat`。

| 场景 | 实测输出（真实） |
|---|---|
| A 首次（无 `node.exe`、有 `lms_launcher.exe`） | `[build] Created node.exe hard link for the elevated PTY host.` → `TAIL-REACHED`，`HARNESS_EXIT=0`；随后 `fsutil hardlink list …\node.exe` 打出**两个名字**（`…\node.exe` 与 `…\lms_launcher.exe`），`node.exe` 长度 14（与源同 inode，不是副本），`Get-Item …\lms_launcher.exe`.LinkType = `HardLink` |
| B 再跑一次（`node.exe` 已在） | `[build] node.exe hard link already present in win-unpacked - leaving it alone.` → `TAIL-REACHED`，`HARNESS_EXIT=0`（幂等，不覆盖别人的文件，规格 §9-R5） |
| C 失败（`node.exe` 与 `lms_launcher.exe` 都不在 → `mklink` 报错） | `[build] WARNING: could not create the node.exe hard link - the elevated terminal` + `        will create it itself the first time it starts.` → **仍走到** `TAIL-REACHED`、`HARNESS_EXIT=0`；mklink 自身的 `The system cannot find the file specified.` 走 stderr 可见；跑完 `node.exe exists = false`（不产生半成品） |

结论：嵌套 `if exist (…) else (…)` + 块内 `if errorlevel 1 (…) else (…)` 在 cmd 下解析与执行都正常（`if errorlevel` 是执行期判定，不受块内变量提前展开影响），三条语义与规格 §6.11 / 本表 B1 一致。

## 3 G1 回归门：`npm test`（真实输出）

```
$ npm test
…
 ✓ src-main/ipc-ql.test.ts (27 tests) 7315ms
 ✓ src/modules/TemplateModal.test.ts (62 tests) 3971ms
 ✓ src-main/update-bootstrap.test.ts (13 tests) 4926ms
 ✓ src-main/process.test.ts (5 tests) 6335ms
 ✓ src-main/ps1-encoding.test.ts (3 tests) 4650ms
（完整日志：.temp/ql-admin-task09/g1-npm-test.log）

 Test Files  51 passed (51)
      Tests  888 passed (888)
   Start at  15:15:43
   Duration  9.19s (transform 6.89s, setup 1.76s, collect 15.24s, tests 40.00s, environment 9.66s, prepare 5.52s)

G1_EXIT=0
```

与主代理给的基线（`Test Files 51 passed (51)` / `Tests 888 passed (888)`）**逐字相同**：本任务不改任何代码，用例数无变化。

## 4 G2 / G3 回归门（真实输出）

```
$ npx tsc --noEmit -p tsconfig.main.json
（无任何输出）
G2_EXIT=0
```

```
$ npx vitest run src-main/i18n
 RUN  v2.1.9 D:/Dev/Projects/lms_launcher

 ✓ src-main/i18n/index.test.ts (3 tests) 65ms
 ✓ src-main/i18n/no-hardcoded.test.ts (2 tests) 62ms
 ✓ src-main/i18n/dict.test.ts (11 tests) 64ms
 ✓ src-main/i18n/key-coverage.test.ts (2 tests) 66ms

 Test Files  4 passed (4)
      Tests  18 passed (18)
   Start at  15:16:04
   Duration  373ms (transform 79ms, setup 190ms, collect 81ms, tests 256ms, environment 0ms, prepare 342ms)

G3_EXIT=0
```

日志落盘：`.temp/ql-admin-task09/g1-npm-test.log` / `g2-tsc.log` / `g3-i18n.log`。

## 5 C3：真机清单（逐字，主代理原样交给用户）

规格 §7.2 末句与本表 D3 的硬门：**不得用「自动化已过」代替这一条**（本实现环境起不了 ConPTY，规格 §2-5）。以下三段**逐字抄自源文件**（未改写、未合并、未优化措辞），行号即源文件真实行号。

### 5.1 规格 §7.2 的 9 条（`docs/superpowers/specs/2026-10-14-quick-launch-admin.md:207-217`）

主代理跑 `build.bat`，核对 `dist-release\win-unpacked\`：`node.exe` 硬链接在（`fsutil hardlink list` 两个名字同 inode）、`app.asar.unpacked\` 里 koffi 与 node-pty 的原生模块在、`app.asar\dist-main\ql-pty-host.js` 在。然后交给用户在同一次构建里跑：

1. 命令行 + 管理员 + `cmd`：页签出现、提示符可用；任务管理器里该 `cmd.exe` 是「高」完整性级别。
2. 命令行 + 管理员 + `pwsh`：同上；输入、拖窗改尺寸、`[停止]` 都能用。
3. 命令行 + 管理员 + 自动命令：命令在 shell 就绪后自动执行（与非提权一致）。
4. 命令行 + 管理员，UAC 点「否」：按钮回落 `[启动]`，日志一行取消原因且带的是**终端名**不是宿主名。
5. 可执行程序 + 管理员：程序以提权启动；UAC 点「否」同上。
6. 不勾选的两条：与今天一致（无 UAC、无弹窗、无多余日志）。
7. 提权终端运行中点应用退出：终端进程树被杀掉，不留孤儿。
8. 提权终端里输 `exit` 关掉：按钮回落、退出码进日志。
9. **同一次构建里补跑前置 feature 的六步清单**（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7），把那个 feature 收尾。

### 5.2 前置 feature 的 E1-E7（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md:54-60`）

前置表 E 段的表头（`:52-53`）一并给出，便于原样阅读：

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 第 1 步：对 `E:\QiYou\QiYou.exe` 点 `[启动]` → 出现系统 UAC 弹窗 → 点「是」→ 奇游启动，日志出现 `启动命令 · E:\QiYou\QiYou.exe` | 规格 §7.2-1 / §4-1 / E6 / 索引清单第 16 行 | ☐ |
| E2 | 第 2 步：点 `[停止]` → 奇游进程真的消失（任务管理器里 `QiYou.exe` **与其子进程都要看**），行按钮回落绿 `[启动]` | 规格 §7.2-2 / §6.7 / E9 / E10 / §9-R2 / 索引 R2 | ☐ |
| E3 | 第 3 步：再点 `[启动]`，在 UAC 点「否」→ 日志出现 `[lms_launcher] PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`（行首 `[lms_launcher] ` 是规格 §8-K8 / 索引 K23 的 sys 通道口径），按钮回落，无残留运行态（不再出现 `EACCES`、按钮不卡在红「...」）。**2026-10-13 23:1x 用户回报（J-8）**：旧构建上该行缺 `[lms_launcher] ` 前缀 → 已按 K23 修代码，本步必须在重新打包后复跑 | 规格 §7.2-3 / §6.5 / §8-K8 / 索引 R1 / K23 | ☐（23:1x 的回报只证「文案可辨、按钮回落」，前缀缺陷已修但未进任何构建 → 整步待新构建复跑） |
| E4 | 第 4 步：不需要管理员的条目（例：`C:\Windows\System32\notepad.exe`）照常启动、停止，退出后 `进程退出 code=` 正常；**不因为走 Shell 路径多弹一次 UAC** | 规格 §7.2-4 / §6.3（`lpVerb = null`）/ E8 / 索引 R3 | ☐ |
| E5 | 第 5 步：打包目录里存在 `resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node` | 规格 §7.2-5 / §6.8 / 索引 R4 | ☐ |
| E6 | 第 6 步：应用退出路径（托盘退出 / `[更新]`）仍不留孤儿进程（`ql.stopAll` 走的是新的 `stopGraceful`） | 规格 §7.2-6 | ☐ |
| E7 | 观察项：UAC 挂起期间（实测 4.1s）主界面只是红「...」、无「未响应」/ 崩溃 —— 只记录现象、不判过否；若判定不可接受 → 按规格 §9-R1 另立规格升级 `worker_threads` | 规格 §6.9 / §9-R1 / 索引 K5 / R7 | ☐ |

### 5.3 本表新增的两条真机门 E7 / E8（`docs/superpowers/checks/2026-10-14-quick-launch-admin/task-09-packaging-realmachine.md:51-52`）

本表 E 段的表头（`:43-44`）：

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E7 | 起提权宿主后**立刻**把宿主进程杀掉（或让它启动即崩）→ 主进程**不得卡住**，必须按 §6.10 报错（索引 K51：`ConnectNamedPipe(h, null)` 是阻塞模式，15s 握手定时器对这种情形兜不住；单测里 `connect` 是假的，只有真机能判） | 任务 6 报告 §6-2 / 索引 K51 | 真机（用户执行） | ☐（真机门，用户执行） |
| E8 | 两态布局**肉眼过**（任务 8 的 D4 只给了数字，观感归真机）：命令行态终端行「左下拉 + 右开关」不换行、不截断（最长标签 `Command Prompt (cmd)` 全名）；可执行程序态的「管理员」行在「程序路径」之上；两态弹窗高度一致（218px）、不出滚动条；开关的紫色与焦点环与 [保存] 同语言。**注意**：同一个开关在命令行态靠右、在可执行程序态靠左 —— 这是规格 §6.2 逐字规定的形状（任务 8 报告 §7-1），若真机判定不可接受，**先改 spec §6.2 再改代码** | 任务 8 报告 §5（356.7px / 不截断 / 左列不变）与 §7-1 | 真机（用户执行） | ☐（真机门，用户执行） |

> 交清单时的口径（不改写上面任何一条，只作提示）：§7.2 的第 9 条 = 5.2 的 E1-E7，**必须在同一次构建里跑**（索引 K11）；5.3 的 E7/E8 也同批跑。前置表 E3 那条自带「必须在重新打包后复跑」的说明，正好由本次构建满足。

## 6 主代理跑完 `build.bat` 之后核对产物的三条命令（本表 D2 / C2）

```powershell
# 1) node.exe 与 lms_launcher.exe 同 inode：两条名字都要出现，且 node.exe 不是副本
fsutil hardlink list dist-release\win-unpacked\node.exe
# 预期：同时列出 …\win-unpacked\node.exe 与 …\win-unpacked\lms_launcher.exe
# 若这里只列出一个名字 / 报「没有此类文件」→ B1 的预建没生效（看 build.bat 是否打了 WARNING 或「already present」）

# 2) 宿主脚本在 asar 里
npx asar list dist-release\win-unpacked\resources\app.asar | Select-String ql-pty-host
# 预期：\dist-main\ql-pty-host.js

# 3) 原生模块解到包外（R1 的前置条件）
Test-Path dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell
Test-Path dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\koffi
# 预期：两条都 True（顺带可核 @koromix\koffi-win32-x64\win32_x64\koffi.node，前置表 C3 的口径）
```

**R1 命中时的回退口径**（规格 §9-R1，本表 E2）：真机上提权宿主里 `require('@lydell/node-pty')` 解析不到 `app.asar.unpacked` → 把 `ql-pty-host.js` 作为 extraFile 解到包外（改 `electron-builder.yml`），**不改协议**；且必须**同一 commit** 同步 spec / plan / 本表（plan 步骤 4）。上面三条命令只判「东西在不在包里」，判不了「提权进程里能不能解析」—— 后者只有 §7.2-1/2 的真机能判。

## 7 已写进 check 表 J 段的内容

只填 J 段（A-I 段的 `☐` 一律未动）：J-5（`npm test`）、新增 J-6（`tsc`）、J-7（`vitest run src-main/i18n`）、J-8（`build.bat` 的 diff 与三场景 harness 取证）。J-1（跑 `build.bat`）、J-2/J-3/J-4（产物核对）留空给主代理；真机回报行按 D4 等用户回报后再填。

## 8 疑虑（需要主代理判断的）

1. **起点 hash 与派单不符**：派单写 `20c28a2`，实际 HEAD 是 `920e7eb`（同标题、同父提交，`20c28a2` 不在任何分支上 → 被 amend 取代）。A1 的语义成立，但主代理落 A1 勾时引用的 hash 应当用 `920e7eb`，别把 `20c28a2` 写进 J 段。
2. **`mklink` 需要权限/文件系统**：NTFS 上建硬链接不需要管理员权限，本机的三场景实测通过；但若打包目录落在非 NTFS / 只读卷（规格 §9-R6），新块只会打 WARNING 并继续 —— 这是规格要求的口径，不是缺陷。真机若发现 `node.exe` 不在，先看 build 日志有没有那行 WARNING。
3. **已存在的 `node.exe` 一律跳过，不看 size**：`build.bat` 的「已存在则跳过」比运行时 `resolveHostLink`（`src-main/ql-elevated.ts:127-146`：同名文件只有 size 与 `process.execPath` 相同才认，否则报 `hostlink=`）宽松。极端情形：上一次构建留下的 `node.exe` 硬链接指向**旧版** `lms_launcher.exe`，而本次构建把 exe 重写（同一路径被覆盖 → 硬链接仍指向同一 inode，内容就是新的，所以正常情形没问题）；只有「用户自己往 win-unpacked 放了个 node.exe」才会命中跳过，此时运行时的 size 比对会按 §6.4-1 明确报错、不覆盖用户文件。规格 §6.11 只要求「已存在则跳过」，我按字面实现，没有加 size 比对 —— 若要打包侧也判 size，得先改规格 §6.11。
4. **`build.bat` 我没跑**（按分工归主代理），所以 D1/G4 的勾与 J-1…J-4 是空的；第 2.1 节的 harness 只证「插入的块语义正确」，不证「整份 build.bat 跑通」。主代理跑 `build.bat` 时请顺带确认新块的两条回显之一确实出现在日志里（首次构建应打 `Created node.exe hard link…`）。
5. 本表 A2 行写的是旧基线 `48 / 835`（该表生成时的数），当前实测 `51 / 888`（任务 1-8 增加了用例）。我按派单给的基线核对（逐字相同），没有改 A 段文字。
## 9 R-16 返工（主代理裁决后）

> 触发：主代理 2026-10-15 15:3x 真跑 `cmd /c build.bat`（`BUILD_EXIT=0`）后判定第 2 节那版「已存在则跳过」语义不对，已落裁决 **R-16 / 索引 K55** 并改写规格 §6.11 与本表 B1/D1。本节按新口径重做，**只改 `build.bat` 一个文件**；未 `git add`、未 commit、未落 check 表 A-I 段的勾、未派子代理。

### 9.1 状态

| 项 | 结果 |
|---|---|
| B1 新口径（那里的 `node.exe` 一律先删再建） | 已改，块仍占 **`:109`-`:128`**（20 行，与上一版同跨度）；`:129`-`:132` 逐字未动、行号未顺移 |
| 改动范围 | `git diff --numstat -- build.bat` = **`21 增 / 0 删 / 仅 build.bat`**；`git diff -U0` 只有一个 hunk：`@@ -107,0 +108,21 @@` —— 相对 HEAD 的新增全部落在 `:108`（空行）+ `:109`-`:128`，块外一行未改。工作区 `git status --porcelain` = `M build.bat` + `?? …task-09-report.md`（本报告仍未跟踪），无其它改动 |
| 编码 | 纯 ASCII / 全 CRLF，复测见 9.4 |
| 四场景实测 | 全部通过，见 9.3 |
| G1-G3 回归门 | **本次未重跑**：`git diff --numstat` 证明没有任何代码 / 测试 / 文档改动，只改了一个 `.bat`，第 3、4 节的绿不受影响 |

### 9.2 改动的真实行号与完整新块

新块逐字（现文件 **`:109`–`:128`**）：

```bat
rem ---- pre-create the node.exe hard link the elevated PTY host needs (2026-10-14 quick-launch-admin 6.11) ----
rem The elevated terminal runs a plain Node script through <win-unpacked>\node.exe, a HARD LINK to
rem lms_launcher.exe - 0 extra bytes; Electron enters Node mode by the executable name, not by an env var.
rem The link MUST sit next to the exe, otherwise the host dies with 0xC0000135 STATUS_DLL_NOT_FOUND.
rem A failure is a warning only - no exit, no goto: resolveHostLink re-creates the link at first use, spec 6.4-1.
rem node.exe in win-unpacked is ALWAYS deleted then re-created, never skipped: electron-builder copies
rem node_modules\electron\dist\node.exe in there - a plain copy, not a link, not the patched exe (R-16).
if exist "dist-release\win-unpacked\node.exe" (
  echo [build] Replacing the copied node.exe with a hard link to lms_launcher.exe...
  del /q "dist-release\win-unpacked\node.exe"
)
pushd "dist-release\win-unpacked"
mklink /H "node.exe" "lms_launcher.exe" >NUL
if errorlevel 1 (
  echo [build] WARNING: could not create the node.exe hard link - the elevated terminal
  echo         will create it itself the first time it starts.
) else (
  echo [build] Created node.exe hard link for the elevated PTY host.
)
popd
```

与上一版（第 2 节）的**全部**差异只有三处：

| 旧 | 新 |
|---|---|
| 旧 `:113`-`:114` rem：「A failure here is a warning only … **and an existing node.exe is left alone - it may be the user's own file (spec 9-R5)**」 | 新 `:113` 只留「失败只警告、无 exit / 无 goto、运行时自建（spec 6.4-1）」；「已存在就不动」那句按 R-16 删掉 |
| 旧 `:115` rem：「Same rule as the note above at :91-92 - no unescaped closing parenthesis…」 | 删掉该行，换成新 `:114`-`:115` 两行 R-16 依据（electron-builder 复制 `node_modules\electron\dist\node.exe`、既非硬链接也非改写后的 exe）。**取舍**：为把块保持在 20 行、不让 `:129`-`:132` 顺移，去掉了这条重复告诫 —— 它在本文件 `:91`-`:92` 仍在，且新块 4 条 echo 行零括号（9.4 有普查）。若主代理要保留这行，说一声，我加回去（块变 21 行、尾部顺移 1 行） |
| 旧 `:116`-`:118`：`if exist … ( echo … already present … leaving it alone. ) else ( … )` | 新 `:116`-`:119`：存在 → 打一行说明 + `del /q`；随后 `:120` 起**无条件** `pushd` + `mklink /H` + `if errorlevel 1`（只警告）/ else（Created）+ `popd` |

`mklink` 命令本体逐字未动：`:121` = `mklink /H "node.exe" "lms_launcher.exe" >NUL`（`>NUL` 只吞成功回显，失败时 mklink 自己的错误仍走 stderr 可见）。

对照新口径（规格 §6.11 逐字 / 本表 B1、C1、D1 / 索引 K55）：

| 要求 | 落在哪 |
|---|---|
| 在 `win-unpacked` 目录内 `mklink /H "node.exe" "lms_launcher.exe"` | `:120` `pushd "dist-release\win-unpacked"` + `:121`（命令本体逐字一致） |
| **那里的 `node.exe` 一律先删再建** | `:116` `if exist "dist-release\win-unpacked\node.exe" (` → `:117` 说明行 → `:118` `del /q "dist-release\win-unpacked\node.exe"` → `:119` `)`；随后无条件建 |
| 失败打警告不中断（运行时会自己补建，§8-K13） | `:122`-`:124` 只 echo WARNING，**无 `exit`、无 `goto`**；`:128` `popd` 后继续走 `:129`-`:132` 的 Done / `exit /b 0`（场景 D 实测） |
| 删除只影响那一个名字，不动 `lms_launcher.exe` 的 inode | 场景 B 实测：`del` 只删一个名字，`lms_launcher.exe` 仍在、大小与 mtime 逐字不变，跑完仍是两个名字同 inode |
| F3：echo 行里不得有未转义的 `) | 新块 4 条 echo 行（`:117` / `:123` / `:124` / `:126`）零括号；块内也没有带括号的 rem 行（R-16 那两行的括号在块外 rem 里，cmd 的 rem 吃整行） |

### 9.3 四场景实测（`.temp/ql-admin-task09/harness2.bat`，逐字拼接）

构造：从**改后**的 `build.bat` 读出 `:109`-`:128` **逐字**拼进 `.temp/ql-admin-task09/harness2.bat`（`.temp/` 被 `.gitignore:4` 的 `.*/` 忽略），前 3 行是 `@echo off` / `setlocal EnableExtensions` / `cd /d "%~dp0"`，块后再**逐字**接上 `build.bat:129`-`:132`（`echo.` / Done / 启动提示 / `exit /b 0`）——用来证明失败分支仍走到尾部。harness 行映射：`harness2.bat:4`-`:23` = `build.bat:109`-`:128`；`:24`-`:27` = `build.bat:129`-`:132`。harness 自身实测 27 CRLF / 0 bareLF / nonAscii=0。场景根 = `.temp\ql-admin-task09\dist-release\win-unpacked\`，每遍都是 `cmd /c harness2.bat` 的真实输出。

#### A 全新（只有 `lms_launcher.exe`）→ 打 Created、两个名字同 inode

```
setup: {"lms":{"exists":true,"size":2097152},"node":{"exists":false}}
$ cmd /c harness2.bat        EXIT=0
[build] Created node.exe hard link for the elevated PTY host.
[build] Done. Output folder: dist-release\win-unpacked\
[build] Start it with: dist-release\win-unpacked\lms_launcher.exe
（stderr 空）
after: {"lms":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"},
        "node":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"}}
$ fsutil hardlink list …\win-unpacked\node.exe     EXIT=0
…\win-unpacked\lms_launcher.exe
…\win-unpacked\node.exe
```

两个名字都在、大小与 mtime 完全一致 → 同一 inode，不是副本。

#### B 再跑一遍（`node.exe` 已是硬链接）→ 仍成功、仍两个名字、幂等

```
before: {"lms":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"},
         "node":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"}}
$ cmd /c harness2.bat        EXIT=0
[build] Replacing the copied node.exe with a hard link to lms_launcher.exe...
[build] Created node.exe hard link for the elevated PTY host.

[build] Done. Output folder: dist-release\win-unpacked\
[build] Start it with: dist-release\win-unpacked\lms_launcher.exe
（stderr 空）
after: {"lms":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"},   <- 与 before 逐字相同
        "node":{"exists":true,"size":2097152,"mtime":"2026-10-15T07:35:25.299Z"}}
$ fsutil hardlink list …\node.exe   EXIT=0        $ fsutil hardlink list …\lms_launcher.exe   EXIT=0
…\win-unpacked\lms_launcher.exe                    …\win-unpacked\lms_launcher.exe
…\win-unpacked\node.exe                            …\win-unpacked\node.exe
```

`del` 只删掉一个名字：`lms_launcher.exe` 仍在、大小与 mtime 未变（2,097,152 / 同一时间戳）。同 inode 的直接证据：往 `node.exe` 写 4096 B（首 19 字节 `WRITE-THROUGH-PROBE`）后读 `lms_launcher.exe` → `size=4096 first19="WRITE-THROUGH-PROBE"`，写穿同一 inode。

#### C 复制件场景（真实打包的情形：`node.exe` 是独立文件、内容不同、大小不同）→ 必须被替换成硬链接

按主代理实测的两个数造场景：`lms_launcher.exe` = **177,150,464**、`node.exe` = **176,813,568**（内容也不同）。

```
before: {"lms":{"exists":true,"size":177150464},"node":{"exists":true,"size":176813568}}
$ fsutil hardlink list …\node.exe   EXIT=0        <- 跑之前只列一个名字（复制件，与真实产物一致）
…\win-unpacked\node.exe
$ cmd /c harness2.bat        EXIT=0
[build] Replacing the copied node.exe with a hard link to lms_launcher.exe...
[build] Created node.exe hard link for the elevated PTY host.

[build] Done. Output folder: dist-release\win-unpacked\
[build] Start it with: dist-release\win-unpacked\lms_launcher.exe
（stderr 空）
after: {"lms":{"exists":true,"size":177150464},"node":{"exists":true,"size":177150464}}
$ fsutil hardlink list …\node.exe   EXIT=0
…\win-unpacked\lms_launcher.exe
…\win-unpacked\node.exe
size equality: true both = 177150464
content equality (first 32 B): "LMS-LAUNCHER-PATCHED-EXEAAAAAAAA" "LMS-LAUNCHER-PATCHED-EXEAAAAAAAA"
```

复制件被换掉：跑完两个名字同 inode、`node.exe` 大小 == `lms_launcher.exe` 大小、内容也是改写后 exe 的内容。

#### D 造失败（`lms_launcher.exe` 不在）→ 只 WARNING、走到尾、`exit /b 0`、不产生半成品

```
setup: {"lms":{"exists":false},"node":{"exists":false}}
$ cmd /c harness2.bat        EXIT=0
[build] WARNING: could not create the node.exe hard link - the elevated terminal
        will create it itself the first time it starts.

[build] Done. Output folder: dist-release\win-unpacked\
[build] Start it with: dist-release\win-unpacked\lms_launcher.exe
stderr（GBK 解码）: 系统找不到指定的文件。        <- mklink 自己的报错，走 stderr，不中断
after: {"lms":{"exists":false},"node":{"exists":false}}  dir listing: []   <- 没有半成品 node.exe
```

**附赠 D2（`win-unpacked` 目录本身不在）**：同样只打两行 WARNING 后走到 `exit /b 0`（`pushd` 与 `mklink` 各自的「系统找不到指定的路径。/ 系统找不到指定的文件。」走 stderr），`dist-release` 也没被凭空造出来。即：块在任何缺件情形下都不会中断打包。

### 9.4 ASCII / CRLF 复测（改后实测）

```
build.bat: {"bytes":6697,"lines":132,"CRLF":132,"bareLF":0,"nonAsciiCount":0}
```

与上一版同口径：**纯 ASCII（`nonAsciiCount=0`）、全 CRLF（`CRLF=132` / `bareLF=0`）**，总行数仍是 132（块保持 20 行，尾部 `:129`-`:132` 未顺移）。新块没有引入 § 等非 ASCII 字节（注释里写的是 `spec 6.4-1` / `R-16` 这种 ASCII 形式）。

echo 括号普查（全文件 28 条 echo 行）：带括号的只有既有的 `:6` / `:70` / `:89` 三条（都不在括号块内，属既有行为，未动）；**新块的 4 条 echo 行（`:117` / `:123` / `:124` / `:126`）零括号**。

### 9.5 主代理重跑 `build.bat` 之后该核对什么

1. **日志里应出现两行**（真实打包必走 C 分支）：`[build] Replacing the copied node.exe with a hard link to lms_launcher.exe...` **然后** `[build] Created node.exe hard link for the elevated PTY host.`。本表 D1 写的「Created node.exe hard link…」只是其中第二条 —— 全新构建里它前面必带 Replacing 那行，别按「只有一行」判。若只出现 WARNING，看紧随其后的 mklink stderr 行（非 NTFS / 只读卷即规格 §9-R6 的口径，属预期不中断）。
2. **`fsutil hardlink list dist-release\win-unpacked\node.exe`** → 必须同时列出 `…\node.exe` 与 `…\lms_launcher.exe` 两个名字（§7.2 前置核对的第一条）。当前盘上（主代理那一轮的产物）实测仍是 `node.exe` 176,813,568 / `lms_launcher.exe` 177,150,464 的复制件状态，即重跑正好命中场景 C。
3. **两个大小必须相等**：`Get-ChildItem dist-release\win-unpacked\node.exe, dist-release\win-unpacked\lms_launcher.exe | Select-Object Name,Length` → 两条同为 177,150,464；`win-unpacked` 目录总占用应比上一轮少约 169 MB（副本被硬链接取代）。
4. 其余两条产物核对（本表 D2 的第 2、3 条：asar 里的 `\dist-main\ql-pty-host.js`、`app.asar.unpacked` 里的 `@lydell` / `koffi`）不受本次改动影响，照旧核。
5. **可选、不在本任务范围**：复制件的来源是 `node_modules\electron\dist\node.exe`（实测它现在与 `node_modules\electron\dist\electron.exe`、`.temp\ql-admin-probe\node.exe` 同 inode，是早前某次 `resolveHostLink` 建的硬链接）。删掉那个源头的 `node.exe` 可让 electron-builder 根本不复制副本，但那是 `node_modules` 里的历史残留、不是本次改动引入的，新块已能纠正产物；要处理请另立条目，别混进本任务。
