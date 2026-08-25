# 模板卡片高度对齐左列 —— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户：「减少这个卡片的高度, 让高度等于左边两个卡片叠加的高度」；追加要求「我要能滚动的列表」）· 前置: v1.2 任务 11（.template-list 固定高度方案 B，192px）、任务 13（行卡片化 44px/条）

## 现状（CDP 实测）

- 左列 stack = 目录卡(125) + gap(12) + 启动控制卡(99) ≈ 236–237px，全恒定、无动态增长。
- 右卡固定高 ≈ 267px：h2 块 40 + .template-list 192px → 比左列高 ≈ 30px，模板少时底部留白、两列不齐。

## 方案（用户批准）

回归任务 11 的**固定高度容器架构**（可滚动列表），仅改高度值：

- .template-list: height 192px → **161px**；右卡自然高 = padding 32 + h2 块 40 + list 161 ≈ 237px = 左列 stack，两列视觉齐平。
- overflow-y:auto 维持：多模板超出 161px → 列表内部滚动条（行卡 44px/条）；不足留白。
- 非方案（实测否决）：flex:1/subgrid/stretch 撑高 —— grid auto row 会追踪右列内容 max-content，多模板（12 条注入实测）把整行拉到 631px，违背等高目标且列表失去滚动；min-height:0 / overflow:hidden / basis:0 均无法收口。

## 非目标

- 不改左列两卡任何尺寸；不改行卡片结构、Tooltip、弹窗（Teleport 到 body）。
- 不引入新依赖。

## 验收（CDP 实测）

1. 空模板：右卡 h=237 = stack h=237 ✅；list 161px 无滚动 ✅。
2. 多模板（12 行注入）：卡片 h=237 不变、hasVScroll=true（内部滚动条出现）✅。
3. vitest 55/55 PASS + npm run build EXIT=0 ✅。
