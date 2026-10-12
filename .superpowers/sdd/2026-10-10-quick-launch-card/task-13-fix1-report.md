# 任务 13 修复轮 1 · 报告（补 E8 / E9 两条缺保护的硬要求）

## 状态

**完成**：`src/App.test.ts` 追加 2 条用例（E8 启动单飞 / E9 不可写守卫）+ 更正 1 行过时注释；生产代码一行未改；四道门全绿；两条变异各红 1 条；还原后 `src/App.vue` SHA = `5d863ad37536`（与本轮开始时逐字一致）。

## 起点核对（未重复跑基线，用指纹核对）

| 项 | 本轮开始时实测 | 与简报 |
|---|---|---|
| `git diff --numstat` | `src/App.test.ts 240/5`、`src/App.vue 209/4`、`src/style.css 1/1` | 一致 |
| `Get-FileHash -Algorithm SHA256 src/App.vue` | `5D863AD37536…`（前 12 位 `5d863ad37536`） | 一致 |
| `git rev-parse HEAD` | `3c7672c1a84fd6f7d15cb092f0953462f13d9b3f` | 工作区未提交，符合 K5 |

基线计数（`App.test.ts 55 passed` / `npm test 47 files / 798 passed`）沿用主代理实测，本次未重复跑；追加后的第一次运行 `57 passed` 里既有 55 条全绿，可反证基线未被扰动。

## 改了什么（只改 `src/App.test.ts`）

1. **E8 `start_button_is_single_flight_while_ql_start_pending`**（`src/App.test.ts:1340`）
   - 复用 `mountQl()`，只把 `ql_start` 换成挂住的 promise（用 `invoke.getMockImplementation()` 取回 `mountQl` 的路由再包一层，其余通道原样转发）——不另起 harness。
   - 钉三件事：① 在途期间连点两次 → `invoke('ql_start', …)` 仍只有 `[['c1']]`；② 在途期间卡片按钮**既没变红也没 disabled**（`states` 未下发），所以点击确实到达 App，守卫只能在 App（去掉 `App.vue:448` 就拦不住）；③ `gate.resolve()` 后第一次点击的结果照常生效（页签建出、按钮变红），再「停止 → 第三次点同一行 [启动]」→ `ql_start` 发出第二次 = **单飞不是永久禁用**。
2. **E9 `no_ql_write_or_ql_resize_for_non_writable_config`**（`src/App.test.ts:1375`）
   - 驱动入口 = `w.findComponent(LogPanel).props('onInput' / 'onResize')`，即 `App.vue:577` 递给 `LogPanel`、`LogPanel.vue:85-86` 再透传给 `TerminalTabView` 的那两个回调（`App.onTerminalInput` / `App.onTerminalResize`）。
   - 三种不可写各断言**不发** `ql_write`/`ql_resize`：① 无页签（未启动的 shell 配置，`:1384-1389`）；② exe 配置（`ql_start` 返回 `tabId = null`，先钉 `ql_start(['c2'])` 已发、`ql:c2` 页签不存在、行按钮已变红 = 运行态确实置上，不是靠「没运行」蒙过守卫）；③ 页签在但 `stopping`（把 `ql_stop` 挂住停在「停止中」，先钉行按钮 `disabled` 以证明状态真的是 stopping）。
   - **正例同测**（`:1391-1399`）：页签在 + running + 非 stopping → `ql_write` 恰发一次 `['c1','ls\r']`、`ql_resize` 恰为「挂载首报 118×41 + 显式一次 100×30」两条；否则「永远不发」也能过。
3. **过时注释**（`src/App.test.ts:884`）：`.grid 第三列，TemplateModule 右侧` → `.grid 第四列，快捷启动卡右侧（2026-10-10 规格 §4 把快捷启动插到第 3 列，GPU 顺移到第 4 列）`。**只改注释文字**，该用例的断言一字未动。

## 门（真实输出）

| 门 | 命令 | 真实输出 | 结论 |
|---|---|---|---|
| 定向（单文件） | `npx vitest run src/App.test.ts` | `Test Files 1 passed (1)` / `Tests 57 passed (57)`，exit 0 | 55 + 2 ✅ |
| D4 | `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` | `Test Files 4 passed (4)` / `Tests 106 passed (106)`（App 57 / QuickLaunch 7 / LogPanel 20 / TerminalTabView 22），exit 0 | 全 PASS ✅ |
| D5 / G1 | `npm test` | `Test Files 47 passed (47)` / `Tests 800 passed (800)`，exit 0 | 798 + 2，既有一红都没有 ✅ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`TSC_EXIT=0` | ✅ |
| 范围 | `git diff --numstat` | `src/App.vue 209/4`、`src/style.css 1/1`（与本轮开始时逐字一致）；`src/App.test.ts 339/6` | 本轮净增 `+99/−1`，唯一删除行 = `:884` 那行注释（其余 5 条删除行是上一轮 GPU 用例的更正）→ 本轮 = 纯追加 + 1 行注释 ✅ |

## 两条变异（各有牙）

| # | 变异 | 真实输出 | 还原 |
|---|---|---|---|
| ⑦ | `App.vue:448` `if (qlStarting.has(configId)) return;` → `if (false) return;` | `Tests 1 failed | 56 passed (57)`，红 1 条：`start_button_is_single_flight_while_ql_start_pending`（在途断言 `toEqual([['c1']])` 收到 3 次调用） | 还原后 `src/App.vue` SHA = `5D863AD37536`，`git diff --numstat` 仍 `209/4` |
| ⑧ | `App.vue:421` `terminalWritable` 的返回改成 `return true;` | `Tests 1 failed | 56 passed (57)`，红 1 条：`no_ql_write_or_ql_resize_for_non_writable_config`（首红在 `src/App.test.ts:1388`「无页签也不发 write」） | 还原后 SHA = `5D863AD37536`，`git diff --numstat` 仍 `209/4` |

两次变异各只红对应的那一条，其余 56 条不受影响。

## 未做 / 边界遵守

- 未 `git add`、未 commit（K5）；未跑 `npm run dev`（K33，真机门 G3/G4 仍交任务 14）。
- 未新增 i18n 键；未改 `src/App.vue` / `src/style.css` / `src/modules/**` / `src-main/**`。
- 既有 55 条用例一字未改（含上一轮更正过的网格顺序用例）。
- 复用既有桩与 harness：`qlDataHandlers`/`qlExitHandlers`、`xh` 的 `FakeTerminal`/`FakeFitAddon`、`mountQl()` 的 `invoke` 路由写法；`FakeTerminal`/`FakeFitAddon` 的定义一字未动。

## 两点请主代理定口径（我没有自行扩范围）

1. **E9 的驱动入口**：`ql_write`/`ql_resize` 在 App 侧只有 `onTerminalInput`/`onTerminalResize` 两个入口，而它们由子组件调用；既有 `FakeTerminal.onData()` 丢弃回调（`src/App.test.ts:1123`），改桩就不是「纯追加」。所以我从 `LogPanel` 的 props 上取 App 传下去的那两个回调直接调用——覆盖的是 App 侧守卫（本轮唯一的新逻辑），「子组件确实会调它们」仍由 `TerminalTabView.test.ts` 钉。要不要把这条口径登记进索引 K 组（作为 K34(5) 的落地方式）？
2. **describe 标题**：两条新用例放在既有 `describe('App 快捷启动接线（任务 13 · E1-E7）')` 内（继承它的 `beforeEach`：`invoke.mockClear()`、`offsetWidth/Height` 覆写、`FakeRO`），因此标题里的「E1-E7」现在少了 E8/E9。改标题要动既有一行，与「纯追加」冲突，我没动。需要的话请落一句口径，我再改。

守卫本身没发现 bug：两条变异都只红对应的新用例，说明守卫的行为与 K14(2) / M8 一致（M8 的「停止中也不发」按 K34(6) 从严，已按 ③ 钉住）。
