# 任务 12 简报 · 新建/编辑弹窗 `QuickLaunchModal.vue`（含卡片挂载接线）

完成判据以 check 表为准：docs/superpowers/checks/2026-10-10-quick-launch-card/task-12-quick-launch-modal.md（A1-A2 / B1-**B3** / C1-C3 / D1-D4 / E1-**E9** / F1-F5 / G1-G3 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §5.3 / §6.1 / §8 / §9.4。计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 12（:418-438，接口行已按 K31(1) 更正）。

## 起点（已实测）

- HEAD = `8b79057`，工作区干净。全量基线：`npm test → Test Files 46 passed / Tests 782 passed`，exit 0。
- 弹窗外壳复用（**照抄类名，不新造**）`src/modules/TemplateModal.vue`：`:358` `<div v-if="open" class="modal-overlay">`、`:361-364` `.modal-head`/`.modal-title`/`.modal-close`、`:369` `.modal-body`、`:422` `.modal-actions`、`:442` `<button class="modal-save" :disabled="saving"`（右下紫色保存 + **单飞标志 `saving`**）。
- 二次确认复用 `src/components/ConfirmDialog.vue`：props `{ open, title, message, tone?, confirmText?, tipName?, tipFull? }`（`:17-28`），emits `confirm`/`close`（`:30`，`close` = 仅关窗无副作用）。调用写法见 `TemplateModal.vue:469-473`（`tone="danger"` + `@confirm="doDelete"`）。
- 下拉复用 `src/components/Dropdown.vue`：props `{ value, options: {value,label,tip?}[], tip?, disabled?, placeholder? }`（`:16-25`），`emit('update:value', v)`（`:26`）。**`disabled` + `placeholder` 就是「探测中…」的实现**（E3）。
- 主进程契约（**不改**）：`src-main/main.ts:1104` `ql_terminals → TerminalInfo[]`（`{id, path}`，`src-main/quick-launch-terminals.ts:17-20`）；`:1095` `ql_save(id | null, entry) → string`（**空串 = 成功**，否则 `VALIDATION:`/`YAML:`/`STATE:` 前缀文案）；`:1100` `ql_delete(id)`（不存在 → 抛 `VALIDATION:`）；`:1139` `ql_pick_exe() → string | null`（取消 = `null`，**不改表单**）。
- 文案键**全部已存在**（任务 8）：`ql.modal.newTitle/editTitle/name/type/type.shell/type.exe/terminal/terminal.loading/cmd/exe/btn.pick/btn.save/btn.delete/delete.title/delete.message`（zh `dict.ts:167-184`，en `:509-526`）、终端标签 `ql.term.pwsh/powershell/cmd/wsl`（zh `:158-161`，en `:500-503`）、`ql.err.nameRequired`（`:182`/`:524`）。**不得新增键**。渲染端 `import { t } from '../i18n'`（索引 K20）。
- 卡片侧现状（任务 11 已提交）：`src/modules/QuickLaunch.vue:41-48` 已有 `modalOpen`/`editingId`（`string | null`）与 `openNew()/openEdit(id)`，**尚未 import 弹窗**——本任务的 B3 就是补上挂载与接线。

## 接口契约（C1-C3，逐字）

`ts
props: { open: boolean; id: string | null; entry: QuickLaunchEntry | null }  // id = null → 新建（K31(1)）
emits: { saved: []; deleted: [id: string]; close: [] }
```
- **C1 的 `id` 必须可为 `null`**（索引 K31(1)）：本表 E8 要求新建态传 `null`，卡片 `editingId` 就是 `string | null`；计划原写 `id: string` 与 E8 自相矛盾，已更正。
- **保存按钮必须单飞**（索引 K14(2)）：`ql_save(null, …)` 重复点击会生成两条新配置 → `saving` 标志 + `:disabled`，与 `TemplateModal.vue:442` 同构。

## TDD（D1-D4）：先写失败用例（用例名 snake_case）

1. `defaults_to_shell_type_with_terminal_dropdown_and_cmd_input`（E1）
2. `switching_to_exe_hides_terminal_and_cmd_shows_path_and_pick_button`（E2）
3. `terminal_options_come_from_ql_terminals_and_are_disabled_while_loading`（E3：加载中 `disabled` + `placeholder = t('ql.modal.terminal.loading')`；**顺序不重排**，按主进程返回序；标签走字面量查表 `TERM_LABEL[id]()`，不写 `t('ql.term.' + id)`——F3/任务 8 F5）
4. `empty_name_blocks_save_and_shows_ql_err_nameRequired`（E4：前端只做空名这类即时提示，其余六条规则交主进程，F4）
5. `duplicate_name_from_main_process_shows_its_message_and_keeps_modal_open`（E5：错误区显示 `errMsg(e)` 即「名字「X」已存在」，**不关窗、不冒泡 `saved`**；**不要**把 `VALIDATION:` 映射成 `ql.err.nameTaken`，索引 K31(2)）
6. `delete_button_only_in_edit_mode_and_requires_confirm_dialog`（E6：新建态无删除；点删除只开 `ConfirmDialog tone=danger`，点[确认]才 `invoke('ql_delete')`，点[取消]/遮罩不产生副作用）
7. `save_success_emits_saved_and_closes`（E7）
8. `new_entry_passes_id_null_to_ql_save`（E8：`ql_save(null, entry)`，新 id 由主进程生成）
9. **B3 卡片接线**：`card_mounts_modal_and_refreshes_on_saved_deleted`（E9：点卡片「新建」→ 弹窗以空表单打开；点行内「编辑」→ 以该条回填打开；弹窗 `saved` → 卡片重拉 `ql_list` 并冒泡 `changed`；`deleted` → 该行消失且冒泡 `changed`；`close` → 只关窗不改动）

## 口径（F1-F5）

- F1：类型与终端都用 `Dropdown`，不手写 `<select>`。
- F2：右下紫色保存（`.modal-save`）；**编辑态**左下删除。
- F3：终端标签 = 字面量查表（`TERM_LABEL` 映射四个 `t('ql.term.xxx')`），主进程只给 `{id, path}`。
- F4：校验以主进程为准，前端只做空名即时提示，**不复制六条规则**。
- F5：不加启动参数 / 工作目录 / 多发行版 WSL 字段（规格 §2 非目标）。
- **K31(3)（关闭 M1）**：终端下拉**不重排**，按主进程返回序 powershell/cmd/pwsh/wsl（`quick-launch-terminals.ts:107-113`），预选第一项可用。规格与计划都没要求 pwsh 优先——要改先改规格，不得在渲染端顺手扩范围。
- **K29**：弹窗归卡片持有（B3 就是这件事）：`QuickLaunch.vue` 里 `import QuickLaunchModal` + 已有 `modalOpen`/`editingId` 接线；**卡片 emits 仍是 `start/stop/changed`，不加 `new`/`edit` 事件**；卡片既有 7 条用例一字不改（`git diff --numstat` 对 `QuickLaunch.test.ts` 应为 0 改动或纯追加）。
- **K21(1)**：`key-coverage` 连注释一起扫，注释里别写 `t('字面量')` 形态；**K20**：词典只有一份。

## 明确不做（越界即打回）

- 不改 `src/App.vue`（任务 13）、不改主进程（`src-main/**` 一字不动）、不改 `src/style.css`（弹窗类名已存在；若必须改才能不出格，停下来报告）、不改 `LogPanel`/`TerminalTabView`。
- 不新增 i18n 键；不做 exe 文件对话框本体（`ql_pick_exe` 已在主进程）。
- 不 `git add`、不 commit（K5）。

## 门（跑完把命令与真实输出填进 check 表 J 段；A-I 的勾留给我，K25）

- G1 `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts` → 全 PASS（卡片 7 条必须仍绿）
- G2 `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS（未新增键）
- G3 `git diff --name-only` → 只含 B1-B3
- 额外：`npm test` → 基线 46 files / 782 tests 之上只增不减；`npx tsc -p tsconfig.main.json --noEmit` → exit 0
- 变异自检至少四处：① 去掉 `saving` 单飞守卫 → 「连点两次只保存一次」必须红；② 去掉加载中的 `disabled`/`placeholder` → E3 必须红；③ 删除按钮直接删（不开 `ConfirmDialog`）→ E6 必须红；④ 卡片不接 `saved`（不重拉列表）→ E9 必须红。逐条还原后报 SHA。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-12-report.md（先红/后绿计数、每条 E 对应哪个用例名、变异各红几条、疑虑清单）。不派子代理。
回传给我（简短）：状态一行 + 三条门与额外门的真实计数 + 四处变异各红几条 + 疑虑（若有）。