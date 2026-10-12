# 任务 10 · 定向修复轮 1（唯一一项：受控激活，索引 K27(1)）

背景：任务 10 的实现我已验收通过（门复跑：G1 `61 passed`、i18n `25 passed`、`App.test.ts 48 passed`、`tsc` exit 0；我的四处变异探针与你报的计数逐条一致：① 3 红 / ② 1 红 / ③ 1 红 / ④ 1 红，SHA 还原一致）。**只剩一个接口缺口**：规格 §9.2:243 要求「点 [启动] → 自动激活该页签」，但 `active` 写死在 `LogPanel` 内部，任务 13 的 B 段不含 `LogPanel.vue` → 任务 13 无法驱动它。已定口径 **K27(1)**（见 `docs/superpowers/checks/2026-10-10-quick-launch-card/00-index.md`，commit `a193bca`）。

## 范围（只有两个文件）

- `src/modules/LogPanel.vue`：加**可选** prop `active?: string` 与 emit `update:active: [id]`（check 表 C4 已更新）。
- `src/modules/LogPanel.test.ts`：补 check 表新增的 **E9 / E10** 两条用例。
- 其余文件一字不改（`log-tabs.ts` / `style.css` / `TerminalTabView.vue` / `App.vue` / 词典）。不 `git add`、不 commit（K5）。

## 语义（照 K27(1)，不得自行改变）

1. **受控**：传了 `active` 时，激活项以 prop 为准；点击页签**只冒泡 `update:active(id)`**，不自行改激活态（App 改 prop 才切）。
2. **非受控（缺省）**：不传 `active` 时行为与现在**一字不变**（内部 `ref` 自持、默认第一个）。这是既有 11 条用例与 `App.vue` 不受影响的保证，必须保持。
3. **兜底**：激活项被从 `tabs` 里摘掉时不得留空白面板——非受控时内部回落到第一个；受控时**冒泡 `update:active(第一个 id)`（状态归 App，我不越权改它）。
4. `scrollIntoView`（F2）在受控路径同样要生效（切换由 prop 驱动时也要把激活页签滚进可视区）。

## 用例（先写失败测试，D2 真红再实现）

- **E9** `active_is_controlled_when_prop_given_and_emits_update_active`：传 `active` → 面板按 prop 显示；点另一个页签 → `update:active` 收到该 id 且**面板不自行切换**；`setProps` 改 `active` → 面板切换 + 该页签 `scrollIntoView` 被调用；不传 `active` 时点击即切换（既有行为回归）。
- **E10** `removed_active_tab_falls_back_to_first_not_blank`：关掉/摘掉当前激活页签 → 面板不空白、第一个页签成为激活（非受控）；受控时断 `update:active` 带第一个 id。

## 门（跑完把命令与真实输出追加到 check 表 J 段的 E9/E10 行；A-I 的勾留给我，K25）

- `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts src/modules/TerminalTabView.test.ts` → 全 PASS（既有 11+21+22 + 上轮 7 条一字未改）
- `npx vitest run src/App.test.ts` → 仍 `48 passed`（`App.vue` 未改 = 非受控路径不变的证据）
- `npx vitest run src-main/i18n src/i18n.test.ts` → `25 passed`；`npx tsc -p tsconfig.main.json --noEmit` → exit 0
- 变异自检两处：① 去掉点击处理里的 `emit('update:active', …)` → E9 必须红；② 去掉 `watch(items, …)` 的兜底 → E10 必须红。逐条还原后报 SHA。

报告追加到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-10-report.md`（新增「定向修复轮 1」一节：先红/后绿计数、E9/E10 用例行号、变异各红几条）。不派子代理。

回传给我（简短）：状态一行 + 四条门的真实计数 + 两处变异各红几条 + 疑虑（若有）。