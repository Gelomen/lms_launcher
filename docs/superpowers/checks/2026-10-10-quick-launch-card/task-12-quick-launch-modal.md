# 任务 12 · 弹窗 `QuickLaunchModal.vue` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 12 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.4 / §5.3 / §6.1
> 前置：任务 3（`ql_save` 校验语义）、任务 4（`ql_terminals`）、任务 8（`ql.modal.*`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 复用对象确认 | 读 `src/modules/TemplateModal.vue` | 遮罩 / 头部 / footer 类名与 `Dropdown`、`ConfirmDialog` 组件可复用 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/QuickLaunchModal.vue` | 新建 | 表单 + 校验回显，不写文件（保存走 `ql_save`） | ☐ |
| B2 | `src/modules/QuickLaunchModal.test.ts` | 新建 | 计划给出的 6 个用例（invoke 用 mock） | ☐ |
| B3 | `src/modules/QuickLaunch.vue` | 修改（挂载接线） | **弹窗由卡片持有**（索引 K29）：`import QuickLaunchModal` + 本地 `modalOpen`/`editingId`，新建/编辑按钮打开它并回填；`saved`/`deleted` → 重拉 `ql_list` + `emit('changed')`。不改弹窗内部、不改 `App.vue`（索引 K29 / 与既有 `TemplateModule.vue:11` 同构） | ☐ |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ open: boolean; id: string \| null; entry: QuickLaunchEntry \| null }`。**`id` 必须可为 `null`**（索引 K31(1)）：本表 E8 要求「新建态 `id` 传 `null`」，卡片侧 `editingId` 就是 `string \| null`（`QuickLaunch.vue:42`）——计划 :422 原写 `id: string` 与 E8 自相矛盾，已更正（出处：本表 E8 / `QuickLaunch.vue:42` / 索引 K31(1)） | ☐ |
| C2 | emits：`{ saved: []; deleted: [id: string]; close: [] }` | ☐ |
| C3 | invoke：`ql_terminals`（`open` 变 true 时拉取，`main.ts:1104` → `TerminalInfo[] {id, path}`，`quick-launch-terminals.ts:17-20`）、`ql_save`（`main.ts:1095`，返回 `string`：空串 = 成功）、`ql_delete`（`main.ts:1100`，不存在 → 抛 `VALIDATION:`）、`ql_pick_exe`（`main.ts:1139` → `string \| null`，取消 = `null`不改表单）。**保存按钮必须单飞**（索引 K14(2)：`ql_save(id=null)` 重复点击会生成两条新配置；`saving` 标志 + `:disabled`，与 `TemplateModal.vue:442` 同构）（出处：规格 \|8 / 索引 K14(2)） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（6 条，见 E） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 复用 `TemplateModal.vue` 类名与 `Dropdown`；`open` 变 true 时拉 `ql_terminals` 并回填表单 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 默认类型为「命令行」→ 显示终端下拉 + 命令输入框 | 计划 步骤 1 | ☐ |
| E2 | 切到「可执行程序」→ 隐藏终端与命令，显示 exe 路径 + 选择按钮 | 计划 步骤 1 | ☐ |
| E3 | 终端下拉来自 `ql_terminals`；**加载中禁用**并用 `placeholder = t('ql.modal.terminal.loading')`（`Dropdown.vue:22-24` 支持 `disabled`/`placeholder`）。**顺序不重排**：按主进程返回序 powershell/cmd/pwsh/wsl（`quick-launch-terminals.ts:107-113`），预选第一项可用；标签取 `ql.term.*`（`dict.ts:158-161`/`:500-503`）。**M1 关闭**（索引 K31(3)：规格与计划都没要求 pwsh 优先，要改先改规格 §6.1） | 规格 §9.4 / §6.1 / 索引 K31(3) | ☐ |
| E4 | 名字为空 → 保存被拦下并显示错误文案（`ql.err.nameRequired`） | 规格 §5.3-1 | ☐ |
| E5 | 主进程返回 `VALIDATION:` 重名 → 错误区显示**主进程返回的文案**（`errMsg(e)`，即 `err.ql.nameDup` = 「名字「X」已存在」，`dict.ts:310`/`:652`）且**不关窗、不冒泡 `saved`**。**不在渲染端把 `VALIDATION:` 映射成 `ql.err.nameTaken`**（索引 K31(2)：主进程文案带名字、与 `TemplateModal` 错误区口径一致；`ql.err.nameTaken` 因此未被引用，登记为冗余键不删——无 unused-key 门，删它要同步任务 8 表 C8） | 规格 §5.3-2 / 索引 K31(2) | ☐ |
| E6 | 仅编辑态显示删除按钮；删除需 `ConfirmDialog` 二次确认 | 规格 §9.4 | ☐ |
| E7 | 保存成功 → emit `saved` 并关窗，父组件负责刷新列表 | 计划 emits | ☐ |
| E8 | 新建态 `id` 传 `null`（由主进程生成 `ql` 前缀 id） | 规格 §5.4 | ☐ |
| E9 | **卡片接线（B3）**：点卡片「新建」→ 弹窗以空表单打开；点行内「编辑」→ 以该条回填打开；弹窗 `saved` → 卡片重拉列表并冒泡 `changed`；`deleted` → 该行消失且冒泡 `changed`；`close` → 只关窗不改动 | 索引 K29 / 规格 §9.4 | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | 类型与终端都用既有 `Dropdown` 组件，不手写 select | 规格 §9.4 | ☐ |
| F2 | 右下紫色保存；编辑态左下删除 | 规格 §9.4 | ☐ |
| F3 | 终端标签用任务 8 F5 的**字面量查表**（`TERM_LABEL[id]()`），不写 `t('ql.term.' + id)`；主进程只给 `{id, path}` | 规格 §6.1 / 任务 8 F5 | ☐ |
| F4 | 校验以主进程为准：前端只做「空名」这类即时提示，不复制六条规则 | 规格 §5.3 | ☐ |
| F5 | 不加启动参数 / 工作目录 / 多发行版 WSL 字段 | G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/TemplateModal.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(module): 新建/编辑启动弹窗（类型二选一 + 终端探测 + 删除确认）` | ☐ |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☐ |

## I. 完成判据

- [ ] E1-E9 有测试（E9 = 卡片挂载接线，索引 K29）
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
