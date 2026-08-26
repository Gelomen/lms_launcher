# 启动控制配置下拉截断 + 完整名 tooltip —— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户对话原需求：与模板行名相同优化、阈值改 10）· 前置: 任务 15 模板行名截断（同机制先例）

## 需求（用户原文拆解）

给「启动控制」下拉菜单做与模板行名相同的优化，显示最大字符改为 10：
1. >10 字 → 前 10 字 + …（U+2026）。
2. hover 弹小提示，样式同「编辑」按钮 tooltip。
3. tooltip 显示完整名字。

## 方案（已批准 = 用户原拆解直接落地）

- **截断在 JS（LaunchBar）**：TRUNC_AT=10；options computed 每项 { value, label=前10字+…, tip=完整名(>10 才有) }；
  triggerTip computed = 选中项的 tip → Dropdown :tip prop。短名无 tip、无省略号。
- **tooltip 机制（Dropdown 共享组件）**：trigger 按钮与面板 li 各自携带 data-tooltip=完整名 + hover 弹
  .dd-tip 悬浮层（position:fixed, getBoundingClientRect 视口坐标，上方居中）；移出/关面板即清。
  样式同「编辑」按钮 / .tpl-tip（#374151 底白字 12px 圆角 z-30 pointer-events:none）。
- **为何 fixed**：.dropdown-panel max-height 116px + overflow:auto 会裁剪行内 absolute 浮层（与模板列表同款问题）。
- **Dropdown 改动最小化**：options 加可选 tip 字段、新增可选 tip prop；TemplateModal 等既有调用方不传 tip → 行为不变。

## 非目标

- 不改 TemplateModal options/boolean 行的下拉行为。
- 不改 selected 值语义（id 仍是数据 key）。

## 验收

1. RED→GREEN：LaunchBar.test.ts（trigger 截断+data-tooltip=全名 / li 截断+tip / 短名无 tooltip）+ Dropdown.test.ts（hover 弹 .dd-tip、移出清除）。
2. 全量 vitest 62/62 PASS + npm run build EXIT=0。
3. GUI 目检：长配置名单行带 …，hover trigger/面板项出深灰 tooltip 完整名。
