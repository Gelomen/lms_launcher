# 变更：检查更新弹窗「LMS 启动器」行默认显示当前版本号

日期：2026-09-18
状态：已实施（npm test 467 全绿；npm run build 通过）

## 背景与用户诉求

打开「检查更新」弹窗后，「LMS 启动器」名称与「检查更新」按钮之间默认（idle 态）
没有显示当前版本号，而 llama.cpp 行（unknown 态）会显示裸版本号，两行观感不一致。
诉求：LMS 启动器行默认也显示当前版本号。

## 根因

LMS 启动器行的中段文字由七态状态机驱动（UpdateModal.vue middleKind/middleText）：
idle/checking 态 middleKind 返回空 → 中段不渲染。版本号（get_version IPC）此前仅用于
顶栏 winbar 显示，未下发给弹窗。

## 方案

- src/App.vue：updateItems computed 在 LMS 行附带 localVersion（= 顶栏同一 version ref，
  onMounted 经 get_version 取得，获取失败为空）。
- src/modules/UpdateModal.vue：
  - Item 类型新增 localVersion?: string；
  - middleKind 对 idle/checking 返回 'local'（localVersion 缺失时仍返回 ''，中段不渲染，
    保持空白兜底）；
  - middleText 的 'local' 分支返回 localVersion；
  - 模板 class 映射：'local' 与 'latest' 同用 .update-row__latest 灰字样式
    （与 llama.cpp 行 unknown 态裸版本号同款灰字）。
- 其余状态不动：up-to-date「已是最新版本 vX.Y.Z」/ available 与 downloading 显新版号 /
  error 红字 / ready 重启应用，均保持原语义。

改动量：App.vue 1 处；UpdateModal.vue 类型 1 处 + middleKind/middleText 各 1 处 + 模板 class 1 处；
UpdateModal.test.ts 3 个新用例（idle 显示 / idle 无版本不渲染 / checking 显示）。

## 测试

- 新增「idle: 带 localVersion 时中段显示当前版本号（灰字）」：items 携带
  localVersion='0.2.0' → LMS 行中段渲染 .update-row__latest，文本 '0.2.0'。
- 新增「idle: 无 localVersion 时中段不渲染（保持空白兜底）」。
- 新增「checking: 带 localVersion 时中段同样显示当前版本号」。
- LMS 行选择器用 .update-row__middle:not(.llama-middle) 排除 llama.cpp 行自带的中段。
- npm test 467 全绿（30 文件）；npm run build 通过。

## 验收

- [x] npm test 通过（467）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：打开弹窗「LMS 启动器」与「检查更新」按钮之间默认显示 0.2.0

## 不做的事

- 不改 IPC 契约（get_version 原样复用）；不改主进程。
- 不改 llama.cpp 行的任何渲染与检查逻辑。
- 不改 up-to-date / available / downloading / error / ready 各态的中段文案。
