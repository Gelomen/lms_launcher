# 模板弹窗 options 下拉选项截断 —— 设计规格

日期: 2026-08-26 · 状态: 已批准（用户对话原需求：下拉菜单的选项最大字符数量也改为 10，超出的显示为 …）· 前置: 任务 16（启动控制配置下拉同机制）、任务 17（.dd-tip 挪位右侧）

## 需求（用户原文拆解）

模板弹窗内 options 类型行（-ctk / --spec-type / --load-mode 等）的下拉**选项**：
1. >10 字 → 前 10 字 + …(U+2026)。
2. hover tooltip 显示完整值（沿用 .dd-tip，已挪位右侧垂直居中）。
3. 提交 yaml 的值必须是原始完整串——截断仅展示层。

## 方案（与 LaunchBar 任务 16 同机制，最小改动）

- **TemplateModal**：TRUNC_AT=10；truncOpt() → { label=前10字+…, tip=完整值(>10 才有) }；
  optionRows computed 构建各 options 行的 Dropdown 选项表；triggerTip(k)=选中项的 tip → :tip prop。
  value 始终是原始选项串（fill/save 路径不动）——保存契约不变。
- **Dropdown 共享组件零改动**：options.tip / :tip 字段任务 16 已具备，.dd-tip 悬浮层任务 17 已挪位右侧。
- boolean 行（false/true）短串恒不截断；text/file 行不涉及选项。

## 非目标

- 不改 config.ts params_options 数据（完整选项值仍写入 yaml）。
- 不新增 CSS（.dd-tip / .dd-tip--flip 已就位）。

## 验收

1. RED→GREEN：TemplateModal.test.ts —— li[0] 截断+data-tooltip=全值 / li[1] 短名无 tooltip / save_config args values.ctk=完整长串。
2. 全量 vitest 65/65 PASS + npm run build EXIT=0。
3. GUI 目检：新建/编辑模板 → options 行长选项单行带 …，hover trigger/面板项右侧弹深灰 tooltip 全值；保存后 yaml 值为完整串。
