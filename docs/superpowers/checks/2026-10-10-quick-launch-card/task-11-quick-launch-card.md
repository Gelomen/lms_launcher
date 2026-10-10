# 任务 11 · 快捷启动卡片 `QuickLaunch.vue` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 11 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §4 / §9.4 / §11-1 / §12.5
> 前置：任务 1（`nextCopyName`）、任务 2（`ql` 前缀）、任务 3（配置层）、任务 8（`ql.*` 键）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 复用对象确认 | 读 `src/modules/TemplateModule.vue` | `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm` 与长名 fixed 浮层可复用 | ☐ |
| A3 | 按钮样式确认 | 读 `src/modules/LaunchBar.vue:125` | `state.running ? 'btn btn-danger' : 'btn btn-launch'` 同构 | ☐ |
| A4 | 截断工具 | 读 `src/util/truncate.ts:23` | `truncateByWidth(s, budget, grace = 2)`，列表预算 **30** | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/QuickLaunch.vue` | 新建 | 不订阅事件，运行态由 App 下发 | ☐ |
| B2 | `src/modules/QuickLaunch.test.ts` | 新建 | 计划给出的 6 个用例 | ☐ |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ states: Record<string, { running: boolean; stopping: boolean }> }` | ☐ |
| C2 | emits：`{ start: [configId: string]; stop: [configId: string]; changed: [] }` | ☐ |
| C3 | 内部 invoke：`ql_list` / `ql_save`（复制走 `ql_save` + `nextCopyName`） | ☐ |
| C4 | **不订阅** `ql-data` / `ql-exit`（与 `LaunchBar` 同构，单向数据流） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（6 条，见 E） | — | 用例落盘（invoke 用 mock） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/QuickLaunch.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 F 组 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/QuickLaunch.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 空列表显示空态文案（`ql.empty.none`） | 计划 步骤 1 | ☐ |
| E2 | 行显示截断后的名字；长名带 `data-tooltip` 全名（**预算 30**） | 规格 §11-1 | ☐ |
| E3 | 名字含 emoji 且超长时截断**不切断代理对** | 计划 步骤 1 | ☐ |
| E4 | 未运行 = 紫底「启动」；运行中 = 红底「停止」；`stopping` = 「…」且禁用 | 规格 §9.4 | ☐ |
| E5 | 复制插入到**源行正后方**且名字为 `X - copy`（用 `nextCopyName`，不自己拼后缀） | 规格 §5.4 | ☐ |
| E6 | `invalid` 非空时显示「N 条配置无效」提示（`ql.invalid`） | 规格 §5.2 | ☐ |
| E7 | 每行按钮顺序 = `[复制][编辑][启动/停止]` | 规格 §4 | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | 复用 `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm`，不新造一套行样式 | 计划 步骤 3 | ☐ |
| F2 | 启动按钮 `.btn-launch`（紫）/ 运行中 `.btn-danger`（红），图标 `faRocket` / `faStop` | 计划 步骤 3 | ☐ |
| F3 | 长名 tooltip 用模板卡同款 `position: fixed` 浮层 | 计划 步骤 3 | ☐ |
| F4 | 卡片标题「快捷启动」+ 新建图标按钮（`faFileCirclePlus` / `.icon-btn--sm`） | 规格 §4 | ☐ |
| F5 | 全部文案走 `t()` | G6 | ☐ |
| F6 | 不做拖动排序 / 命令历史 / 工作目录字段 | G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/QuickLaunch.vue src/modules/QuickLaunch.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(module): 快捷启动卡片（列表/复制/编辑/启动停止）` | ☐ |

## I. 完成判据

- [ ] E1-E7 有测试
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
