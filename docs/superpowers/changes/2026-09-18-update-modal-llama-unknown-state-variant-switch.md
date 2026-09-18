# 变更：本地版本无法检测时允许切换 llama.cpp 变体（unknown 态放行「切换版本」）

日期：2026-09-18
状态：已实施（npm test 485 全绿；npm run build 通过）

## 背景与用户诉求

用户把 llama.cpp 切换为 arm64 CPU 版后，`llama-server.exe` 在 x64 机器上无法运行，
`--version` 无输出 → 本地版本 unknown。此时想切回 x64 CUDA 版：下拉虽可见（unknown 态
下拉自 2026-11 细化起即渲染），但一旦点过「检查更新」/「重试」，按钮恒显示「重试」，
无法触发变体下载——死锁。日志：

    [lms_launcher] llama.cpp · 本地版本：未检测到
    [lms_launcher] llama.cpp · 版本检查：unknown（本地 未知 vs 远程 b11036）

## 根因

`UpdateModal.vue` 的 `runLlamaUpdateCheck` 把 `status=unknown`（检查成功但本地未检测到）
与真正的失败混为一谈，统一落 `llamaPhase='error'`（按钮「重试」）。而「切换版本」的
gate `llamaSwitchVariantApplies` 只认 `idle / up-to-date / ready` 三种 phase（2026-11 回归
修复曾把 gate 扩展到 unknown 态，但只覆盖了 status=unknown 且 phase=idle 的
「打开未检查」场景）——status=unknown 且检查过一次后 phase=error，gate 失效，
下拉切到任意变体按钮都停留在「重试」。

注：纯「检查失败」（`success:false`，如网络失败）落 error 是合理语义，本变更不动该路径。

## 用户定稿（对话确认，grill-me 流程）

目标行为：本地版本无法运行（拿不到版本号）但远程选项可用时：

1. 打开弹窗：中段「本地版本未检测到」，下拉默认选中 yaml 里 `last_llama_type` 记录的
   变体（即当前无法运行的 arm64 版），按钮「检查更新」。
2. 下拉切到其它变体（所选 ≠ 配置）→ 按钮变「切换版本」；点击**直接下载并覆盖安装**
   ——不比对本地版本、无二次确认框（用户明确确认不需要）。
3. 所选 = 配置 → 按钮保持「检查更新」（点击走完整检查，现有行为不变）。
4. 安装链路完全复用现有两阶段流程（服务运行中 →「停止并更新」；成功后回写配置并重查，
   本地版本恢复可检测 → 正常「已是最新版本」态）。

## 方案

仅渲染层 `src/modules/UpdateModal.vue` 一处状态映射修正 + 测试：

- `runLlamaUpdateCheck` 成功路径：`status === 'unknown'` 时 `llamaPhase` 落 `'idle'`
  （而非 `'error'`），与「打开未检查」的已知可用行为对齐（该态下拉可见、gate 生效、
  「检查更新」点击走完整检查）。`status` 仍如实记为 unknown（中段文案「本地版本未检测到」
  由 `llamaMiddle` 按 status 渲染，不受影响）。
- 其余映射不变：`update-available → available`、`up-to-date → up-to-date`、`success:false`
  → `error`（「重试」+ 红字）。

不新增 phase、不新增确认层、不改 IPC/主进程/下载安装链路。

## 测试（TDD，先红后绿）

`src/modules/UpdateModal.test.ts` 新增用例（放入「2026-11 细化」describe 末尾，与
同场景用例同组）：

1. **回归主场景**：本地查询无 localVersion（模拟 arm64 exe 无法运行）+ 选项拉取成功 +
   点击「检查更新」落 unknown → 按钮**不是**「重试」而是「检查更新」；下拉切到与配置
   不一致的变体 → 按钮「切换版本」；点击 → `download_llama_update` 携带所选变体 URL，
   不重发 `check_llama_update`；下载完成 installed=false → 两阶段「停止并更新」。
2. **所选=配置**：同上但下拉不动（或切回配置项）→ 按钮保持「检查更新」，点击重发
   完整检查、不发起下载。
3. **纯检查失败不受影响**：`check_llama_update` 返回 `success:false` → 按钮仍「重试」
   + 红字（现有 error 态用例已覆盖按钮文案，本用例补下拉仍渲染、gate 不生效的断言）。

## 验证

- `npx vitest run src/modules/UpdateModal.test.ts`（新用例先红后绿）
- `npm test` 全量
- `npm run build`
