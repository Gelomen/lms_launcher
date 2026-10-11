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
| C3 | 对外暴露（**主代理批准，索引 K23(2)**）：`defineExpose({ fit, focus })`。理由：任务 13 表 E5 要求「自动激活 + `fit()` + 聚焦」，而任务 13 的 B 段只能改 `App.vue` / `style.css` / `App.test.ts`，改不到本组件 → 不暴露就没有别的途径。除此之外不得再暴露内部状态 | ☐ |

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
| E9 | **首帧必须把尺寸上报**：`fit()` 成功后调用 `onResize(id, cols, rows)`（→ `ql_resize`）。主进程 `start()` 不带尺寸、按 **80×24 兜底**建 PTY（索引 K11(2)），不上报则终端一直按 80×24 排版 | 索引 K11(2) / 规格 §7.3 | ☐ |
| E10 | 链接点击 → `invoke('open_external', uri)`（**编号更正**：主代理先前追加首帧尺寸那条时误写成第二个 E9，现改为 E10；E9 = 首帧必须上报尺寸） | 规格 §9.1 | ☐ |

## F. 实现口径（不得随意改）

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | `Terminal({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace" })` + `FitAddon` + `SearchAddon` + `WebLinksAddon((e, uri) => invoke('open_external', uri))`。**`fontFamily` 已更正（索引 K23(1)）**：原写的 `'var(--font-mono)'` 在测量路径上不解析——`node_modules/@xterm/xterm/src/browser/services/CharSizeService.ts:29-33` 优先选 `TextMetricsMeasureStrategy`，`:122` 拼成 canvas 的 `ctx.font = "13px var(--font-mono)"`（canvas 不解析 CSS 变量 → 无效值被忽略、按 canvas 默认字体量格子），而 5.5.0 默认的 DomRenderer 渲染时 CSS 变量会解析 → 网格与字形不匹配（真机留白/溢出）。字面量栈必须与 `src/style.css:29` 的 `--font-mono` **逐字同值**，代码里加注释指向该行（注释里不得出现字面量 t() 形态，K21(1)） | 计划 步骤 3 / 规格 §9.3（均已同步更正） | ☐ |
| F2 | 尺寸：`ResizeObserver` + `fit()` → `onResize`；`v-show` 保活，隐藏期间不 fit | 规格 §9.3 | ☐ |
| F3 | 键盘：`attachCustomKeyEventHandler` 按规格 §9.3 | 规格 §9.3 | ☐ |
| F4 | 所有文案走 `t()`（`ql.terminal.*` / `ql.btn.closeTab` / `ql.tab.closeBlocked`） | G6 | ☐ |
| F5 | 版本钉 5.5.0，不升 6.x | 规格 §9.5 | ☐ |
| F6 | 单测里 xterm 真实渲染**不在**范围（只测接线） | 规格 §12.5 | ☐ |
| F8 | **尺寸上报去重 + 强制重报**（主代理批准，索引 K23(3)）：`onResize` 只在 `cols`/`rows` 变化时上报（避免每次 ResizeObserver 回调都打 `ql_resize`）；但**必须**提供强制重报的路径（`fit(force)`）——「页签还在、PTY 被停止后重新 `start()` 重建为 80×24」时尺寸没变却必须重报，否则新 PTY 停在 80×24（K11(2)）。这条要求有独立用例 | ☐ |
| F9 | `Ctrl+Shift+C` 在**无选中**时仍返回 `false`（不进终端、也不复制）：规格未规定归属，取「不产生终端输入」这一侧（主代理批准，索引 K23(4)） | ☐ |
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

- [ ] E1-E10 全部有测试（E3/E4/E5 是 R2/R5 的钉桩，缺一条即未完成；E9 首帧上报尺寸是 K11(2) 的下游硬门）
- [ ] F1-F6 口径一致
- [ ] G1-G4 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git rev-parse --short HEAD` + `git status --porcelain` | `1d35691`；输出只有一行 `M docs/superpowers/checks/2026-10-10-quick-launch-card/task-09-terminal-tab-view.md`（= 主代理把第二个 E9 改编号为 E10 的那处更正，先于本任务存在，diff 已核对只动 E10 行与 I 段一行） | 除主代理的文档更正外工作区干净；本任务未碰任何既有代码 |
| A2 | 读 `package.json` devDependencies + `node_modules/@xterm/*/package.json` | `@xterm/xterm 5.5.0` / `addon-fit 0.10.0` / `addon-search 0.15.0` / `addon-web-links 0.11.0`，四份 typings 都在；`node_modules/@xterm/xterm/` 含 `css lib typings` | 依赖可用；F5 不升 6.x ✓ |
| A3 | 读 `src/modules/LogTabView.vue:133-183`、`src/style.css:184-233`、`:262-273` | 高度链 = `.log-panel`(flex column) → `.log-pane`(flex:1 min-height:0 padding:8px) → `.log-view`(flex:1 overflow-y:auto 等宽 13px)；工具条 markup 与 `.log-search` / `.icon-btn` / `.log-search-count` / `.btn-search-*` 类名可直接复用 | 复用对象确认；实现未新增任何 CSS 规则（只在挂载点内联 `overflow: hidden` 关掉重复滚动条） |
| A4 | 接口口径决定 | props 逐字取 C1（含 `label`/`fullLabel`，**无 `configId`**）；emits 只有 `close: [id]`；本任务没有任何地方需要 configId → 未造 `id.slice(QL_TAB_PREFIX.length)` 反解，也没新增 API（F7）。`label`/`fullLabel` 落在根节点的 `data-tab-id` / `data-tab-label`（`.vue:187`），供任务 10/13 定位页签 | 与 K2 / A4 一致 |
| D1 | 写 `src/modules/TerminalTabView.test.ts`（402 行 / 18 条用例） | 首行 `// @vitest-environment happy-dom`；`vi.mock` 四个模块：`@xterm/xterm` + 三个 addon（`.test.ts:102-105`）+ `../ipc`（`:109`，样板 LogTabView.test.ts:10-11）；另把 `ResizeObserver` 换成假实现以捕获回调（happy-dom 有实现但拿不到回调） | 用例落盘且全部打桩 ✓ |
| D2 | `npx vitest run src/modules/TerminalTabView.test.ts` | exit 1；`❯ src/modules/TerminalTabView.test.ts (0 test)`；`Test Files 1 failed (1)`；`Tests no tests`；`Error: Failed to resolve import "./TerminalTabView.vue" … Does the file exist?` | 先红 ✓（组件不存在 → 整个文件加载失败） |
| D3 | 写 `src/modules/TerminalTabView.vue`（223 行，sha256 前 12 位 `262f12324854`） | F1 逐字见 `:149-154`；尺寸链 `:46-67`；键盘 `:92-100`；剪贴板 `:69-87`；查找 `:103-138`；工具条与 \[x\] 见 `:188-218`；卸载清理 `:168-176`；对外 fit/focus 见 `:178-183` | 见 F 组 |
| D4 | `npx vitest run src/modules/TerminalTabView.test.ts` | 第一轮：exit 0；`✓ …(17 tests) 102ms`；`Test Files 1 passed (1)`；`Tests 17 passed (17)`。第二轮（为「同一页签再次启动要强制重报尺寸」再走一次 TDD）：先加 1 条用例 → `1 failed \| 17 passed (18)`（`expected "spy" to be called 2 times, but got 1 times`）→ 给 fitAndReport/reportSize 加 force 参数 → `Tests 18 passed (18)` | 后绿 ✓（两轮都先红后绿） |
| 变异自检 | 对最终实现临时改四处 → 各跑一次 → 逐字还原（前后 sha256 同为 `262f12324854`，`restored: true`） | ① 去掉 `onMounted` 末尾的 `fitAndReport()` → `3 failed \| 15 passed`（`first_frame_reports_size…`、`exposed_fit_re_reports…`、`same_size_is_not_reported_twice`）；② 去掉 `offsetWidth === 0` 守卫 → `1 failed \| 17 passed`（`hidden_container_skips_fit…`）；③ 把 `Ctrl+C` 也拦下（`return false`）→ `1 failed \| 17 passed`（`ctrl_c_is_not_intercepted…`）；④ `new WebLinksAddon()` 不传处理器 → `1 failed \| 17 passed`（`weblink_activation_opens_uri…`） | E9 / E4 / E5 / E10 的断言确实咬住实现，不是空跑 |
| G1 | `npx vitest run src/modules/TerminalTabView.test.ts` | exit 0；`✓ src/modules/TerminalTabView.test.ts (18 tests) 93ms`；`Tests 18 passed (18)` | ✓ |
| G2 | `npx vitest run src/modules/LogTabView.test.ts` | exit 0；`✓ src/modules/LogTabView.test.ts (21 tests) 91ms`；`Tests 21 passed (21)` | 静态页签不受影响 ✓ |
| G3 | `npx vitest run src-main/i18n src/i18n.test.ts` | exit 0；5 个文件全绿：`index.test.ts` 3、`no-hardcoded.test.ts` 2、`key-coverage.test.ts` 2、`dict.test.ts` 11、`src/i18n.test.ts` 7 → `Tests 25 passed (25)` | 新组件的字面量 key 全部命中词典、占位符名与词典一致、无新增硬编码文案 ✓ |
| G4 | `git diff --name-only`；`git status --porcelain` | 已跟踪改动只有 `docs/superpowers/checks/…/task-09-terminal-tab-view.md`（主代理的 E10 更正 + 本次填写的 J 段）；未跟踪新增只有 `src/modules/TerminalTabView.vue` 与 `src/modules/TerminalTabView.test.ts` | 代码改动 = B1-B2，无越界 ✓ |
| 额外取证 | `npm test`（全量，非本任务门，V5 在任务 13 才要求） | `Test Files 45 passed (45)`；`Tests 762 passed (762)`（含本任务 18 条） | 无跨文件回归 |
