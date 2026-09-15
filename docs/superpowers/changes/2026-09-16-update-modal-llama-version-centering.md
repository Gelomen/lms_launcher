# 变更：检查更新弹窗 llama.cpp 行「本地: bNNNNN」检查中时文字居中

日期：2026-09-16
状态：已实施（npm test 415 全绿；npm run build 通过）

## 背景与用户诉求

检查更新弹窗中，llama.cpp 行处于「检查中...」时，「本地: b10679」文字紧贴名称「llama.cpp」
左对齐，未居中（用户截图）。根因：该行第一行结构为
名称 | 本地版本（.llama-version） | 中段状态文字（.llama-middle，flex:1+居中） | 按钮。
中段状态文字仅 up-to-date / update-available 态渲染；检查中（checking，status='unknown'）时
`llamaMiddle()` 返回 null 不占位，而 .llama-version 无 flex 伸展 → 无法占据剩余空间居中，
视觉上贴左。

## 方案

- `src/modules/UpdateModal.vue` 的 `.llama-version` 增加
  `flex: 1; min-width: 0; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`：
  使其在任意态（含检查中）都占据 .llama-info 内名称与按钮之间的剩余空间并水平居中，
  与中段状态文字同语言（.update-row__middle 同款居中规则）。

改动量：UpdateModal.vue 样式 1 处；UpdateModal.test.ts 新增 1 个布局回归用例。

## 测试

- 新增用例「布局：检查中（checking）期间本地版本号文字居中于名称与按钮之间」：
  挂起 check_llama_update（按钮「检查中...」禁用）→ 断言本地版本号 b10679 仍显示，
  并读源码断言 .llama-version 自带 flex:1 + text-align:center（防规则误删回归）。
  修复前红、修复后绿。
- npm test 415 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（415）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：检查中时「本地: bNNNNN」居中于名称与按钮之间

## 不做的事

- 不改检查逻辑 / IPC 契约 / 本地版本 ref 语义。
- 不改 LMS 启动器行；不改 up-to-date / update-available 态（其中段 .llama-middle 本已居中）。
