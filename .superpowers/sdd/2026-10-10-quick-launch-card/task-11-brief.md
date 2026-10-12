# 任务 11 简报 · 快捷启动卡片 `QuickLaunch.vue`

完成判据以 check 表为准：docs/superpowers/checks/2026-10-10-quick-launch-card/task-11-quick-launch-card.md（A1-A4 / B1-**B3** / C1-C4 / D1-D4 / E1-E7 / F1-**F7** / G1-G3 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §4 / §5.2-§5.4 / §9.4 / §11-1 / §12.5。计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 11（:394-414，步骤 1/5 已按 K28 更正）。

## 起点（已实测）

- HEAD = `a4dd3ca`，工作区干净。全量基线：`npm test → Test Files 45 passed / Tests 775 passed`，exit 0。
- 复用对象（照抄其样式与手法，不新造一套）：
  - `src/modules/TemplateModule.vue:173-190`：`.tpl-rows` / `.tpl-row` / `.tpl-row__id`（长名带 `data-tooltip` + hover 自绘 `.tpl-tip` 浮层）/ `.tpl-row__actions`；新建按钮 `:151`（`icon-btn icon-btn--sm` + `faFileCirclePlus`）。
  - `src/modules/TemplateModule.vue:71-95`：**复制的完整流程**——`copying` 单飞标志 → 取新 id → `nextCopyName(src.name, taken)` → 保存 → **本地按现有键序把新行插到源行正后方**（:86-93）→ `emit('changed')`；失败进 `error` 区、列表不变。
  - `src/modules/LaunchBar.vue:125-128`：`state.running ? 'btn btn-danger' : 'btn btn-launch'` + `faRocket`/`faStop`（`:4`/`:14` 的 `library.add`）。
  - `src/util/truncate.ts:23` `truncateByWidth(s, budget, grace = 2)`；**列表行预算 30**（模板卡用 25，本卡按规格 §11-1 用 30）；tooltip 只在真截断时挂（`LaunchBar.vue:93` 的 `grace=2` 口径）。
  - `src/util/copy-name.ts:6` `nextCopyName(base: string, taken: Set<string>): string`（任务 1 已建，**不得自己拼 `- copy`**）。
  - `src/ipc.ts:48` `invoke<T>(cmd, ...args)`，另有 `errMsg`/`isMissing`/`isValidation`。
  - 主进程契约（**不改**）：`src-main/main.ts:1090` `ipcMain.handle('ql_list', () => QuickLaunchList)`；`:1095` `ql_save(id | null, entry) => string`（空串 = 成功，否则 `VALIDATION:`/`YAML:`/`STATE:` 前缀文案）。类型在 `src-main/quick-launch-config.ts:12-16`：`QuickLaunchEntry { name, type, shell?, cmd?, exe? }`、`QuickLaunchList { items: Record<string, QuickLaunchEntry>, invalid: string[] }`（渲染端引类型可用 `import type … from '../src-main/quick-launch-config'`，与 `src/i18n.ts:3` 同一先例）。
  - 文案键**全部已存在**（任务 8）：`ql.title`/`ql.empty.none`/`ql.invalid`/`ql.btn.new`/`ql.btn.copy`/`ql.btn.edit`/`ql.btn.start`/`ql.btn.stop`（zh `dict.ts:148-157`，en `:490-499`）。渲染端 `import { t } from '../i18n'`（索引 K20）。**不得新增键**（唯一例外见 B3）。

## 接口契约（C1-C4，逐字）

`ts
props: { states: Record<string, { running: boolean; stopping: boolean }> }
emits: { start: [configId: string]; stop: [configId: string]; changed: [] }
```
- 列表数据**自己** `invoke('ql_list')`（`onMounted` + 每次 `changed` 后重拉）；运行态由 App 经 `states` 下发（C1）。
- **C4：不订阅 `ql-data`/`ql-exit`**（与 `LaunchBar` 同构，单向数据流）。
- 复制走 `invoke('ql_save', null, entry)` + `nextCopyName`（C3）。

## TDD（D1-D4）：先写 6 条失败用例（用例名 snake_case，与同仓其它测试一致）

1. `empty_list_renders_empty_state_text`（E1，`ql.empty.none`）
2. `row_name_is_truncated_to_budget_30_and_long_name_carries_full_tooltip`（E2）
3. `emoji_long_name_is_not_split_at_surrogate_pair`（E3：代理对不被切断——`truncateByWidth` 已按码点处理，用例是钉桩）
4. `start_stop_button_three_states_by_states_prop`（E4：未运行 = `.btn-launch` 紫「启动」；`running` = `.btn-danger` 红「停止」；`stopping` = 「…」且 `disabled`）
5. `copy_uses_nextCopyName_and_inserts_locally_right_after_source`（E5，见 K28(1)）
6. `invalid_ids_render_count_hint`（E6，`ql.invalid` 带 `{n}`）
再加 E7：`row_action_buttons_order_is_copy_edit_start_stop`。

**E5 的准确口径（索引 K28(1)）**：`qlSave` 落盘是**追加**语义（`quick-launch-config.ts:137-139`），没有 insert-after 通道；「源行正后方」= **卡片本地重排**，与 `TemplateModule.vue:86-93` 同一手法（遍历现有键序、源 id 后插入新 id）。断两件事：名字来自 `nextCopyName`（`X - copy`，重名时 `X - copy 2`）+ 本地显示序里新行紧跟源行。**不要**为此加 IPC 参数或改主进程。

## 口径（F1-F7）

- F1/F2/F3/F4：样式与图标全部复用既有类名（`.tpl-row` 系、`.icon-btn--sm`、`.btn-launch`/`.btn-danger`、`faRocket`/`faStop`/`faFileCirclePlus`、`position: fixed` 长名浮层）。**不改 `src/style.css`**（类名已存在；若你发现必须改才能不出格，停下来报告）。
- F5：所有文案 `t('字面量')`。**K21(1)**：`key-coverage` 连注释一起扫，注释里别写 `t('字面量')` 形态。
- F6：不做拖动排序 / 命令历史 / 工作目录字段（规格 §2 非目标）。
- **F7 / K29**：弹窗归**卡片**持有——本任务只留本地 `modalOpen`/`editingId`（新建/编辑按钮写它），**不 import** `QuickLaunchModal`（任务 12 才存在，挂载接线在任务 12 的 B3/E9）。emits 不加 `new`/`edit`。
- **B3（索引 M2 / K28(2)）**：`src-main/i18n/dict.ts:492` 的 en `ql.invalid` 由 `{n} invalid entries skipped` 改为 `invalid entries skipped: {n}`（n=1 时原句语法不成立）。**只改这一行**；zh 不动、不新增键。改完必须跑 i18n 门。

## 明确不做（越界即打回）

- 不改 `src/App.vue`（任务 13）、不改 `src/modules/QuickLaunchModal.vue`（任务 12）、不改 `src/modules/LogPanel.vue`/`log-tabs.ts`/`style.css`、不改主进程（`src-main/**` 只允许 `dict.ts` 那一行）。
- 不新增 i18n 键；不做弹窗本体。
- 不 `git add`、不 commit（K5）。

## 门（跑完把命令与真实输出填进 check 表 J 段；A-I 的勾留给我，K25）

- G1 `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` → 全 PASS
- G2 `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS（B3 改了 en 文案，这条必须过）
- G3 `git diff --name-only` → 只含 B1-B3
- 额外：`npm test` → 基线 45 files / 775 tests 之上只增不减；`npx tsc -p tsconfig.main.json --noEmit` → exit 0
- 变异自检至少三处：① 把本地重排的「源 id 后插入」改成直接追加到末尾 → E5 必须红；② 把 `stopping` 分支去掉 → E4 必须红；③ 把 `invalid` 提示删掉 → E6 必须红。逐条还原后报 SHA。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-11-report.md（先红/后绿计数、每条 E 对应哪个用例名、变异各红几条、疑虑清单）。不派子代理。
回传给我（简短）：状态一行 + 三条门与额外门的真实计数 + 三处变异各红几条（各一行）+ 疑虑（若有）。