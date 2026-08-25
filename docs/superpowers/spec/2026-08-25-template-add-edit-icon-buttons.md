# 启动参数模板 ·「新建模板/编辑」图标化 —— 设计说明

日期: 2026-08-25 · 状态: 已批准（口头 ok）· 前置: v1.1 UI 规格、模板列表固定高度方案 B

## 需求

- 「启动参数模板」卡片顶部「新建模板」按钮 → + 号图标按钮，悬停提示「新建模板」。
- 列表行「编辑」文字按钮 → 铅笔图标按钮，悬停提示「编辑」。
- 图标用内联 SVG（不引 fontawesome/任何新 npm 依赖）；tooltip 为自绘 CSS。

## 约束与决策

| 项 | 决定 | 理由 |
|---|---|---|
| 图标库 | 不用，内联 SVG | v1.1 约定「不引新依赖」；用户确认 |
| tooltip | 纯 CSS（::after + data-tooltip） | 立即显示、零 JS、可复用 |
| 范围 | 仅新建 + 编辑两处按钮 | 用户确认；LaunchBar/LogPanel/弹窗不动 |
| a11y | aria-label 同步文案 | 图标无语义文字，读屏/搜索断言都靠它 |

## 行为规格

### B1 顶部「新建模板」

- 元素: button.icon-btn，data-tooltip="新建模板"、aria-label="新建模板"，内含内联加号 SVG。
- 点击行为 = 原 openNew()（editingId=null → 新建弹窗），不变。
- 位置：卡片 h2 下、右对齐容器内，替换原文字按钮。

### B2 列表行「编辑」

- 元素: button.icon-btn.icon-btn--sm，data-tooltip="编辑"、aria-label="编辑"，内含内联铅笔 SVG。
- 点击 = 原 openEdit(id)，不变。替换原 height:24px 文字按钮。

### B3 CSS（style.css 追加新类，不改既有类）

- .icon-btn：32×32（与 --h-control 等高）、白底、1px --control-border 边框、圆角 var(--radius-btn)、图标色 var(--muted)；hover 背景 #F6F7F8、图标变 var(--text)（与 .btn:hover 同语言）。
- .icon-btn--sm：24×24（替代行内编辑按钮原高度）。
- tooltip：.icon-btn::after 取 attr(data-tooltip)，hover 时在按钮上方居中弹出；深灰底白字 12px、圆角 6px、z-index ≥ 20（同下拉弹层）、pointer-events:none、无延迟。
- SVG：默认 16px（--sm 行内 14px）；stroke=currentColor 随按钮文字色变化。

## 测试（TemplateModule.test.ts）

1. 新增用例：顶部存在 button[data-tooltip="新建模板"]；点击后弹窗打开（teleport，h3 文案「新建模板」）。
2. 修改现有用例 list_has_no_delete_and_edit_modal_shows_it：找「编辑」按钮由 b.text()==="编辑" 改为 data-tooltip/aria-label；删除按钮断言不变。
3. 收紧作用域断言：卡片内（不含 teleport 弹窗）不再出现可点击文字「新建模板」「编辑」。

## 非目标

- TemplateModal 弹窗内部零改动（h3、表单、删除按钮都不动）。
- 不引 fontawesome / @fortawesome/*。
- 不改 LaunchBar、LogPanel、DirModule。

## 验收

- npx vitest run 全绿。
- dev 窗口验证：+ 号按钮 hover 显示「新建模板」气泡；铅笔按钮 hover 显示「编辑」气泡；点击行为与原文字按钮一致。