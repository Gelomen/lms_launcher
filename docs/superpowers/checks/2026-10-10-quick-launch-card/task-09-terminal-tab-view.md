# 任务 9 · `TerminalTabView.vue`（xterm 终端页签） — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 9 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.3 / §11 / §12.5 · 钉住审查重点 **R2**（隐藏时 fit）与 **R5**（Ctrl+C vs 复制）
> 前置：任务 5（依赖已装）、任务 8（`ql.terminal.*` / `ql.btn.closeTab` 键已存在）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 依赖可用 | `ls node_modules/@xterm/xterm` | 5.5.0 + 三个 addon 在 | ☐ |
| A3 | 尺寸链复用对象 | 读 `src/modules/LogTabView.vue` 与 `src/style.css` 的 `.log-pane` / `.log-view` | 外壳类名与尺寸链可复用 | ☐ |
| A4 | 接口口径（**已定**） | 对照计划 §任务 9 props 与规格 §9.3 props | 以计划 props 为准：含 `label` / `fullLabel`，**不含 `configId`**；需要 configId 的地方一律由 `id` 去掉 `ql:` 前缀反解（见 F7）。规格 §9.3 的 `configId` 字段不实现 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/TerminalTabView.vue` | 新建 | 只管一个终端实例，不碰 App 状态 | ☐ |
| B2 | `src/modules/TerminalTabView.test.ts` | 新建 | **必须 `vi.mock('@xterm/xterm')` + 三个 addon**（G8） | ☐ |

## C. 接口契约（与计划 §任务 9 逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ id: string; label: string; fullLabel: string; closable: boolean; closeDisabled: boolean; register: (id: string, sink: (d: string) => void) => void; unregister: (id: string) => void; onInput: (id: string, data: string) => void; onResize: (id: string, cols: number, rows: number) => void }` | ☐ |
| C2 | emits：`{ close: [id: string] }` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（6 条，见 E） | — | 用例落盘且全部 mock xterm | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/TerminalTabView.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 F 组实现口径 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/TerminalTabView.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 挂载时 `register(id, sink)`，卸载时 `unregister(id)` | 规格 §9.2 / §12.5 | ☐ |
| E2 | sink 收到数据 → 写到终端实例（`term.write`） | 规格 §12.5 | ☐ |
| E3 | `term.onData` → `onInput(id, data)`；模拟 xterm 触发 `\\x03` → `onInput` 收到 `\\x03`（**R5：Ctrl+C 原样送达**） | 计划 审查重点 5 | ☐ |
| E4 | **R2**：`element.offsetWidth === 0` 时不调用 `fit` / `onResize`；恢复宽度后调用并上报尺寸 | 计划 审查重点 2 | ☐ |
| E5 | `Ctrl+Shift+C` 走复制、**不**送终端；`Ctrl+C` **不**被拦截（用 `attachCustomKeyEventHandler` 捕获到的处理器直接断言返回值） | 规格 §9.3 | ☐ |
| E6 | `closeDisabled === true` 时 `[x]` 禁用（tooltip「请先停止」） | 计划 审查重点 3 | ☐ |
| E7 | `Ctrl+Shift+V` / 右键 = 粘贴，走 `clipboard_read`（`file://` 下 `navigator.clipboard` 不可靠） | 规格 §8 / §9.3 | ☐ |
| E8 | 工具条：清空（`term.clear()`）+ 查找输入框 + 上/下 + 计数 | 规格 §9.3 | ☐ |
| E9 | 链接点击 → `invoke('open_external', uri)` | 规格 §9.1 | ☐ |

## F. 实现口径（不得随意改）

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | `Terminal({ scrollback: 5000, fontSize: 13, fontFamily: 'var(--font-mono)' })` + `FitAddon` + `SearchAddon` + `WebLinksAddon((e, uri) => invoke('open_external', uri))` | 计划 步骤 3 / 规格 §9.3 | ☐ |
| F2 | 尺寸：`ResizeObserver` + `fit()` → `onResize`；`v-show` 保活，隐藏期间不 fit | 规格 §9.3 | ☐ |
| F3 | 键盘：`attachCustomKeyEventHandler` 按规格 §9.3 | 规格 §9.3 | ☐ |
| F4 | 所有文案走 `t()`（`ql.terminal.*` / `ql.btn.closeTab` / `ql.tab.closeBlocked`） | G6 | ☐ |
| F5 | 版本钉 5.5.0，不升 6.x | 规格 §9.5 | ☐ |
| F6 | 单测里 xterm 真实渲染**不在**范围（只测接线） | 规格 §12.5 | ☐ |
| F7 | `configId` 反解口径：`id.slice(QL_TAB_PREFIX.length)`（`QL_TAB_PREFIX = 'ql:'`，见任务 10 C1）；不新增 `configIdFromTabId` 之类的 API，也不给组件加 `configId` prop | 用户确认（批注 2） | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/TerminalTabView.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src/modules/LogTabView.test.ts` | 全 PASS（静态页签不受影响） | ☐ |
| G3 | `npx vitest run src-main/i18n` | 全 PASS（无新增硬编码文案） | ☐ |
| G4 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/TerminalTabView.vue src/modules/TerminalTabView.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(module): xterm 交互终端页签（输入/尺寸/查找/复制粘贴）` | ☐ |

## I. 完成判据

- [ ] E1-E9 全部有测试（E3/E4/E5 是 R2/R5 的钉桩，缺一条即未完成）
- [ ] F1-F6 口径一致
- [ ] G1-G4 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A4 | 接口口径决定 |  |  |
| D2 |  |  |  |
| D4 |  |  |  |
