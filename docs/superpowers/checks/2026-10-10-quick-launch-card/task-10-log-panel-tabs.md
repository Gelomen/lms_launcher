# 任务 10 · 页签条支持两种页签 + `[x]` + 横向滚动 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 10 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.1 / §9.2 / §11-2 · 钉住审查重点 **R3**（运行中页签被关掉 → 孤儿 PTY）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 既有页签模型 | 读 `src/modules/log-tabs.ts` 与 `src/modules/LogPanel.vue` | 静态 `LOG_TABS` 保留，不删不改语义 | ☐ |
| A3 | 既有页签测试基线 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | 改动前先全绿（作为对照基线） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/log-tabs.ts` | 修改 | 保留 `LOG_TABS`，新增前缀工具与类型 | ☐ |
| B2 | `src/modules/LogPanel.vue` | 修改 | 按 `tabs` 渲染两种内容 + `[x]`（`faXmark`，本组件内 `library.add`） | ☐ |
| B3 | `src/style.css` | 修改 | `.tab-bar` 横向滚动 | ☐ |
| B4 | `src/modules/LogPanel.test.ts` | 追加 5 条 | 既有用例不改 | ☐ |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | `export const QL_TAB_PREFIX = 'ql:';` / `export function qlTabId(configId: string): string` | ☐ |
| C2 | `export type LogTabKind = 'text' \| 'terminal';` | ☐ |
| C3 | `export interface LogTabItem { id: string; label: string; fullLabel: string; kind: LogTabKind; closable: boolean; closeDisabled: boolean; configId?: string }` | ☐ |
| C4 | `LogPanel` props：`tabs: LogTabItem[]`、`buckets: Record<string, LogEntry[]>`；emits：`clear: [id]`、`close: [id]`，并透传 terminal 的 `register/unregister/onInput/onResize` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（5 条，见 E） | — | 用例落盘（terminal 用例 mock 掉 xterm） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/LogPanel.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 F 组 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `kind: 'text'` 渲染 `LogTabView`，清空行为不变（既有用例继续通过） | 规格 §9.1 | ☐ |
| E2 | `kind: 'terminal'` 渲染 `TerminalTabView`（mock xterm） | 规格 §9.1 | ☐ |
| E3 | 仅 `closable` 的页签渲染 `[x]`；`closeDisabled` 时禁用（**R3**） | 计划 审查重点 3 | ☐ |
| E4 | 点击 `[x]` 冒泡 `close(id)` | 计划 步骤 1 | ☐ |
| E5 | 页签多于 6 条时页签条不换行（断言 `.tab-bar` 的 nowrap 类/样式） | 规格 §11-2 | ☐ |
| E6 | 静态两页签（`launcher` / `llama-server`）能力与代码不受影响 | 规格 §9.1 结论 | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | `.tab-bar` 加 `overflow-x: auto; flex-wrap: nowrap`；页签不被压扁 | 规格 §11-2 | ☐ |
| F2 | 切换页签时对激活页签 `scrollIntoView({ inline: 'nearest' })` | 规格 §11-2 | ☐ |
| F3 | 关闭图标用 `faXmark`，在本组件内 `library.add` | 计划 步骤 3 | ☐ |
| F4 | 长名截断沿用 `truncateByWidth`：页签预算 16、列表行预算 30；`fullLabel` 供 tooltip | 规格 §11-1 | ☐ |
| F5 | 页签文案走 `t()` | G6 | ☐ |
| F6 | 不改 `LogTabView.vue` 内部实现（规格 §9.1「不改」） | 规格 §9.1 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B4 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/log-tabs.ts src/modules/LogPanel.vue src/style.css src/modules/LogPanel.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(log): 页签条支持文本/终端两种页签 + 关闭按钮 + 横向滚动` | ☐ |

## I. 完成判据

- [ ] E1-E6 有测试；E3/E5 是 R3 与页签溢出的钉桩
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A3 | 基线 |  |  |
| D2 |  |  |  |
| D4 |  |  |  |
