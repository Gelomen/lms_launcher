# 任务 10 · 页签条支持两种页签 + `[x]` + 横向滚动 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 10 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.1 / §9.2 / §11-2 · 钉住审查重点 **R3**（运行中页签被关掉 → 孤儿 PTY）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 既有页签模型 | 读 `src/modules/log-tabs.ts` 与 `src/modules/LogPanel.vue` | 静态 `LOG_TABS` 保留，不删不改语义 | ☐ |
| A3 | 既有页签测试基线 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | 改动前先全绿（作为对照基线）；实测基线 `LogTabView 21 + LogPanel 11` | ☐ |
| A4 | **兼容性基线（索引 K26）** | 读 `src/App.vue:373` 与 `src/modules/LogPanel.test.ts:20/:63/:81/:103/:127/:159/:168` | `App.vue` 只传 `:buckets`；测试里 7 处 `mount` 只传 `buckets` → `tabs` 必须可选且有缺省路径 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/log-tabs.ts` | 修改 | 保留 `LOG_TABS`，新增前缀工具与类型 | ☐ |
| B2 | `src/modules/LogPanel.vue` | 修改 | 按 `tabs` 渲染两种内容 + `[x]`（`faXmark`，本组件内 `library.add`） | ☐ |
| B3 | `src/style.css` | 修改 | `.tab-bar` 横向滚动 | ☐ |
| B4 | `src/modules/LogPanel.test.ts` | 追加 9 条（E1-E5/E7/E8 七条 + 定向修复轮补 E9/E10 两条） | 既有 11 条用例与 7 处 `mount` 夹具**一字不改**（靠 C4 的缺省 `tabs`） | ☐ |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | `export const QL_TAB_PREFIX = 'ql:';` / `export function qlTabId(configId: string): string` | ☐ |
| C2 | `export type LogTabKind = 'text' \| 'terminal';` | ☐ |
| C3 | `export interface LogTabItem { id: string; label: string; fullLabel: string; kind: LogTabKind; closable: boolean; closeDisabled: boolean; configId?: string }` | ☐ |
| C4 | `LogPanel` props：`tabs?: LogTabItem[]`（**可选**；缺省 = 由 `LOG_TABS` 生成两个 `'text'` 页签、`closable: false`，索引 K26）、`buckets: Record<string, LogEntry[]>`、`active?: string`（索引 K27(1)）；emits：`clear: [id]`、`close: [id]`、`update:active: [id]`（K27(1)），并透传 terminal 的 `register/unregister/onInput/onResize` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（5 条，见 E） | — | 用例落盘（terminal 用例 mock 掉 xterm） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/LogPanel.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 F 组 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | 全 PASS（既有 11 + 21 条一字未改仍绿 = E6 的证据） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `kind: 'text'` 渲染 `LogTabView`，清空行为不变（既有用例继续通过） | 规格 §9.1 | ☐ |
| E2 | `kind: 'terminal'` 渲染 `TerminalTabView`（mock xterm） | 规格 §9.1 | ☐ |
| E3 | 仅 `closable` 的页签渲染 `[x]`；`closeDisabled` 时禁用（**R3**）。**强度边界（K27(4)）**：去掉 handler 里的 `closeDisabled` 守卫 → 0 红，该行为由 `disabled` 属性保证 | 计划 审查重点 3 | ☐ |
| E4 | 点击 `[x]` 冒泡 `close(id)` | 计划 步骤 1 | ☐ |
| E5 | 页签多于 6 条时页签条不换行（断言 `.tab-bar` 的 nowrap 类/样式） | 规格 §11-2 | ☐ |
| E6 | 静态两页签（`launcher` / `llama-server`）能力与代码不受影响：**不传 `tabs` 时**页签条与两个文本面板照旧（既有 11 条用例一字不改即证） | 规格 §9.1 结论 / 索引 K26 | ☐ |
| E7 | 页签 `title` 只在 `label !== fullLabel` 时挂 `fullLabel`（未截断不挂，与 `LaunchBar.vue:93` 的 `grace=2` 口径同形） | 规格 §11-1 / 索引 K26 | ☐ |
| E8 | **切到别的页签再切回来，terminal 页签不卸载**：断假 xterm 的 `dispose` 与 `unregister` 在切换过程中**没有被调用**（`v-show` 保活） | 索引 K26(4) / 任务 9 表 E1 | ☐ |
| E9 | **受控激活（定向修复轮 1 新增）**：外部改 `active` → 面板切到该页签；点击页签 → 冒泡 `update:active(id)`；不传 `active` 时自持（既有行为不变） | 规格 §9.2「自动激活」/ 索引 K27(1) | ☐ |
| E10 | **激活项被摘掉时回落第一个页签**（关掉当前页签不得让面板空白） | 索引 K27(1) 后半 | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | `.tab-bar` 加 `overflow-x: auto; flex-wrap: nowrap`；页签不被压扁 | 规格 §11-2 | ☐ |
| F2 | 切换页签时对激活页签 `scrollIntoView({ inline: 'nearest' })` | 规格 §11-2 | ☐ |
| F3 | 关闭图标用 `faXmark`，在本组件内 `library.add` | 计划 步骤 3 | ☐ |
| F4 | **职责划分（索引 K26）**：短名由**构造方**用 `truncateByWidth(fullLabel, 16)` 生成并放进 `LogTabItem.label`（构造方 = 任务 13 的 App 接线）；`LogPanel` 只渲染 `item.label`，并在 `label !== fullLabel` 时挂 `title=fullLabel`。**不得在 `LogPanel` 里二次截断**（两处预算会互相抵消）。`TerminalTabView` 根节点的 `data-tab-label`/`data-tab-full-label` 只是测试/调试钩子，页签文案**不从 `data-*` 反取**（索引 M4） | 规格 §11-1 / 索引 K26 / M4 | ☐ |
| F5 | 页签文案走 `t()` | G6 | ☐ |
| F6 | 不改 `LogTabView.vue` 内部实现（规格 §9.1「不改」） | 规格 §9.1 | ☐ |
| F7 | **两种页签的内容一律 `v-show` 保活，terminal 页签不得用 `v-if`**：`TerminalTabView` 卸载即 `unregister` + `term.dispose()`（`TerminalTabView.vue:169-178`），用 `v-if` 就等于「切页签杀终端」；隐藏期间它自己也不 `fit`（任务 9 表 E4） | 索引 K26(4) / 任务 9 表 E1/E4 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` | 全 PASS（既有 11 + 21 + 22 条一字未改仍绿） | ☐ |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B4 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/log-tabs.ts src/modules/LogPanel.vue src/style.css src/modules/LogPanel.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(log): 页签条支持文本/终端两种页签 + 关闭按钮 + 横向滚动` | ☐ |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☐ |

## I. 完成判据

- [ ] E1-E10 有测试；E3/E5 是 R3 与页签溢出的钉桩，E8 是「切页签不杀终端」的钉桩，E9/E10 是「自动激活」与「关页签不空白」的钉桩
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

> 实现者 = 任务 10 子代理；未 `git add`、未 commit（索引 K5）。A-I 的勾留给主代理验收后落（索引 K25）。
> 完整报告：`.superpowers/sdd/2026-10-10-quick-launch-card/task-10-report.md`。

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain` / `git rev-parse --short HEAD` | HEAD = `d3c667e`（简报写 `5ca9cb1`，中间多一条 docs 提交 `d3c667e docs: 账本记录任务 10 起点核对与 K26 四条口径`）；工作区仅未跟踪 `.superpowers/sdd/…/task-10-brief.md` | 通过（起点与简报差一条 docs 提交，已登记报告疑虑 1） |
| A2 | 读 `src/modules/log-tabs.ts` / `src/modules/LogPanel.vue` | `LOG_TABS` 在 :8-11、`LogPanel` 的 props 只有 `buckets`（:7）、页签条 markup :17-21 | 与简报一致 |
| A3 | 基线 `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | `✓ LogTabView.test.ts (21 tests)`、`✓ LogPanel.test.ts (11 tests)` → `Tests 32 passed (32)`，exit 0 | 基线全绿（对照基线成立） |
| A4 | 读 `src/App.vue:373` 与 `LogPanel.test.ts:20/:63/:81/:103/:127/:159/:168` | `<LogPanel :buckets="logBuckets" @clear="onLogClear" />`；7 处 `mount(LogPanel, { props: { buckets } })` 原样在位 | `tabs` 必须可选 → 按 C4 缺省路径实现 |
| D1 | 追加用例（无命令） | 7 条：E1-E5、E7、E8；假 `@xterm/xterm` + fit/search/web-links 打桩（照 `TerminalTabView.test.ts`）+ `ResizeObserver` 空壳 | 用例落盘 |
| D2 | `npx vitest run src/modules/LogPanel.test.ts` | `Tests 6 failed \| 12 passed (18)`，exit 1。红：`terminal_tab_renders_terminaltabview` / `switching_tabs_does_not_unmount_terminal_tab` / `only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled` / `clicking_close_emits_close_with_tab_id` / `tab_bar_does_not_wrap_with_many_tabs` / `tab_title_attribute_only_when_label_differs_from_fullLabel`。第 7 条 E1 特征化用例首跑即绿（索引 K18(1) 口径，红由变异 ①②③④ 提供） | **真红**，D2 通过 |
| D4 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | `✓ LogTabView.test.ts (21 tests)`、`✓ LogPanel.test.ts (18 tests)` → `Tests 39 passed (39)`，exit 0 | 后绿；既有 11 + 21 一字未改仍绿（E6 证据） |
| G1 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` | `Tests 61 passed (61)`（21 + 22 + 18），exit 0 | 通过 |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Tests 25 passed (25)`（index 3 / no-hardcoded 2 / key-coverage 2 / dict 11 / i18n.test 7），exit 0 | 通过；新增的两处字面量 `t()` 调用点进硬门且通过，未新增键 |
| G3 | `git diff --name-only` | `src/modules/LogPanel.test.ts`、`src/modules/LogPanel.vue`、`src/modules/log-tabs.ts`、`src/style.css` | 只含 B1-B4 |
| 额外 | `npx vitest run src/App.test.ts` | `✓ src/App.test.ts (48 tests)` → `Tests 48 passed (48)`，exit 0 | K26(1) 兼容性证据：`App.vue` 一行未改 |
| 额外 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`tsc exit=0` | 通过 |
| 额外 | `npm test`（全量，自查非本任务门） | `Test Files 45 passed (45)` / `Tests 773 passed (773)`，exit 0 | 无回归 |
| 变异 ① | `<TerminalTabView v-else v-show="item.id === active"` → `v-else-if="item.id === active"` | `Tests 3 failed \| 15 passed (18)`：E8 `switching_tabs_does_not_unmount_terminal_tab`（要求红）+ E2 + E4。还原后 `LogPanel.vue` SHA-256/12 = `2a74f18bc1e5`，与变异前一致 | E8 按要求红 |
| 变异 ② | 去掉页签 `[x]` 的 `:disabled="item.closeDisabled"` | `Tests 1 failed \| 17 passed (18)`：E3。还原后 SHA 一致 | E3 按要求红 |
| 变异 ②b（附加） | 去掉 `onCloseClick` 里的 `closeDisabled` 守卫 | `Tests 18 passed (18)` = 0 红：该断言实际由 `disabled` 属性保证（不向 disabled 按钮派发点击），守卫是防御性冗余 → 已按 K24(2) 先例登记强度边界 | 已登记，不造虚构契约 |
| 变异 ③ | `:title` 无条件挂 `item.fullLabel` | `Tests 1 failed \| 17 passed (18)`：E7。还原后 SHA 一致 | E7 按要求红 |
| 变异 ④（附加） | 删 `.tab-bar` 的 `flex-wrap: nowrap; overflow-x: auto` | `Tests 1 failed \| 17 passed (18)`：E5。还原后 `style.css` SHA-256/12 = `32eb9e9c1773`，与变异前一致 | E5 的「CSS 规则文本」断言不空转 |
| E5 断法说明 | — | happy-dom 不加载外部 CSS（computed style 读不到 `style.css`）→ 断的是「10 条页签全部渲染在同一 `.tab-bar` 内」+ `style.css` 里 `.tab-bar` 段含 `flex-wrap: nowrap` / `overflow-x: auto`、`.log-tab` 段含 `flex: none`；另打桩 `HTMLElement.prototype.scrollIntoView` 断切页签时被调用 1 次且参数含 `{ inline: 'nearest' }`（F2）。真机横向滚动外观推到任务 14（规格 §12 硬门 8） | 可证且已被变异 ④ 反证 |

