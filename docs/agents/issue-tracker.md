# Issue tracker：GitHub

本仓的 issue 与 spec 都存放在 GitHub Issues 里。所有操作走 `gh` CLI。

> 工具链注记（2026-10-18 实测）：`gh` 2.102.0 装在 `C:\Program Files\GitHub CLI\gh.exe`，**不在代理 shell 的 `PATH` 上**——请用全路径调用，或把该目录加进 `PATH`。**已登录** github.com / `Gelomen`（凭据在系统 keyring，token 前缀 `gho_`，scopes：`gist`、`read:org`、`repo`、`workflow`）。换机器或换账号时才需要重跑 `gh auth login`。

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

## 本仓当前状态（2026-10-18 实测）

- **仓库**：GitHub `Gelomen/lms_launcher`，**public**，Issues 已开启；当前分支 `feat/quick_launch-matt`。
- **标签**：五个分级标签已建好并投入使用（映射见 [triage-labels.md](./triage-labels.md)）。
- **在飞工作**：spec #1「快捷启动 [程序路径] 支持多条」是当前唯一 open 的 spec，子票 #2、#3、#4 都是它的 sub-issue。
  - **已关闭**：#2 启动前全量预检（实现提交 `ee77d68`）、#3 弹窗 [程序路径] 多行（实现提交 `5ac31a4`）；
    两票的执行记录与两轴审查结论都写在各自的关票评论里。
  - **前沿（可立即开工）**：#4 打包 + 布局量取 + R1–R12 真机门——它的两个原生阻塞者（#2、#3）都已关。
  - **被阻塞**：无。
  - 做完一张票就关一张。
  - 交接给 #4 的注记（#3 实测边界）：可执行程序态的多行**没做真机量取**。#3 只钉 DOM 与 CSS 契约
    （.exe-cell 与 .cmd-cell 共用同一条 flex 列 + 6px 规则，QuickLaunchModal.vue 的样式注释已写明），
    命令行态那组数字（1 行 218.0 / 3 行 293.3，每行 +38）在 exe 态应当同形，但仍需按票 #4 的手法实测一遍。
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

- **地图**：一条打了 `wayfinder:map` 标签的 issue，正文承载 Notes / Decisions-so-far / Fog 三段。`gh issue create --label wayfinder:map`。
- **子票**：以 GitHub sub-issue 的形式挂到地图上的 issue（见**把 issue 变成某条的 sub-issue**）。tracker 不支持 sub-issue 时，把子票加进地图正文的任务列表，并在子票正文顶部写 `Part of #<map>`。标签用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。领取后把票指派给推进它的开发者。
- **阻塞关系**：用 GitHub **原生 issue 依赖**——这是唯一能在界面上看见的标准表示。加边用 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞者的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，**不是** `#number`，也不是 `node_id`）。GitHub 用 `issue_dependencies_summary.blocked_by` 报告还开着的阻塞者数量（这是实时闸口）。tracker 不支持依赖时，退回在子票正文顶部写一行 `Blocked by: #<n>, #<n>`。一条票的所有阻塞者都关闭，它才解除阻塞。
- **前沿查询**：列出地图下所有 open 的子票（`gh issue list --state open`，范围限地图的 sub-issue / 任务列表），丢掉还有 open 阻塞者的（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 那行里仍有 open 的）以及已被指派的；按地图顺序，第一个胜出。
- **领取**：`gh issue edit <n> --add-assignee @me`，这是本会话的第一次写操作。
- **结案**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，最后把一段上下文指针（要点 + 链接）追加到地图的 Decisions-so-far。
