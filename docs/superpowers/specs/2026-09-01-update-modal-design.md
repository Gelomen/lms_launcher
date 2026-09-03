# lms_launcher 检查更新窗 + update.exe 同目录 设计

## 日期

2026-09-01（批准日）

## 背景

lms_launcher 已有自动更新机制（规格 2026-09-01-auto-update-design.md）：启动静默检查、顶栏「有新版本!」按钮、check_update / download_update / run_update 三个 IPC、独立 update.exe 双产物构建。落地后发现两个问题：

1. **update.exe 与 lms_launcher.exe 不同目录**：build 产物分别在 dist-release/win-unpacked/ 与 dist-release-update/，只有发布 zip 时才合并。用户希望构建后两者即同目录（win-unpacked 本身可直接解压运行，发布 zip 也自然包含 update.exe）。
2. **托盘「检查更新」弹的是确认窗口**：用户要求 v2rayN 式的独立检查更新窗——每行一个项目 + 独立「检查更新」按钮（当前只有 LMS 启动器一行，后续可能增加如 llama.cpp），并内化完整更新流程（检查 → 下载 → 重启），而非确认框。

## 目标

1. build.bat 构建完成后，自动把 update-0.1.0.exe 拷贝并重命名为 dist-release/win-unpacked/update.exe（与 lms_launcher.exe 同目录）；package-zip.ps1 同步简化（不再单独拷贝 update.exe）
2. 新增「检查更新」弹窗（UpdateModal），视觉与 TemplateModal 统一（主窗口内 Vue 弹窗，非独立 BrowserWindow）
3. 弹窗内每行 = 项目名 +（新版号）+ 动作按钮，同一行显示
4. LMS 启动器行内化完整状态机：检查更新 → 下载更新（进度条）→ 重启应用
5. 点 [重启应用] 弹出的确认窗与现有「退出程序」ConfirmDialog 是**同一个**（同一组件、同一文案）
6. 顶栏「有新版本!」按钮与托盘右键「检查更新」都只负责**打开这个弹窗**（替换现有确认框流程）

## 非目标

- 不实现 llama.cpp 等其它项目的实际检查逻辑（行结构预留，本期只加 LMS 启动器一行）
- 不改 check_update / download_update / run_update 三个 IPC 的契约（复用现有实现）
- 不改 update.exe 自身逻辑

## 详细设计

### A. 构建：update.exe 同目录

- build.bat 末尾追加一步（node 脚本或内联 Node -e 均可，倾向内联简单命令）：
  - 源：dist-release-update/win-unpacked/update-*.exe（取唯一项）
  - 目标：dist-release/win-unpacked/update.exe（覆盖已存在）
- scripts/package-zip.ps1 简化：删除单独拷贝 update.exe 的逻辑；校验改为检查 win-unpacked 内 update.exe 存在
- 效果：win-unpacked 目录解压即用（update.exe 已在内）；发布 zip 根目录即 win-unpacked 内容，天然包含 update.exe

### B. UpdateModal 组件

- 新增 src/modules/UpdateModal.vue；视觉语言与 TemplateModal 完全一致：
  - 居中卡片（.modal-overlay 全局遮罩，z-index 10；打开时主窗口其他区域遮罩不可交互，同 TemplateModal）
  - 32px 标题栏：文字「检查更新」居中；右上角形 × 按钮（hover 红底白字，点击 @close 关弹窗，不中断下载）
  - 卡片宽 320px，白底 12px 圆角；内容区 padding 16px
- 行结构（本期一行，数据驱动便于扩展）：
  - 同一行 flex 三段：左 = 项目名（14px，--text）；中 = 新版号（12px，--muted，仅 available 状态显示，如 v0.2.0）；右 = 动作按钮（.text-btn：深色字、无填充、hover 浅灰底，与 v2rayN 截图一致）
- × 关窗不中断下载（下载在主进程进行）；再次打开弹窗恢复当前状态（状态由 App 持有，见 D）

### C. LMS 启动器行状态机

| 状态 | 按钮显示 | 按钮可点 | 行内其它显示 |
|------|----------|----------|--------------|
| idle | 检查更新 | 是 | 无 |
| checking | 检查中… | 否 | 无 |
| available | 下载更新 | 是 | 新版号灰字（按钮左侧，同中间段位置） |
| downloading | 下载中 NN% | 否 | 行下方紫色进度条（0→100%，主进程 update-download-progress 事件驱动） |
| ready | 重启应用 | 是 | 新版号仍显示 |
| error | 重试 | 是 | 红色小字错误原因（替代新版号位置，12px --danger） |
| up-to-date | 检查更新 | 是 | 灰字「已是最新版本 v0.1.0」（中间段） |

状态流转：

- idle/up-to-date/error → 点按钮 → invoke check_update → checking
  - available → available（记版本号）
  - up-to-date → up-to-date（记版本号）
  - error/dev/异常 → error（dev 模式文案「开发模式不检查更新」）
- available → 点「下载更新」→ invoke download_update → downloading（进度事件更新 pct）
  - ok → ready
  - 失败 → error（删半成品由主进程负责；按钮回「重试」）
- error → 点「重试」→ 重发**上次失败的那个请求**（渲染端记录 lastFailure = 'check' | 'download'）
  - check 失败 → 重发 check_update → checking
  - download 失败 → 重发 download_update → downloading；若主进程返回失败且原因是「尚无更新任务」（应用重启后 pendingUpdate 已失）→ 回落 idle 并自动重发 check_update
- ready → 点「重启应用」→ 弹「退出程序」ConfirmDialog（见 D）→ 确认 → invoke run_update

### D. 重启确认复用退出确认

- 现有 exitConfirm 的 ConfirmDialog（title「退出程序」/ message「将停止 llama-server 并退出，是否确认？」/ tone primary）扩展为**两个入口共享**：
  - 托盘右键「退出」→ exitAction = 'exit' → [确认] → invoke('exit_app')
  - UpdateModal [重启应用] → exitAction = 'run_update' → [确认] → invoke('run_update')（主进程内部同样 stopGraceful(3) + app.exit(0)，与退出语义一致，现有文案准确）
- 删除：旧「发现新版本」第一次确认框、旧「开始更新」二次确认框（流程已内化到状态机）

### E. 入口统一

- 顶栏「有新版本!」按钮（update-pill）：点击 → 只打开 UpdateModal（不再 re-check + 弹确认框）
- 顶栏「下载中 NN%」按钮（update-pill--busy）：下载进行中同样可点 → 只打开 UpdateModal（恢复 downloading 态 + 进度条）；2026-09-03 由「纯禁用占位」改为「可点入口」，与 available 态同口径（入口统一原则：顶栏任何更新相关 pill 点击都只开弹窗）
- 托盘右键「检查更新」：主进程唤回窗口 + tray-update-request（现有 IPC 不变）→ 渲染端打开 UpdateModal（不再走旧 onUpdateButton 确认流程）
- App.vue 持有：updateOpen（弹窗开关）、updateState（C 节状态机）、exitAction（D 节）；UpdateModal 通过 props/emits 通信（与 LaunchBar 同模式）

### F. 样式

- src/style.css 新增 .text-btn（与 .btn 同高 32px，无边框、白底、--text 色，hover #F6F7F8，disabled 置灰——复用现有 disabled 语言）
- 进度条：2px 高、--primary 紫、行下方 4px 间距（scoped 于 UpdateModal）

## 端到端流程

1. 启动 → 静默检查（不变）→ 有新版 → 顶栏「有新版本!」
2. 点「有新版本!」或托盘「检查更新」→ 打开「检查更新」弹窗（初始状态映射：顶栏 phase=available → 弹窗 available 态；phase=downloading → downloading 态；其余 → idle，用户点「检查更新」re-check）
3. [检查更新] → 发现 v0.2.0 → 行内显示 v0.2.0 + 按钮变「下载更新」
4. [下载更新] → 下载中 NN% + 进度条 → 完成 → 按钮变「重启应用」
5. [重启应用] → 「退出程序」确认窗（与托盘退出同一个）→ [确认] → run_update → spawn 同目录 update.exe → 退出 → 自动重启新版

## 边界与失败模式

| 场景 | 行为 |
|---|---|
| 检查失败（网络等） | error 态 + 红色原因 + [重试]；主进程 [更新] 日志不变 |
| 下载失败 | error 态 + 原因 + [重试]；主进程删半成品、日志不变 |
| 重试时 pendingUpdate 已失（应用重启过） | download_update 返回失败 → 回落 idle 重查 |
| 关弹窗后下载中 | 下载继续；顶栏按钮仍显「下载中 NN%」；重开弹窗恢复 downloading 态 |
| 重启确认点[取消] | 保持 ready 态，[重启应用] 仍可点 |
| 开发模式 | 点检查更新 → error 态文案「开发模式不检查更新」（无重试语义，重试按钮点了重查仍如此，可接受） |
| run_update 时 update.exe 缺失 | 主进程现有报错（更新文件缺失）→ 弹窗维持原态 |

## 测试与验收

- 单元（vitest，沿用现有 mock 模式）：
  - UpdateModal.test.ts（新）：七态渲染（按钮文案/可点/新版号/进度条/错误行）、状态流转（idle→checking→available→downloading→ready→触发 run_update 确认链路）、up-to-date、error+重试
  - App.test.ts（改）：托盘「检查更新」/ 顶栏「有新版本!」→ 打开 UpdateModal（删旧 updateConfirm 断言）；重启确认复用退出对话框（[确认] → run_update 而非 exit_app）
- 手工验收：
  1. build.bat 全量构建 → dist-release/win-unpacked/ 内存在 update.exe
  2. 托盘右键「检查更新」→ 打开新弹窗（非旧确认框）
  3. 完整更新流程走到 run_update 前（可用 0.2.0-rc 测试发布验证）
- 验收命令：npm test 全绿 + npm run build 成功

## 假设

- UpdateModal 状态与 exitAction 由 App.vue 持有（单窗口架构，无跨窗口状态同步问题）
- 现有 check_update / download_update / run_update IPC 契约不动，仅渲染端调用方变化
