# 变更：检查更新弹窗卡片左上/右上圆角丢失修复

日期：2026-09-16
状态：已实施（npm test 418 全绿；vite build 通过，产物 CSS 已验证）

## 背景与用户诉求

检查更新弹窗（UpdateModal）卡片左上角与右上角的 12px 圆角丢失，顶缘呈直角（用户截图，
像素分析确认：顶缘两角无内缩，底缘两角圆弧正常）。

根因：提交 bf9698f（2026-09-16）将 llama.cpp 版本下拉改为共享 Dropdown 组件时移除了
.update-card 的 overflow:hidden——向下展开的 .dropdown-panel 会被卡片圆角裁切。移除后，
卡片顶缘由 .update-head（背景与卡片同为 --card、自身无圆角）构成：左上角直了；右上角
当时仅由 .update-close 自身的 border-top-right-radius 兜底，但该按钮 36px 宽且 hover 变红底，
兜底不完整（且左上无任何兜底元素）。

## 方案

- src/modules/UpdateModal.vue 的 .update-head 增加
  border-top-left-radius / border-top-right-radius: var(--radius-card)：
  标题栏自身兜底顶缘两侧圆角。不恢复卡片 overflow:hidden（否则 Dropdown 弹层再被裁）；
  内容区 padding 16px 无贴角元素，标题栏高度 32px > 圆角 12px，无副作用。
  右上角与 .update-close 的 border-top-right-radius 同值对齐（两元素同一角上重叠，视觉无缝）。

改动量：UpdateModal.vue 样式 2 处（.update-head 规则 + 注释）；UpdateModal.test.ts 新增 1 个布局回归用例。

## 测试

- 新增用例「布局：.update-head 自带顶部左右圆角（卡片去掉 overflow:hidden 后顶缘圆角不丢）」：
  读组件源码断言 .update-head 规则含 border-top-left-radius 与 border-top-right-radius: var(--radius-card)
  （happy-dom 不注入 SFC 样式，与既有布局回归用例同手法）。修复前红、修复后绿。
- npm test 418 全绿（30 文件）；vite build 通过，dist/assets/index-*.css 中
  .update-head 已含两条 border-top-*-radius 规则。

## 验收

- [x] npm test 通过（418）
- [x] vite build 通过 + 产物 CSS 验证
- [ ] 用户真机 npm run dev 目检：弹窗左上/右上角圆角恢复

## 不做的事

- 不恢复 .update-card 的 overflow:hidden（会重新裁剪 Dropdown 向下展开的弹层）。
- 不改卡片圆角值 / 其他弹窗；不改 Dropdown 组件（其弹层裁剪行为由 .dropdown-panel 自身负责）。
