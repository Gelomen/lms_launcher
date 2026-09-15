# 变更：发现新版本时隐藏 llama.cpp 本地版本号

日期：2026-09-15
状态：已实施（npm test 414 全绿；npm run build 通过）

## 背景与用户诉求

检查更新弹窗中，llama.cpp 行发现新版本时同时显示「本地: b10679」与「新版本: b10984」，
信息冗余。用户指定：删除本地版本号，只保留新版本号。

## 方案

- `src/modules/UpdateModal.vue` llama.cpp 行「本地: …」的 `v-if` 由
  `llamaLocalVersion` 改为 `llamaLocalVersion && llamaUpdateStatus !== 'update-available'`：
  仅发现新版本时隐藏；up-to-date / 检查中 / 未配置 / 出错等其余状态照常显示。
- 本地版本 ref 与主进程 `get_llama_local_version` 调用保留不动（远端比较逻辑仍在主进程，
  前端只是不再渲染）。

改动量：UpdateModal.vue 模板 1 处；UpdateModal.test.ts 2 个用例改写/补断言。

## 测试

- 「本地 dev 构建版本显示 build 号」用例改写：update-available 时断言
  `.llama-version` 不存在（本地号不显示），「新版本: b10955」断言保留。
- 「up-to-date 恒显示「已是最新版本」…」用例补断言：up-to-date 时本地号 b10679 照常显示。
- npm test 414 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（414）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：发现新版本时 llama.cpp 行只显「新版本: bNNNNN」

## 不做的事

- 不改主进程版本比较与 IPC 契约（local version 仍被用于 up-to-date / update-available 判定）。
- 不改 LMS 启动器行（其「已是最新版本 vX.Y.Z」/「vX.Y.Z」文案保持原样）。
