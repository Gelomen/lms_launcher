# 变更：检查更新「本地版本」日志去重——本地版本统一由 check_llama_update 返回

日期：2026-09-16
状态：已实施（npm test 449 全绿；npm run build 通过）

## 背景与用户诉求

llama.cpp 检查更新完毕后，日志区打印两次完全相同的日志：

```
[lms_launcher] llama.cpp · 本地版本：version: 0.4.1-dev (build 11002, commit 83078fec0)
built with Clang 20.1.8 for Windows x86_64
[lms_launcher] llama.cpp · 本地版本：version: 0.4.1-dev (build 11002, commit 83078fec0)
built with Clang 20.1.8 for Windows x86_64
```

## 根因

两条日志各自独立产生，同一次检查里 `llama-server --version` 被执行了两次：

- 第 1 条：渲染端 `UpdateModal.checkLlamaUpdateInternal` 检查前先单独 invoke
  `get_llama_local_version` 取本地版本用于 UI 显示 → 主进程执行一次 `--version` 并
  emitLog「本地版本：…」（src-main/main.ts `get_llama_local_version` handler）。
- 第 2 条：随后的 `check_llama_update` handler 内部又执行一次 `--version`（用于与远程
  版本比较）并再 emitLog 一条相同的「本地版本：…」（src-main/main.ts `check_llama_update`）。

两次查询结果相同 → 日志区两条逐字相同的「本地版本」日志。

## 方案

本地版本显示改由 `check_llama_update` 返回的 `localVersion` 字段派生（该字段主进程
一直在返回），删除独立的 `get_llama_local_version` 链路——一次检查只执行一次
`--version`、只落一条「本地版本」日志：

- src/modules/UpdateModal.vue
  - `checkLlamaUpdateInternal`：删除检查前对 `getLlamaLocalVersion()` 的单独调用。
  - `runLlamaUpdateCheck`：从 check 返回的 `result.localVersion` 派生
    `llamaLocalVersion`（b 号优先显示，无 build 号显示 vX.Y.Z；未返回 → 空串，
    up-to-date 中段回退不带版本号）。
- src/llama-update-client.ts：删除 `getLlamaLocalVersion()` 与 `LlamaLocalVersionResult`。
- src-main/main.ts：删除 `get_llama_local_version` IPC handler（含其 emitLog）；
  `check_llama_update` 内部的版本查询与日志保持不变（唯一落点）。

## 测试

- 新增回归用例（UpdateModal.test.ts）：
  1. 渲染端不再调用 `get_llama_local_version`，且 up-to-date 中段版本号由 check 返回的
     `localVersion` 派生（「已是最新版本 b11002」）；
  2. check 未返回 `localVersion` → 中段回退「已是最新版本」不带版本号、不出现 undefined。
- 既有 up-to-date 断言的 mock 改为经 `check_llama_update.localVersion` 提供本地版本；
  死掉的 `get_llama_local_version` mock 分支全部移除（25 处）。
- 无 UI 行为变化：本地版本号显示格式（b 号 / vX.Y.Z）、弹窗布局、检查/下载流程均未动。

## 验收

- [x] npm test 通过（449，30 文件）
- [x] npm run build 通过
- [ ] 用户真机目检：检查更新完毕后「本地版本」日志只出现一次

## 不做的事

- 不改 `check_llama_update` 内部的 `--version` 执行与「本地版本」日志（它是唯一落点，
  且窗口未开/事件丢失时仍是唯一可见痕迹）。
- 不改本地版本号显示格式与弹窗任何布局。
