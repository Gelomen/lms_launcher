# 变更：检查更新弹窗 llama.cpp 行删除「本地:」span，up-to-date 中段显示「已是最新版本 bNNNNN」

日期：2026-09-16
状态：已实施（npm test 443 全绿；npm run build 通过）

## 背景与用户诉求

检查更新弹窗中 llama.cpp 行「已是最新版本」提示文字与 LMS 启动器行（「已是最新版本 0.2.0」）
格式不一致：llama.cpp 行本地版本号单独显示在「本地: b10999」span，中段状态文字不带版本号
（用户截图）。诉求：

1. llama.cpp 最新版提示文字与 LMS 启动器行一致，如「已是最新版本 b10999」。
2. 删除「本地: b10999」独立 span（与中段信息冗余）。

## 方案

- src/modules/UpdateModal.vue 的 llamaMiddle() up-to-date 分支：本地版本号并入中段——
  llamaLocalVersion 有值时返回「已是最新版本 bNNNNN / v0.4.1」（格式沿用 get_llama_local_version
  解析逻辑），无值时回退「已是最新版本」。
- 删除模板中「本地:」的 .llama-version span 及 .llama-version CSS 块
  （含 2026-09-16 加的 flex:1 居中规则，该 span 已不存在）。
- llamaLocalVersion ref 保留：仍由 get_llama_local_version 填充，现仅消费方为 llamaMiddle()。
- update-available 态中段「新版本: …」不变；llamaBelow()（未配置提示/错误红字）不变。

改动量：UpdateModal.vue 脚本 1 处 + 模板 1 处 + 样式 1 处；UpdateModal.test.ts 断言更新 4 处，
原「本地版本号居中」布局用例改写为「本地: span 不再渲染 + up-to-date 中段带版本号」回归用例。

## 测试

- 新增用例「「本地:」span 不再渲染；up-to-date 中段显示「已是最新版本 bNNNNN」」：
  up-to-date + build 10679 → .llama-version 为 null、行内无「本地:」字样、
  .llama-state-text 为「已是最新版本 b10679」。
- 既有 3 处 up-to-date 断言随 mock 本地版本更新（v1 / b10679 / b10997）；
  update-available 态 .llama-version toBeNull 断言保留（span 已删，恒成立）。
- npm test 443 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（443）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：up-to-date 显示「已是最新版本 bNNNNN」，「本地:」span 消失

## 不做的事

- 不改 LMS 启动器行；不改检查逻辑 / IPC 契约 / get_llama_local_version 解析格式。
- 不改 update-available / error / unconfigured 态渲染。