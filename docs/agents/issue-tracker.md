# Issue tracker：GitHub

本仓的 issue 与 spec 都存放在 GitHub Issues 里。所有操作走 `gh` CLI。

> 工具链注记（2026-10-18 实测，2026-10-19 复核仍成立）：`gh` 2.102.0 装在 `C:\Program Files\GitHub CLI\gh.exe`，**不在代理 shell 的 `PATH` 上**——请用全路径调用，或把该目录加进 `PATH`。**已登录** github.com / `Gelomen`（凭据在系统 keyring，token 前缀 `gho_`，scopes：`gist`、`read:org`、`repo`、`workflow`）。换机器或换账号时才需要重跑 `gh auth login`。

## 约定

- **建 issue**：`gh issue create --title "..." --body "..."`。正文多行时用 heredoc。
- **读 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需配 `--label` 与 `--state` 过滤。
- **把 issue 变成某条的 sub-issue**：`gh issue create --parent <parent> ...`，或事后 `gh issue edit <parent> --add-sub-issue <child>`（需 `gh` 2.94+）。更老的 `gh`：`gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（数据库 id，取法见下面的**阻塞关系**）。若 tracker 不支持 sub-issue，就在子 issue 正文顶部写一行 `Part of #<parent>`。
- **评论**：`gh issue comment <number> --body "..."`
- **加标签 / 去标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断；在 clone 里跑 `gh` 时它会自动这么做。

## 与本仓文档流程的关系

spec 与 ticket 都放在这里——仓库里不再有单独的 spec / plan 目录。

- **spec** 就是一条带 `ready-for-agent` 标签的 issue，按 `to-spec` 模板写（Problem Statement / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes）。
- **ticket** 是这条 spec 的 sub-issue，一张票一个 tracer bullet（示踪弹：贯穿各层、可独立演示的最小完整切片），票与票之间的阻塞边用 GitHub 原生 issue 依赖表示。
- 干活的顺序是**前沿（frontier）**：所有阻塞者都已关闭的 open sub-issue 都可以开工。

本仓更早的 superpowers 流程把 spec、plan 与逐任务 check 表放在 `docs/superpowers/`（过程账本放在 `.superpowers/`）。2026-10-18 这些内容已迁进本 tracker，随后从工作树里删除；原文仍可从 git 历史取回（`git log -- docs/superpowers`、`git log -- .superpowers`）。

## 本仓当前状态（2026-10-18 实测，2026-10-19 / 2026-10-25 复核）

- **仓库**：GitHub `Gelomen/lms_launcher`，**public**，Issues 已开启；当前分支 **`master`**（2026-10-25 实测：`origin/HEAD -> origin/master`，远端已无 `feat/quick-launch`；本节更早写的分支名保留作历史，别再照它找活儿）。
- **标签**：五个分级标签已建好并投入使用（映射见 [triage-labels.md](./triage-labels.md)）。
- **已收口（2026-10-25）**：spec #21「[终端] 页签复制 / 粘贴语义（智能右键、选区提示、多行粘贴确认）」——四张实现子票已于 2026-10-25 全部关闭并落在 `master`：#22 智能右键 + 选区口径（`9bbdf99` 红 / `45dacff` 绿）、#24 Ctrl+V 粘贴（`2cc1013` / `55323a7`）、#23 工具条选区提示（`dcd036d` / `2979bb1`）、#25 多行粘贴二次确认（`c9fa2dc` / `18b8e4d`）。
  - 关键口径：**「鼠标选区」是组件里的唯一真源**（只由终端库的选区变化事件驱动；addon-search 命中后的程序化 `select()` 用同步窗口 `withProgrammaticSelection` 排除），智能右键（#22）与工具条提示（#23）共用这一份，永不分歧；三条粘贴入口（Ctrl+V / Ctrl+Shift+V / 无选区右键）收敛成 `pasteClipboard` **一条**，#25 的多行判定「去掉**一个**尾部行尾后仍含换行」只加在那一条上；**Ctrl+C 无任何分支**（中断语义原样）。终端库的右键选词按构造参数显式关（`rightClickSelectsWord: false`，它的默认值按 `isMac` 走 → 靠平台的默认必须写死）。词典新增 `ql.terminal.copyHint` 与 `ql.terminal.pasteConfirm.{title,message,paste}`（正文带 `{lines}` 行数占位符），中英同批。
  - 决策登记：**`docs/adr/0003-terminal-copy-paste-semantics.md`**（四处取舍：Ctrl+C 不占用为复制 / 不采用「选择即复制」（库 5.x 已移除该开关 + 查找会抢剪贴板）/ 智能右键以关掉右键选词为前提 / 选区只认鼠标来源）+ GLOSSARY 两条含 _Avoid_（**选区（Selection）**：查找高亮不是它；**智能右键（SmartRightClick）**：右键不再是「粘贴」的同义词）。
  - **两轴审查轮（`af37edc..HEAD`，Standards + Spec 并行子代理）修掉 / 补齐七处**：① 票 #22 新增的选区事件面没进 `App.test.ts` / `LogPanel.test.ts` 的假终端 → 挂载当场抛 TypeError、46 条上层用例假红（App 侧 26、LogPanel 侧 20）→ `5763956`；② **Ctrl+Shift+V 也要挡浏览器原生粘贴事件**——上一轮只给不带 Shift 那一支做了，带 Shift 那半留同一个「粘两遍」的洞（真机上 Chromium 的 Ctrl+Shift+V 也是「粘贴为纯文本」，xterm 隐藏 textarea 会自己收到 paste）→ 红 `6544dfc` / 绿 `268947f`；③ 多行判定与确认框正文的行数改成**同一次拆行**（`pasteLines`；原先两份换行正则各写各的，会出现「弹了框却显示 1 行」）+ 组件注释里两处票号写错（票 #3 / #4 → #24 / #25）→ `b5dd0fd`；④ user story 17「Ctrl+Shift+C 复制后高亮还在」补判据（两条复制路径的差别自此有人守）→ `b683148`；⑤ 票 #23 AC「点空白清选区 → 提示消失」缺的可测那半 → `778197a`；⑥ 裸 CR 也算多行的口径钉死（判定与行数是同一次拆行）→ 并入 `6544dfc`；⑦ paper trail 对齐（ADR 0003 段名与 0001/0002 同族、「智能右键」定义去动作细节、票 #22 用脚本追加时混进的 LF-only 行归一 CRLF）→ `e42dfd4`。**未修裁决两条**：真库 `getSelection()` 的「CRLF 拼行 / 去每行尾随空格」不在测试面上钉（spec 的口径是「复制的内容不加工」，由「根本不碰它」保证，钉 xterm 自己的行为是自证）；`TerminalTabView.test.ts` 里那组同型粘贴夹具不抽 helper（本仓「只钉外部行为」的显式风格优先于 Duplicated Code 这条基线 smell）。
  - 门的读数（2026-10-25 收实现票时，HEAD = `778197a`）：全量 `vitest run` **1085/1085**（56 文件，spec #12 收口时基线 1053 → +32）、`npm run build` exit 0、`tsc -p tsconfig.main.json` exit 0。
  - **测试环境新增一条硬口径**：全量 `vitest run` 必须在**沙箱外**跑。`src-main/ipc-ql.test.ts` 要真起 cmd / 调 `tasklist` / `taskkill`，在代理沙箱内该文件**挂死**（沙箱外实测 8.7s / 36 条绿），`update-bootstrap` 的两条 `cscript` 用例在沙箱内同样假红。旧注记仍成立：PATH 需含 `WindowsApps` 与 `WindowsPowerShell` 两个目录，否则 `process / ps1-encoding / update-bootstrap` 三组假红。
  - **真机门 #26 已于 2026-10-25 收口**：八条读数①-⑧**全部通过、无不满足项**（用户原话「https://github.com/Gelomen/lms_launcher/issues/26 验收通过」）。载体 = 打包产物 `dist-release\win-unpacked\lms_launcher.exe`（LastWriteTime **2026-10-25 22:11:58**，含到 `2488e5a` 的全部改动，由用户本机 `build.bat` 产出）。#26 的执行记录（含**取证缺口**：坐标级右键 / 真实点击 / 窄窗逐值本轮没有截图与逐值读数——happy-dom 无布局、本机 Electron 以 `0x80000003` 退出）：https://github.com/Gelomen/lms_launcher/issues/26#issuecomment-6398910493 ；spec #21 收口评论：https://github.com/Gelomen/lms_launcher/issues/21#issuecomment-6398972406 。
  - 一条**未回报**的建议读数留档（不在 #26 票面八条里，不挡收口）：**Ctrl+Shift+V 只粘一遍**——审查轮补的那半个 `preventDefault`（绿 `268947f`）在 happy-dom 里复现不了（原生粘贴事件不发生），真机也没回报这一条。以后若有人报「Ctrl+Shift+V 粘两遍」，先查 `onCustomKey` 带 Shift 那一支的 `preventDefault` 还在不在。
  - **前沿（可立即开工）**：无——spec #21 已收口，`gh issue list --state open` 返回 `[]`（2026-10-25 实测）。**被阻塞**：无。下一条 feature 先按上面「spec」那条建新 issue，再拆 tracer-bullet 子票。
- **已收口（2026-10-23，背景参照）**：spec #12「快捷启动条目各自的终端配色（六档预设，两处入口）」——三条实现子票 #13（配色表 + 条目字段 `terminal_palette` + 窄通道 `ql_set_palette` + 页签快照）、#14（终端页签工具条的配色浮层）、#15（条目编辑弹窗的 [配色] 一行）已关闭并入 `feat/quick-launch`；**#12 已于 2026-10-23 收口** —— 真机门 #17（R1–R9）**全部通过、无不满足项**，另两张读侧缺陷票一并同日收掉：#18（条目落盘档 → 已开着的页签当场换档，`859347b` 红 / `ea776a4` 绿）与 #19（页签改的档 → 弹窗回填与 [保存]，`f473ad2` 红 / `86980ee` 绿，修法 = 开窗即读）；#16（删条目连带关页签，`41dfcf5` 红 / `d49577d` 绿）实机行为由 #18 的 R-c 覆盖，同日收。
  - 代理侧取证已交：六档各一张真 app 截图 + 逐槽像素核对（六档的底色与 16 个 ANSI 槽逐值等于 `src/modules/term-palettes.ts`；`campbell` 的 `black` 与底色同值 → 隐形，按底色核）、换档不重启进程（同一 `pid` 与同一屏历史）、弹窗一行真 app 实测（六块顺序 + `aria-current` + `.modal-box` = 261.0）。两轴审查轮修掉四处（换档重铺查找高亮 / campbell `selectionBackground` 取官方 `#FFFFFF` / 档名去掉 GLOSSARY _Avoid_ 里的「画布」/ 弹窗关窗撤 hover 预览），执行记录与未修裁决：https://github.com/Gelomen/lms_launcher/issues/12#issuecomment-6347782918
  - 门的读数（收口时 2026-10-23 复核）：全量 `vitest run` **1053/1053**（56 文件）、`npm run build` exit 0、`tsc -p tsconfig.main.json` exit 0；真机门载体 = 打包产物 `dist-release\win-unpacked\lms_launcher.exe`（LastWriteTime **2026-10-23 22:27:01**，含 `86980ee`，由用户本机 `build.bat` 产出）。验收判据合并跑：#17 的 R1–R9 + #18 的 R-a–R-d + #19 的 R-e/R-f，**全部通过、无不满足项**；用户原话「我手动push了, 同时也 build 了新产物, 验收通过」，口径先问清后确认（记录：https://github.com/Gelomen/lms_launcher/issues/17#issuecomment-6367381985 ）。spec 收口评论：https://github.com/Gelomen/lms_launcher/issues/12#issuecomment-6367469958
  - **决策变更（别当普通 bug 顺手改掉）**：`docs/adr/0001-terminal-palette-per-entry.md`（本体）+ `docs/adr/0002-tab-palette-mirrors-the-saved-entry.md`（修订 0001 的「改名、换档都不跳变」那半句）——**条目落盘档 = 唯一真源，[编辑] 弹窗与 [终端] 页签都是它的镜像**；三分口径：改名不跳变（页签文案仍是创建那一刻那份）/ 条目落盘换档跟着变（页签在 `refreshQlConfigs` 的成功分支对齐）/ 条目被删则冻结在最后一档、不回落默认档。弹窗那一侧在**开窗那一刻**读（`QuickLaunch.openEdit` 先 `await reload()`）→ spec 正文 Implementation Decisions 那句「只读镜像 `qlConfigs` 仅在创建时取」现由 0002 取代。
  - **#20 已于 2026-10-23 收口**（测试卫生，不属本 spec，`a9f0317`）：`App.test.ts` 里 `tray-settings-request opens settings modal` 用 `mountApp()` 之后不 unmount，把 SettingsModal 那块 `<Teleport to="body">` 的 `.modal-box` / `.modal-overlay` 永久留在 document 里 → 其后 38 个共用这套外壳类名的用例按文档顺序取第一块时取到别人那一块（形状 = 单跑绿、全量红；#19 的实现轮当场撞上，靠「带 [配色] 那一行的那块」锁块才躲过）。修法两条：该用例补 `w.unmount()`（根因）+ 文件级 `afterEach` **断言**残留为 0 —— 选断言不选清理：漏 unmount 的用例当场红，而不是被 `afterEach` 扫干净后继续潜伏。红绿对偶已验证：临时撤掉那行 unmount → 39 failed 且失败消息直接带出污染者 titles `["设置","设置"]`；恢复 → 77 passed；全仓仍是 56 文件 / 1053 全绿。
  - 收口时钉死的四条口径（免得以后又猜）：静态枚举出 15 个 mount 未 unmount 的用例，但只有这一处产生 DOM 残留，其余 14 个没开窗 → Teleport 不渲染任何节点；`w.unmount()` 在 happy-dom 下确实删掉 Teleport 插进 body 的节点，不需要在 `afterEach` 里手动清 body；另外四个弹窗测试文件（QuickLaunch / Template / Settings / UpdateModal）都有文件级 `afterEach(() => { document.body.innerHTML = ''; })` 兜底、实测不跨用例泄漏，**`App.test.ts` 是全仓唯一没有这条兜底的 Teleport 测试文件**；写探针时注意 `afterEach` 逆序执行 —— append 到文件末尾的探针会跑在既有兜底之前，读数虚高。
    副读数（未修，留此备忘）：那块残留是活体 —— i18n 组切语言后它的标题从「设置」变「Settings」，即未 unmount 的 App 实例会随 i18n 模块单例继续重渲染，污染不止选择器一层。
  - **前沿（可立即开工）**：无——#20 已于 2026-10-23 收口（`a9f0317`）；本分支的 open 票自此清空（2026-10-25 实测 `gh issue list --state open` = `[]`）。**被阻塞**：无。下一条 feature 先按上面「spec」那条建新 issue，再拆 tracer-bullet 子票。
  - 取证台与被挡住的那一半：脚本与截图在 `%TEMP%\ql-palette-shots\`（`run.ps1` / `drive.cjs` / `slots.cjs` / `drive-modal.cjs` / `measure.cjs` / `run-measure.ps1`）。本机自 2026-10-22 23:32 那次 `build.bat` 之后，从会话里起 Electron 一律以 `0x80000003` 退出（`electron.exe --version` 同象，`ELECTRON_RUN_AS_NODE` 正常；加 `--no-sandbox` 能过初始化但 Chromium 在 `%TEMP%` 里写不出 singleton lock）→ 代理侧再取证待换机或重启，**不影响用户验收**（#17 / #18 / #19 的验收载体由用户本机 `build.bat` 产出，2026-10-23 已全部通过）。
  - 注释里的取证缺口：`.temp/ql-modal-palette-row/`（票 #15 的定高探针）在本机已不存在，那组 260.7 / 37.3 / 34.3 当下不可复核——已在注释里如实登记并留重测口径（本轮真 app 独立量得 `.modal-box` = 261.0 作旁证）。
- spec #8「页签条溢出时可横滚与翻页：滚轮横滚 + 两端翻页箭头」连同它的三条子票已于 2026-10-19 全部关闭。
  - **2026-10-19 收口复核口径**：`gh issue list --state open` 返回 `[]`；当前分支 `feat/quick-launch` @ `65631e9`（本条收口提交紧随其后），与 `origin/feat/quick-launch` 同步。分级标签在位不变。
  - **已关闭**：#9（页签条滚轮直接横滚）与 #10（两端翻页箭头）为同一实现提交 `7c9f662`（两条票改同一批文件；切片独立性由测试边界保证），逐票执行记录与取证（新增 11 条测试、全量 973/973 绿、build 门绿）在各票评论；#11 真机门（R1–R6 **全部通过、无不满足项**，载体 = 打包产物 `dist-release\win-unpacked\lms_launcher.exe`（19:28 构建）——用户原话「验收通过」，记录：https://github.com/Gelomen/lms_launcher/issues/11#issuecomment-6266404579 ）。spec 收口评论：https://github.com/Gelomen/lms_launcher/issues/8#issuecomment-6266406006
  - 实现备忘（留给以后改这块的票）：页签条底部灰线、z-index 与 -16px 延伸挂在 `.tab-bar-wrap`（翻页箭头段上也连续）；`.tab-bar-wrap .tab-bar` 后代规则必须写在 `.tab-bar` 主规则之后——测试的 cssRule 助手按第一次出现取规则（style.css 注释里同条警示）。
  - **前沿（可立即开工）**：无——本 spec 已收口。下一条 feature 先按上面「spec」那条建新 issue，再拆 tracer-bullet 子票。
  - **被阻塞**：无。
  - spec #5「快捷启动卡片每行配置名左侧显示 [类型] 图标」连同它的两条子票已于 2026-10-19 全部关闭。
  - **2026-10-19 收口复核口径**：`gh issue list --state open` 返回 `[]`；当前分支 `feat/quick-launch` @ `400d1bd`，与 `origin/feat/quick-launch` 同步。分级标签在位不变。
  - **已关闭**：#6 实现票（单提交 `61f5e14`（含 GLOSSARY.md 首条）+ 审查轮 `1d06f6a`，执行记录与两轴审查、裁决、探针数值：https://github.com/Gelomen/lms_launcher/issues/6#issuecomment-6254317270 ）、#7 真机门（R1–R7 **全部通过、无不满足项**，载体 = **打包产物**——用户原话「#7 验收通过」，追问口径的记录：https://github.com/Gelomen/lms_launcher/issues/7#issuecomment-6254379956 ）。spec 的收口评论：https://github.com/Gelomen/lms_launcher/issues/5#issuecomment-6254382382
  - **前沿（可立即开工）**：无——本 spec 已收口。下一条 feature 先按上面「spec」那条建新 issue，再拆 tracer-bullet 子票。
  - **被阻塞**：无。
- **历史 spec（2026-10-18，已全部关闭，仅背景参照）**：spec #1「快捷启动 [程序路径] 支持多条」连同它的三条子票已于 2026-10-18 全部关闭。
  - **2026-10-19 复核口径**：`gh issue list --state open` 返回 `[]`（开放 issue 为零），#1 现为 `closed`；当前分支 `feat/quick-launch`，与 `origin/feat/quick-launch` 同步。分级标签经 `gh label list` 复核仍在位（映射见 [triage-labels.md](./triage-labels.md)）。
  - **已关闭**：#2 启动前全量预检（实现提交 `ee77d68`）、#3 弹窗 [程序路径] 多行（`5ac31a4`）、
    #4 打包 + 布局量取 + R1–R12 真机门（`7c32ec4` … `0b43346`）。每票的执行记录与两轴审查结论都写在各自票的评论里；
    spec 的收口评论：https://github.com/Gelomen/lms_launcher/issues/1#issuecomment-6251941207 。
  - #4 的收口口径（别混淆两件事）：agent 侧取证在 https://github.com/Gelomen/lms_launcher/issues/4#issuecomment-6251647704
    （布局量取与出图、打包取证、四次全量门 + 类型门全绿）；R1–R12 是**用户**用打包产物 `dist-release\win-unpacked\lms_launcher.exe`
    本机实跑后回报「验收通过」= 全部通过、无不满足项，记录在 https://github.com/Gelomen/lms_launcher/issues/4#issuecomment-6251889396 。
  - 前沿与被阻塞状态以上方「在飞工作」为准，本节不再维护。
  - 纪律：做完一张票就关一张；真机门这类只有用户能执行的判据不得由 agent 代填，
    用户的回报按原话记录、口径不明就先问（#4 收票前就问了一次「验收通过」指的是哪一层）。
  - #4 的实测结论（留给以后改这个弹窗的票，别照搬数字）：可执行程序态的多行已真机量取
    （`.temp/ql-exe-rows-probe/`，对照组 = 票 #3 之前那一版组件 + 命令行态两态）。1 行 = 218.0，与改前逐像素一致
    （唯一变化就是多出的 36px [+]，输入框窄 44.0 = 36 + 8 行内 gap）；行 y 步距实测 38.0，两态同口径；
    多行两态都不出横向 / 竖向滚动条。两处必须记下的差别：① 3 行的绝对值两态不同（可执行程序 285.3 / 命令行 293.3）——
    差的 8.0 来自两态「管理员」那一行的既有高度差（只放开关 24 vs 还挂终端下拉 32），1 行时被 218 的 min-height 地板盖住，
    不是多行引入的；② 上一轮「[+] 挂气泡顶出 10px 横向滚动条」的坑在这条上不存在（[+] / [-] 不带气泡；
    [选择文件] 的既有气泡实测不出溢出）。数字已写进 QuickLaunchModal.vue 的样式注释。
  - 测试环境注记（#2 实测）：跑 vitest 的 PATH 必须含 `C:\Users\Gelomen\AppData\Local\Microsoft\WindowsApps`（mspaint.exe 别名预检）与 `C:\Windows\System32\WindowsPowerShell\v1.0`（powershell.exe），否则 `process / ps1-encoding / update-bootstrap` 三组共 8 条会因 ENOENT/EINVAL 假红。
- **sub-issue 与原生依赖在本仓已验证可用**：`gh issue edit <parent> --add-sub-issue <child>` 与 `gh api --method POST .../issues/<child>/dependencies/blocked_by -F issue_id=<db-id>` 都已成功执行过（#4 的 `issue_dependencies_summary.blocked_by` = 2）。上面「更老的 `gh`」分支只是兜底，不必先试。
- **本地暂存**：迁移时用过的草稿留在 `.scratch/quick-launch-exe-rows/`（被 `.gitignore` 的 `.*/` 忽略，不入库）；tracker 是唯一权威，草稿可随时删。

## PR 是否作为分级入口

**PRs as a request surface: no.** _（若本仓把外部 PR 当作功能请求，就把它设为 `yes`；`/triage` 会读这个开关。）_

设为 `yes` 时，PR 走与 issue 同一套标签与状态，只是换用 `gh pr` 的等价命令：

- **读 PR**：`gh pr view <number> --comments`，diff 用 `gh pr diff <number>`。
- **列出待分级的外部 PR**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用一套编号，所以裸写一个 `#42` 可能指两者之一：先用 `gh pr view 42` 解析，查不到再退回 `gh issue view 42`。

## 当技能说「发布到 issue tracker」

建一条 GitHub issue。

## 当技能说「取出相关 ticket」

按上面**读 issue** 的做法读它。

## 寻路（Wayfinding）操作

供 `/wayfinder` 使用。**地图（map）**是一条 issue，**子票（child）**是挂在地图下的 issue。

> **标签已就位（2026-10-19 建好，`gh label list` 实测在位）**：`wayfinder:map`（`5319E7`）、`wayfinder:research`（`006B75`）、`wayfinder:prototype`（`D4C5F9`）、`wayfinder:grilling`（`F9D0C4`）、`wayfinder:task`（`C2E0C6`）。所以下面的 `gh issue create --label wayfinder:map` 可以直接用，不需要先建标签。这五个**不在** setup 技能自动创建的那五个分级标签之列，因此换仓、换 tracker 或删过标签时要补建：`gh label create wayfinder:map --color 5319E7 --description "Wayfinder map"`（子票同理）。

- **地图**：一条打了 `wayfinder:map` 标签的 issue，正文承载 Notes / Decisions-so-far / Fog 三段。`gh issue create --label wayfinder:map`。
- **子票**：以 GitHub sub-issue 的形式挂到地图上的 issue（见**把 issue 变成某条的 sub-issue**）。tracker 不支持 sub-issue 时，把子票加进地图正文的任务列表，并在子票正文顶部写 `Part of #<map>`。标签用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。领取后把票指派给推进它的开发者。
- **阻塞关系**：用 GitHub **原生 issue 依赖**——这是唯一能在界面上看见的标准表示。加边用 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞者的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，**不是** `#number`，也不是 `node_id`）。GitHub 用 `issue_dependencies_summary.blocked_by` 报告还开着的阻塞者数量（这是实时闸口）。tracker 不支持依赖时，退回在子票正文顶部写一行 `Blocked by: #<n>, #<n>`。一条票的所有阻塞者都关闭，它才解除阻塞。
- **前沿查询**：列出地图下所有 open 的子票（`gh issue list --state open`，范围限地图的 sub-issue / 任务列表），丢掉还有 open 阻塞者的（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 那行里仍有 open 的）以及已被指派的；按地图顺序，第一个胜出。
- **领取**：`gh issue edit <n> --add-assignee @me`，这是本会话的第一次写操作。
- **结案**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，最后把一段上下文指针（要点 + 链接）追加到地图的 Decisions-so-far。
