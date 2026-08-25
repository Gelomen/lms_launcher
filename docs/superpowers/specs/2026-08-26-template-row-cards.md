# 模板配置行卡片化 —— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户选行卡片化）· 前置: 方案 B（.template-list 固定高度 192px）、§4.2 模板列表 table

## 需求（用户原文拆解）

1. 取消当前每条配置的横向分隔线（现有 tr border-top）。
2. 增高每条配置的高度。
3. 给每条配置添加边框。
4. 边框用公共的灰色（--border #E2E5E9，项目卡片边框色）。
5. 边框圆角。

## 方案 A：行卡片化（已批准）

把 TemplateModule 列表中每个 <tr> 改成独立「行卡片」div：

- 结构：每配置一个 .tpl-row div（display:flex; justify-content:space-between; align-items:center），
  左 = 配置 id（font-weight 600），右 = 编辑 icon-btn。外层不再是 table，而是
  <div class="tpl-rows"> 包裹所有行卡片。
- CSS：
  - .tpl-row { border: 1px solid var(--border); border-radius: var(--radius-btn) /*8px*/; padding: 8px 10px; }
  - 行间距由 .tpl-rows { display:flex; flex-direction:column; gap:8px } 提供——行间可见底色分隔，不再需要横向分隔线。
  - 高度：原 30px/行 → 新 ≈ 44px（14px 文字行高 ×1.5 + 上下 8px padding + 2px border），满足「增高」。
- 边框色 = var(--border) #E2E5E9，与卡片 .card、下拉面板、日志面板同色，满足「公共灰」。
- 取消原 tr border-top（table 移除后自然消失）。

## 非目标

- 不改 LaunchBar 配置下拉、TemplateModal 弹窗。
- 不改行内容（仅 id + 编辑按钮；desc/预览不显示是既定行为）。
- 不动 .template-list 固定高度与滚动条方案（行卡片仍在其内滚动）。
- 不引入新依赖。

## 验收

1. CDP / DOM 目检：每配置一行独立圆角灰边框卡片，行间留白、无横向分隔线，行高约 44px（≥原 30px）。
2. 组件测试：渲染出 .tpl-row 行卡片（含 id + 编辑按钮）；不再渲染 table。
3. 全量 vitest 绿 + npm run build EXIT=0。
