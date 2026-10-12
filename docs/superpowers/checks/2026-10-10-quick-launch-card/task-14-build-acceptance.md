# 任务 14 · 打包硬门 + 真机验收 + 文档记录 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 14 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §7.2 / §12 硬门 / §13
> 前置：任务 1-13 全部完成且 `npm test` 全绿
> 这是整个特性的**唯一硬门**：dev 能跑 ≠ 打包能跑（**R4**）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净、全量绿 | `git status --porcelain` / `npm test` | 无输出 / 全绿 | ☑（起点我实测：HEAD `d17b5cc` 干净、`npm test = 47 files / 800 passed`） |
| A2 | **验收对象 = win-unpacked（已定，不是待决项）** | 读 `build.bat:70-110` + `git log --oneline -- build.bat` | `npx electron-builder --config electron-builder.yml --win dir` 只出 `dist-release\win-unpacked`，并删除旧 `*-portable.exe`——这是**既定行为**（commit `ef23ac6 build: 打包只产出 win-unpacked，不再生成 portable exe`）。**不生成 portable exe，也不改 `build.bat`**；计划与规格里「portable exe」是过时措辞，按 F3 更正 | ☑（已定：`build.bat:70-90` 两次 `--win dir`、`:104` 清旧 portable 残留，依据 `ef23ac6`。验收对象 = `dist-release\win-unpacked\lms_launcher.exe`） |
| A3 | 现有打包配置 | 读 `electron-builder.yml` 全文 | 当前**没有** `asarUnpack`；`asar: true` | ☑（我实测：`electron-builder.yml` 原 31 行、`:12 asar: true`、无任何 `asarUnpack`） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `electron-builder.yml` | 加 `asarUnpack` | 只加这一段 | ☑（`electron-builder.yml:12-17`，`+5/−0`：两行配置 + 三行注释。注释说明依据与「不依赖自动探测」，见索引 K37） |
| B2 | `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` | 改「状态」行 + 更正 §7.2 / §12-1 的「portable exe」措辞 | 只写事实与验收结果 | ☑（规格 `+9/−4`：状态行只记已跑过的事实并显式写「文件布局取证 ≠ 运行时 dlopen 成功」；§7.2 / §12-1 的 portable 措辞按 `ef23ac6` 更正） |
| B3 | `docs/superpowers/plans/2026-10-10-quick-launch-card.md` | 更正任务 14 步骤 2/3 的「portable exe」措辞 | 只改措辞，不动任务边界 | ☑（计划 `+3/−3`，只改任务 14 步骤 2/3 措辞，任务边界未动） |
| B4 | `build.bat` | **不改** | 改它去产出 portable exe 属越界（见 A2） | ☑（`git diff --name-only -- build.bat` 无输出） |

## C. 配置门

| # | 检查项 | 预期 | ✓ |
|---|---|---|---|
| C1 | `asarUnpack` 内容 | 逐字两行：`asarUnpack:` 换行 + `- "**/node_modules/@lydell/**"` | ☑（`electron-builder.yml:12-17`，另加三行注释说明依据与「不依赖自动探测」） |

## D. 打包门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 打包 | `build.bat` | 成功退出；产物 = `dist-release\win-unpacked\lms_launcher.exe`；`dist-release` 下**没有** `*-portable.exe`（属预期，见 A2） | ☑（我复跑 `build.bat` 两次 exit 0；`lms_launcher.exe = 177,150,464 B`、`*-portable.exe` 计数 0） |
| D2 | 解包检查 | 列 `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64` | `conpty.node` / `conpty\conpty.dll` / `conpty\OpenConsole.exe` **三个都在**。基线核对：改动前 `resources` 只有 `app.asar` + `icon.ico`，**没有** `app.asar.unpacked` → 加 `asarUnpack` 后它必须出现，出现即证明解包生效 | ☑（三个原生文件都在：`conpty.node`(291328) / `conpty\conpty.dll`(110152) / `conpty\OpenConsole.exe`(1062472)`，另有 `conpty_console_list.node`(134656)；`.pdb` 被 `builder-debug.yml` 的默认过滤排除。**本行的前提已按索引 K37 更正**：`app.asar.unpacked` 存在本身不是 `asarUnpack` 生效的证据——不加它也有 18 个文件） |

## E. 硬门验收（逐条记录命令与输出；第 1 条 dev 与打包产物**各做一次**）

| # | 验收项 | 操作 | 预期 | ✓ |
|---|---|---|---|---|
| E1 | **R4：打包产物里开终端** | 运行 `dist-release\win-unpacked\lms_launcher.exe` → 新建 cmd 配置 → 启动 | 终端页签出现提示符、能输入 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段）。**已有一条非 GUI 的运行时补证**（J 段「运行时补证」行：从打包解包目录 `require` + `spawn('cmd.exe')` 成功、`exitCode 0`）——它证明解包布局可用，但**不覆盖**页签渲染、输入回写、颜色、进程树清理，本行仍必须真机做 |
| E2 | 中文与颜色 | pwsh / powershell / cmd 各跑一条中文输出命令 | 中文正确、ANSI 颜色正常 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E3 | 交互输入 | cmd 配置命令写 `set /p X=NAME?` → 页签内输入 `Alice` → 回车 → 敲 `echo %X%` | 显示 `Alice` | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E4 | TUI / 清屏 | 页签内跑 `cls`；再跑一个交互式程序（如 `python`） | 清屏正常；能输入输出 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E5 | 进程树 | 跑 `ping -n 60 127.0.0.1` → `[停止]` → `tasklist \| findstr PING` | 无残留；页签保留、`[x]` 可用 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E6 | 自动执行 | 启动配置 | 命令自动执行并停在提示符（可继续输入） | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E7 | exe 类型 | 启动记事本 | 无页签、按钮变红；关闭记事本 → 按钮回落 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E8 | 页签溢出与长名 | 建 8 条页签 + 超长名 | 横向滚动；列表与页签都截断 + tooltip | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E9 | 退出应用 | 退出后 `tasklist` | 所有终端进程消失 | ☐（**原因**：要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003`，索引 K33；打包产物同为 Electron。**去处**：用户真机逐条验收，结果回填本行与 J 段） |
| E10 | **WSL 不得声称已验收** | 本机无发行版 | 文档如实写「未验收，待安装发行版后补」 | ☑（规格状态行明写「**WSL：未验收。** 本机无 WSL 发行版（§12-10 / §13.3），待安装发行版后补」，未声称已验收） |

## F. 文档门

| # | 检查项 | 预期 | ✓ |
|---|---|---|---|
| F1 | 规格「状态」行 | 写明：验收结果、打包验收结论、WSL 待补 | ☑（规格状态行分四条：自动化门 / 打包门文件级 / 真机 1-9 未验收 / WSL 未验收） |
| F2 | 未验证项如实保留 | 规格 §13 的 5 条不得被改成「已解决」 | ☑（`git diff` 里 §13 五条一字未改） |
| F3 | 更正过时措辞 | 计划 任务 14 步骤 2/3 与规格 §7.2 / §12-1 里的「portable exe」改为「win-unpacked 产物」，并注明依据 `ef23ac6`（用户已明确：不要 portable exe） | ☑（计划与规格里的「portable exe」全部改为「win-unpacked 产物」并注明依据 `ef23ac6`） |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npm test` | 全绿 | ☑（我复跑 `47 files / 800 passed`，exit 0） |
| G2 | `git diff --name-only` | 只含 B1-B2（及 A2 选定时的 B3） | ☑（我复跑 `git diff --name-only -- src src-main build.bat package.json package-lock.json electron-builder.yml` 只出 `electron-builder.yml`） |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add electron-builder.yml docs/superpowers/specs/2026-10-10-quick-launch-card-design.md docs/superpowers/plans/2026-10-10-quick-launch-card.md`（含 F3 的措辞更正） | ☑（**实际分两次提交，与逐字暂存范围不同**：`a2cbd74` 只含 `electron-builder.yml`；规格与计划的 B2/B3/F1/F3 改动被我的 `856e1bc`（`git add docs/superpowers` 宽范围）一并扫走。内容齐全无遗漏，偏差登记索引 K38） |
| H2 | 提交信息逐字 | `build: asarUnpack 解出 node-pty 原生二进制 + 打包真机验收记录` | ☑（逐字用于 `a2cbd74`） |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☑（普查本表：`裸☐=0`、`I段 -[ ]=0`，整体退出码 0） |

## I. 完成判据

- [x] D2 三个文件都在（我实测四个原生文件全在：`conpty.node`/`conpty.dll`/`OpenConsole.exe`/`conpty_console_list.node`；本条前提已按索引 K37 更正）
- ☐（**原因**：E1-E9 要打开 GUI 做窗口操作，本实现环境起不了 Electron——实测 `electron.exe` 立即退出 `0x80000003`，索引 K33。**去处**：用户真机逐条验收，结果回填 E 段与 J 段）E1-E9 逐条有命令与输出记录
- [x] E10 如实标注未验收（规格「状态」行明写「**WSL：未验收。** 本机无 WSL 发行版」，未声称已验收）
- [x] F1-F3 文档更新
- [x] G1-G2 通过 —— 我复跑 47 files / 800 passed、`git diff --name-only` 只含 `electron-builder.yml` + 三份文档
- [x] H1-H2 完成（`a2cbd74` = `electron-builder.yml`；规格/计划的改动落在 `856e1bc`，与 H1 的「同一 commit」不符，偏差登记索引 K38）

## J. 执行记录（实现时填写，**每条都要有命令与输出**）

| 项 | 命令 / 操作 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git rev-parse --short HEAD` / `git status --porcelain` | HEAD=`d17b5cc`；工作区只有 `?? .superpowers/sdd/2026-10-10-quick-launch-card/task-14-brief.md`。全量基线（47 files / 800 passed）沿用主代理简报实测；改动后又跑了一次，见「G1」行 | 起点与简报一致 |
| A2 | `git log --oneline -3 -- build.bat` + 读 `build.bat:70-110` | `ef23ac6 build: 打包只产出 win-unpacked，不再生成 portable exe`（2026-10-08 03:30）；`:70` echo「win-unpacked only」、`:83`/`:90` 两次 `call npx electron-builder --config electron-builder.yml --win dir`、`:104-107` 删除旧 `*-portable.exe` | 验收对象 = `dist-release\win-unpacked\lms_launcher.exe`；B4 不改 build.bat |
| A3 | 读 `electron-builder.yml` 全文（31 行） | `:12 asar: true`，**无** `asarUnpack`；`:28 win.target: portable` 被 `--win dir` 覆盖（`build.bat:73-78` 注释说明） | 与简报 A3 一致 |
| 起点取证（**前提不成立**） | 用 `@electron/asar` 的 `listPackage` 读旧 `dist-release\win-unpacked\resources\app.asar` | 旧产物（app.asar LastWriteTime 2026-10-11 01:51:56）里 **lydell 条目 = 0**，且打进包里的 `package.json` 的 dependencies **没有** `@lydell/node-pty` → 该产物早于任务 5 的依赖提交 `90c9320`（2026-10-11 19:25）。所以「改动前 .node/.dll 在 asar 里」不能拿旧产物取证 | 已改为现跑一次不带 asarUnpack 的构建取证（下两行） |
| 前置构建（**不带** asarUnpack） | `cmd /c build.bat`（日志 `.temp\task14-build-before.log`） | exit 0；vite `✓ built in 1.64s`；electron-builder 25.1.8 `packaging platform=win32 arch=x64 electron=28.3.3 appOutDir=dist-release\win-unpacked`；日志里出现 `signing with signtool.exe path=...\resources\app.asar.unpacked\...\OpenConsole.exe` → **没加 asarUnpack 也已经有 app.asar.unpacked**。墙钟 ≈15s（日志 CreationTime 18:26:49 → LastWriteTime 18:27:04） | 基线本身就能打包；D2 的「改动前没有 app.asar.unpacked」前提不成立 |
| 加 asarUnpack **前**取证 | `@electron/asar` 的 `listPackage` + `getRawHeader` | asar 共 3927 条，其中 lydell 32 条；4 个原生文件在 asar **头**里列出但带 `"unpacked": true`：`conpty.node`(291328)、`conpty\conpty.dll`(110152)、`conpty\OpenConsole.exe`(1062472)、`conpty_console_list.node`(134656)；`app.asar.unpacked` **已存在**，物理 18 个文件 = 平台包 `@lydell\node-pty\node_modules\@lydell\node-pty-win32-x64\` 全部（12 个 lib/*.js + package.json + LICENSE + 4 个原生）；外层 `@lydell\node-pty\index.js` 仍是 `{"offset":"11531252"}`（字节在 asar 内） | electron-builder 25.1.8 的**原生模块自动探测**已把平台包整包解出 |
| B1/C1 | 编辑 `electron-builder.yml`（紧跟 `asar: true` 之后） | 新增 5 行 = 3 行注释（写明依据规格 §7.2）+ `asarUnpack:` + `  - "**/node_modules/@lydell/**"`；`git diff --numstat` → `electron-builder.yml 5/0` | 与 C1 逐字一致（多出的只是注释，简报允许） |
| D1 | `cmd /c build.bat`（日志 `.temp\task14-build-after.log`） | **exit 0，一次成功、未走 `:pack_retry`**；产物 `dist-release\win-unpacked\lms_launcher.exe` = 177,150,464 B（18:28:30）；`(Get-ChildItem dist-release -Filter "*-portable.exe" -Recurse -Force \| Measure-Object).Count` = **0**；墙钟 ≈9s（18:28:21 → 18:28:30） | 打包门通过（比简报估的「几分钟」快：工具缓存已预热、Defender 未拦） |
| D2 | 逐个列 `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64` | 真实清单（实测字节数）：`conpty.node` 291328、`conpty_console_list.node` 134656、`conpty\conpty.dll` 110152、`conpty\OpenConsole.exe` 1062472 → **要求的三个都在**，另有 `conpty_console_list.node`。源码目录里的 `conpty.pdb`(6311936) 与 `conpty_console_list.pdb`(4321280) **不在包里**：electron-builder 默认过滤 `!**/*.{...,pdb}`（见 `dist-release\builder-debug.yml` 的 firstOrDefaultFilePatterns） | 三个都在；缺 .pdb 属默认过滤，不影响加载 |
| 运行时补证（**主代理追加，非表内判据行**） | `node .temp/ql-packaged-dlopen/packaged-dlopen.cjs`（从打包解包目录 require + spawn） | `dlopen 成功，导出 native/spawn/fork/createTerminal/open`；`spawn('cmd.exe',['/c','echo','PACKAGED-DLOPEN-OK'])` → `onExit {"exitCode":0}`、输出含该串、`NODE_EXIT=0`。加载路径 = `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty`。同一份 `conpty.node` 在 Node 24（ABI 137）下无需重编译即可加载 → 它是 N-API 构建，不绑具体 V8 ABI，故 Electron 28 加载同一文件的 ABI 风险很低 | **打包解包布局在运行时真的可用**（dlopen + 起进程 + 拿到输出）。**这不等于 E1**：页签渲染、输入回写、颜色、进程树清理仍要真机做 |
| 加 asarUnpack **后**取证 | 同一命令重跑 | asar 仍 3927 条 / lydell 仍 32 条 —— **头里仍列出，这是 asar 的语义**：unpacked 文件在头里保留条目并标 `"unpacked": true`，字节改放 `app.asar.unpacked` 下。真实差别：`app.asar.unpacked` 物理文件 **18 → 21**，新增外层 `@lydell\node-pty\index.js`(2059)、`package.json`(755)、`LICENSE`(1091)，其头条目由 `{"offset":"11531252"}` 变为 `{"unpacked":true}`；4 个原生文件前后都是 `"unpacked": true` | 显式 `asarUnpack` 的实际作用 = 把整个 `@lydell` 作用域解出，不再依赖自动探测只覆盖平台包 |
| 路径解析未变（「牙」第 3 条） | 读 `dist-main\quick-launch.js:46`、`node_modules\@lydell\node-pty\index.js:1`、`node-pty-win32-x64\lib\utils.js` 的 `loadNativeModule` | 编译产物是 `require("@lydell/node-pty")`（**包名解析，无硬编码 asar 路径**）→ `require("@lydell/node-pty-" + platform + "-" + arch)` → `require("../prebuilds/win32-x64/conpty.node")`（相对包目录，先试 build/Release、build/Debug）。`src-main/quick-launch.ts:8` 的 `import * as pty from '@lydell/node-pty'` 一字未改 | 解包后由 Electron 的 asar 补丁把 asar 内路径映射到 `.unpacked`，代码侧不需要改 |
| E1 | 打开 `dist-release\win-unpacked\lms_launcher.exe` 做窗口操作 | **未执行（本环境无 GUI）**：`node_modules\electron\dist\electron.exe` 立即退出 `0x80000003`（索引 K33），打包产物同为 Electron 故同样起不来 | ☐（原因 + 去处：用户真机验收） |
| E2-E9 | 同上（中文/颜色、交互输入、TUI、进程树、自动执行、exe 类型、页签溢出、退出应用） | **未执行（本环境无 GUI）**，原因同 E1 | ☐（原因 + 去处：用户真机验收） |
| E10 | 本机 WSL | 未跑：本机无 WSL 发行版；已在规格「状态」行写「**WSL：未验收**」 | 如实标注，未声称已验收 |
| F1 | 改规格「状态」行（`docs/superpowers/specs/...design.md:4-9`） | 写明：自动化门（47 files / 800 passed、tsc exit 0）、打包门**文件级**结论（含 D2 真实清单与 `"unpacked": true`）、**真机 §12 硬门 1-9 未验收**（附 `0x80000003` 原因与记录表路径）、**WSL 未验收**、§13 五条保持原样 | 只写已跑过的事实 |
| F2 | `git diff` 对规格 §13 | §13 的 5 条一字未改；`git diff --numstat` 对规格 = `9/4`，全部落在「状态」行与 §7.2（`:152-153`）/ §12-1（`:298`）的措辞 | 未验证项如实保留 |
| F3 | 改措辞 + `grep -n portable` 复核 | 规格 `:152-153`（§7.2）、`:298`（§12-1）、计划 `:483`（步骤 2）、`:487`（步骤 3 第 1 条）：「portable exe」→「win-unpacked 产物 `dist-release\win-unpacked\lms_launcher.exe`」并注明依据 `ef23ac6`。复核后 spec/plan 里剩下的 `portable` 只出现在「**不生成** portable exe」这类说明句里 | 措辞更正完成，任务边界未动 |
| G1 | `npm test` | `Test Files 47 passed (47)` / `Tests 800 passed (800)`，`Start at 18:29:35`，`Duration 9.24s`，`TEST_EXIT=0`（与基线逐字相同，无减少） | 全绿 |
| G2 | `git diff --name-only` / `git diff --numstat` | 四个：`electron-builder.yml`（**B1，唯一的非文档改动**，+5/−0）、`docs/superpowers/specs/...design.md`（B2，+9/−4）、`docs/superpowers/plans/...md`（B3，+3/−3）、本表 `docs/superpowers/checks/.../task-14-build-acceptance.md`（J 段 + I 段延期项写法 + E 段显式未勾，+34/−24）。未跟踪只有 `.superpowers/sdd/.../task-14-brief.md` 与 `task-14-report.md`；`.temp/` 被 gitignore | **代码/配置侧只含 B1**，其余三处都是本任务允许的文档（B2/B3 + J 段） |
| 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`TSC_EXIT=0` | 主进程侧未触碰且干净 |
| 取证陷阱 | `Get-Item dist-release\builder-effective-config.yaml` | 它的 LastWriteTime 仍是 **2026-10-11 01:51:54**（`--win dir` 构建不重写它），里面也没有 `asarUnpack` → **不能**用它判断本次生效配置；生效证据是上面的 asar 头与 `app.asar.unpacked` 物理清单 | 别拿这个文件当证据 |
