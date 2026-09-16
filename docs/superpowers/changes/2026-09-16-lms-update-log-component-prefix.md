# 变更：LMS 启动器更新链路日志统一「LMS 启动器 ·」前缀——与 llama.cpp 日志区分

日期：2026-09-16
状态：已实施（npm test 449 全绿；npm run build 通过）

## 背景与用户诉求

日志区同时存在 LMS 启动器与 llama.cpp 两条更新链路，llama.cpp 侧日志统一带
「llama.cpp ·」前缀，而 LMS 启动器侧为「检查更新 · …」「更新 · …」等无组件前缀文案，
混在一起无法一眼区分属于哪条链路。用户要求 LMS 启动器侧同样带组件前缀。

## 方案

LMS 启动器更新链路（检查/下载/安装）的全部日志行统一加「LMS 启动器 ·」前缀，
与 llama.cpp 侧「[lms_launcher] llama.cpp · …」对称：

- src/App.vue（渲染端 appendSys，自动补 [lms_launcher] 前缀）
  - 检查更新 · 发现新版本 → LMS 启动器 · 发现新版本（启动时静默检查 + 手动检查两处）
  - 检查更新 · 当前已是最新版本 → LMS 启动器 · 当前已是最新版本（用户上一轮指定）
  - 开始下载新版本… → LMS 启动器 · 开始下载新版本…
  - 新版本下载完成 → LMS 启动器 · 下载完成
  - 更新下载失败 · … → LMS 启动器 · 更新下载失败 · …
  - 启动更新失败 · … → LMS 启动器 · 启动更新失败 · …
- src-main/main.ts（主进程 emitLog，check_update / download_update / run_update / 残留任务清理）
  - [lms_launcher] 检查更新失败：… → [lms_launcher] LMS 启动器 · 检查更新失败：…（3 处）
  - [lms_launcher] 更新 · …（开始下载/EPERM 重试/完整性/下载完成/下载失败/已启动更新脚本）
    → [lms_launcher] LMS 启动器 · 更新 · …（6 处）
  - [lms_launcher] 更新失败：计划任务创建/触发失败（…）→ [lms_launcher] LMS 启动器 · 更新失败：…
  - [lms_launcher] 更新 · 已清理残留计划任务 → [lms_launcher] LMS 启动器 · 更新 · 已清理残留计划任务

## 测试

- 无契约/行为变化：仅日志文案前缀；IPC 返回值、状态机、弹窗 UI 均未动。
- 现有测试无对这些日志字符串的断言（App.test.ts / UpdateModal.test.ts 不受影响）。

## 验收

- [x] npm test 通过（449，30 文件）
- [x] npm run build 通过
- [ ] 用户真机目检：日志区 LMS 启动器与 llama.cpp 的更新日志行各自带组件前缀

## 不做的事

- 不改 llama.cpp 侧任何日志（已是统一前缀）。
- 不改 ps1 更新脚本的 [INFO]/[ERROR] 行格式（回显时由 replayUpdateLog 统一加 [lms_launcher] 前缀，
  且发生在应用更新完成后的下次启动，语境自明，无混淆场景）。
- 不改「目录校验」「启动失败」「停止失败」等非更新链路日志（与更新区分无关）。
