# 变更：托盘「检查更新」打开弹窗时自动 re-check LMS 启动器行

日期：2026-09-15
状态：已实施（npm test 414 全绿；npm run build 通过；待用户真机目检）

## 背景与用户诉求

用户报告：点击托盘「检查更新」弹出检查更新窗口后，llama.cpp 行会自动检查更新，
但 LMS 启动器行不会（停在 idle「检查更新」），需要再点一次按钮才检查。

用户指定：让 LMS 启动器行与 llama.cpp 一致——打开弹窗即自动检查。

## 根因

- 历史契约（2026-09-01 update-modal 规格 §E「入口统一」）定稿为：托盘「检查更新」
  **只开弹窗，不 re-check**——理由是启动时已做过静默检查，避免重复请求。
- 但 llama.cpp 行自 2026-09-14 bug 修复后改为 `watch(open)` 打开即自动检查
  （当时修「选目录前检查一次卡 unconfigured」），两行行为从此不一致：
  启动之后发布的新版本，启动器行不会自动发现（除非再点按钮），
  而 llama.cpp 行打开即见。
- 这是 spec 定稿行为，非回归——本次是用户改需求：两行对齐「打开即自动检查」。

## 方案

`src/App.vue` 托盘事件 handler 由「只开弹窗」改为「开弹窗 + 自动 re-check」：

- `onTrayUpdateRequest` → `updateOpen = true` 后调 `void runCheck()`；
- **downloading 态跳过 re-check**：下载在途时 runCheck 会把状态机打回 checking，
  打断「下载中 NN%」进度显示；下载完成后的下一次打开会正常 re-check。
- 其余态（idle / up-to-date / error / available / ready）均允许 re-check：
  runCheck 幂等（重查覆盖旧结论），error 态重查即重试，available 态重查刷新版本。
- llama.cpp 行零改动：其 `watch(open)` 自动检查机制不变，两行各自触发、互不影响。
- 顶栏「有新版本!」/「下载中 NN%」入口维持只开弹窗不 re-check（规格 §E）：
  顶栏可见即说明状态已 available/downloading，无需重查。

改动量：App.vue 1 处 handler（4 行）；App.test.ts 3 个用例改写 + 2 个新增。

## 测试

- 「托盘只开弹窗不 re-check」原契约用例改写为：开弹窗 + 恰好 1 次 check_update，
  且启动静默检查后发布的新版本立即可见（up-to-date → available「下载更新」+ 新版号）。
- 新增「自动 re-check 失败 → 弹窗仍打开、行进入 error 态「重试」」。
- 新增「downloading 态托盘再点 → 只开弹窗不 re-check、不打断下载」。
- 「check 失败 → error 态」拆为两用例：自动 re-check 失败路径（原断言改为
  打开即 error 态「重试」）+ 手动点「检查更新」失败路径（脚本补第 2 项 up-to-date
  供自动 re-check 消费）。
- 「尚无更新任务」回归用例脚本补 1 项 AVAILABLE（托盘自动 re-check 消费）。
- npm test 414 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（414）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：托盘「检查更新」→ 弹窗打开后两行均自动检查；
      启动时是最新、随后发布新版 → 重开弹窗启动器行显示「下载更新」

## 不做的事

- 不改顶栏入口行为（仍只开弹窗）。
- 不改 llama.cpp 行逻辑（其打开即检查机制保留，含 unconfigured 置灰）。
- 不做定时轮询检查（用户仅要求打开弹窗时对齐行为）。
