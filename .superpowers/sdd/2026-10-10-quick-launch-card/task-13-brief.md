# 任务 13 简报 · App 接线（四列布局、状态、数据路由、重载复原）

完成判据以 check 表为准：docs/superpowers/checks/2026-10-10-quick-launch-card/task-13-app-wiring.md（A1-A3 / B1-B3 / C1-C6 / D1-D5 / E1-E7 / F1-F5 / G1-G4 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §4 / §7.5 / §7.6 / §9.1 / §9.2 / §9.3。计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 13（:442-458）。

## 起点（已实测）

- HEAD = `0e735d6`，工作区干净。全量基线：`npm test → Test Files 47 passed / Tests 791 passed`，exit 0。
- **真机门 G3/G4 本环境不可执行**（索引 K33）：我实测 `node_modules\electron\dist\electron.exe --version` 与 `electron.exe .` 都立即退出，退出码 `-2147483645 = 0x80000003 STATUS_BREAKPOINT`。**不要跑 `npm run dev`**（会挂住或崩），G3/G4 已写成 `☐（原因 + 去处）` 交任务 14。
- 现状锚点（真实行号）：
  - `src/App.vue:34` `logBuckets = ref<Record<LogTabId, LogEntry[]>>({ launcher: [], 'llama-server': [] })`（C4：只这两个桶，v1「动态桶」作废）。
  - `src/App.vue:360-371` 三列：`:361-366` `.stack`（第 1 列）、`:367` `<div class="card"><TemplateModule … /></div>`（第 2 列）、`:370` `<div class="card card--gpu"><GpuModule /></div>`（第 3 列）。**QuickLaunch 插在 :367 与 :370 之间**（C5：`stack → QuickLaunch（第 3 列）→ GPU（第 4 列）`）。
  - `src/App.vue:373` `<LogPanel :buckets="logBuckets" @clear="onLogClear" />` —— 本任务要加 `:tabs` / `v-model:active` / `@close`（任务 10 已把这些 prop 做成可选，不传就是旧行为）。
  - `src/App.vue:156` `onMounted(async () => {…})`（复原挂这里）；`src/App.vue:2` 已引 `onMounted/onUnmounted/ref/computed`。
  - `src/style.css:76-80` `.grid { … grid-template-columns: 280px 350px 330px; }` → 四列 `280px 350px 330px 330px`（F1；默认 1400px 下 1290px ≤ 可用 1340px）。**只改这一处**，别的一律不动。
  - `src/App.test.ts:33-34` 已登记 `qlDataHandlers`/`qlExitHandlers`，`:52-53` 的 mock 已注册 `onQlData`/`onQlExit`。**索引 M9：这两个数组目前无人读——本任务的用例必须驱动它们**，否则断言是空跑。既有 48 条用例一字不改（`git diff --numstat` 对 `App.test.ts` 必须是纯追加）。
  - 事件桥：`src/ipc.ts:116-121` `onQlData(cb)/onQlExit(cb)`（`ql-data` 载荷 `{tabId, data}`，`ql-exit` 载荷 `{configId, code}`）。
  - 页签类型与 id：`src/modules/log-tabs.ts`（`QL_TAB_PREFIX`/`qlTabId(configId)`/`LogTabItem {id,label,fullLabel,kind,closable,closeDisabled,configId?}`/`LOG_TABS`）。**F4：页签 id 一律经 `qlTabId()`，不手拼字符串。**
  - 页签条契约（任务 10 已落地）：`src/modules/LogPanel.vue:26-33` props `tabs?`/`buckets`/`active?` + emits `update:active`/`close`；**K26(2)**：标签截断归构造方——`label = truncateByWidth(fullLabel, 16)`（`src/util/truncate.ts:23`），`fullLabel` 放全名；**K26(3)** 不从 `TerminalTabView` 的 `data-tab-*` 反读标签；**K26(4)** 两种页签都用 `v-show` 渲染（F3 保活）。
  - 终端页签契约（任务 9 已落地）：`src/modules/TerminalTabView.vue:22-32` props `{tabId, configId, register, unregister, onInput, onResize}`，`defineExpose({ fit, focus })`；**K24(1)**：暴露的 `fit` 默认 `fit(force = false)` **不**强制重报尺寸——**重启/复原路径必须显式 `fit(true)`**（E3/E5）。
  - 主进程契约（**不改**）：`src-main/main.ts:1109` `ql_start(id) → { tabId: string | null }`（**exe 配置返回 null**）；`:1128` `ql_stop(id)`；`:1131` `ql_write(id, data)`；`:1134` `ql_resize(id, cols, rows)`；`:1137` `ql_states() → Record<string, {running, stopping}>`；`:1090` `ql_list() → {items, invalid}`。

## 契约（C1-C6，逐字）

`ts
const qlTabs = ref<{ id: string; configId: string }[]>([]);
const qlStates = ref<Record<string, { running: boolean; stopping: boolean }>>({});
const terminalSinks = new Map<string, (d: string) => void>();
```
- **C3**：`onQlData` 按 `tabId` 查 `terminalSinks`，**未知 tabId 直接忽略**（防竞态，不抛错）。
- **C6（K27(1)）**：`activeTabId` 归 App，以 `v-model:active` 传给 `LogPanel`；启动/新建/复原后把它置为 `qlTabId(configId)`；`LogPanel` 点页签冒泡 `update:active` **必须真回写**（受控下 `LogPanel` 不越权改激活态，摘掉当前激活页签时它只冒泡 `update:active(第一个 id)`——不接就留空白面板）。
- **K11(5) / M7**：`ql_states()` 的 `running` 是从「在 Map 里且不在 stopping」推导、**从不调 `proc.isRunning()`**，也不区分 shell/exe。所以复原时必须 **join `ql_list` 的 `type`，只给 `type === 'shell'` 的配置建页签**。
- **M8**：**不得对 exe 配置调 `ql_write`/`ql_resize`。**
- **K14(2)**：启动按钮**单飞**（`starting` 标志，重复点击只发一次 `ql_start`）。
- **K11(2)**：复原路径同样要发一次 `ql_resize`（重载后尺寸归零）。

## TDD（D1-D5）：先写失败用例（追加到 `src/App.test.ts`，既有一字不改）

1. `ql_data_dispatches_to_registered_sink_and_ignores_unknown_tab_id`（E1，驱动 `qlDataHandlers`）
2. `ql_exit_clears_running_state_but_keeps_tab`（E2，驱动 `qlExitHandlers`：按钮回落「启动」、`closeDisabled` 转 false、**页签保留**）
3. `on_mounted_rebuilds_empty_tabs_for_running_shell_configs_only`（E3：只给 shell 建；**复原路径发一次 `ql_resize`**；历史不回放）
4. `stop_makes_tab_close_button_enabled`（E4，R3）
5. `start_success_creates_tab_activates_it_and_calls_fit_focus`（E5：`tabId !== null` 才建；置 `activeTabId`；`fit(true)` 与 `focus()`）
6. `tab_close_removes_tab_and_unregisters_sink`（E6：`running || stopping` 时不触发）
7. `exe_start_with_null_tab_id_creates_no_tab_only_red_button`（E7）

## 口径（F1-F5）

- F1/F2：只改 `.grid` 的列数；窄窗口横向溢出属现状，不改。
- F3：终端页签 `v-show` 保活（切走不销毁）——任务 10 的 `LogPanel` 已按 `v-show` 渲染，**不要再改成 `v-if`（K26(4)）**。
- F5：不实现重载后的历史回放。
- 卡片根类名 `section.module.module-quick` 已定（K30），`App.vue` 里用 `<div class="card"><QuickLaunch … /></div>` 包裹，与其它卡片一致。
- 卡片 props 只有 `states`（任务 11 已定），emits `start/stop/changed`；**不新增键、不改卡片**。
- **K20/K21(1)**：不新增 i18n 键；`key-coverage` 连注释一起扫。

## 明确不做（越界即打回）

- 不改 `src/modules/**`（QuickLaunch / QuickLaunchModal / LogPanel / TerminalTabView / log-tabs 全部一字不动）、不改 `src-main/**`、不改 `src/ipc.ts`、不改词典。
- `src/style.css` 只改 `.grid` 的 `grid-template-columns` 一行。
- 不跑 `npm run dev`（K33：本环境起不了 GUI）。
- 不 `git add`、不 commit（K5）。

## 门（跑完把命令与真实输出填进 check 表 J 段；A-I 的勾留给我，K25）

- D4 `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` → 全 PASS
- D5 / G1 `npm test` → **全绿**（本任务是全量绿的第一个硬门；基线 47 files / 791 tests 之上只增不减）
- G2 `npx tsc -p tsconfig.main.json --noEmit` → exit 0
- `git diff --numstat` 对 `src/App.test.ts` 必须纯追加（既有 48 条不改）；`git diff --name-only` 只含 B1-B3
- 变异自检至少六处：① `onQlData` 不查 `terminalSinks`（未知 tabId 也派发/抛错）→ E1 必须红；② `ql-exit` 时顺手删页签 → E2 必须红；③ 复原路径不发 `ql_resize` → E3 必须红；④ 停止后不把 `closeDisabled` 置回 false → E4 必须红；⑤ 启动后不置 `activeTabId` → E5 必须红；⑥ 不给 exe 配置过滤（`tabId === null` 也建页签）→ E7 必须红。逐条还原后报 SHA。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-13-report.md（先红/后绿计数、每条 E 对应哪个用例名、变异各红几条、疑虑清单）。不派子代理。
回传给我（简短）：状态一行 + 各门真实计数 + 六处变异各红几条 + 疑虑（若有）。