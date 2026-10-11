# 任务 9 · 定向修复 2（复审后的两条「应当修」+ 三条顺手修）

任务 9 已实现、已验收、已提交（`151046e`）。定向复审判定**通过**，但留了两条「应当修」与若干次要。主代理已逐条自己核实（不是采信说法）。本轮只改下面点名的几处，**其余一律不动**。

## 必修 A：补一条「上报的尺寸真的变化」的用例（测试强度缺口）

现状：假 `FitAddon` 恒给 `proposed: { cols: 118, rows: 41 }`（`src/modules/TerminalTabView.test.ts:30` / `:173`），没有任何用例改它。于是 `:268` 只钉住「同尺寸不重发」这**负半边**；若实现硬编码 `onResize(id,118,41)` 或去重写得过激（每实例只报一次），18 条仍全绿。
要做的：在 `:268` 那条用例之后（或新写一条），把 `h.state.proposed = { cols: 90, rows: 30 }` 再触发一次 `ResizeObserver` 回调，断 `onResize` 第二次收到 `('ql:demo', 90, 30)`。这条钉的是 F2/K23(3) 的正半边：「容器变了 → 新尺寸 → 再发一次 `ql_resize`」。
先红后绿：这条用例应当**先红**（如果实现本来就正确，它会直接绿——那就用变异证明它有牙：把 `reportSize` 改成「每实例只报一次」，它必须红）。不许为了凑红改实现。

## 必修 B：`defineExpose` 的 `fit` 默认改为不强制上报

现状：`src/modules/TerminalTabView.vue:183` 是 `fit: (force = true)`。任务 13 表 E5 每次激活都会调 `fit()` → 每次切页签都强制发一次 `ql_resize`，正是 F8 去重要消除的那次；实现自己的注释（`:180`）也说常规切页签不需要它。
要做的：默认改成 `force = false`，并更新那两行注释：说明「同一页签再次启动（PTY 被重建为 80×24）」时调用方必须显式 `fit(true)`（任务 13 会这么做）。同步那条断 `fit()` 行为的用例（`:256` 一带）：断默认调用**不**重发、`fit(true)` 才重发。

## 顺手修 C：`term.clear()` 时复位查找状态

现状：`src/modules/TerminalTabView.vue:141` 清空 buffer 后，计数仍显示 `1 / 3`、上/下仍指向已不存在的匹配。补一条用例：有查找结果时点清空 → 计数复位、装饰清掉（复用 `:127-131` 的复位路径 + `searchAddon.clearDecorations()`）。

## 顺手修 D：`fullLabel` 的落点要说清

现状：`fullLabel` 声明了但完全未用（`:25`），而 `data-tab-label` 装的是**短** `label`（`:188`）。任务 10 若要全名 tooltip，从这个属性取会取到截断名。
要做的：把根节点改成同时提供 `:data-tab-label="label"` 与 `:data-tab-full-label="fullLabel"`（保留现有属性名不变，新增一个），并加一条断言证明两个属性各自装对的值。不要改 props（C1 逐字）。

## 顺手修 E：补 `resultIndex < 0` 哨兵的用例

现状：`src/modules/TerminalTabView.vue:161` 把 addon 文档里「超过阈值时 `resultIndex` 为 -1」钳到 0，但假 addon 从不发 -1（`node_modules/@xterm/addon-search/typings/addon-search.d.ts:142`）。补一次 `resultsCb({ resultIndex: -1, resultCount: 1200 })`，断显示 `0 / 1200`。

## 明确不要做的

- 不动 props/emits/`defineExpose` 的形状（除 B 的默认值）、不动键盘归属、不动字体栈、不动内联样式与 `xterm.css` 的导入位置、不删假 addon 的死面、不动 `:272` 的 `fitCalls === 3` 断言（这些已登记为 deferred，交最终整分支审查）。
- 不加 CSS、不碰 `style.css` / `LogPanel.vue` / `log-tabs.ts` / `dict.ts` / `main.ts`。
- 不 `git add`、不 commit（K5）。

## 门（跑完把命令与真实输出追加到 check 表 J 段，标注「定向修复 2」）

- `npx vitest run src/modules/TerminalTabView.test.ts` → 全 PASS（用例数应比 18 多）
- `npx vitest run src/modules/LogTabView.test.ts src/modules/LogPanel.test.ts src/App.test.ts` → 全 PASS
- `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS
- 变异自检三次：① 把 `reportSize` 改成「每实例只报一次」→ A 那条必须红；② 把 `fit` 默认改回 `force = true` → B 那条必须红；③ 去掉 `onClearTerminal` 里的查找复位 → C 那条必须红。逐条还原后报 SHA。

报告追加到 .superpowers/sdd/2026-10-10-quick-launch-card/task-09-report.md 的「§9 定向修复 2」小节。不派子代理。
回传给我：状态一行 + 三条门的真实计数 + 三次变异各红几条（各一行）。