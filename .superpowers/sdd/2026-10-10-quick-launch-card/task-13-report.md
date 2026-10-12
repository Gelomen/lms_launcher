# 任务 13 报告 · App 接线（四列布局、状态、数据路由、重载复原）

## 状态

实现完成、自动化门全绿：D2 真红 7 条 → D4 定向 104 绿 → `npm test` **47 files / 798 tests passed**（基线 791 + 本任务 7，既有用例无一转红）→ `tsc` exit 0；六处变异各自把对应用例跑红。**一处必须你裁决的口径冲突**（既有「GPU 卡片是网格…」用例，见「疑虑 1」）。G3/G4 按索引 K33 未跑，交任务 14。

## 改动范围（实测）

```
 M src/App.vue        +209 / −4
 M src/style.css        +1 / −1
 M src/App.test.ts    +240 / −5
```

- `src/App.vue`：新增快捷启动接线块 :332-511；`onMounted` 订阅两个事件桥 :173-175、复原 :182；模板插卡片 :566-568、`LogPanel` 接线 :573-578。
- `src/style.css:80`：`.grid` → `280px 350px 330px 330px`（只这一行）。
- `src/App.test.ts`：追加 7 条（:1220 / :1235 / :1250 / :1263 / :1279 / :1302 / :1323）+ 一处既有用例的必要更正（疑虑 1）。

## 契约对照（C1-C6 / F1-F5）

| 项 | 落点 | 说明 |
|---|---|---|
| C1 | `App.vue:338-340` | `qlTabs` / `qlStates` / `terminalSinks` 三个形状逐字照表 |
| C2 | `App.vue:567` | `<QuickLaunch :states=… @start @stop @changed>`，卡片 props/emits 未动 |
| C3 | `App.vue:409-411` | `terminalSinks.get(tabId)?.(data)`，未知 tabId 静默忽略 |
| C4 | 未改 | `logBuckets` 仍只有 `launcher` / `llama-server` 两桶（`App.vue:34`） |
| C5 | `App.vue:566-570` | `stack → QuickLaunch（第 3 列）→ GPU（第 4 列）` |
| C6 | `App.vue:346` + `:575` | `activeTabId` 归 App，模板用 `v-model:active`；`openTerminalTab` 在启动/复原时置位；摘掉激活页签时 LogPanel 冒泡 `update:active(第一个 id)` 被真接住 |
| F1 | `style.css:80` | 四列，只改这一行 |
| F2 | 未改 | 两种页签的 `v-show` 保活归 LogPanel（任务 10），本任务只传 `tabs` |
| F3 | 未加键 | 无新 i18n 键；`key-coverage` / `no-hardcoded` / `dict` 在全量里绿 |
| F4 | `App.vue:381/382/415` | 页签 id 只经 `qlTabId()`，反解用 `QL_TAB_PREFIX.length`（索引 K2），无手拼字符串 |
| F5 | 测试钉住 | E3 断言重建的页签 `written` 为空 |

## 各门真实输出

全部逐行贴进 `docs/superpowers/checks/2026-10-10-quick-launch-card/task-13-app-wiring.md` 的 J 段（A3 / D1-D5 / G1 / G2 / 六条变异 / 范围 / G3 / G4）。摘要：

- D2 先红：`Tests 7 failed | 48 passed (55)`，exit 1（首条红因 = `.module-quick .tpl-row` 计数 0，即卡片尚未接入 App —— 不是夹具写错）。
- D4：`Test Files 4 passed (4)` / `Tests 104 passed (104)`（App 55 / QuickLaunch 7 / LogPanel 20 / TerminalTabView 22）。
- D5 / G1：`npm test` → `Test Files 47 passed (47)` / `Tests 798 passed (798)`，exit 0。
- G2：`npx tsc -p tsconfig.main.json --noEmit` → 无输出，exit 0。
- G3 / G4：未跑（索引 K33，本 harness `electron.exe` 立即退出 `0x80000003`）。

## 变异自检（在最终代码上跑，还原后 `src/App.vue` SHA = `5d863ad37536` 一致）

| 变异 | 红几条 / 哪条 |
|---|---|
| ① `onQlDataEvent` 不查 `terminalSinks` | 1 → `ql_data_dispatches_to_registered_sink_and_ignores_unknown_tab_id` |
| ② `ql-exit` 顺手删页签 | 1 → `ql_exit_clears_running_state_but_keeps_tab` |
| ③ 复原路径删掉显式 `fit(true)` | 1 → `on_mounted_rebuilds_empty_tabs_for_running_shell_configs_only` |
| ④ 停止后不清运行态 | 3 → `stop_makes_tab_close_button_enabled` + `start_success_…` + `tab_close_…`（后两条也走停止路径） |
| ⑤ 启动后不置 `activeTabId` | 1 → `start_success_creates_tab_activates_it_and_calls_fit_focus` |
| ⑥ exe 的 `tabId=null` 也建页签 | 1 → `exe_start_with_null_tab_id_creates_no_tab_only_red_button` |

## 实现要点（供你逐行核对）

1. **数据路由**：`registerTerminalSink`（`:395-401`）在页签自己的 `onMounted` 里被调用，所以此刻 `getCurrentInstance()` 就是那个页签 —— 顺手记下它 `expose` 的 `fit`/`focus` 存进 `terminalViews`。这是**不改 `LogPanel.vue` / `TerminalTabView.vue`（都不在本任务 B 段）就能拿到 fit/focus 句柄的唯一办法**（索引 K23(2) 说「任务 13 表 E5 要 fit()+聚焦，而任务 13 改不到本组件」）。已实测该语义（临时探针跑完即删）。
2. **两条尺寸路径**（K24(1)/K11(2)）：新建页签 → 挂载首报 1 次，App 的 `fit(false)` 被去重吞掉；同一页签再次启动 → `fit(true)` 强制重报；复原 → 挂载首报 + 显式 `fit(true)` = 2 次。E3/E5 按次数逐条钉住（这也是变异 ③ 能红的原因）。
3. **复原过滤**（K11(5)/M7）：`restoreTerminals`（`:495-511`）先 `ql_list` 再 `ql_states`，运行态整表下发（exe 配置重载后行按钮也应是红的），**页签只给 `type === 'shell'` 建**。
4. **M8 的落点**：`terminalWritable`（`:419-422`）同时挡住 `ql_write` 与 `ql_resize` —— 主进程对「无实例 / 非 shell」的 write/resize 抛 `STATE:`（`src-main/quick-launch.ts:290-301`），所以「没有页签（含 exe）」和「停止中」都不发。
5. **K14(2) 单飞**：`qlStarting` Set（`:348/:448/:466`）。
6. **页签文案**：`logTabItems`（`:354-372`）用 `truncateByWidth(full, 16)` 造 `label`、`fullLabel` 放全名（K26(2)），静态两页签仍由 `LOG_TABS` 生成（`label === fullLabel` ⇒ 不挂 title）。

## 疑虑 / 需要你裁决

1. **既有 48 条「一字不改」与 C5/F1 + G1 不能同时成立**（唯一冲突点）。四列布局必然把 `.grid` 的直接子项从 3 变 4，既有 `App.test.ts:886`「GPU 卡片是网格第三列」的 `toBe(3)` / `gridItems[2]` / `.card:nth-child(3)` 必然红。我做了**最小更正**（`-5/+7` 行，全在这一个用例内）：`toBe(4)`、加一条 `.module-quick` 在第 3 列的断言、`gridItems[3]`、`nth-child(4)`、用例标题与注释同步。→ 需要你把 check 表 B3「追加 4 条 / 既有用例不改」与简报 A 段「纯追加」改成「追加 7 条 + 更正 1 条既有网格顺序用例（理由：C5/F1）」，或打回让我换做法。**这是本次唯一超出「纯追加」的改动。**
2. **App 成了 `ql_list` 的第二个消费者**（`:437-442`，并在卡片 `@changed` 时刷新）。这是 K26(2)（构造方造 label）+ K11(5)（按 type 过滤）的必然结果，但 C 段没写这一项。列表数据所有权仍在卡片，App 只留一份只读镜像（名称 + type）；失败时用配置 id 兜底文案。
3. **`getCurrentInstance()` 取 expose 句柄**：见「实现要点 1」。若你认为太巧，替代做法是给 `LogPanel` 加一个 `registerView` 透传（越界，要改任务 10 的文件）。
4. **K14(2) 单飞无专测**：简报把用例钉死为 7 条，我没加第 8 条。要钉就得追加「重复点击只发一次 `ql_start`」。
5. **词典里的 `ql.log.exit` / `ql.log.fail` 仍无调用点**（全仓 grep 只有 `dict.ts` 两处定义 + 注释）。本任务 check 表没要求，主进程对 exe 路径已发 sys 行（`quick-launch.ts:279/:282`），所以我没在 App 的失败/退出路径落日志 —— 属扩范围。要不要补，请你定（补的话按 K21(3) 用 `{name}` / `{name}{msg}`）。
6. **`onTerminalResize` 我按 M8 收紧**（与 write 同一道守卫，含「停止中不发」）。M8 原文只写「不对 exe 配置调 `ql_write`/`ql_resize`」，「停止中也不要发」在索引 M8 行里；这是对它的从严解释，登记一下。
7. **复原多个运行中终端时 `activeTabId` 取最后一个**（`openTerminalTab` 的副作用）。规格只钉「复原后把它置为 `qlTabId(configId)`」，没钉多终端顺序。
8. **类型门覆盖不到 `.vue`**（索引 M16）：`tsconfig.main.json` 只含 `src-main`，仓库没有 `vue-tsc`。G2 绿只证明主进程侧干净；渲染端靠 vitest 运行时。
9. 文档小漂移（不影响实现）：check 表 B3 写「追加 4 条」，实际按 D 段与简报是 7 条；`App.test.ts:884` 上方那段「挂载位置 = .grid 第三列」的注释我没动（它描述 GPU 卡，现已过时）—— 落勾时你可以顺手改掉。

## 未做

- G3 / G4 真机门（索引 K33）：本 harness 起不了 Electron GUI，已写成 `☐（原因 + 去处）` 交任务 14。
- H1-H3：按索引 K5 我不 `git add`、不 commit；A-I 的勾留给你。
