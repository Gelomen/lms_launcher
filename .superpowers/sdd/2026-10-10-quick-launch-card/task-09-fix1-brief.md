# 任务 9 · 定向修复（口径已更正后的 `fontFamily` 一处改动）

你接手的是**已实现并通过自测**的任务 9（`src/modules/TerminalTabView.vue` + `src/modules/TerminalTabView.test.ts`，两份文件在工作区未提交）。主代理已核实你的取证并**更正了口径本身**（先改文档再改代码）：

- 索引 K23(1)（docs/superpowers/checks/2026-10-10-quick-launch-card/00-index.md）
- 任务 9 表 F1（docs/superpowers/checks/2026-10-10-quick-launch-card/task-09-terminal-tab-view.md）
- 规格 §9.3:250 与计划 步骤 3 已同步更正（commit `41e04a2` / `49df85c`）

## 要做的改动（只此一处）

1. `Terminal({ ... })` 的 `fontFamily` 从 `'var(--font-mono)'` 改为**与 `src/style.css:29` 的 `--font-mono` 逐字同值**的字面量栈：`'Cascadia Code', Consolas, monospace`。
2. 在该处加一行注释指向 `src/style.css:29`（说明两处必须同值、为什么不能用 CSS 变量：`CharSizeService` 走 canvas 测量）。**注释里不得出现字面量 `t('…')` 形态**（K21(1)）。
3. 若测试里有断 `fontFamily` 取值的用例（你报告说 18 条用例覆盖「F1 取值」），把期望值同步改成新字面量栈；**不要**削弱这条断言（它必须真的检查传给 `Terminal()` 的 options 对象）。

## 不要做的

- 不动其他任何行为、props、emits、`defineExpose`（C3 已批准保留）、尺寸去重与 `fit(force)`（F8 已批准）、`Ctrl+Shift+C` 的返回值（F9 已批准）。
- 不加 CSS、不碰 `style.css` / `LogPanel.vue` / `log-tabs.ts`。
- 不 `git add`、不 commit（K5）。

## 门（跑完把命令与真实输出追加到 check 表 J 段，标注「定向修复」）

- `npx vitest run src/modules/TerminalTabView.test.ts` → 全 PASS（18 条）
- `npx vitest run src/modules/LogTabView.test.ts src/modules/LogPanel.test.ts` → 全 PASS
- `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS
- 变异自检一次：把 `fontFamily` 改回 `'var(--font-mono)'` → 那条取值用例必须红；还原后文件字节级一致（报 SHA）。

报告追加到 .superpowers/sdd/2026-10-10-quick-launch-card/task-09-report.md 的「§8 定向修复」小节。不派子代理。
回传给我：状态一行 + 三条门的真实计数 + 变异自检结果（一行）。