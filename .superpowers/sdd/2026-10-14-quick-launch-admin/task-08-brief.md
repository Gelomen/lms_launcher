任务 8 简报（从 plan 逐字抽取，勿改）

### 任务 8：弹窗两态的「管理员」开关 + 词典键

**改什么**：§6.2。先改测试（含把 `QuickLaunchModal.test.ts:681-683` 的计数器扩到覆盖新控件格），再改组件。

- [ ] **步骤 0：起点核对**：`QuickLaunchModal.vue:60-64`（表单 ref）、`:106-117`（`fill`）、`:149-168`（`save` 的两个 payload）、`:229-245`（shell 态）、`:248-261`（exe 态）、`:291-307`（定高注释与 `min-height`）、`:356-385`（`.flag-grid` / `.row-cell` / `.type-field`）；`TemplateModal.vue:398-406`（开关 markup）、`:567-588`（开关样式）。
- [ ] **步骤 1：先改测试**（`QuickLaunchModal.test.ts`）：
  - 夹具与 payload 断言加 `admin`：`:29`、`:383`、`:407`、`:425`
  - `admin_switch_defaults_off_and_is_a_role_switch`（`role="switch"`、`aria-checked="false"`）
  - `admin_switch_sits_in_the_right_segment_of_the_terminal_row`（同一行内：下拉在前、开关在后；且**不新增网格行**）
  - `admin_switch_row_is_above_the_program_path_row_in_exe_type`
  - `edit_mode_reflects_admin_true_from_the_entry`
  - `save_payload_carries_admin_true_when_toggled`
  - 改 `modal_height_is_fixed_to_the_shell_form_height_in_both_types`：`controlCells` 过滤器加 `.switch-cell` 之外**不需要**（控件格用 `.field-cell`，见 §6.2），但**新增**一行断言「可执行程序态也数到 3 个控件格」
- [ ] **步骤 2：跑红**：`npx vitest run src/modules/QuickLaunchModal.test.ts`。
- [ ] **步骤 3：加词典键**（先改行号大的 en `:519` 之后，再改 zh `:176` 之后，避免行号漂移）：`'ql.modal.admin': '管理员'` / `'Admin'`。
- [ ] **步骤 4：实现组件**：markup + 复制 `.bool-switch` 样式（G15/K15）。`.term-field { flex:1 1 auto; min-width:0 }`、`.switch-cell`、`.admin-label { flex:none; white-space:nowrap }`。
- [ ] **步骤 5：宽度取证**（无头 Chromium，与 218px 同一手法）：520px 弹窗里终端行的下拉可用宽度 ≥ 300px、最长终端标签 `Command Prompt (cmd)` 不被截断、左列宽度与改动前一致（「程序路径」仍是最宽）。输出贴进 check 表 J 段。
- [ ] **步骤 6：跑绿 + G5 + G6 + 全量**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 新建/编辑启动项弹窗的管理员开关（两态各一行）`

---
