# 任务 13 修复轮 1 · 补两条缺保护的硬要求（E8 / E9）

背景：任务 13 的实现已在工作区（未提交）。我验收复跑：D4 **4 files / 104 passed**、`npm test → 47 files / 798 passed`、`tsc -p tsconfig.main.json --noEmit` exit 0、i18n 25 passed；六处变异（E1/E2/E3/E4/E5/E7）与实现者报的逐条一致。**唯一缺口**：两条已登记的硬要求没有测试保护——

- 把 `App.vue:448` 的 `if (qlStarting.has(configId)) return;` 改成 `if (false) return;`（索引 K14(2) 的启动单飞）→ **0 红**
- 把 `App.vue:421` 的 `return hasTerminalTab(configId) && !!s && s.running && !s.stopping;` 改成 `return true;`（索引 M8 的不可写守卫）→ **0 红**

所以新增两条用例（check 表已加行：docs/superpowers/checks/2026-10-10-quick-launch-card/task-13-app-wiring.md 的 **E8 / E9**，口径登记在索引 **K34(5)**）。

## 要做的（只改 `src/App.test.ts`，**生产代码一行不改**）

1. **E8**：`start_button_is_single_flight_while_ql_start_pending` —— 让 `ql_start` 的 promise 挂住不 resolve，连点两次同一行的 [启动]，断言 `invoke('ql_start', …)` **只被调用一次**；resolve 后再点第三次应正常发出（证明是「单飞」而不是「永久禁用」）。
2. **E9**：`no_ql_write_or_ql_resize_for_non_writable_config` —— 三种不可写情形都断言**不发** `ql_write`/`ql_resize`：① exe 配置（`ql_start` 返回 `tabId = null`，无页签）；② 该配置没有终端页签；③ 页签存在但状态是 `stopping`。同时保留一条正例（可写时确实发一次），否则「永远不发」也能过。
3. 顺手修一处过时注释：`src/App.test.ts:884` 的 `// GPU 卡片…挂载位置 = .grid 第三列…` 已过时（该用例现在钉的是第四列）。**只改注释文字**，不动断言。

## 边界（越界即打回）

- 只改 `src/App.test.ts`。`src/App.vue`、`src/style.css`、`src/modules/**`、`src-main/**` 一字不动（若你认为守卫本身有 bug，**停下来报告**，不要自己改生产代码）。
- 既有 55 条用例（含上一轮更正过的那条网格顺序用例）一字不改；本次是纯追加 + 一处注释文字。
- 不新增 i18n 键；不 `git add`、不 commit（K5）；不跑 `npm run dev`（索引 K33：本 harness 起不了 GUI，`electron.exe` 立即退出 `0x80000003`）。
- 复用本文件已有的桩：`qlDataHandlers`/`qlExitHandlers`（`:33-34`）、`xh` 的 `FakeTerminal`/`FakeFitAddon`（上一轮已加在文件末尾）、`mountApp()` 与既有的 `invoke` 路由写法。不要另起一套 harness。

## 门（真实输出填进 check 表 J 段新增行；A-I 的勾留给我，K25）

- `npx vitest run src/App.test.ts` → **57 passed**（55 + 2）
- D4 `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` → 全 PASS（预期 106）
- `npm test` → **47 files / 800 passed**（798 + 2，既有一红都不行）
- `npx tsc -p tsconfig.main.json --noEmit` → exit 0
- `git diff --numstat -- src/App.vue src/style.css` 与本轮开始时一致（生产代码未动）；`git diff --numstat -- src/App.test.ts` 是纯追加 + 1 行注释
- **两条变异必须各有牙**（跑完还原并报 SHA）：⑦ `if (qlStarting.has(configId)) return;` → `if (false) return;` → E8 用例必须红；⑧ `terminalWritable` 的返回改成 `return true;` → E9 用例必须红。还原后 `src/App.vue` 的 SHA 必须仍是 `5d863ad37536`（前 12 位）。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-13-fix1-report.md。不派子代理。
回传给我（简短）：状态一行 + 各门真实计数 + 两条变异各红几条 + 还原后的 SHA。