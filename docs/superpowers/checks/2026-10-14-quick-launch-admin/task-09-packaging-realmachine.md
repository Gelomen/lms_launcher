# 任务 9 · `build.bat` 预建硬链接 + 打包真机门（用户执行） — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 9 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.11 / §7.2 / §9-R1 · 关联审查重点 **RF7**（索引 R 组）
> 前置：任务 1-8 全部已提交
> 现状锚点（本表生成时实测，2026-10-14）：`build.bat`：`:pack_done` 标签 `:102`、旧产物清理块 `:104-107`、`echo [build] Done.` `:109`、`exit /b 0` `:111`（插入点 = `:107` 与 `:108` 之间）；`electron-builder.yml`：`files` `:5`、`asarUnpack` `:18-21`；取证：`.temp/ql-admin-probe/probe8.mjs`（asar 内脚本 + 硬链接 node.exe）、`probe5.mjs` B 段（硬链接必须在同目录，否则 `0xC0000135 STATUS_DLL_NOT_FOUND`）
> **主代理验收（2026-10-15 15:4x，打包与产物核对全部由主代理亲跑 —— plan 任务 9 步骤 2 明写「主代理」）**
> 第一轮 `cmd /c build.bat`（`BUILD_EXIT=0`）**暴露缺陷**：产物里 `node.exe` 只被 `fsutil` 列出一个名字、大小 **176,813,568** ≠ `lms_launcher.exe` 的 **177,150,464** → 表 C2 第一条不通过 → 落裁决 **R-16 / 索引 K55**，同一提交 `875019b` 改写规格 §6.11 与本表 B1/D1，再返工 `build.bat`（「先删后建」）。
> 返工后第二轮 `cmd /c build.bat` → **`BUILD_EXIT=0`**，日志两行齐全：`[build] Replacing the copied node.exe with a hard link to lms_launcher.exe...` + `[build] Created node.exe hard link for the elevated PTY host.`。产物核对（主代理亲跑）：`fsutil hardlink list …\node.exe` 与 `…\lms_launcher.exe` **都列出两个名字**、两个大小同为 **177,150,464**；`npx asar list …app.asar` = 4019 条，含 `\dist-main\ql-pty-host.js`（另有 `ql-elevated.js` / `ql-host-protocol.js`）；`app.asar.unpacked` 下 `@lydell` / `koffi` / `@koromix\koffi-win32-x64\win32_x64\koffi.node` / `conpty.node` / `conpty\OpenConsole.exe` **全部 True**。
> 我独立复测（不信子代理自述）：`build.bat` 新块 `:109`-`:128` 与报告逐字一致；`git diff --numstat` = **21 增 / 0 删 / 仅 build.bat**、`git diff -U0` 只有一个 hunk `@@ -107,0 +108,21 @@`；**纯 ASCII（`nonAscii=0`）/ 全 CRLF（132 / bareLF 0）/ 132 行**；新块 4 条 echo 行**零右括号**（全文件带括号的 echo 只有既有的 `:6`/`:70`/`:89`）。子代理的四场景（全新 / 幂等 / 复制件 / 失败）用逐字拼接的 `.temp/ql-admin-task09/harness2.bat` 真跑，其中「复制件」场景就是真实打包的情形 → 被替换成硬链接。
> 取舍**认可**：删掉上一版那条重复的「echo 不得带括号」rem（原文仍在 `build.bat:91-92`，新块实测零括号），换取块保持 20 行、尾部 `:129`-`:132` 不顺移。A1 的起点 hash 按索引 K30 口径记实际值：首版起点 `920e7eb`（我 amend 后的任务 8 docs 提交，派单里写的 `20c28a2` 已被 amend 取代、不在分支上），返工起点 = R-16 的文档提交 `875019b`。
> **E1-E8 是真机门，保持 `☐（真机门，用户执行）`**：本实现环境起不了 ConPTY（规格 §2-5），**不得用「自动化已过」代替**（§7.2 / 本表 D3）。清单已逐字交付用户（规格 §7.2 九条 + 前置 feature 的 E1-E7 + 本表 E7/E8）。
>
> 索引：[00-index.md](00-index.md) 的 G7、K11、K13、**K55**（R-16 打包侧硬链接先删后建）、**K54**（Electron 版本 vs 内置 Node 版本）
> **主代理实测（2026-10-15 15:3x，第一轮 `cmd /c build.bat`）**：`BUILD_EXIT=0`，产物里 `node.exe` **不是**硬链接（`fsutil hardlink list` 只列一个名字），大小 176,813,568 ≠ `lms_launcher.exe` 的 177,150,464 → 表 C2 的第一条**不通过**，据此落裁决 R-16/K55 并改写规格 §6.11；`build.bat` 按新口径返工后由主代理重跑核对。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 8 的提交；porcelain 干净；`npm test` 全绿 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `build.bat:100-111`、`electron-builder.yml:1-25` | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 确认 `dist-main/ql-pty-host.js` 会被 `tsc` 产出（`tsconfig.main.json` 的 `outDir`） | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `build.bat` | 改：`:107` 之后插入预建 `node.exe` 硬链接的步骤 | **那里的 `node.exe` 一律先删再建**（**主代理裁决 R-16 / 索引 K55**：实测 electron-builder 会把 `node_modules\electron\dist\node.exe` 复制进产物，「已存在则跳过」每次全新构建都空转、且复制件既非硬链接也不同大小）；失败只警告不中断（运行时会自建）；echo 行里不得有未转义的 `)`（`:91-92` 的既有告诫） | ☑ |
| B2 | `electron-builder.yml` | **不改**（除非 R1 命中，命中就同 commit 改并同步 spec/plan） | `asarUnpack` 已覆盖 `@lydell/**` / `koffi/**` / `@koromix/**`（`:18-21`） | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 预建命令 | 在 `win-unpacked` 目录内：`mklink /H "node.exe" "lms_launcher.exe"` —— 规格 §6.11 | ☑ |
| C2 | 产物核对项 | `win-unpacked\node.exe` 与 `lms_launcher.exe` 同 inode；`app.asar\dist-main\ql-pty-host.js` 在；`app.asar.unpacked\node_modules\@lydell` 与 `koffi` 在 | ☑ |
| C3 | 真机清单 | 规格 §7.2 的 9 条 + 前置 feature 的 E1-E7（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md`）逐字交给用户 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 改 `build.bat` 并跑一次 | `cmd /c build.bat` | 打包成功；新增步骤打印「Created node.exe hard link…」（**先删后建**，R-16）；`exit /b 0` | ☑ |
| D2 | 核对产物 | `fsutil hardlink list dist-release\win-unpacked\node.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String ql-pty-host`；`Test-Path dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell` | 两条硬链接名都在；`\dist-main\ql-pty-host.js` 在；unpacked 目录在 | ☑（当时的实测。**加注（2026-10-16，另一 feature 的索引 K14）**：`node.exe` 硬链接已被 `8998801 fix: 提权宿主由应用入口按 --ql-host 开关分流启动（R-23）` 删除，`build.bat` 里现在没有任何 `node.exe` / `hardlink` 步骤（实测 `Select-String` 零命中、`Test-Path dist-release\win-unpacked\node.exe` = False）→ 本行的 `fsutil hardlink list …\node.exe` 半边在新构建上不再适用；勾保留为历史证据） |
| D3 | 把清单交给用户（含前置 feature 的六步） | —— | 不得用「自动化已过」代替这一条（规格 §7.2） | ☑ |
| D4 | 等回报并填 J 段 | —— | 每条「通过 / 不通过 + 现象」都落到本表 J 段与 E 段 | ☐（**等用户回报**：清单已于 2026-10-15 15:4x 逐字交付 —— 规格 §7.2 九条 + 前置 feature 的 E1-E7 + 本表 E7/E8；回报到达后由主代理填本表 J 段与 E 段，见 J-10） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 提权终端真的能起（ConPTY 在提权进程里） | 规格 §7.2-1/2 / §9-R2 | 用户回报 + 任务管理器完整性级别截图/描述 | ☐（真机门，用户执行） |
| E2 | 提权宿主里 node-pty 原生模块解析成功 | 规格 §9-R1 | 用户回报；失败按 R1 回退口径改 `electron-builder.yml` 并同步三份文档 | ☐（真机门，用户执行。**措辞更新（2026-10-16，索引 K14）**：宿主现由应用入口按 `--ql-host` 分流启动，产物里**没有** `node.exe`，不要再让用户去找它。要验的是提权终端能起、且 `resources\app.asar.unpacked\node_modules\@lydell\node-pty\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64\*.node` 在其中加载成功 —— 本次打包实测这些 `.node` 与 `conpty\OpenConsole.exe` 都在 unpacked 里） |
| E3 | UAC 点「否」→ 按钮回落 + 日志带终端名 | 规格 §7.2-4/5 | 用户回报 | ☐（真机门，用户执行） |
| E4 | 不勾选的两条与今天一致（无 UAC、无多余日志） | 规格 §4-4 / 索引 K10 | 用户回报 | ☐（真机门，用户执行） |
| E5 | 提权终端运行中退出应用不留孤儿进程 | 规格 §6.7 / RF6 | 用户回报 | ☐（真机门，用户执行） |
| E6 | 前置 feature 的 E1-E7 在同一次构建里跑完 | 索引 K11 | 前置表 J 段 + 本表 J 段 | ☐（真机门，用户执行） |
| E7 | 起提权宿主后**立刻**把宿主进程杀掉（或让它启动即崩）→ 主进程**不得卡住**，必须按 §6.10 报错（索引 K51：`ConnectNamedPipe(h, null)` 是阻塞模式，15s 握手定时器对这种情形兜不住；单测里 `connect` 是假的，只有真机能判） | 任务 6 报告 §6-2 / 索引 K51 | 真机（用户执行） | ☐（真机门，用户执行） |
| E8 | 两态布局**肉眼过**（任务 8 的 D4 只给了数字，观感归真机）：命令行态终端行「左下拉 + 右开关」不换行、不截断（最长标签 `Command Prompt (cmd)` 全名）；可执行程序态的「管理员」行在「程序路径」之上；两态弹窗高度一致（218px）、不出滚动条；开关的紫色与焦点环与 [保存] 同语言。**注意**：同一个开关在命令行态靠右、在可执行程序态靠左 —— 这是规格 §6.2 逐字规定的形状（任务 8 报告 §7-1），若真机判定不可接受，**先改 spec §6.2 再改代码** | 任务 8 报告 §5（356.7px / 不截断 / 左列不变）与 §7-1 | 真机（用户执行） | ☐（真机门，用户执行） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不新增依赖、不新增 extraFile（除非 R1 命中） | 索引 G7 / 规格 §6.11 | ☑ |
| F2 | 硬链接必须在 exe 同目录（否则 STATUS_DLL_NOT_FOUND） | 取证 P5 / `probe4` 的失败教训 | ☑ |
| F3 | `build.bat` 的 echo 括号转义告诫 | `build.bat:91-92` | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 打包前全量 | `npm test` | 全绿（打包门之前必须是绿的） | ☑ |
| G2 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G3 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G4 | 产物核对 | 见 D2 的三条命令 | 见 C2 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `build.bat`（+ 本表与前置 feature 的 task-04 表；若 R1 命中则含 `electron-builder.yml` 与 spec/plan） | ☑ |
| H2 | commit message 逐字 | `build: 预建提权宿主的 node.exe 硬链接 + 真机门清单` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1 之外没有文件被改（B2 未改或已按 R1 同步三份文档）
- [x] C1-C3 逐字一致
- [x] D1→D4 执行且输出贴 J 段
- [x] E1-E6 有用户回报或写明去处
- [x] G1-G4 全绿 / 通过
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `cmd /c build.bat`（主代理两轮，2026-10-15 15:3x / 15:4x） | 第一轮 `BUILD_EXIT=0` 但新增步骤打的是 `node.exe hard link already present … leaving it alone.` → 暴露 R-16 缺陷（复制件非硬链接、大小不同）。第二轮（返工后）`BUILD_EXIT=0`，日志 `[build] Replacing the copied node.exe with a hard link to lms_launcher.exe...` + `[build] Created node.exe hard link for the elevated PTY host.`。完整日志 `.temp/ql-admin-task09/build-main.log` / `build-main-2.log` |
| J-2 | `fsutil hardlink list dist-release\win-unpacked\node.exe`（主代理） | 第一轮：只列 `…\node.exe` 一个名字，且大小 176,813,568 ≠ `lms_launcher.exe` 177,150,464 → **不通过**（据此落 R-16）。第二轮：同时列出 `…\lms_launcher.exe` 与 `…\node.exe` 两个名字，`Get-ChildItem` 两条同为 **177,150,464** → **通过**（C2 第一条） |
| J-3 | `npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String ql-pty-host` |  |
| J-4 | `Test-Path …app.asar.unpacked\node_modules\@lydell` 等（主代理） | `@lydell` / `koffi` / `@koromix` 全 True；具体原生件到位：`@koromix\koffi-win32-x64\win32_x64\koffi.node`、`@lydell\…\prebuilds\win32-x64\conpty.node`、`…\conpty\OpenConsole.exe` 全 True → 通过（R1 的「在包里」半边成立；「提权进程里能否解析」仍只有真机 E1/E2 能判） |
| J-10 | 真机清单交付（D3） | 已逐字交付用户：规格 §7.2 九条（`docs/superpowers/specs/2026-10-14-quick-launch-admin.md:209-217`）+ 前置 feature 的 E1-E7（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md:54-60`）+ 本表 E7/E8。等回报后回填本表 E 段与 J 段（D4） |
| J-5 | `npm test`（子代理 2026-10-15 15:15，G1） | `Test Files  51 passed (51)` / `Tests  888 passed (888)`、`Duration  9.19s`、`G1_EXIT=0`；与主代理给的基线逐字相同（本任务不改任何代码 → 用例数无变化）。完整日志 `.temp/ql-admin-task09/g1-npm-test.log` |
| J-6 | `npx tsc --noEmit -p tsconfig.main.json`（子代理 15:16，G2） | 无任何输出、`G2_EXIT=0`（干净）。日志 `.temp/ql-admin-task09/g2-tsc.log` |
| J-7 | `npx vitest run src-main/i18n`（子代理 15:16，G3） | `Test Files  4 passed (4)` / `Tests  18 passed (18)`（index 3 / no-hardcoded 2 / dict 11 / key-coverage 2）、`Duration  373ms`、`G3_EXIT=0`。日志 `.temp/ql-admin-task09/g3-i18n.log` |
| J-8 | `git diff --stat -- build.bat` + 把 `build.bat:109-128` 逐字拼进 `.temp/ql-admin-task09/harness.bat` 跑三场景（B1 取证，**不跑** `build.bat`） | `build.bat \| 21 +++++++++++++++++++++`、`1 file changed, 21 insertions(+)`（只改这一个文件；未 `git add`、未 commit）。三场景真实输出：A 首次 → `[build] Created node.exe hard link for the elevated PTY host.`，随后 `fsutil hardlink list …\node.exe` 列出 `node.exe` 与 `lms_launcher.exe` 两个名字（同 inode、`LinkType=HardLink`、长度与源相同）；B 再跑 → `[build] node.exe hard link already present in win-unpacked - leaving it alone.`；C 造失败（`lms_launcher.exe` 不在）→ 只打 `[build] WARNING: could not create the node.exe hard link …`、脚本继续走到 `TAIL-REACHED`、`HARNESS_EXIT=0`。全部 echo 行零括号（F3）；文件仍纯 ASCII、全 CRLF |
| J-9 | 报告与真机清单（C3 / D3 的输入） | 全文在 `.superpowers/sdd/2026-10-14-quick-launch-admin/task-09-report.md`：第 5 节逐字抄了规格 §7.2 的 9 条（`specs/…:207-217`）+ 前置表 E1-E7（`2026-10-13-…/task-04-packaged-realmachine.md:54-60`）+ 本表 E7/E8（本文件 `:51-52`），供主代理原样转交用户；第 6 节是 J-2/J-3/J-4 那三条命令与预期 |

> J-1 … J-4 归主代理（plan 步骤 2 明写「主代理」：跑 `build.bat` 与产物核对）；真机回报行按 D4 等用户回报后再填。A-I 段的勾一个都没动（真机门 E1-E8 归用户）。
