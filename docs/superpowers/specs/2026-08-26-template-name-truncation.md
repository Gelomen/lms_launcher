# 模板行名截断 + 完整名 tooltip —— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户对话原需求拆解即本方案；当日复报：**列表行名最大字符 25 → 10**）· 前置: 行卡片化（tpl-row）、desc 展示（c0c1ecf）、编辑按钮自绘 tooltip

## 需求（用户原文拆解）

1. 模板列表列文字过长时换行撑高该行，很丑 → 限制最大显示为 25 个字符。
2. 超出的部分以 …（U+2026 单字符省略号）代替。
3. 鼠标悬停该行（名字列）弹小提示，样式与「编辑」按钮 tooltip 一致。
4. 该 tooltip 显示完整名字。

## 方案（已批准 = 用户原拆解直接落地）

- **截断在 JS**：rowName(id) = desc||id；len>25 → 前 25 字 + …(U+2026)；否则原文。
  纯 CSS ellipsis（max-width + text-overflow）在 happy-dom/组件测试无法验证，JS 截断可直接断言。
- **tooltip 同款视觉**：深灰 #374151 底白字、12px(--fs-label)、行高 1.4、padding 2px 8px、圆角 6px、z-index 30、pointer-events:none —— 全部取自 .icon-btn::after。
- **tooltip 位置机制差异（必要）**：编辑按钮用 absolute ::after（按钮左侧，避开 .template-list overflow 上裁剪）。
  行名 tooltip 若用 absolute 会随滚动出裁剪/漂移问题，故采用 **position:fixed 浮层**（.tpl-tip div）：
  mouseenter 时取 getBoundingClientRect() 视口坐标（上方居中），mouseleave 清空。fixed 跟随视口、不受滚动容器裁剪。
- **data-tooltip 携带规则**：仅 len>25 的行名 span 带 data-tooltip=完整名字（与按钮同款属性机制）；
  短名不带——无需提示。
- **CSS 双保险**：.tpl-row__id 改 white-space:nowrap + overflow:hidden（原 word-break:break-all 正是换行撑高的根因），
  即便未来截断阈值调整，行高也被钉死在单行。

## 非目标

- 不改编辑按钮/新建模板 tooltip 机制。
- 不改 desc 展示逻辑（c0c1ecf）。
- 不动 .template-list 固定高度与滚动条方案。

## 验收

1. 组件测试：长名（>25）截断为前 25 字 + …、data-tooltip=完整名；短名原样、无 data-tooltip；CSS 契约 nowrap+hidden。
2. 全量 vitest 绿 + npm run build EXIT=0。
3. GUI 目检：长模板名单行带 …，hover 出深灰 tooltip 显示完整名字（与编辑按钮提示同风格）。
