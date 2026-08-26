# Dropdown 长名 tooltip 挪位（上方居中 → 元素右侧垂直居中）—— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户对话原需求：启动控制下拉已选选项的 tooltip 在上方被应用窗口裁剪，挪到下拉菜单右侧）· 前置: 任务 16 .dd-tip 悬浮层（spec 2026-08-26-launchbar-dropdown-truncation）

## 需求（用户原文拆解）

「启动控制」下拉选择后，鼠标放在已选选项/面板项上弹出的小提示窗口在**上方**，会被应用窗口裁剪。修改：
1. tooltip 改到下拉菜单的**右侧**。
2. 保持完整名展示与既有深灰视觉语言不变。

## 方案（用户拆解直接落地）

- **坐标（Dropdown showTip）**：默认挂元素右侧垂直居中——left = r.right + 8px、top = r.top + r.height/2；
  CSS .dd-tip transform: translateX(-50%) translateY(-100%) → translateY(-50%)。
- **flip 防出屏**：tooltip 估算宽（CJK 12px/字 × 字数 + padding 余量）放不下右侧视口
  （r.right + 8 + est > innerWidth - 8）→ .dd-tip--flip：left = r.left - 8px，CSS translateX(-100%) translateY(-50%)
  （右缘贴锚点，向左侧展开），不出窗口。trigger 按钮与面板 li 共用同一逻辑（showTip 统一入口）。
- **样式同源**：视觉参数（#374151 底白字/12px/圆角/z-30/pointer-events:none）不动，仅 transform 变体 + JS 锚点。

## 非目标

- 不改 .tpl-tip（模板列表行 tooltip，独立问题域）。
- 不改 label 截断逻辑（任务 16 已交付）。
- 不引入第三方 tooltip 库 / 不做像素级测量（估算宽足够，避免布局抖动）。

## 验收

1. RED→GREEN：Dropdown.test.ts —— hover li 弹 .dd-tip 完整名（存量）+ **右侧定位**（left=右缘+8、top=垂直中心）+ **flip**（贴右视口时 left=左缘-8 + dd-tip--flip 类）。
2. 全量 vitest PASS + npm run build EXIT=0。
3. GUI 目检：长名 hover trigger/面板项 → tooltip 出现在右侧垂直居中，深灰圆角完整名；靠右时无越窗。
