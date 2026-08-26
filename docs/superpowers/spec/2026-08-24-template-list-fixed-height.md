# 规格 —— 启动参数模板列表固定高度 + 内部滚动（方案 B）

> **状态：** v1 已批准（用户在 2026-08-24 会话中于 A/B 两选项中选定 **B：固定高度**）。基线提交 8ceb084。

## 背景

App 布局为上区三卡片 grid + 下区日志区（`.layout` 高 `100vh`，日志区 `flex: 1`）。模块 2「启动参数模板」（TemplateModule）的模板 `<table>` 没有任何高度约束：模板数量一多，卡片被撑高，把下方法志区往下挤压——窗口内容溢出、布局失衡。

用户裁决：**模板列表固定占位高度，超出部分在卡片内部出滚动条；卡片高度恒定**（方案 B，接受模板很少时的留白）。

## 需求（#1）

1. **固定容器**：TemplateModule 内新增 `.template-list` 容器 div，包裹全部列表态内容：
   - 「暂无模板配置」（missing）、错误文案（error）、模板 table、「暂无配置」（空表）——四种状态同处一个固定高度区域，任何状态下卡片高度一致。
2. **尺寸**：`height: 192px`（≈6 行模板，行高 ~30px：4+4 padding + 14px×1.5 line-height）；`margin-top: 8px`（承接原 table 的 margin-top，视觉不漂移）。
3. **滚动**：`overflow-y: auto`；超出 6 行时列表内部出滚动条，不改变卡片高度。
4. **滚动条样式**：复用已落地的 #12 全局滚动条美化（webkit `*::-webkit-scrollbar` 自动覆盖）；Firefox 三件套选择器 `.log-view, .modal-box` → 追加 `.template-list`。
5. **不改**：h2、新建模板按钮行、TemplateModal 一律不动；三卡片 grid 布局不动；不引新依赖。

## 测试契约（RED）

- TemplateModule.test.ts 新增用例：`get_configs` 正常返回时，`.module-template .template-list` div 存在，且 table 位于 `.template-list` 之内（`wrapper.findAll('.template-list table')` 长度 1）。
- happy-dom 无布局引擎，不测像素高度——CSS 尺寸验收走 dev 窗口目检（见计划任务步骤）。

## 验收（dev 窗口）

1. 模板 ≤6 条：卡片高度与 LaunchBar/DirModule 卡片基本持平，列表底部留白，无滚动条。
2. 临时建 ≥7 条模板：「启动参数模板」卡片高度不变，列表区出现定制滚动条，可滚到末尾并正常点「编辑」。
3. 删除全部模板 / 首启 MISSING 态：卡片高度仍恒定，文案显示在固定区域内。
4. 日志区（下区）不再被上区撑挤。

## 范围外（YAGNI）

- 不做拖拽调高、不做记忆高度、不做虚拟滚动——模板数量量级小（yaml 手工维护），192px/6 行足够。
