# 变更：llama.cpp 更新失败日志去重——下载失败行简化为「更新失败，稍后再试」

日期：2026-09-16
状态：已实施（npm test 447 全绿；npm run build 通过）

## 背景与用户诉求

llama.cpp 更新（下载）失败时，日志区出现两条高度重复的行：

1. `[lms_launcher] llama.cpp · 下载失败：下载失败：HTTP 404——该版本的下载资产可能还在上传（nightly 发布后资产需几分钟陆续就位，稍后重试即可）；若持续 404 请检查代理设置`
2. `[lms_launcher] llama.cpp 更新失败 · 下载失败：HTTP 404——该版本的下载资产可能还在上传……`

用户反馈：两条重复，保留第二条（渲染端「更新失败」行）即可，且第二条应带「稍后再试」。

## 根因

两条日志各自独立产生，错误全文各写一遍：

- 第 1 条：src-main/main.ts `download_llama_update` 下载失败分支
  `emitLog('…下载失败：${dl.error}')`——dl.error 本身已是完整友好错误（「下载失败：HTTP 404——…」），
  行内「下载失败」前缀与 dl.error 前缀叠加出「下载失败：下载失败：」。
- 第 2 条：src/App.vue `onLlamaComplete(false, error)` →
  `appendSys('llama.cpp 更新失败 · ' + error)`——error 同源（IPC 返回值即 dl.error），全文重复。

## 方案

- src-main/main.ts：下载失败分支的 emitLog 改为固定短文案
  `[lms_launcher] llama.cpp · 更新失败，稍后再试`（不再内嵌 dl.error 全文；
  详细错误仍经 IPC 返回值传到渲染端第 2 条日志）。
- src/App.vue：onLlamaComplete 失败分支追加「，稍后再试」→
  `llama.cpp 更新失败 · <error>，稍后再试`。

效果（404 重试耗尽场景）：

```
[lms_launcher] llama.cpp · 更新失败，稍后再试
[lms_launcher] llama.cpp 更新失败 · 下载失败：HTTP 404——该版本的下载资产可能还在上传（nightly 发布后资产需几分钟陆续就位，稍后重试即可）；若持续 404 请检查代理设置，稍后再试
```

第 1 行仅作「失败」短标记，细节全部集中在第 2 行，不再逐字重复。

## 测试

- 无契约变化：IPC 返回值、弹窗红字错误、404 自动重试行为均未动；
  既有断言（error 含 '404' / '可能还在上传'）不受影响。
- 受影响模块回归：App.test.ts / UpdateModal.test.ts / llama-update-download.test.ts 106 用例全绿。

## 验收

- [x] npm test 通过（447，30 文件）
- [x] npm run build 通过
- [ ] 用户真机目检：下载失败时日志区两行不再逐字重复

## 不做的事

- 不合并/删除其中一行（主进程失败行保留：窗口未开或事件丢失时仍是唯一可见的失败痕迹；
  且安装/验证等其他失败路径各有一行主进程日志，风格保持一致）。
- 不改 llama.cpp 错误文案全文（弹窗红字与日志第 2 行仍显示完整友好错误）。
