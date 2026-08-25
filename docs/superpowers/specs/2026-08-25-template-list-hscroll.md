# 模板列表横向滚动条 —— 设计说明

日期: 2026-08-25 · 状态: 已批准（用户选 A）· 前置: v1.0 规格 §4.2（模板列表 table）、方案 B（固定高度 192px overflow-y:auto）

## 根因（已 CDP 实证）

- `.template-list { height:192px; overflow-y:auto }`：内容超 192px 时出现纵向滚动条（Windows Chromium，宽 ≈7px）。
- `table { width:100%; border-collapse }` 相对父 `.template-list` **content-box**（含 scrollbar gutter）→ table.w = 324px。
- Windows Chromium：content-box 包含 scrollbar gutter；clientWidth 报告为「不含 scrollbar」≈317px → **横向 overflow ≈7px**，出现横向滚动条。
- `overflow-x:hidden` 实测**不消除** scrollW 溢出（只是藏起来）—— 需真正缩 table 宽。

## 方案 A：table width = calc(100% - var(--sb-w, 7px))

- CSS 变量 `--sb-w: 7px`（Windows Chromium scrollbar 宽度）。未来若改 macOS/Firefox overlay scrollbar，只需一处覆盖。
- `.template-list table { width: calc(100% - var(--sb-w, 7px)); }` —— 保留视觉撑满，消除横向 overflow（CDP 实测 hasHScroll=false、tableW=310、btnRight=629）。

## 非目标

- 不改 table 结构（v1.0 spec §4.2 约定）。
- 不改行内按钮/tooltip/既有 `.icon-btn` CSS。
- 不引入新依赖。

## 验收

- CDP 干净 DOM：BASE hasHScroll=true → 应用方案 A 后 hasHScroll=false。
- 全量 vitest 无回归（CSS 不参与单测，但须无语法错误）。