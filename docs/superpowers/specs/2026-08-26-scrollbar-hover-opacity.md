# 滚动条透明度两态（idle 隐形 / hover 浮现）设计

日期：2026-08-26　状态：已批准（用户批注定稿：idle=0%，hover=5%）

## 目标

所有可滚动列表的滚动条平时完全隐形；鼠标 hover 到容器任意位置时，滚动条浮现为约 5%
透明度的浅灰，作为轻提示。纯 CSS 实现，无 JS。

## 范围

三个可滚动容器，各自独立响应自身 :hover（不做全局联动）：

| 选择器 | 位置 |
|---|---|
| .dropdown-panel | components/Dropdown.vue 的 <ul>（下拉选项列表） |
| .template-list | modules/TemplateModule.vue（参数配置列表） |
| .log-view | modules/LogPanel.vue（日志区） |

## 行为矩阵

| 状态 | WebKit thumb | Firefox scrollbar-color |
|---|---|---|
| 默认 idle | rgba(0,0,0,0) | transparent transparent |
| 容器 :hover | rgba(0,0,0,0.05) | rgba(0,0,0,.05) transparent |

thumb 几何不变：width/height 10px、border-radius 5px、border 2px var(--card) 留白；
轨道背景保持 transparent。

## 改动清单（仅 src/style.css，§#12 滚动条段）

1. 全局基线 *::-webkit-scrollbar-thumb：background #CDD3D8 → rgba(0,0,0,0)。
2. 删除现有 *::-webkit-scrollbar-thumb:hover { background: #AEB5BD }（第三态歧义，
   hover 语义统一交给容器 :hover）。
3. 新增三条规则：.log-view:hover / .template-list:hover / .dropdown-panel:hover
   的 ::-webkit-scrollbar-thumb → rgba(0,0,0,0.05)。
4. Firefox 段：.log-view, .modal-box, .template-list { scrollbar-color: #CDD3D8 transparent }
   改为三容器各写 base（transparent transparent）+ :hover（rgba(0,0,0,.05) transparent），
   并给 .dropdown-panel 补上同套规则。
5. .modal-box 无自身滚动条，从 Firefox 规则中移除，不留悬空条目。

## 不动的部分

- JS、组件模板、DOM 结构零改动。
- thumb 宽度/圆角/留白、track 透明度均不变。

## 验证

1. npm run dev：肉眼确认三处滚动条静止时隐形；鼠标进容器任意位置浮现淡灰；移开回落隐形。
2. npm test 全绿（CSS 不在 vitest 覆盖内，防组件/构建回归）。

## 回退余量

若 5% 观感偏弱，仅调整 :hover 数值即可（例如回 0.2），不涉及结构变化。
