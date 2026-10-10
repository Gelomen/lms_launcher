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

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ open: boolean; id: string; entry: QuickLaunchEntry \| null }` | ☐ |
| C2 | emits：`{ saved: []; deleted: [id: string]; close: [] }` | ☐ |
| C3 | invoke：`ql_terminals`（`open` 变 true 时拉取）、`ql_save`、`ql_delete`、`ql_pick_exe` | ☐ |

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
| E3 | 终端下拉来自 `ql_terminals`；**加载中禁用**（`ql.modal.terminal.loading`） | 规格 §9.4 | ☐ |
| E4 | 名字为空 → 保存被拦下并显示错误文案（`ql.err.nameRequired`） | 规格 §5.3-1 | ☐ |
| E5 | 主进程返回 `VALIDATION:` 重名 → 错误区显示「名字已存在」且**不关窗** | 规格 §5.3-2 | ☐ |
| E6 | 仅编辑态显示删除按钮；删除需 `ConfirmDialog` 二次确认 | 规格 §9.4 | ☐ |
| E7 | 保存成功 → emit `saved` 并关窗，父组件负责刷新列表 | 计划 emits | ☐ |
| E8 | 新建态 `id` 传 `null`（由主进程生成 `ql` 前缀 id） | 规格 §5.4 | ☐ |

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

## I. 完成判据

- [ ] E1-E8 有测试
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
