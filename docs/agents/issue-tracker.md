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

## 本仓当前状态（2026-10-18 实测，2026-10-19 复核）

- **仓库**：GitHub `Gelomen/lms_launcher`，**public**，Issues 已开启；当前分支 `feat/quick-launch`（2026-10-18 由 `feat/quick_launch-matt` 改名，旧名已不存在）。
- **标签**：五个分级标签已建好并投入使用（映射见 [triage-labels.md](./triage-labels.md)）。
- **在飞工作**：spec #8「页签条溢出时可横滚与翻页：滚轮横滚 + 两端翻页箭头」（`ready-for-agent`，2026-10-19 grilling 全部设计决定已写入 spec 正文）。
  - 子票：#9 T1 滚轮横滚 与 #10 T2 两端翻页箭头（**均已关闭**，同一提交 `7c9f662`，两票的执行记录各写在各票评论里）、#11 T3 真机门 R1–R6（open；阻塞者 #9+#10 已关 → **已解除阻塞**）。
  - **前沿（可立即开工）**：#11 —— 真机门只有用户能执行：载体 = 打包产物 `dist-release\win-unpacked\lms_launcher.exe`（沿用 #4/#7 口径），R1–R6 按原话回报后 spec 才收口。
  - 实现备忘（留给真机门失败时回查）：底部灰线、z-index、-16px 延伸已从 .tab-bar 上移到 .tab-bar-wrap（箭头段上连续）；`.tab-bar-wrap .tab-bar` 后代规则必须写在 .tab-bar 主规则之后——测试的 cssRule 助手按第一次出现取规则（style.css 注释里有同条警示）。
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
