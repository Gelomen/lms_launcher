# 任务 12 · 弹窗 `QuickLaunchModal.vue` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 12 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.4 / §5.3 / §6.1
> 前置：任务 3（`ql_save` 校验语义）、任务 4（`ql_terminals`）、任务 8（`ql.modal.*`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑（起点实测 HEAD `84fe0b9` 干净；基线我实测 `npm test = 46 files / 782 passed`） |
| A2 | 复用对象确认 | 读 `src/modules/TemplateModal.vue` | 遮罩 / 头部 / footer 类名与 `Dropdown`、`ConfirmDialog` 组件可复用 | ☑（`TemplateModal.vue:358-372/:369/:422/:442/:469-473` 与 `Dropdown.vue:16-25`、`ConfirmDialog.vue:17-30` 全部复用，见 `QuickLaunchModal.vue:168/:192-193/:219/:226-227`） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/QuickLaunchModal.vue` | 新建 | 表单 + 校验回显，不写文件（保存走 `ql_save`） | ☑ |
| B2 | `src/modules/QuickLaunchModal.test.ts` | 新建 | 计划给出的 6 个用例（invoke 用 mock） | ☑ |
| B3 | `src/modules/QuickLaunch.vue` | 修改（挂载接线） | **弹窗由卡片持有**（索引 K29）：`import QuickLaunchModal` + 本地 `modalOpen`/`editingId`，新建/编辑按钮打开它并回填；`saved`/`deleted` → 重拉 `ql_list` + `emit('changed')`。不改弹窗内部、不改 `App.vue`（索引 K29 / 与既有 `TemplateModule.vue:11` 同构） | ☑（`QuickLaunch.vue` numstat 16/2；`git diff -- QuickLaunch.test.ts` 为空 = 卡片 7 条一字未改） |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ open: boolean; id: string \| null; entry: QuickLaunchEntry \| null }`。**`id` 必须可为 `null`**（索引 K31(1)）：本表 E8 要求「新建态 `id` 传 `null`」，卡片侧 `editingId` 就是 `string \| null`（`QuickLaunch.vue:42`）——计划 :422 原写 `id: string` 与 E8 自相矛盾，已更正（出处：本表 E8 / `QuickLaunch.vue:42` / 索引 K31(1)） | ☑（`:41` `isEdit = props.id !== null`；我的变异⑥ `props.id ?? ''` = 1 红 E8） |
| C2 | emits：`{ saved: []; deleted: [id: string]; close: [] }` | ☑ |
| C3 | invoke：`ql_terminals`（`open` 变 true 时拉取，`main.ts:1104` → `TerminalInfo[] {id, path}`，`quick-launch-terminals.ts:17-20`）、`ql_save`（`main.ts:1095-1098` + `quick-launch-config.ts:123-141`：**成功 = resolve 最终 id；失败 = reject，消息带 `VALIDATION:`/`YAML:` 前缀**。没有「空串 = 成功」这条路径，`STATE:` 也不在保存路径上——本行原描述有误，索引 K32(1) 已更正）、`ql_delete`（`main.ts:1100`，不存在 → 抛 `VALIDATION:`）、`ql_pick_exe`（`main.ts:1139` → `string \| null`，取消 = `null`不改表单）。**保存按钮必须单飞**（索引 K14(2)：`ql_save(id=null)` 重复点击会生成两条新配置；`saving` 标志 + `:disabled`，与 `TemplateModal.vue:442` 同构）（出处：规格 §8 / 索引 K14(2) / K32(1)） | ☑（含 K32(1) 更正：成功 = resolve id、失败 = reject；单飞 `:124/:132/:219`，我的变异①去守卫 = 1 红 E7） |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（6 条，见 E） | — | 用例落盘 | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | FAIL | ☑（真红 = `Failed to resolve import "./QuickLaunchModal.vue"`，`Tests no tests`，exit 1） |
| D3 | 步骤 3：实现 | — | 复用 `TemplateModal.vue` 类名与 `Dropdown`；`open` 变 true 时拉 `ql_terminals` 并回填表单 | ☑ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全 PASS | ☑（9 passed；G1 合计 78 passed） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 默认类型为「命令行」→ 显示终端下拉 + 命令输入框 | 计划 步骤 1 | ☑ |
| E2 | 切到「可执行程序」→ 隐藏终端与命令，显示 exe 路径 + 选择按钮 | 计划 步骤 1 | ☑ |
| E3 | 终端下拉来自 `ql_terminals`；**加载中禁用**并用 `placeholder = t('ql.modal.terminal.loading')`（`Dropdown.vue:22-24` 支持 `disabled`/`placeholder`）。**顺序不重排**：按主进程返回序 powershell/cmd/pwsh/wsl（`quick-launch-terminals.ts:107-113`），预选第一项可用；标签取 `ql.term.*`（**修复轮 B 起按规格 §11-1 追加的预算 16 截断 + `option.tip` 全名**，索引 K41）（`dict.ts:158-161`/`:500-503`）。**M1 关闭**（索引 K31(3)：规格与计划都没要求 pwsh 优先，要改先改规格 §6.1） | 规格 §9.4 / §6.1 / 索引 K31(3) | ☑（我的变异②去 `:disabled="terminalsLoading"` = 1 红；⑤终端重排 = 1 红 → K31(3) 有牙） |
| E4 | 名字为空 → 保存被拦下并显示错误文案（`ql.err.nameRequired`） | 规格 §5.3-1 | ☑ |
| E5 | 主进程 reject 且消息带 `VALIDATION:`（重名）→ 错误区显示**主进程返回的文案**（`errMsg(e)`，即 `err.ql.nameDup` = 「名字「X」已存在」，`dict.ts:310`/`:652`）且**不关窗、不冒泡 `saved`**。**不在渲染端把 `VALIDATION:` 映射成 `ql.err.nameTaken`**（索引 K31(2)：主进程文案带名字、与 `TemplateModal` 错误区口径一致；`ql.err.nameTaken` 因此未被引用，登记为冗余键不删——无 unused-key 门，删它要同步任务 8 表 C8） | 规格 §5.3-2 / 索引 K31(2) | ☑（按 reject 建模，显示 `errMsg`、不关窗、不冒泡 `saved`；K32(1)） |
| E6 | 仅编辑态显示删除按钮；删除需 `ConfirmDialog` 二次确认 | 规格 §9.4 | ☑（我的变异③删除不开确认框 = 2 红 E6+E9） |
| E7 | 保存成功 → emit `saved` 并关窗，父组件负责刷新列表 | 计划 emits | ☑（我的变异①去单飞守卫 = 1 红） |
| E8 | 新建态 `id` 传 `null`（由主进程生成 `ql` 前缀 id） | 规格 §5.4 | ☑（我的变异⑥ = 1 红） |
| E9 | **卡片接线（B3）**：点卡片「新建」→ 弹窗以空表单打开；点行内「编辑」→ 以该条回填打开；弹窗 `saved` → 卡片重拉列表并冒泡 `changed`；`deleted` → 该行消失且冒泡 `changed`；`close` → 只关窗不改动 | 索引 K29 / 规格 §9.4 | ☑（我的变异④卡片不接 `saved` = 1 红） |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | 类型与终端都用既有 `Dropdown` 组件，不手写 select | 规格 §9.4 | ☑ |
| F2 | 右下紫色保存；编辑态左下删除 | 规格 §9.4 | ☑ |
| F3 | 终端标签用任务 8 F5 的**字面量查表**（`TERM_LABEL[id]()`），不写 `t('ql.term.' + id)`；主进程只给 `{id, path}` | 规格 §6.1 / 任务 8 F5 | ☑（`:46` `TERM_LABEL` 字面量查表，无 `t('ql.term.' + id)`） |
| F4 | 校验以主进程为准：前端只做「空名」这类即时提示，不复制六条规则 | 规格 §5.3 | ☑ |
| F5 | 不加启动参数 / 工作目录 / 多发行版 WSL 字段 | G10 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts` | 全 PASS（B3 改了卡片，卡片 7 条必须一字不改仍绿） | ☑（我复跑 3 files / 78 passed：卡片 7 · 弹窗 9 · TemplateModal 62） |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☑（我复跑 5 files / 25 passed，未新增键） |
| G3 | `git diff --name-only` | 只含 B1-B3 | ☑（代码侧只 B1-B3；check 表 J 段属文档，走独立 docs: 提交） |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.vue` | ☑（`4c518d1`，`git show --stat` 只含这三个文件） |
| H2 | 提交信息逐字 | `feat(module): 新建/编辑启动弹窗（类型二选一 + 终端探测 + 删除确认）` | ☑（逐字用于 `4c518d1`） |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☑（普查本表行：`裸☐=0`、`I段 -[ ]=0`，整体退出码 0） |

## I. 完成判据

- [x] E1-E9 有测试（9 条用例名见 J 段；E9 = 卡片挂载接线，E3/E8 是 K31(3)/K31(1) 的钉桩）
- [x] D2 先红、D4 后绿
- [x] G1-G3 通过 —— 见 J 段与我的门复跑（78 / 25 passed、npm test 47 files / 791 passed、tsc exit 0）
- [x] H1-H2 完成（代码 `4c518d1`；文档另走 docs: 提交）

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain -uall` · `git rev-parse --short HEAD` | 简报写 HEAD = 8b79057，实测 **84fe0b9**（其后只有一笔 docs：84fe0b9 记 K31 三条口径与任务 11 完成，代码状态与简报一致）；工作区只有未跟踪的 task-12-brief.md（简报本身） | 起点干净（唯一未跟踪项就是简报） |
| D1 | 新建 src/modules/QuickLaunchModal.test.ts | 436 行 / 9 条用例（invoke 全 mock；第 9 条挂卡片，见 B3） | 用例落盘 |
| D2 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | `Error: Failed to resolve import "./QuickLaunchModal.vue" … File: …/QuickLaunchModal.test.ts:9:29` · `Test Files 1 failed (1)` · `Tests no tests` · exit 1 | 先红（组件不存在；与任务 9 / 任务 11 的 D2 同形，行为性的红由下面六次变异提供） |
| D3 | 新建 src/modules/QuickLaunchModal.vue（350 行）+ 改 src/modules/QuickLaunch.vue（挂载接线，改后 181 行，`git diff --numstat` = 16 插入 / 2 删除，那 2 行是任务 11 留下的「弹窗待落地」注释） | 外壳类名照抄 TemplateModal（modal-overlay / box / head / body / actions / modal-save / btn-delete），类型与终端走 Dropdown、删除走 ConfirmDialog；`:110` 的 open 监视 = fill() + loadTerminals() | 实现完成 |
| D4 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | `✓ src/modules/QuickLaunchModal.test.ts (9 tests) 99ms` · `Test Files 1 passed (1)` · `Tests 9 passed (9)` · exit 0 | 后绿 |
| G1 | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts` | `✓ QuickLaunch.test.ts (7 tests)` · `✓ QuickLaunchModal.test.ts (9 tests)` · `✓ TemplateModal.test.ts (62 tests)` · `Test Files 3 passed (3)` · `Tests 78 passed (78)` · exit 0 | 通过；卡片 7 条一字不改仍绿（git diff 不含 QuickLaunch.test.ts） |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts`（含本表 G2 的 `src-main/i18n`，另加渲染端 i18n 门） | index 3 · no-hardcoded 2 · key-coverage 2 · dict 11 · i18n 7 → `Test Files 5 passed (5)` · `Tests 25 passed (25)` · exit 0 | 通过；未新增键（`git diff --name-only -- src-main/i18n/dict.ts` 输出为空） |
| G3 | `git diff --name-only` · `git status --porcelain -uall` · `git diff --numstat` · `git diff --name-only -- src-main/i18n/dict.ts src/style.css src/App.vue` | 跑 G3 时（填 J 段之前）跟踪文件只有 `src/modules/QuickLaunch.vue`（B3，numstat 16/2）；未跟踪新增 = `src/modules/QuickLaunchModal.vue` / `.test.ts`（B1/B2）+ 本报告 + 起点就在的 brief；最后一条命令输出为空。填完本表 J 段后 `git diff --name-only` 另含本表（18/2 = 执行记录，前例见任务 11 表 J 段 G3 行） | 代码改动 = B1-B3，无越界；未碰 App.vue / style.css / src-main / LogPanel·TerminalTabView；`QuickLaunch.test.ts` 一字未改（`git diff -- src/modules/QuickLaunch.test.ts` 输出为空） |
| 额外-1 | `npm test` | `Test Files 47 passed (47)` · `Tests 791 passed (791)` · exit 0 | 基线 46 files / 782 tests 之上 +1 文件 / +9 用例，无减少 |
| 额外-2 | `npx tsc -p tsconfig.main.json --noEmit` | `tsc exit=0` | 通过 |
| 变异 ① | 删 `QuickLaunchModal.vue:124` 的 `if (saving.value) return;`（保存单飞守卫，索引 K14(2)） | `× save_success_emits_saved_and_closes` · `Tests 1 failed \| 8 passed (9)` | E7 有牙（恰 1 红：连点两次发了两次 ql_save） |
| 变异 ② | 删终端 Dropdown 的 `:disabled="terminalsLoading"` 与 `:placeholder=…`（:192-193） | `× terminal_options_come_from_ql_terminals_and_are_disabled_while_loading` · `Tests 1 failed \| 8 passed (9)` | E3 有牙（恰 1 红） |
| 变异 ③ | `onDelete()` 改为直接 `void doDelete()`（:145，不开 ConfirmDialog） | `× delete_button_only_in_edit_mode_and_requires_confirm_dialog` · `× card_mounts_modal_and_refreshes_on_saved_deleted` · `Tests 2 failed \| 7 passed (9)` | E6 有牙（E6 + E9 两条红：卡片用例也走删除确认路径） |
| 变异 ④ | 卡片不接 saved：`QuickLaunch.vue:179` 的 `@saved="onModalSaved"` → `@saved="() => { modalOpen = false; }"`（不重拉列表） | `× card_mounts_modal_and_refreshes_on_saved_deleted` · `AssertionError: expected 1 to be greater than 1` · `Tests 1 failed \| 15 passed (16)`（卡片 7 条仍绿） | E9 有牙（恰 1 红） |
| 变异 ⑤（加做） | `loadTerminals` 把探测结果按 id 字典序重排（:99 `terminals.value = found`，索引 K31(3) 的反面） | `× terminal_options_come_from_ql_terminals_and_are_disabled_while_loading` · `Tests 1 failed \| 8 passed (9)` | 「不重排」有牙（恰 1 红） |
| 变异 ⑥（加做） | `invoke('ql_save', props.id ?? '', entry)`（:134，索引 K31(1) 的反面） | `× new_entry_passes_id_null_to_ql_save` · `Tests 1 failed \| 8 passed (9)` | 新建传 null 有牙（恰 1 红） |
| 变异还原 | 六次还原后 `Get-FileHash -Algorithm SHA256` | `QuickLaunchModal.vue` 每次均为 `372CF7FCD79867FFC8DD5072C1C65C270AE0072F22675C0F3456BEA007F52B55`；`QuickLaunch.vue` 均为 `0A34C322A00B7AD17C4F9FB4A30CE50FC6C151732A276172C56DAA56FAFB4056`；还原后复跑 G1 = 78 passed、`npm test` = 47 files / 791 passed | 两份实现文件字节级一致 |
| 报告 | .superpowers/sdd/2026-10-10-quick-launch-card/task-12-report.md | 先红/后绿计数、E→用例映射、六次变异计数、疑虑清单 | 已写 |
