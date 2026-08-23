# 计划 —— 启动参数模板列表固定高度 + 内部滚动（方案 B）

**目标：** TemplateModule 的模板列表区域改为固定高度容器，超出内容内部滚动（定制滚动条），卡片高度恒定不再撑大。
**规格：** docs/superpowers/spec/2026-08-24-template-list-fixed-height.md（用户已批 B）

## 架构

单文件 UI 变更 + CSS：TemplateModule.vue 的 `<table>` 及状态文案移入 `.template-list` div；style.css 追加 `.template-list`（height 192px / margin-top 8px / overflow-y auto），Firefox scrollbar-color 选择器追加该类。无 IPC/主进程改动、无新依赖。

## 任务

### 任务 1：RED 组件测试 + GREEN 实现

- **步骤 1（RED）**：TemplateModule.test.ts 新增用例 `list_wrapped_in_fixed_height_container`——mount 后 `.module-template .template-list` 存在 1 个、table 在其内。
- **步骤 2**：`npx vitest run src/modules/TemplateModule.test.ts` → 新用例失败（container not found）。
- **步骤 3（GREEN）**：TemplateModule.vue 模板改写：missing/error/table/暂无配置包进 `<div class="template-list">`，原 table 的 `margin-top: 8px` 内联样式移除（改由 CSS 承载）。
- **步骤 4**：style.css 追加：
  ```css
  /* ---- #模板列表固定高度（方案 B）：6 行占位、超出内部滚动；卡片高度恒定 ---- */
  .template-list {
    height: 192px; /* ≈6 行模板（30px/行），不足留白、不收缩 */
    margin-top: 8px;
    overflow-y: auto;
  }
  ```
  并将 Firefox 选择器 `.log-view, .modal-box` → `.log-view, .modal-box, .template-list`（保持同一行 scrollbar-width/color 规则）。
- **步骤 5**：`npx vitest run` 全绿 + `npx tsc --noEmit`（渲染端无 ts 编译则跳）+ `npm run build`（vite build 验证 CSS 可处理）。
- **步骤 6**：dev 窗口目检 4 项验收（≤6 条留白 / ≥7 条出滚动条 / MISSING 态恒定 / 日志区不被挤）——需用户在 GUI 确认或我截图佐证；若无法开 Electron dev，则以 CSS 推理 + vite build 绿为准并向用户说明。

## 提交

- 1 commit：`feat: 模板列表固定高度容器（6 行占位+内部滚动，方案 B）`
