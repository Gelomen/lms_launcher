# 任务 10 报告 · 页签条支持两种页签 + `[x]` + 横向滚动

起点 HEAD：`d3c667e`（简报写的是 `5ca9cb1`，中间多一个 docs 提交 `d3c667e docs: 账本记录任务 10 起点核对与 K26 四条口径`；见「疑虑 1」）。
改动范围（`git diff --name-only`）：`src/modules/log-tabs.ts`、`src/modules/LogPanel.vue`、`src/style.css`、`src/modules/LogPanel.test.ts` —— 与 B1-B4 逐字一致，无其它文件。
未 `git add`、未 commit（口径 K5）。

## 1. 先红 / 后绿（真实计数）

| 步骤 | 命令 | 真实输出 |
|---|---|---|
| A3 基线（改动前） | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | `LogTabView.test.ts (21 tests)` + `LogPanel.test.ts (11 tests)` → **Tests 32 passed (32)**，exit 0 |
| D1 写失败测试 | — | 追加 7 条用例（E1-E5、E7、E8）+ 假 xterm/三 addon 打桩 + ResizeObserver 空壳 |
| **D2 先红** | `npx vitest run src/modules/LogPanel.test.ts` | **Tests 6 failed | 12 passed (18)**，exit 1。红的是：`terminal_tab_renders_terminaltabview`、`switching_tabs_does_not_unmount_terminal_tab`、`only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled`、`clicking_close_emits_close_with_tab_id`、`tab_bar_does_not_wrap_with_many_tabs`、`tab_title_attribute_only_when_label_differs_from_fullLabel` |
| D2 说明 | — | 第 7 条 `text_tab_renders_logtabview_and_clear_behaviour_unchanged`（E1）**首跑即绿**：它是特征化用例（钉「既有行为不变」），旧实现忽略 `tabs` 也照样渲染两个文本页签。与索引 K18(1) 的口径一致：特征化用例的红由变异自检提供（见第 3 节） |
| **D4 后绿** | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` | **Tests 39 passed (39)**（LogPanel 18 = 既有 11 + 新 7；LogTabView 21），exit 0 |

## 2. 门（真实计数）

| 门 | 命令 | 真实输出 |
|---|---|---|
| G1 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` | **Tests 61 passed (61)**：LogTabView 21 + TerminalTabView 22 + LogPanel 18；既有 11+21+22 一字未改仍绿 |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts` | **Tests 25 passed (25)**（index 3 / no-hardcoded 2 / key-coverage 2 / dict 11 / i18n.test 7）——新增的两处字面量 `t()` 调用点进词典硬门且通过 |
| G3 | `git diff --name-only` | 只有 B1-B4 四个文件（另有未跟踪的 `task-10-brief.md`，非本次改动） |
| 额外（K26(1) 兼容性证据） | `npx vitest run src/App.test.ts` | **Tests 48 passed (48)** —— `App.vue:373` 只传 `:buckets`，未改一行 |
| 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | exit 0（无输出） |
| 全量（自查，非本任务门） | `npm test` | **Test Files 45 passed (45) / Tests 773 passed (773)**，exit 0 |

## 3. 变异自检（各红几条）

文件还原用字节级写回 + SHA-256 前 12 位比对，全部 `match = true`。
`LogPanel.vue` 稳定 SHA = `2a74f18bc1e5`；`style.css` 稳定 SHA = `32eb9e9c1773`。

| # | 变异 | 结果 |
|---|---|---|
| ① | 终端页签 `v-else v-show="item.id === active"` → `v-else-if="item.id === active"`（即「切页签杀终端」） | **3 红**：`switching_tabs_does_not_unmount_terminal_tab`（**E8 按要求红**）+ `terminal_tab_renders_terminaltabview`（E2：未激活时终端 pane 不在 DOM）+ `clicking_close_emits_close_with_tab_id`（E4：非激活页签的 [x] 找不到）。还原后 match=true |
| ②a | 去掉页签 `[x]` 的 `:disabled="item.closeDisabled"` 绑定 | **1 红**：`only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled`（**E3 按要求红**）。还原后 match=true |
| ②b（附加） | 去掉 `onCloseClick` 里的 `item.closeDisabled` 守卫 | **0 红**（18 全绿）——见「疑虑 7」：这条断言实际由 `disabled` 属性保证（happy-dom 与真实浏览器都不向 disabled 按钮派发点击），处理器里的守卫是防御性冗余 |
| ③ | `:title` 无条件挂 `item.fullLabel` | **1 红**：`tab_title_attribute_only_when_label_differs_from_fullLabel`（**E7 按要求红**）。还原后 match=true |
| ④（附加） | 删掉 `.tab-bar` 的 `flex-wrap: nowrap; overflow-x: auto` | **1 红**：`tab_bar_does_not_wrap_with_many_tabs`（E5）——证明 E5 的「CSS 规则文本」断言不是空转。还原后 match=true |

## 4. E1-E8 → 用例名对应

| E | 用例名（`src/modules/LogPanel.test.ts`） | 钉法 |
|---|---|---|
| E1 | `text_tab_renders_logtabview_and_clear_behaviour_unchanged` | 显式传两个 `kind:'text'` 页签 → 两个 `.log-pane .log-view`；ERROR 行仍 `ln-err`（着色仍在 LogTabView 内，F6 未改它）；`[清空日志]` 仍按页签 id 冒泡 `clear('llama-server')` |
| E2 | `terminal_tab_renders_terminaltabview` | 假 xterm 打桩（`@xterm/xterm` + fit/search/web-links 三个 addon，照 `TerminalTabView.test.ts`）；断 `register('ql:demo', fn)` 被调、假 Terminal 实例数 = 1、`.log-pane[data-tab-id="ql:demo"]` 存在且带 `display: none`（= 渲染了但 v-show 隐藏）；卸载才 `unregister` |
| E3 | `only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled` | 4 个页签里 3 个 closable → `.tab-bar .btn-close-tab` 恰 3 个；`closeDisabled` 的那个有 `disabled`、另一个没有；点禁用的不冒泡 `close`；**另**：不传 `tabs` 的缺省路径页签条 0 个 `[x]`（K26(1) 的 `closable:false`） |
| E4 | `clicking_close_emits_close_with_tab_id` | 点页签条 `[x]` → `emitted('close') = [['ql:demo']]`；且该页签未被激活（`@click.stop`）；再点终端工具条里的 `[x]`（任务 9 的组件）→ 同样经 LogPanel 冒泡 `close(id)` |
| E5 | `tab_bar_does_not_wrap_with_many_tabs` | 10 条页签（2 text + 8 terminal）全部渲染在同一 `.tab-bar` 内；happy-dom 不加载外部 CSS → 断 `style.css` 规则文本本身：`.tab-bar` 段含 `flex-wrap: nowrap` 与 `overflow-x: auto`、`.log-tab` 段含 `flex: none`（F1「不被压扁」）；并打桩 `HTMLElement.prototype.scrollIntoView` 断切页签时被调用 1 次且参数含 `{ inline: 'nearest' }`（F2）。变异 ④ 证明该断言有效 |
| E6 | 既有 11 条用例 + 7 处 `mount(LogPanel, { props: { buckets } })` **一字未改**（G1 里 11 条仍绿）+ E3 用例里的「缺省无 [x]」断言 | 缺省 `tabs` = 由 `LOG_TABS` 生成两个 `kind:'text'`、`closable:false` 页签（`fallbackTabs`），`LOG_TABS` 本体未删未改语义（A2） |
| E7 | `tab_title_attribute_only_when_label_differs_from_fullLabel` | `label === fullLabel`（含缺省页签）→ 无 `title`；`label !== fullLabel` → `title = fullLabel`；页签文本恰等于构造方给的短名（不二次截断）；另传一个「未截断的长名」断言原样渲染且无 `title` |
| E8 | `switching_tabs_does_not_unmount_terminal_tab` | 切到终端页签 → 切回文本 → 再切过去：`unregister` 未被调用、假 Terminal 实例数仍 = 1、`disposed === false`；`w.unmount()` 之后才 `unregister` 1 次、`disposed === true` |

## 5. 实现要点（对照 F 组）

- **C1-C4**：`QL_TAB_PREFIX` / `qlTabId` / `LogTabKind` / `LogTabItem` 逐字落在 `log-tabs.ts:13-37`；`LOG_TABS`（:8-11）一字未动。`LogPanel` 的 `tabs` 为可选 prop，缺省走 `fallbackTabs`（`log-tabs.ts` 的 `LOG_TABS` → 两个 text 页签、`closable:false`）。
- **C4 的「透传」**：`register/unregister/onInput/onResize` 在 `LogPanel` 上声明为**可选** prop，模板里经 `pipe*` 包装转发给 `TerminalTabView`（它的这几个 prop 是必填的，不包一层在缺省路径下会 `TypeError`）。选「可选 prop + no-op」而不是必填，理由与 K26(1) 同源：`App.vue` 属任务 13、本任务不许改它。
- **F1**：`.tab-bar` 加 `flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden`（`overflow-y` 必须显式写：`overflow-x` 非 visible 时它按规范算成 auto，多一条横向滚动条会把页签条顶高）；`.log-tab` 加 `flex: none` + `white-space: nowrap`；并把 `.tab-bar` 加进既有「#12 滚动条美化」的三组选择器（`style.css:369/373/378-382` 区域），否则页签条下会出现一条默认外观的滚动条。
- **F2**：`onTabClick` 里 `tabEls.get(id)?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })`，可选链守卫与 `LogTabView.vue:77` 同口径；页签元素经函数 ref 收进 `tabEls`。
- **F3**：`faXmark` 在 `LogPanel.vue` 内 `library.add`，`<FontAwesomeIcon :icon="['fas','xmark']" />`，`aria-label` / `data-tooltip` 与 TerminalTabView 的 `.btn-close-tab` 同名同类，复用 `.icon-btn:disabled` 的既有禁用外观。
- **F4 / K26(2)**：`LogPanel` 只渲染 `item.label`，`label !== fullLabel` 时挂 `title=fullLabel`，**没有任何二次截断**（`truncateByWidth` 未在本组件出现）。
- **K26(3) / M4**：页签文案取 `item.label`；`data-tab-id` 只作测试钩子（与 LogTabView / TerminalTabView 根节点同名），未从 `data-*` 反取。
- **F5 / K20 / K21(1)**：新增的用户可见文案只有 `[x]` 的 `aria-label` 与 `data-tooltip`，走 `import { t } from '../i18n'` 的**字面量** `t('ql.btn.closeTab')` / `t('ql.tab.closeBlocked')`（词典已有，未新增键）；注释里没有 `t('字面量')` 形态。页签文案本身来自 `LogTabItem.label`（构造方 = 任务 13，终端标签文案由它按 `ql.term.*` 生成），缺省两页签的 label 是产品名（词典无对应键，也不允许新增）。
- **F7 / K26(4)**：两种页签一律 `v-show`；`v-if` 只按 `item.kind` 分流（`v-if="item.kind === 'text'"` / `v-else`），与激活态无关。
- **M3**：未把 `overflow: hidden` 收进 `.log-view`（按简报决定），未改 `TerminalTabView.vue`。
- **M5**：`@xterm/xterm/css/xterm.css` 的副作用导入仍在 `TerminalTabView.vue:11`；本任务后 `App → LogPanel → TerminalTabView` 真的引用了它（任务 9 时没有任何模块 import 该组件），xterm.css 因此进入模块图。未改 `main.ts`。
- **M6**：未加防抖/节流，未改 `TerminalTabView.test.ts`。

## 6. 疑虑清单（请主代理定夺）

1. **起点与简报差一个提交**：实际 HEAD = `d3c667e`（`5ca9cb1` 之后多一条 docs 提交），工作区除未跟踪的 `task-10-brief.md` 外干净；A3 基线实测仍 32 passed，不影响结论。
2. **check 表 B4 的「追加 6 条」与 E/I 段不一致**：E8 是 `1ae9e07`/`5ca9cb1` 之后新增的判据，B4 那行没跟着改。我按 E/I 段实现，**追加 7 条**（E1-E5、E7、E8）。表我没改（改表属主代理）。
3. **任务 13 的「自动激活新页签」缺接口**：C4 只给 `tabs` / `buckets` + 四个透传，激活态 `active` 在 `LogPanel` 内部，没有 `active` prop 也没有 `update:active`；而任务 13 的 B 段不含 `LogPanel.vue`（只有 `App.vue` / `style.css` / `App.test.ts`）。规格 §9.2 要求「点 [启动] → 建页签 + **自动激活** + fit + 聚焦」，按现在的契约 App 做不到。我**没有擅自扩接口**，只加了必要兜底：`watch(items)` 里若激活项已不在列表（页签被关掉）就回落到第一个，否则面板空白。请定：任务 13 扩 C4，还是让 LogPanel 观察 `tabs` 增长自动激活新页签（后者属本任务未登记的行为）。
4. **E5 的断言强度**：happy-dom 不加载外部 CSS，所以 E5 断的是「渲染出的页签数 + `style.css` 规则文本」，不是 computed style；真机的横向滚动外观（规格 §12 硬门 8「页签溢出（8 条）横向滚动」）推到任务 14。已用变异 ④ 证明该断言不空转。
5. **`.log-tab` 与 `.log-tab .btn-close-tab` 的 CSS 改动是否算 B3 边界内**：B3 字面只写「`.tab-bar` 横向滚动」，但 F1「页签不被压扁」要求 `.log-tab { flex: none }`；`[x]` 放进 26px 高的页签要求给它 16×16 的尺寸规则（`.icon-btn` 默认 32×32 会顶破页签高度）。另把 `.tab-bar` 加进既有滚动条美化的三组选择器。请按 F1/F3 判定。
6. **两个 `[x]` 并存**：页签条每个可关页签一个（本任务），终端工具条里也有一个（任务 9 的 `TerminalTabView.vue:227-232`，已在基线里）。两处都冒泡 `close(id)`，语义一致、不会重复关闭（第二次时页签已不在列表）。若产品上只要一个，需要主代理定夺——`TerminalTabView.vue` 不在本任务 B 段，我没动它。
7. **一条已知的测试强度边界**（按 K24(2) 的先例如实登记，不为此造虚构契约）：变异 ②b 去掉 `onCloseClick` 里的 `closeDisabled` 守卫 → 0 红。「点禁用 `[x]` 不冒泡 close」实际由 `disabled` 属性保证（happy-dom 与真实浏览器都不向 disabled 按钮派发点击）。处理器里的守卫保留为防御（若将来改用 `aria-disabled` 或去掉属性，它仍成立），但它不是被测试钉住的那一层。
8. **HTML 内容模型**：页签是 `<button class="log-tab">`，`[x]` 是它内部的 `<button>`——button 里嵌 button 在 HTML 规范里不允许（interactive content 不得嵌套）。Vue 用 DOM API 建节点，实际渲染与点击都正常（E3/E4 已证），但严格合法性有瑕疵。若要合法，得把页签改成 `<div role="tab" tabindex="0">` + 键盘激活处理，那会改到既有页签的元素类型与 CSS 语义——我按「最小改动、不改既有视觉」选了前者，登记供审查。

---

## 7. 定向修复轮 1 · 受控激活（E9/E10，索引 K27(1) / 规格 §9.2:243-244）

起点 HEAD `15b0d1a`；本轮只写两个文件：`src/modules/LogPanel.vue`、`src/modules/LogPanel.test.ts`。
**代码 diff 仍是 B1-B4 四个文件**，本轮只写其中两个；`log-tabs.ts` mtime = 16:15:36、`style.css` mtime = 16:25:37，都早于本轮开始（16:28），本轮一字未改。除代码外只按简报第 23 行追加了两处文档：本报告的本节 + check 表 J 段的 E9/E10 行（A-I 的勾未落，K25 属主代理）。未 `git add`、未 commit（K5）。

### 7.1 先红 / 后绿（真实计数）

| 步骤 | 命令 | 真实输出 |
|---|------|---|
| 起点核对 | `git rev-parse --short HEAD` / `git status --porcelain` | HEAD = `15b0d1a`；工作区 = B1-B4 四个 M + 三个未跟踪 brief/report 文档。改前 `LogPanel.vue` SHA-256/12 = `2a74f18bc1e5`（与第 3 节登记的稳定 SHA 逐字一致 = 主体实现未被改动） |
| D1 写失败测试 | — | 追加 2 条：`active_is_controlled_when_prop_given_and_emits_update_active`（E9，`LogPanel.test.ts:430`）、`removed_active_tab_falls_back_to_first_not_blank`（E10，:468）；新增 describe 在 :414，夹具助手 `visiblePanes` 在 :422。既有 18 条与 7 处 `mount` 夹具一字未改（文件 408 → 493 行，只在末尾追加） |
| **D2 先红** | `npx vitest run src/modules/LogPanel.test.ts` | **Tests 2 failed \| 18 passed (20)**，exit 1。红：E9 `expected [ 'log-tab' ] to include 'active'`（:436，`active` prop 被忽略 → 面板仍按「默认第一个」）、E10 `expected undefined to deeply equal [ [ 'launcher' ] ]`（:484，无 `update:active` 冒泡）。既有 18 条全绿 = 新用例没有误伤 |
| **D4 后绿** | 同上 | **Tests 20 passed (20)**，exit 0 |

### 7.2 门（真实计数）

| 门 | 命令 | 真实输出 |
|---|---|---|
| G1 | `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` | **Tests 63 passed (63)**：LogTabView 21 + TerminalTabView 22 + LogPanel 20（既有 11 + 上轮 7 + 本轮 2）；既有 11+21+22 一字未改仍绿 |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts` | **Tests 25 passed (25)**（index 3 / no-hardcoded 2 / key-coverage 2 / dict 11 / i18n.test 7），exit 0；本轮未新增任何用户可见文案，词典零改动 |
| 额外（非受控路径不变的证据） | `npx vitest run src/App.test.ts` | **Tests 48 passed (48)**，exit 0 —— `App.vue:373` 仍只传 `:buckets`，一行未改 |
| 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | exit 0（无输出） |
| 全量（自查，非本任务门） | `npm test` | **Test Files 45 passed (45) / Tests 775 passed (775)**，exit 0（上轮 773 + 本轮 2） |

### 7.3 变异自检（各红几条）

字节级写回 + SHA-256/12 比对：本轮 `LogPanel.vue` 稳定 SHA = **`6ba11a074e46`**，两次变异还原后均 `== baseline OK`。

| # | 变异 | 结果 |
|---|---|---|
| ① | `onTabClick` 里去掉 `emit('update:active', item.id)`（`if (controlled.value) { return; }`） | **1 红**：`active_is_controlled_when_prop_given_and_emits_update_active`（**E9 按要求红**），其余 19 绿。还原后 SHA 一致 |
| ② | 删掉 `watch(items, …)` 的兜底整块 | **1 红**：`removed_active_tab_falls_back_to_first_not_blank`（**E10 按要求红**；红在首个断言处 = 非受控段 `expected [ 'log-tab' ] to include 'active'`，一条测试只报第一个失败，受控段的 `update:active` 断言同样会红）。还原后 SHA 一致 |

### 7.4 E9/E10 钉法

| E | 用例 | 钉法 |
|---|---|---|
| E9 | `active_is_controlled_when_prop_given_and_emits_update_active`（`LogPanel.test.ts:430-466`） | 传 `active: 'ql:demo'` → 页签按钮带 `active` 类、可见 pane 恰为 `ql:demo`（不是「默认第一个」）；点另一页签 → `emitted('update:active') = [['launcher']]` 且**面板不自行切换**（`active` 类与可见 pane 都不动）；`setProps({ active: 'launcher' })` → 类与可见 pane 都切过去，且打桩的 `scrollIntoView` 被调 1 次、参数含 `{ inline: 'nearest' }`（F2 在受控路径生效）；末尾另起一个不传 `active` 的实例断「点击即切换」（既有自持行为回归） |
| E10 | `removed_active_tab_falls_back_to_first_not_blank`（:468-490） | 非受控：激活 `ql:demo` → `setProps({ tabs: [launcher] })` → `launcher` 页签带 `active` 类、可见 pane = `launcher`（`visiblePanes()` 判据：`v-show` 未隐藏的 pane 恰一个，空面板 = 零个）；受控：同样摘掉 → `emitted('update:active') = [['launcher']]`（不越权改 App 的状态），App 应用 `active: 'launcher'` 后面板不空白 |

### 7.5 实现要点（对照 C4 / F2 / K27(1)）

- **C4 逐字**：props 加 `active?: string`（`LogPanel.vue:23`，可选），emits 加 `(e: 'update:active', id: string): void`（:33）。未新增其它 prop/emit，未新增 i18n 键。
- **受控判定**：`controlled = computed(() => props.active !== undefined)`（:43）；`active` 改为 computed（:45）= 受控取 prop、非受控取 `internalActive`（:44，默认 `items[0].id`）。模板里的 `item.id === active` 与 `:class="{ active: … }"` 一字未改（computed 自动解包），`v-show` 保活与 `v-if` 只按 `kind` 分流（F7）不变。
- **点击（:69-74）**：受控 → 只 `emit('update:active', id)` 后 `return`，不自行改激活态；非受控 → `internalActive.value = id`（既有行为）。
- **兜底（:49-54）**：`watch(items)` 里激活项不在列表时——非受控回落第一个；受控只 `emit('update:active', 第一个 id)`（`first` 为空即 tabs 空 → 不冒泡，状态归 App）。
- **F2 位置变化**：`scrollIntoView` 从 `onTabClick` 移到 `watch(active, …, { flush: 'post' })`（:65-67），受控/非受控共用一条路径。理由：受控时点击不改本地状态，留在点击处理里就切不到新页签；`flush: 'post'` 保证 DOM 已 patch、函数 ref 已把（新出现的）页签元素登记进 `tabEls`。单一触发点，所以 E5 的 `seen.length === 1` 仍成立（复跑 63 全绿即证）。报告第 5 节「F2 在 `onTabClick` 里」的描述已被本轮取代，check 表 F2 行只要求「切换时把激活页签滚进可视区」，未指定位置。

### 7.6 疑虑清单（本轮新增，请主代理定夺）

1. **非受控点击是否也冒泡 `update:active`**：规格 §9.2:244 字面是「`LogPanel` 点击页签时冒泡 `update:active`，不传时自持」，可读成「一律冒泡 + 不传时额外自持」；简报语义 2 要求「不传 `active` 时行为与现在一字不变」。我按后者实现 = **只有受控路径冒泡**。E9 没有断「非受控不冒泡」（不造未登记契约），所以两种实现都过 E9；若你要前者（便于将来渐进接 `v-model:active`），把 `emit` 提到 `if (controlled.value)` 之前即可，一行改动、现有用例不会红。
2. **受控 + 激活项被摘掉 → App 回应前会短暂空白**：这是 K27(1) 明写的口径（「状态归 App，我不越权改它」），E10 断的是「冒泡第一个 id」+「App 应用后不空白」。**任务 13 必须真把 `update:active` 写回 prop**（`v-model:active`），否则关掉当前页签会留空白面板——建议在任务 13 表 C6 上钉一句。
3. **兜底只观察 `items`**：受控下若 App 传的 `active` 不在 `tabs` 里而 `tabs` 不变（例如先改 `active` 再建页签），不会自动纠正、也不冒泡。规格没要求这种顺序的纠正能力，登记边界，未实现。
4. **`active` 类型是 `string`**（与 `LogTabItem.id` 同型），未收窄成 `LogTabId`：终端页签 id 是 `ql:` 前缀字符串，收窄会编译不过。与 C4 的 `active?: string` 逐字一致。
5. **本轮未落 A-I 的勾**（K25 属主代理），只在 check 表 J 段追加了本轮的 E9/E10 行（含 D2 真红、D4 后绿、四条门、两处变异的真实输出）。
