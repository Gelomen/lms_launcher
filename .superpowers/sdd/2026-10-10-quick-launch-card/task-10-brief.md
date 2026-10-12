# 任务 10 简报 · 页签条支持两种页签 + `[x]` + 横向滚动

完成判据以 check 表为准：docs/superpowers/checks/2026-10-10-quick-launch-card/task-10-log-panel-tabs.md（A1-A4 / B1-B4 / C1-C4 / D1-D4 / **E1-E8** / **F1-F7** / G1-G3 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §9.1 / §9.2 / §11-1 / §11-2。计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 10（:360-383，接口块已按 K26 更正）。

## 起点（已实测，不是自述）

- HEAD = `5ca9cb1`，工作区干净。基线：`TerminalTabView.test.ts 22 passed`、`LogTabView 21 + LogPanel 11 + App 48 = 80 passed`、i18n `25 passed`、`tsc -p tsconfig.main.json` exit 0。
- `src/modules/log-tabs.ts`（11 行）：`LogTabId` :3、`LogTab` :5、`LOG_TABS` :8-11（顺序即 UI 顺序，**保留不动**）。
- `src/modules/LogPanel.vue`（25 行）：props 只有 `buckets`（:7）、`active = ref(LOG_TABS[0].id)`（:10）、`defineEmits<{ (e: "clear", id) }>`（:13）、页签条 markup :17-21、`LogTabView v-for + v-show` :22-23。
- `src/style.css`：`.log-panel` :184、`.log-view` :194、**`.tab-bar` :237-243**、**`.log-tab` :244-262**（含共边 `+ .log-tab` :252、`.active` :254）、滚动条样式 :361-380。
- `src/modules/LogPanel.test.ts`（177 行 / 11 条用例）：**7 处 `mount(LogPanel, { props: { buckets } })`** 在 :20/:63/:81/:103/:127/:159/:168；文件首行是 `// @vitest-environment happy-dom`。
- `src/modules/TerminalTabView.vue`：props :22-32（`id/label/fullLabel/closable/closeDisabled/register/unregister/onInput/onResize`，**没有 `configId`**）、`emit close` :33、卸载清理 :169-178（`unregister` → `observer.disconnect()` → `term.dispose()`）、`defineExpose({ fit, focus })` :195-197、根节点带 `data-tab-id`/`data-tab-label`/`data-tab-full-label`。
- `src/util/truncate.ts:23` `truncateByWidth(s, budget, grace = 2)`；tooltip 的既有口径见 `src/modules/LaunchBar.vue:93`（只有真截断才挂完整名 tooltip）。
- 词典已有本任务要用的键（任务 8 落地，**不得新增键**）：`ql.btn.closeTab`（`src-main/i18n/dict.ts:157` zh / :499 en）、`ql.tab.closeBlocked`（:151 / :493）。渲染端取文案用 `import { t } from '../i18n'`（`src/i18n.ts:3` 复用主进程词典，索引 K20）。

## 接口契约（C1-C4，逐字；已按索引 K26 更正）

`ts
export const QL_TAB_PREFIX = 'ql:';
export function qlTabId(configId: string): string;
export type LogTabKind = 'text' | 'terminal';
export interface LogTabItem { id: string; label: string; fullLabel: string; kind: LogTabKind; closable: boolean; closeDisabled: boolean; configId?: string }
// LogPanel props：tabs?: LogTabItem[]（缺省 = 由 LOG_TABS 生成两个 text 页签、closable: false）, buckets: Record<string, LogEntry[]>
// LogPanel emits：clear: [id], close: [id]，并透传 terminal 的 register/unregister/onInput/onResize
```

**K26(1)：`tabs` 必须可选并带缺省路径。** 原因：`App.vue:373` 只传 `:buckets`（`App.vue` 属任务 13，本任务不许改它），且测试里 7 处 `mount` 只传 `buckets`。必填 = 应用当场失去日志面板 + 逼既有用例改夹具（违反 B4/E6）。

## TDD（D1-D4）

先写 6 条失败用例（计划点名的 5 条 + 本表新增的 E7），再实现。用例名用 snake_case（与同文件既有 11 条一致），语义对应：
1. `text_tab_renders_logtabview_and_clear_behaviour_unchanged`（E1）
2. `terminal_tab_renders_terminaltabview`（E2，**必须 mock `@xterm/xterm` 与三个 addon**，照 `TerminalTabView.test.ts` 的打桩法；真实渲染不在单测范围，规格 §12.5）
3. `only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled`（E3，**R3：运行中页签被关掉 → 孤儿 PTY**）
4. `clicking_close_emits_close_with_tab_id`（E4）
5. `tab_bar_does_not_wrap_with_many_tabs`（E5：断 `.tab-bar` 的 `flex-wrap: nowrap` / `overflow-x: auto` 生效——happy-dom 里 computed style 读不到外部 CSS，**用「渲染出的类/内联样式 + 断言 CSS 文本含该规则」这类可证的方式**，并在 J 段写清你实际断的是什么）
6. `tab_title_attribute_only_when_label_differs_from_fullLabel`（E7）
再加 E8：`switching_tabs_does_not_unmount_terminal_tab`（断假 xterm 的 `dispose` 与 `unregister` 未被调用）。

D2 必须先红（`npx vitest run src/modules/LogPanel.test.ts` FAIL），D4 后绿。

## 必须钉住的行为（E1-E8）与口径（F1-F7）——见 check 表，逐条对应

要点（其余以表为准）：
- **F4 / K26(2)**：短名由**构造方**（任务 13）用 `truncateByWidth(fullLabel, 16)` 生成放进 `LogTabItem.label`；`LogPanel` 只渲染 `item.label`，并在 `label !== fullLabel` 时挂 `title=fullLabel`。**`LogPanel` 里不得再截断一次。**
- **K26(3) / M4**：页签文案**不从 `TerminalTabView` 的 `data-tab-*` 反取**（那是测试钩子）。
- **F7 / K26(4)**：两种页签的内容一律 `v-show` 保活；terminal 页签**不得 `v-if`**——卸载即 `unregister + term.dispose()`（`TerminalTabView.vue:169-178`），`v-if` 等于「切页签杀终端」。
- **F2**：激活页签 `scrollIntoView({ inline: "nearest" })`（happy-dom 里 `scrollIntoView` 可能不存在，需安全调用 + 用例里打桩断被调用）。
- **F3**：关闭图标 `faXmark`，在 `LogPanel.vue` 内 `library.add`（照本仓其他组件的写法）。
- **F5**：页签文案与 tooltip 走 `t('…')`，**字面量 key**（`key-coverage` 只扫字面量且连注释一起扫，索引 K21(1)：注释里不要写 `t('字面量')` 形态）。
- **F6**：不改 `LogTabView.vue` 内部实现。

## 会被本任务触到的已登记 Minor（索引 M 组，原样转达）

- **M3**：`TerminalTabView` 挂载点用内联 `overflow: hidden; min-height: 0` 压掉 `.log-view` 的重复滚动条。**本任务决定：不收进 `style.css`**——本任务不改 `TerminalTabView.vue`（不在 B 段），且把 `overflow` 写进共享的 `.log-view` 会影响文本日志页。若你发现必须改才能不出双滚动条，**先停下来报告**，不要自己扩范围。
- **M4**：见上（K26(3)）。
- **M5**：`@xterm/xterm/css/xterm.css` 由 `TerminalTabView.vue:11` 副作用导入。本任务只要确认页签条接入后它仍被加载（不改 `main.ts`、不改 `TerminalTabView.vue`）。
- **M6**：`TerminalTabView.test.ts:278` 把「每次 ResizeObserver 都 fit」钉成契约——本任务不加防抖，别顺手改它。

## 明确不做（越界即打回）

- 不改 `src/App.vue`（任务 13）、不改 `src/modules/TerminalTabView.vue`、不改 `src/modules/LogTabView.vue`、不改 `src-main/**`、不改 `src-main/i18n/dict.ts`（不新增键）。
- 不动既有 11 条用例与 7 处 `mount` 夹具一字（靠缺省 `tabs` 通过）。
- 不做页签拖拽/右键菜单/新建页签按钮等规格外功能（规格 §2 非目标）。
- 不 `git add`、不 commit（口径 K5）。

## 门（跑完把命令与真实输出填进 check 表 J 段）

- G1 `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` → 全 PASS（既有 11 + 21 + 22 条一字未改仍绿）
- G2 `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS
- G3 `git diff --name-only` → 只含 B1-B4 四个文件
- 额外：`npx vitest run src/App.test.ts`（`App.vue` 没改，必须仍 48 passed——这是 K26(1) 的兼容性证据）
- 变异自检至少三处：① 把 `v-show` 改成 `v-if` → E8 必须红；② 去掉 `closeDisabled` 的禁用分支 → E3 必须红；③ 把 `title` 无条件挂上 → E7 必须红。逐条还原后报 SHA。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-10-report.md（含：先红/后绿的真实计数、每条 E 对应哪个用例名、变异自检各红几条、疑虑清单）。不派子代理。
回传给我：状态一行 + 三条门 + 额外门的真实计数 + 变异各红几条（各一行）+ 疑虑（若有）。