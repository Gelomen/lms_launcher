# 变更：检查更新弹窗删除 llama.cpp 按钮下方独立细进度条

日期：2026-09-16
状态：已实施（npm test 420 全绿；npm run build 通过）

## 背景与用户诉求

检查更新弹窗 llama.cpp 行下载更新时，按钮（「下载中 NN%」+ 左侧紫填充，按钮本身即进度条）
下方另有一条 4px 细进度条 + "download" 阶段文字（用户截图）。细条与按钮内进度信息完全冗余，
用户要求删除细进度条，下载进度仅保留按钮内的「下载中 NN%」+ 紫填充。

## 方案

- `src/modules/UpdateModal.vue`：
  - 删除模板中按钮下方的独立进度条节点（.llama-download-progress：细条 + 阶段文字）；
  - 删除对应 CSS（.llama-download-progress / .llama-progress-bar / .llama-progress-fill /
    .llama-progress-stage）；
  - 删除只为该进度条服务的 `llamaDownloadStage` ref（含进度监听与打开弹窗重置处的赋值）；
  - 删除无消费者的 `llama-progress` emit 声明（App 侧 handler 是空函数，一并移除）。
  - 保留：`llamaDownloadPct`（按钮内紫填充与「下载中 NN%」文案仍由它驱动）与
    `onLlamaUpdateProgress` 订阅（percent 通道不变）。
- `src/App.vue`：移除 UpdateModal 上的 `@llama-progress` 绑定与空的 `onLlamaProgress` 函数。

改动量：UpdateModal.vue 模板 1 处 + CSS 4 条 + script 3 处；App.vue 模板 1 处 + script 1 处。

## 测试

- 新增用例「downloading：llama.cpp 行无独立细进度条与阶段文字；按钮本身即进度条」：
  检查到 update-available → 点击「下载更新」进入 downloading（下载 promise 挂起）→
  断言 DOM 无 .llama-download-progress / .llama-progress-bar / .llama-progress-stage，
  且按钮禁用、文案「下载中 0%」、紫填充节点存在（width 0%）。修复前红、修复后绿。
- 新增源码回归用例「UpdateModal.vue 不再包含 llama 细进度条的模板与样式」：
  读源码断言三个类名不再出现（防模板删了样式残留死代码）。
- npm test 420 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（420）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：llama.cpp 下载中仅有按钮内「下载中 NN%」+ 紫填充，
  下方细条与 "download" 文字消失

## 不做的事

- 不改主进程进度事件契约（llama_update_progress 仍发 { percent, stage }；stage 仅渲染端不再展示）。
- 不改 LMS 启动器行（该行按钮内进度本来就保留）。
- 不改下载逻辑 / 版本选择器 / 七态按钮映射。
