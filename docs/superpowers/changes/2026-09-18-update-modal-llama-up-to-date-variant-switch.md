# 变更：检查更新弹窗 llama.cpp「已是最新版本」态显示 Windows 版本下拉，允许切换变体；CUDA DLLs 下载地址落日志

日期：2026-09-18
状态：已实施（npm test 447 全绿；npm run build 通过）

## 背景与用户诉求

1. 检查更新弹窗中 llama.cpp 检查到「已是最新版本」时，下方不显示各 Windows 版本的下拉菜单，
   用户无法切换变体（CPU / CUDA 12 / CUDA 13 / Vulkan / OpenVINO / SYCL / ROCm / arm64 等）。
2. 选择的版本包含 CUDA 时，日志区没有打印要下载的 CUDA DLLs 链接地址（只打印了主包 URL）。

## 根因

- 下拉不显示：UpdateModal.vue 的 Dropdown v-if 条件为
  llamaUpdateStatus === 'update-available' && llamaVersionOptions.length > 0——
  仅 update-available 态渲染。主进程 check_llama_update 返回的 versionOptions 不依赖 status
  （恒为最新 release body 解析出的 10 个 Windows 变体），渲染端 runLlamaUpdateCheck 也恒填充
  llamaVersionOptions → up-to-date 态数据已就绪，仅 UI 条件挡住渲染。
- CUDA 链接无日志：main.ts 的 download_llama_update handler 只 emitLog 主包 URL
  （「开始下载更新：<url>」），opts.cuda_dlls_url 未落日志。

## 方案

- src/modules/UpdateModal.vue：
  - Dropdown v-if 放宽为
    (llamaUpdateStatus === 'update-available' || llamaUpdateStatus === 'up-to-date') && llamaVersionOptions.length > 0。
  - up-to-date 且有版本选项时按钮文案切「下载更新」（点击即下载所选变体、覆盖安装），
    无选项（主进程未返回 versionOptions 的异常情形）保持「检查更新」（点击重查）。
  - onLlamaBtn 同步分支：up-to-date + 有选项 → downloadLlamaUpdateInternal()（不重发检查）。
  - runLlamaUpdateCheck 选项表恒与最近一次检查同步：主进程未返回时清空旧选项
    （修复重查后残留上一轮选项导致 up-to-date 态误显下拉的缺陷）。
- src-main/main.ts：download_llama_update 在「开始下载更新：<主包 URL>」之后，
  opts.cuda_dlls_url 有值时追加「CUDA DLLs 下载地址：<url>」一行（sys 桶）。

改动量：UpdateModal.vue 脚本 3 处 + 模板 1 处；UpdateModal.test.ts 新增 3 例 + 1 处旧断言随新契约更新；main.ts 2 行。

## 测试

- 新增用例「up-to-date + 有版本选项：显示 Windows 版本下拉 + 按钮「下载更新」（可切换变体）」：
  up-to-date + 3 选项 → .select-trigger 渲染（默认第一项）+ 面板 3 li + 按钮「下载更新」可点。
- 新增用例「up-to-date 点击「下载更新」：切换变体后调 download_llama_update（所选选项 URL），不重发 check」：
  切到 CUDA 13 → 点击 → download_llama_update 恰 1 次且携带 { download_url: cuda13.zip,
  cuda_dlls_url: cuda13-dlls.zip }；check_llama_update 不增加；按钮进 downloading 禁用。
- 新增用例「up-to-date 无版本选项：不渲染下拉，按钮保持「检查更新」（回归守护）。
- 既有用例「stop-update → 安装成功 → 重查」尾部断言由「检查更新」更新为「下载更新」
  （新契约：up-to-date + 有选项即显下拉/下载按钮）。

## 验收

- [x] npm test 通过（447，30 文件）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：up-to-date 时下拉出现、可切换变体并下载；CUDA 变体下载时日志见 DLLs 地址

## 不做的事

- 不改主进程检查逻辑 / IPC 契约 / compareLlamaVersions / 下载解压验证流程。
- 不改 update-available / error / unconfigured / checking / stop-update 态渲染。
- 不持久化所选变体（与既有行为一致：每次打开弹窗按最新 release 选项表重新渲染，默认第一项）。
