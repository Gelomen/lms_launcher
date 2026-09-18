# 变更：llama.cpp 安装验证降级为辅助告知（解压成功即安装完成）

日期：2026-09-18
状态：已实施（npm test 489 全绿；npm run build 通过）

## 背景与用户诉求

用户切到 arm64 CPU 变体后，`llama-server.exe` 在 x64 机器上无法运行。安装链路
`installPendingLlama` 的最后一步「验证」会 spawn `llama-server --version` → 跑不起来 /
输出无法解析 → 验证失败 → **整个安装被判失败** → 渲染端回写 `update.last_llama_type`
的配置动作被跳过 → yaml 停留在旧变体（如 `Windows x64 (CUDA 13)`）→ 下次打开弹窗下拉
默认选中错位的变体，且 UI 显示「重试」（文件其实已覆盖安装成功）。

日志现场：

    [lms_launcher] llama.cpp · 安装验证失败：llama-server --version exited with code ...
    [lms_launcher] llama.cpp · 更新失败，稍后再试

## 根因

`verifyLlamaInstall` 的失败语义与「安装是否完成」耦合：安装成功判定 = 解压成功 **且**
--version 可跑且可解析。而跨架构变体（arm64 exe 装 x64 机器）下 --version 必然不可用，
验证必然失败，把已完成的文件覆盖否定为「安装失败」。渲染端（UpdateModal）以
`installLlamaUpdate().success` 为闸门回写 `last_llama_type`，闸门未过 → 配置不更新。

## 用户定稿（对话确认，systematic-debugging + grill 分支）

1. **解压成功即安装完成**：`--version` 只是辅助告知用户当前在哪个版本号，其失败
   （exe 无法运行 / 退出非 0 / 输出无法解析）一律**非致命**——安装算成功，配置正常
   回写，UI 走正常成功流程（重查后自然显示「本地版本未检测到」+ 下拉）。
2. 警告**只落日志**，不新增 UI 态：日志一行「安装完成（未能确认本地版本号：原因）」；
   验证成功时日志保持原文案「安装完成：bNNNNN」。

## 方案

### src-main/llama-update-download.ts（新增纯函数）

- `installVerifyMessage(result)`：`{ success: true; actualVersion?: string } | { error?: string }`
  → 完成日志文案。成功 → `安装完成：${actualVersion ?? '版本号未知'}`；失败 →
  `安装完成（未能确认本地版本号：${error}）`。纯函数便于单测文案。

### src-main/main.ts（installPendingLlama 第 4 步接线）

- 删除「验证失败 → return { success:false }」分支。
- 成功 → `emitLog(...installVerifyMessage(verifyResult))`，`pendingLlamaUpdate = null`，
  `return { success: true }`。
- 注释同步：第 4 步从「验证」改为「版本确认（辅助，非致命）；解压成功即安装完成，
  --version 失败只记日志——跨架构变体（如 arm64 装 x64）下 --version 必然不可用，
  不得否定已完成的文件覆盖（2026-09-18 用户定稿）；渲染端以本函数 success 为闸门
  回写 last_llama_type」。

### 测试（TDD，先红后绿）

`src-main/llama-update-download.test.ts` 新增 `installVerifyMessage` 用例：

- 成功 + actualVersion → 「安装完成：b11036」
- 成功 + 无 actualVersion → 「安装完成：版本号未知」
- 失败（exited 非 0）→ 「安装完成（未能确认本地版本号：llama-server --version exited with code 3221225786）」
- 失败（解析失败）→ 同上，原因透传

## 影响面

- `verifyLlamaInstall` 本体不动（保留其 success/error/actualVersion 契约与既有测试）。
- 渲染端零改动：`installLlamaUpdate` 成功路径本就回写配置 + 重查，现在验证失败也走
  该路径 → 配置回写自然恢复；重查时本地版本拿不到 → unknown 态（上一变更已放行
  「切换版本」，用户仍可切回可运行变体）。
- UpdateModal.test.ts 中 mock 主进程返回 `{ success: false, error: 'verify failed: ...' }
  的用例（stop-update 非占用类失败）是 IPC 层 mock，不依赖本变更，不受影响。

## 验证

- `npx vitest run src-main/llama-update-download.test.ts`（新用例先红后绿）
- `npm test` 全量
- `npm run build`
