# 规格 — 日志卡片 [清空日志] 图标按钮（2026-08-28）

## 需求（用户原始表述）

日志卡片 [自动滚动] 勾选框右边添加 [清空日志] 按钮：
1. 按钮没有文字，使用 icon；
2. icon 复用编辑模板弹窗左下角的删除图标（FontAwesome trash-can regular，即
   TemplateModal .btn-delete 的 byPrefixAndName.fat['trash-can'] / faTrashCan）；
3. 点击后清空**当前标签页**的所有日志（只清本 tab 桶，另一 tab 不受影响）。

## 设计决策

- **DOM 位置**：LogTabView 首行（自动滚动 checkbox 所在 flex 行）内、checkbox
  label 右侧。每个 tab 一个实例（LogTabView 每 tab 一个实例，天然 per-tab）。
- **按钮形态**：无文字 + aria-label="清空日志" + data-tooltip="清空日志"
  （.icon-btn::after 的既有 tooltip 语言，与模板卡片 [新建] 按钮同款），
  复用 style.css 既有 .icon-btn（32×32、hover 浅灰）+ 新增 --noborder 修饰类（去灰色外框、hover 不改变底色，用户 2026-08-28 追加）。
- **事件链**：LogTabView emit('clear') → LogPanel 透传 emit('clear', tabId)
  → App 处理。事件带 tab id，App 只清空该桶。
- **App 端清空**：logBuckets.value[tabId].splice(0)（原地清空，保持引用身份；
  两桶互不挤占的既有语义不变）。无 IPC——日志仅存在于渲染端内存，主进程无需知悉。
- **自动滚动交互**：清空后 lines 为空 → 视图自然停底；自动滚动状态（每 tab 自持）
  不清空，勾选框保持用户设置。LogTabView 的首行身份 watch 信号在清空后
  lines[0] → null，不触发误滚（空桶无内容可滚）。
- **FontAwesome**：LogTabView 新增 import faTrashCan（free-regular）+
  library.add（与 TemplateModal/App 同口径：regular 优先）。

## 后续追加（用户 2026-08-28）

1. 按钮去灰色外框（.icon-btn--noborder）。
2. 按钮 hover 不改变底色（.icon-btn--noborder:hover background: transparent）。
3. 「自动滚动」label 文字不可被选择（user-select: none——UI chrome，区别于 .log-view 可选可复制的日志正文）。

## 测试契约（LogPanel.test.ts）

1. 每个 tab 面板内渲染一个 aria-label=清空日志 的按钮（共 2 个）。
2. 点击 llama-server tab 的清空按钮 → emitted('clear') = ['llama-server']；
   点击 launcher tab 的 → ['launcher']。
3. （GREEN 后目视）清空仅影响当前 tab 桶。
