# 任务 9 报告 · `TerminalTabView.vue`（xterm 交互终端页签）

> 起点 HEAD `1d35691`。起点工作区唯一改动 = 主代理把 check 表里第二个 E9 改编号为 E10（先于本任务存在；已核对 diff 只动 E10 行与 I 段一行）。
> 本任务**不 `git add`、不 commit**（索引 K5），改动全部留在工作区。
> check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-09-terminal-tab-view.md`（J 段已填真实命令与输出，A-I 段未改、H 段未执行）

## 1. 状态

**DONE_WITH_CONCERNS** —— E1-E10 全部有测试（18 条用例）；D1→D4 两轮都先红后绿；G1/G2/G3/G4 全绿；额外跑了全量 `npm test`（45 文件 / 762 用例全绿）。
疑虑 7 条见 §7，其中 2 条需要主代理裁定：F1 的 `fontFamily` 取值（§7-1）、`defineExpose` 是否算越界（§7-3）。

## 2. 改动清单

| 文件 | 动作 | 行数 |
|---|---|---|
| `src/modules/TerminalTabView.vue` | 新建（B1） | 223 |
| `src/modules/TerminalTabView.test.ts` | 新建（B2） | 402 |

最终 `git status --porcelain`：已跟踪改动只有 check 表（主代理的 E10 更正 + 本次 J 段），未跟踪新增只有上面两份。
**未碰**：`LogPanel.vue` / `log-tabs.ts` / `style.css`（任务 10）、`App.vue`（任务 13）、`src-main/i18n/dict.ts`（**未新增任何键**）、`package.json` / lock、`src/ipc.ts`。

## 3. E1-E10 落点（逐条）

| # | 实现落点（`src/modules/TerminalTabView.vue`） | 钉它的用例（`src/modules/TerminalTabView.test.ts`） |
|---|---|---|
| E1 | `:162` `props.register(props.id, sink)`；`:168-176` `onBeforeUnmount` 里 `unregister` + `observer.disconnect()` + `term.dispose()` | `:185` `mount_registers_data_sink_and_unmount_unregisters_it` |
| E2 | `:162` 交出的 sink 就是 `(data) => term.write(data)` | `:208` `sink_writes_terminal_output_into_the_terminal_instance`（含 ANSI 与中文） |
| E3 | `:157` `term.onData((data) => props.onInput(props.id, data))`，不做任何过滤/转义 | `:228` `term_onData_forwards_ctrl_c_verbatim_to_onInput`（`\x03` 原样） |
| E4 | `:46-52` `fitAndReport()`：`offsetWidth === 0 \|\| offsetHeight === 0` 直接返回，不 `fit()` 也不上报；`:163-164` ResizeObserver 是唯一恢复入口 | `:239` `hidden_container_skips_fit_and_onResize_until_it_has_width_again` |
| E5 | `:92-100` `onCustomKey`：只有 `Ctrl+Shift+C/V` 返回 `false`（不进终端），其余（含 `Ctrl+C`）返回 `true` | `:279`（复制 + 返回 false + `clipboard_write`）、`:293`（`Ctrl+C` 返回 true 且随后 `\x03` 送达） |
| E6 | `:213-218` `[x]`：`v-if="closable"`、`:disabled="closeDisabled"`、禁用时 `data-tooltip` = `ql.tab.closeBlocked` | `:368`（禁用 + tooltip 逐字）、`:378`（`closable=false` 不渲染）、`:384`（可点时 `close(id)`） |
| E7 | `:76-87` `pasteClipboard()` 走 `invoke('clipboard_read')` → `term.paste`；`:221` `@contextmenu.prevent` | `:305`（`Ctrl+Shift+V`）、`:318`（右键） |
| E8 | `:188-218` 工具条（清空终端 / 查找框 / 清空查找 / 计数 / 上 / 下）；`:124-136` `runSearch`；`:141` `term.clear()` | `:329`（清空 → `term.clear()`）、`:339`（查找 + 计数 + 清空查找复位） |
| E9 | `:163-165` `observe(el)` 之后**同步**调 `fitAndReport()`；`:57-66` `reportSize` 把 `term.cols/rows` 交给 `props.onResize` | `:217` `first_frame_reports_size_without_waiting_for_resize_observer`、`:268`（同尺寸不重复发）、`:256`（再次启动时强制重报） |
| E10 | `:155` `new WebLinksAddon((_e, uri) => openLink(uri))`；`:144` `invoke('open_external', uri)` | `:394` `weblink_activation_opens_uri_through_open_external` |

F 组口径：F1 逐字见 `:149-155`（`{ scrollback: 5000, fontSize: 13, fontFamily: 'var(--font-mono)' }` + Fit + Search + WebLinks，并有 `:200` 一条用例把这份取值钉死）；F2 `:46-66` + `:163-164`；F3 `:92-100`；F4 全部文案走 `t()`（`ql.terminal.clear` / `searchPlaceholder` / `searchPrev` / `searchNext` / `count`、`ql.btn.closeTab`、`ql.tab.closeBlocked`、复用 `log.search.clear`）；F5 未动依赖版本；F6 只测接线；F7 未造 configId 反解、未加 prop/API。
i18n 三条口径：`ql.terminal.count` 的调用点逐字用 `{ cur, total }`（`:106`，与 `dict.ts:166/508` 的占位符名一致，`key-coverage:44` 绿）；清空查找按钮用 `log.search.clear`（`:198-199`）；源码注释里没有 `t('字面量key')` 形态的举例（K21(1)）。

## 4. mock 的边界

| 打桩 | 位置 | 桩的语义（刻意照抄真实契约的地方） |
|---|---|---|
| `@xterm/xterm` | `.test.ts:102` + `:33-59` | 记录构造参数（钉 F1）、`write/paste/clear/dispose/focus` 计数、`onData`/`attachCustomKeyEventHandler` 的处理器**暴露给测试直接调**（E3/E5 的断言方式按 check 表要求） |
| `@xterm/addon-fit` | `:103` + `:60-70` | `fit()` 把 `cols/rows` 写成固定的 118×41 = 「fit 成功」，于是「上报的尺寸」与「fit 的结果」在断言里可区分 |
| `@xterm/addon-search` | `:104` + `:71-92` | **只有传了 `decorations` 才发 `onDidChangeResults`**（真实 addon 的契约）——计数用例因此不会假绿，也逼实现必须带 decorations |
| `@xterm/addon-web-links` | `:105` + `:93-98` | 构造参数被记录，E10 用它触发链接回调 |
| `../ipc` | `:109` | 样板 `LogTabView.test.ts:10-11`；`clipboard_read` 返回固定串 |
| `ResizeObserver` | `:115-127` | happy-dom 自带实现但拿不到回调，换成假实现以手动触发「尺寸变化」；`afterEach` 还原真实构造函数 |

未打桩：`../i18n`（走真词典，语言由 `src/test-setup.ts` 固定为 zh）、Vue 与 `@vue/test-utils`。
尺寸链的模拟：`setProtoBox()`（`:132`）在 `HTMLElement.prototype` 上覆写 `offsetWidth/offsetHeight` = 「页签可见」；`setElementBox()`（`:136`）对挂载点覆写为 0 = 「v-show 隐藏」。happy-dom 无布局，这是唯一能钉 R2 的办法，已在测试文件头部注释写明。

## 5. E9 首帧时序怎么保证

1. `onMounted` 内的顺序是固定的：`new Terminal` → `loadAddon`×3 → `open(el)` → `onData` / 键盘 / 结果事件 → `register(sink)` → `new ResizeObserver` → `observe(el)` → **同步调 `fitAndReport()`**（`:165`）。
2. 不等 ResizeObserver 的首次回调：真实浏览器里那次回调是异步的（下一帧），而主进程已经按 80×24 兜底建好 PTY（索引 K11(2)）——同步调一次，保证「页签出现即上报」。RO 随后仍会触发一次 `fit()`，但 `reportSize` 的去重（`:62`）让它不会重复发 `ql_resize`（`:268` 钉这条）。
3. 隐藏时挂载（页签未激活）：`:49` 的守卫直接返回，不 fit 也不上报；`v-show` 恢复显示必然产生一次尺寸变化 → RO 回调 → fit + 上报（`:239` 钉这条，即 R2）。
4. 同一页签上**再次启动**（页签还在、PTY 被重建为 80×24）：去重会挡住那次必要的上报，所以对外暴露 `fit(force = true)`（`:181-183`）强制重报——这是给任务 13 表 E5 的接缝（见 §7-3）。

## 6. 门与真实结果（详见 check 表 J 段）

| 门 | 结果 |
|---|---|
| D2 先红 | `Test Files 1 failed (1)` / `Tests no tests` / `Failed to resolve import "./TerminalTabView.vue"`（exit 1） |
| D4 后绿 | 第一轮 `Tests 17 passed (17)`；第二轮（新增强制重报用例）先 `1 failed \| 17 passed (18)` → 加 `force` 参数后 `Tests 18 passed (18)` |
| 变异自检 | 四处各跑一次：去首帧上报 → 3 红；去隐藏守卫 → 1 红；拦截 `Ctrl+C` → 1 红；WebLinks 不传处理器 → 1 红；实现逐字还原（sha256 前后同为 `262f12324854`） |
| G1 | `Tests 18 passed (18)` |
| G2 | `src/modules/LogTabView.test.ts` → `Tests 21 passed (21)` |
| G3 | `src-main/i18n` + `src/i18n.test.ts` → 5 文件 / `Tests 25 passed (25)`（含 `key-coverage`、`no-hardcoded`） |
| G4 | 代码改动 = B1-B2 两份新文件；已跟踪改动只有 check 表 |
| 额外 | `npm test` → `Test Files 45 passed (45)`、`Tests 762 passed (762)` |

## 7. 疑虑

**7-1（需要裁定）F1 的 `fontFamily: 'var(--font-mono)'` 在测量路径上不解析。** 按 F1 原样实现（`:150`），未自行换字体串。取证（`node_modules/@xterm/xterm/lib/xterm.js`，5.5.0）：
- 偏移 ~77544：`DomRenderer._injectCss` 把取值写进 `<style>` 规则 `font-family: ${rawOptions.fontFamily}` —— CSS 声明，`var(--font-mono)` **会解析**（变量定义在 `src/style.css:29`）。
- 偏移 ~92785 / ~100257：`WidthCache.setFont` 与 `DomMeasureStrategy` 用 `style.fontFamily` —— 同样会解析。
- 偏移 ~100936：`CharSizeService` 优先构造 Canvas 测量策略：`this._ctx.font = \`${fontSize}px ${fontFamily}\`` —— canvas 的 font 简写**不解析 CSS 变量**，于是单元格宽高按 canvas 默认字体（10px sans-serif）量出来。
- 5.5.0 的默认渲染器是 DomRenderer（同一文件里 `_createRenderer()` 返回 `DomRenderer`），所以文字按 Cascadia/Consolas 画、格子按 canvas 默认字体量 → 网格与容器尺寸不匹配（表现为右侧/底部留白或溢出）；中文与颜色不受影响。真机门（任务 14）会暴露。
- 建议（属偏离口径，需主代理先改 F1 再改代码）：换成与 `--font-mono` 同值的字面量栈 `'Cascadia Code, Consolas, monospace'`，或删掉 `fontFamily` 用 xterm 默认值。

**7-2 挂载点复用了 `.log-view`，但内联关掉了它的 `overflow-y`。** `:221` 用 `class="log-view term-view"` 复用 flex:1 高度链（`style.css:194-204` / `:262-273` 那条链），同时内联 `style="overflow: hidden; min-height: 0;"` —— `.log-view` 的 `overflow-y: auto` 会和 xterm 自带视口滚动叠成两条滚动条。没有新增 CSS 规则；若主代理希望把这条收进 `style.css`，任务 10 的 B3 正好在改该文件，可顺手搬。

**7-3（需要裁定）`defineExpose({ fit, focus })` 是 C1/C2 之外的对外 API。** 理由：任务 13 表 E5 要求「自动激活 + `fit()` + 聚焦」，而任务 13 的 B 段只能改 `App.vue` / `style.css` / `App.test.ts`，改不到本组件；没有这个接缝它就无从调用（常规切页签不需要它，`v-show` 恢复显示必然触发 ResizeObserver）。删掉 `:181-183` 不影响任何一条 E 断言（只有 `:256` 那条用例会红）。请主代理裁定保留或删。

**7-4 `label` / `fullLabel` 的实际用法。** C1 要求这两个 prop，但页签文案与长名 tooltip 属任务 10 的页签条。本组件只把它们落在根节点 `data-tab-id` / `data-tab-label`（`:187`）作为定位钩子（`LogTabView.vue:134` 已有 `data-tab-id` 先例）。若任务 10 需要别的形态（例如 `title`），说一声我改。

**7-5 起点 A1 不是完全干净。** `git status --porcelain` 起点有一处先于本任务的改动（主代理的 E10 编号更正）。我没有回退它；G4 的「只含 B1-B2」按「代码改动只含 B1-B2」解释，文档改动 = 那处更正 + 本次 J 段。H1 的暂存范围（只两份代码文件）不受影响。

**7-6 `import '@xterm/xterm/css/xterm.css'`（`:11`）。** 不引入的话真机上 xterm 没有视口/滚动条/cursor 的基本样式。它只在本文件内生效，不改 `style.css`、不改 `src/main.ts`。若主代理希望集中到入口引入，请说。

**7-7 `Ctrl+Shift+C` 在无选中时仍返回 `false`。** 规格 §9.3 只写「有选中时复制」，未规定无选中时这条组合键归谁；我让它永远不进终端（`:94-98` + `copySelection` 的空选中早退 `:72`），避免某些 shell 把它当输入。若希望无选中时回落给终端，改一行即可。

## 8. 未做的事

- H1/H2 未执行（K5：不 `git add`、不 commit）。
- 未订阅 `onQlData` / `onQlExit`（按简报，数据路由属任务 13）。
- 未新增 i18n 键；未改 `style.css` / `log-tabs.ts` / `LogPanel.vue` / `App.vue` / `src/ipc.ts`。
- 未做真机验证（xterm 真实渲染不在单测范围，规格 §12.5 / §13-2；由任务 14 硬门覆盖）。

## 8. 定向修复（口径已更正后，按新 F1 改代码）

主代理更正口径（K23(1) / F1 / 规格 §9.3:250 / 计划 步骤 3，commit `41e04a2` / `49df85c`）之后，本轮只改一处：

1. `.vue:150-151`：`fontFamily` 由 `'var(--font-mono)'` 改为字面量栈 `"'Cascadia Code', Consolas, monospace"`，并在上一行加一行注释——指向 `src/style.css:29`、写明两处必须逐字同值、以及为什么不能用 CSS 变量（`CharSizeService` 走 canvas 测量，canvas 的 font 不解析 `var()`）。注释里没有 `t('字面量key')` 形态（K21(1)）。
2. `.test.ts:202-203`：那条取值用例的期望值同步为新字面量栈。断言强度不变——仍是 `toEqual` 逐字比对传给 `Terminal()` 的 options 对象（`.test.ts:45` 的 `FakeTerminal` 构造即 `state.termOptions.push(options)`）。
3. 其余一切未动：props / emits / `defineExpose`（C3）/ 尺寸去重与 `fit(force)`（F8）/ `Ctrl+Shift+C` 返回值（F9）/ CSS 与 `style.css` / `LogPanel.vue` / `log-tabs.ts`。

**同值取证**（node 脚本比对，非目测）：从 `src/style.css:29` 正则取出 `--font-mono` 的值，与 `.vue` 里 `fontFamily:` 字面量解掉外层引号后逐字符比对 → `css value : "'Cascadia Code', Consolas, monospace"` / `js literal : "'Cascadia Code', Consolas, monospace"` / `identical : true`。

**门与真实结果**（命令与输出逐条见 check 表 J 段「定向修复」行）：

| 门 | 结果 |
|---|---|
| G1 | `npx vitest run src/modules/TerminalTabView.test.ts` → exit 0，`Tests 18 passed (18)` |
| G2 | `npx vitest run src/modules/LogTabView.test.ts src/modules/LogPanel.test.ts` → exit 0，2 文件 / `Tests 32 passed (32)`（21 + 11） |
| G3 | `npx vitest run src-main/i18n src/i18n.test.ts` → exit 0，5 文件 / `Tests 25 passed (25)` |
| 变异自检 | `fontFamily` 改回 `'var(--font-mono)'`（注释保留）→ exit 1，`Tests 1 failed \| 17 passed (18)`，红的正是 `terminal_is_created_with_spec_options_and_three_addons`；逐字节还原后 sha256 前 12 位前后同为 `a61640e3c573`（10682 字节，`byte-identical: true`） |
| 范围 | `git status --porcelain` 只有两行未跟踪（两份源码）；`git diff --name-only` 只有 check 表。`.superpowers/` 被 `.gitignore:4` 的 `.*/` 忽略，本报告不进 status。未 `git add`、未 commit（K5） |

§7-1 的疑虑随口径更正关闭（原建议里的 `'Cascadia Code, Consolas, monospace'` 少一层引号，会丢掉 `Cascadia Code` 的带空格家族名引号，本轮按 `style.css:29` 逐字取值为 `'Cascadia Code', Consolas, monospace`）。§7-2（挂载点内联 `overflow: hidden`）本轮未触碰，仍按索引 K23(1) 记为 deferred，由任务 10 的 B3 承接。

## 9. 定向修复 2（复审两条「应当修」+ 三条顺手修）

起点 `0ff8763`（`151046e` 之后只有 docs 提交），工作区干净。本轮只改简报点名的五处，命令与真实输出逐条见 check 表 J 段「定向修复 2」行。

### 9.1 改了什么

| # | 实现 | 用例 |
|---|---|---|
| A（必修） | 实现未动（本来就正确） | `.test.ts:283-294` 新增 `changed_size_is_reported_again`：把假 FitAddon 的 `state.proposed` 改成 `{ cols: 90, rows: 30 }` 后再 `fireResize()`，断 `fitCalls === 2`、`onResize` 第二次收到 `('ql:demo', 90, 30)`。钉 F2 / 索引 K23(3) 的正半边 |
| B（必修） | `.vue:190-196`：`fit: (force = false)`；注释改为「默认不强制（F8 去重）；只有『同一页签再次启动』那次例外——主进程把 PTY 重建为 80×24（K11(2)），那种调用必须显式 `fit(true)`」 | `.test.ts:256-272` 改写为 `exposed_fit_does_not_re_report_by_default_but_fit_true_does`：`fit()` 后 `onResize` 仍 1 次（`fitCalls` 到 2）、`fit(true)` 后才 2 次 |
| C（顺手） | `.vue:124-127` 提取 `resetSearchState()`（清装饰 + 计数归零），`:134` 空查询与 `:145-152` `onClearTerminal` 共用它（= 简报说的「复用 :127-131 的复位路径」，行为不变） | `.test.ts:358-371`：有查找结果（`1 / 3`、上/下可用）时点清空 → `cleared === 1`、`clearDecorations === 1`、计数回 `0 / 0`、上/下重新禁用 |
| D（顺手） | `.vue:201`：根节点新增 `:data-tab-full-label="fullLabel"`，`data-tab-label` 原样装短 `label`；props（C1）未动 | `.test.ts:373-382`：三个属性各自装对的值（`ql:demo` / `Demo` / `Demo · PowerShell 7 (pwsh)`） |
| E（顺手） | 实现未动（`.vue:172` 已有钳位） | `.test.ts:413-424`：直接喂 `resultsCb({ resultIndex: -1, resultCount: 1200 })` → 显示 `0 / 1200` |

简报「明确不要做的」逐条遵守：props / emits / `defineExpose` 形状（除 B 的默认值）、键盘归属、字体栈、内联样式与 `xterm.css` 导入位置、假 addon 的死面、`.test.ts:278` 的 `fitCalls === 3` 断言一律未动；未加 CSS，未碰 `style.css` / `LogPanel.vue` / `log-tabs.ts` / `dict.ts` / `main.ts`。两文件 460 / 237 行。

### 9.2 门与真实结果

| 门 | 结果 |
|---|---|
| 先红（只加/改用例） | `Tests 3 failed \\| 19 passed (22)` —— 红的正是 B / C / D；**A 与 E 首跑即绿**（未为凑红改实现） |
| 后绿 | `Tests 22 passed (22)`（18 → 22） |
| G1 | `npx vitest run src/modules/TerminalTabView.test.ts` → exit 0，`Tests 22 passed (22)` |
| G2 | `npx vitest run src/modules/LogTabView.test.ts src/modules/LogPanel.test.ts src/App.test.ts` → exit 0，3 文件 / `Tests 80 passed (80)`（21 + 11 + 48） |
| G3 | `npx vitest run src-main/i18n src/i18n.test.ts` → exit 0，5 文件 / `Tests 25 passed (25)` |
| 变异 ① | `reportSize` 去重改成「每实例只报一次」（`.vue:62`）→ `2 failed \\| 20 passed (22)`，红的是 **A** + B（`force` 路径同时被挡）→ **A 有牙** |
| 变异 ② | `fit` 默认改回 `force = true` → `1 failed \\| 21 passed (22)`，红的正是 **B** |
| 变异 ③ | 去掉 `onClearTerminal` 里的 `resetSearchState()` → `1 failed \\| 21 passed (22)`，红的正是 **C** |
| 还原 | 三次均用 node 原 Buffer 逐字节还原，`.vue` 的 sha256 前 12 位前后同为 `2e8d35b220e0` |
| 额外 | `npm test` → `Test Files 45 passed (45)`、`Tests 766 passed (766)`（762 + 本轮 4） |
| 范围 | `git status --porcelain` 只有两份源码（加本 check 表共三行）；未 `git add`、未 commit（K5） |

### 9.3 疑虑

**9-1（需要主代理行动）B 改了对外默认值，任务 13 的 E5 必须跟着改。** `fit()` 现在不再强制上报尺寸：常规切页签正是想要的（F8），但「同一页签停止后再次 `start()`」那次 PTY 被重建为 80×24，若任务 13 仍写 `fit()`，尺寸就永远不会重报（K11(2) 的下游硬门会静默失效）。已在 `.vue:190-194` 的注释里写明「必须显式 `fit(true)`」，但任务 13 表 E5 的措辞（「自动激活 + `fit()` + 聚焦」）建议同步为「重启路径显式 `fit(true)`」——按 K 组流程，这属先改表再改代码，本轮没碰任务 13 的表。

**9-2（取证结论，非缺陷）E 那条钉的是可观察契约，杀不掉「删钳位」这个变异。** 额外做了一次简报未要求的变异：把 `.vue:172` 的 `r.resultIndex < 0 ? 0 : r.resultIndex + 1` 改成 `r.resultIndex + 1` → `Tests 22 passed (22)`（0 红）。原因：`-1 + 1` 本就是 0，与钳位结果相同，所以那条断言只能保证「哨兵值不会产出负数 / NaN 计数」，不能证明那行存在。按简报原样保留（未擅自加强断言，例如喂 `resultIndex: -2` 才能区分——那属扩范围，留给主代理决定）。

**9-3 变异 ① 同时让 B 也红（2 红，不是 1 红）。** 因为 `fit(true)` 走的也是 `reportSize` 的同一条去重路径，「每实例只报一次」把 force 也吞掉了。A 确实红，符合简报要求；只是计数不是 1，如实登记。

**9-4 C 的实现方式：提取了 `resetSearchState()`。** 简报写的是「复用 `:127-131` 的复位路径」，我按字面把那条路径提成一个具名函数，空查询分支与 `onClearTerminal` 都调它（行为与提前提逐字相同：`clearDecorations()` + 计数归零）。若主代理更希望两处各写两行、不新增函数，说一声我改回去。
