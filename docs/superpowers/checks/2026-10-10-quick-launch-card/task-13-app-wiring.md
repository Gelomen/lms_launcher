# 任务 13 · App 接线（四列布局、状态、数据路由、重载复原） — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 13 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §9.2 / §7.6 / §4 · 关联审查重点 **R3 / R4**
> 前置：任务 6、7、9、10、11、12 全部完成
> 现状锚点：`src/style.css:76-80` 的 `.grid { grid-template-columns: 280px 350px 330px; }`

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 前置任务已提交 | `git log --oneline -8` | 任务 6-12 的提交都在 | ☐ |
| A3 | 全量基线 | `npm test` | 改动前全绿（对照基线） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/App.vue` | 修改 | `qlTabs` / `qlStates` / `terminalSinks` + 卡片顺序 | ☐ |
| B2 | `src/style.css` | 修改 `.grid` | 四列 `280px 350px 330px 330px` | ☐ |
| B3 | `src/App.test.ts` | 追加 **9** 条（E1-E7 + 索引 K34(5) 的两条）；**只允许更正 1 条既有用例**：`App.test.ts:886`「GPU 卡片是网格第 X 列」——四列（C5/F1）必然把 `.grid` 直接子级从 3 变 4，该用例的 `toBe(3)`/`gridItems[2]`/`nth-child(3)` 不可能同时成立。原写「既有用例不改」与 C5 自相矛盾，索引 K34(1) 已更正；除此之外既有用例一字不改 | （出处：本表 C5 / F1 / 索引 K34(1)） | ☐ |

## C. 状态与数据路由契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `qlTabs = ref<{ id: string; configId: string }[]>([])`、`qlStates = ref<Record<string, { running: boolean; stopping: boolean }>>({})` | 规格 §9.2 | ☐ |
| C2 | `terminalSinks: Map<string, (d: string) => void>`；`TerminalTabView` 挂载注册、卸载注销 | 规格 §9.2 | ☐ |
| C3 | `onQlData` 按 `tabId` 派发；**未知 tabId 忽略**（防竞态） | 规格 §9.2 | ☐ |
| C4 | `logBuckets` 只容纳 `launcher` / `llama-server`（v1「动态桶」作废） | 规格 §9.2 | ☐ |
| C5 | **卡片根节点类名 = `section.module.module-quick`（任务 11 已落地，索引 K30）**；四列布局按规格 §9.1 排卡片顺序：`stack → QuickLaunch（第 3 列）→ GPU（第 4 列）` | 规格 §4 / §9.2 | ☐ |
| C7 | **App 是 `ql_list` 的第二个消费者（只读镜像）**：页签文案要配置名（K26(2) 截断归构造方）、复原要按 `type` 过滤（K11(5)），所以 App 持 `qlConfigs` 镜像并在卡片 `@changed` 时刷新（`App.vue:344/:438-443/:516-518`）。**列表数据所有权仍在卡片（K29）**，App 不改写、不排序、不新增。索引 K34(2) | 本表 C5 / K26(2) / K11(5) / 索引 K34(2) | ☐ |
| C6 | **激活状态归 App（索引 K27(1)）**：`App` 持 `activeTabId`，以 `v-model:active` 传给 `LogPanel`；启动/新建终端页签后置为 `qlTabId(configId)`（规格 §9.2「自动激活」的机制）；`LogPanel` 点击页签冒泡 `update:active` 回写。**必须真回写**：受控下 `LogPanel` 不越权改激活态，摘掉当前激活页签时它只冒泡 `update:active(第一个 id)`（任务 10 表 E10 受控段只断到「冒泡」）——`App` 不接就留空白面板 | 规格 §9.2 / 索引 K27(1) / 任务 10 表 E10 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（**9 条**，见 E1-E9） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 C 组 + F 组 | ☐ |
| D4 | 步骤 4-1：定向 | `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` | 全 PASS | ☐ |
| D5 | 步骤 4-2：全量 | `npm test` | 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `ql-data` 按 `tabId` 派发到已注册 sink；未知 `tabId` 被忽略 | 计划 步骤 1 | ☐ |
| E2 | `ql-exit` 后该配置运行态清空，卡片行按钮回落「启动」，**页签保留** | 规格 §7.5 | ☐ |
| E3 | `onMounted` 读到 `ql_states` 里 running 的配置 → 重建**空**终端页签（历史丢失，输入与后续输出照常）；**复原路径同样要发一次 `ql_resize`**（索引 K11(2)），且必须 join `ql_list` 的 `type` 只给 shell 配置建页签（索引 K11(5)：`states()` 不区分 shell/exe） | 规格 §7.6 / 索引 K11(2)(5) | ☐ |
| E4 | 停止后该终端页签的 `[x]` 由禁用变为可用（**R3**） | 计划 步骤 1 | ☐ |
| E5 | 启动成功且 `tabId !== null` → 建页签（不存在时）+ **自动激活**（机制 = C6 的 `v-model:active`，索引 K27(1)） + `fit()` + 聚焦。**调用形式已按索引 K24 更正**：`TerminalTabView` 暴露的 `fit` 默认 **不** 强制重报（`fit(force = false)`，任务 9 的 F8 去重）——① 普通激活路径调 `fit()` 即可（`v-show` 恢复显示必然触发 `ResizeObserver` → 自己去重后上报）；② **「同一页签再次启动」那条路径（PTY 被重建为 80×24、容器尺寸没变）必须显式 `fit(true)`**，否则去重会吞掉那次唯一必要的 `ql_resize`，K11(2) 的硬门静默失效。测试要分别钉这两条：普通激活不重发、重启路径重发一次 | 规格 §9.2 / §9.3 / 索引 K11(2) / K23(3) / K24 | ☐ |
| E6 | 页签 `close` → 删页签 + 注销 sink（`running \|\| stopping` 时不触发） | 规格 §7.5 | ☐ |
| E7 | exe 类型启动（`tabId === null`）→ **不建页签**，仅按钮变红 | 规格 §7.5 | ☐ |
| E8 | **启动按钮单飞**：`ql_start` 未返回期间重复点击只发一次（索引 K14(2) 对任务 13 的硬要求）。**必须有用例**：我实测把守卫改成 `if (false) return;` → **0 红**，说明这条契约原本没有测试保护 | 索引 K14(2) / 索引 K34(5) | ☐ |
| E9 | **不对不可写配置调 `ql_write`/`ql_resize`**（无页签 / exe / 停止中一律不发）。**必须有用例**：我实测把守卫改成 `return true;` → **0 红** | 索引 M8 / 索引 K34(5) | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | `.grid` 四列 `280px 350px 330px 330px`；默认 1400px 下四列 1290px（可用 1340px） | 规格 §4 | ☐ |
| F2 | 窄窗口横向溢出属现状，本期不改 | 规格 §4 | ☐ |
| F3 | 终端页签用 `v-show` 保活（切走不销毁） | 规格 §9.3 | ☐ |
| F4 | 页签 id 一律经 `qlTabId(configId)`，不手拼字符串 | 规格 §9.2 | ☐ |
| F5 | 不实现重载后的历史回放 | 规格 §2 / §7.6 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npm test` | 全绿（本任务是全量绿的第一个硬门） | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | 真机 `npm run dev`：启动 cmd 配置 → 页签出现且自动激活 → 输入回显 → 停止 → `[x]` 可用 → 关页签 | 全流程可用 | ☐（**本 harness 起不了 GUI**：我实测 `node_modules\electron\dist\electron.exe --version` 与 `electron.exe .` 都立即退出，退出码 `-2147483645 = 0x80000003 STATUS_BREAKPOINT`（与规格 §13.2 记载一致）。→ **任务 14 真机门**，索引 K33） |
| G4 | 真机重载（Ctrl+R）：运行中的终端重建空页签且继续接收输出 | 与 §7.6 一致 | ☐（同 G3：本 harness 无 GUI，0x80000003；→ 任务 14 真机门，索引 K33） |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/App.vue src/style.css src/App.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(app): 快捷启动接入第 3 列、终端页签数据路由与重载复原` | ☐ |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☐ |

## I. 完成判据

- [ ] E1-E9 有测试（E8/E9 是 K14(2)/M8 的钉桩，索引 K34(5)）
- [ ] D5 全量绿
- [ ] G3 / G4 真机流程走通（输出记入 J）——**本环境不可执行，已按 K33 交任务 14**；本任务只交自动化门（D4/D5/G1/G2）
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 / 操作 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A3 | `git status --porcelain` / `git rev-parse HEAD` / `npx vitest run src/App.test.ts` | 工作区只有 `?? .superpowers/sdd/2026-10-10-quick-launch-card/task-13-brief.md`；HEAD=`0e735d6`；`Test Files 1 passed (1)` / `Tests 48 passed (48)`，exit 0。全量基线（47 files / 791 tests）见简报 A 段，本次未重复跑 | 起点与简报一致 |
| D1 | 追加 7 条用例到 `src/App.test.ts` | 名称逐字照本表 D1-D5；xterm 与三个 addon 按规格 §12.5 打桩；`qlDataHandlers` / `qlExitHandlers` 被驱动（索引 M9） | 先写失败测试 |
| D2 | `npx vitest run src/App.test.ts` | `Tests 7 failed \| 48 passed (55)`，exit 1。红：`ql_data_dispatches_to_registered_sink_and_ignores_unknown_tab_id` / `ql_exit_clears_running_state_but_keeps_tab` / `on_mounted_rebuilds_empty_tabs_for_running_shell_configs_only` / `stop_makes_tab_close_button_enabled` / `start_success_creates_tab_activates_it_and_calls_fit_focus` / `tab_close_removes_tab_and_unregisters_sink` / `exe_start_with_null_tab_id_creates_no_tab_only_red_button`；首条红因 = `.module-quick .tpl-row` 计数 0（卡片还没接进 App） | 真红：7 条全红、既有 48 条仍绿 |
| D3 | 实现 `src/App.vue`（+209/−4）、`src/style.css`（+1/−1） | C1-C6 逐条落地；`.grid` → `280px 350px 330px 330px`；卡片插在 TemplateModule 与 GPU 之间 | 见 C / E 段 |
| D4 | `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` | `Test Files 4 passed (4)` / `Tests 104 passed (104)`（App 55 / QuickLaunch 7 / LogPanel 20 / TerminalTabView 22），exit 0 | 定向绿 |
| D5 / G1 | `npm test` | `Test Files 47 passed (47)` / `Tests 798 passed (798)`，exit 0 = 基线 791 + 本任务 7，既有用例无一转红 | 全量绿、只增不减 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`EXIT=0` | 类型门绿 |
| 变异 ① | `onQlDataEvent` 不查 `terminalSinks`（向所有 sink 派发） | `Tests 1 failed \| 54 passed (55)`：`ql_data_dispatches_to_registered_sink_and_ignores_unknown_tab_id`。还原后 `src/App.vue` SHA = `5d863ad37536`（与变异前一致） | E1 按要求红 |
| 变异 ② | `onQlExitEvent` 里顺手删页签 | `1 failed \| 54 passed (55)`：`ql_exit_clears_running_state_but_keeps_tab`；SHA 一致 | E2 红 |
| 变异 ③ | 删掉复原路径的显式 `fit(true)` | `1 failed \| 54 passed (55)`：`on_mounted_rebuilds_empty_tabs_for_running_shell_configs_only`（`ql_resize` 只剩挂载首报 1 次，断言要 2 次）；SHA 一致 | E3 红 |
| 变异 ④ | `doQlStop` 结束不清运行态（`closeDisabled` 不回落） | `3 failed \| 52 passed (55)`：`stop_makes_tab_close_button_enabled` / `start_success_creates_tab_activates_it_and_calls_fit_focus` / `tab_close_removes_tab_and_unregisters_sink`；SHA 一致 | E4 红（连带两条：它们也走停止路径） |
| 变异 ⑤ | `openTerminalTab` 不置 `activeTabId` | `1 failed \| 54 passed (55)`：`start_success_creates_tab_activates_it_and_calls_fit_focus`；SHA 一致 | E5 红 |
| 变异 ⑥ | `if (r?.tabId)` → `if (true)`（exe 也建页签） | `1 failed \| 54 passed (55)`：`exe_start_with_null_tab_id_creates_no_tab_only_red_button`；SHA 一致 | E7 红 |
| 范围 | `git status --porcelain` / `git diff --numstat` | 只有三处：`src/App.vue` +209/−4、`src/style.css` +1/−1、`src/App.test.ts` +240/−5。`App.test.ts` 的 −5 行全部落在既有「GPU 卡片是网格…」用例内（四列布局必然改变 `.grid` 直接子项数：`toBe(3)`→`toBe(4)`、`gridItems[2]`→`gridItems[3]`、`nth-child(3)`→`nth-child(4)`、用例标题与注释同步）；其余 47 条既有用例一字未改 | B3「既有用例一字不改」与 C5/F1 + G1 不能同时成立 → 见报告「疑虑 1」 |
| G3 | 真机流程 | 未跑：本 harness 起不了 Electron GUI（索引 K33，实测 `0x80000003`） | ☐（原因 + 去处：任务 14 真机门） |
| G4 | 重载复原 | 同上 | ☐（原因 + 去处：任务 14 真机门） |
