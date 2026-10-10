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
| B3 | `src/App.test.ts` | 追加 4 条 | 既有用例不改 | ☐ |

## C. 状态与数据路由契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `qlTabs = ref<{ id: string; configId: string }[]>([])`、`qlStates = ref<Record<string, { running: boolean; stopping: boolean }>>({})` | 规格 §9.2 | ☐ |
| C2 | `terminalSinks: Map<string, (d: string) => void>`；`TerminalTabView` 挂载注册、卸载注销 | 规格 §9.2 | ☐ |
| C3 | `onQlData` 按 `tabId` 派发；**未知 tabId 忽略**（防竞态） | 规格 §9.2 | ☐ |
| C4 | `logBuckets` 只容纳 `launcher` / `llama-server`（v1「动态桶」作废） | 规格 §9.2 | ☐ |
| C5 | 卡片顺序：`stack → QuickLaunch（第 3 列）→ GPU（第 4 列）` | 规格 §4 / §9.2 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（4 条，见 E） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 C 组 + F 组 | ☐ |
| D4 | 步骤 4-1：定向 | `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` | 全 PASS | ☐ |
| D5 | 步骤 4-2：全量 | `npm test` | 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `ql-data` 按 `tabId` 派发到已注册 sink；未知 `tabId` 被忽略 | 计划 步骤 1 | ☐ |
| E2 | `ql-exit` 后该配置运行态清空，卡片行按钮回落「启动」，**页签保留** | 规格 §7.5 | ☐ |
| E3 | `onMounted` 读到 `ql_states` 里 running 的配置 → 重建**空**终端页签（历史丢失，输入与后续输出照常） | 规格 §7.6 | ☐ |
| E4 | 停止后该终端页签的 `[x]` 由禁用变为可用（**R3**） | 计划 步骤 1 | ☐ |
| E5 | 启动成功且 `tabId !== null` → 建页签（不存在时）+ **自动激活** + `fit()` + 聚焦 | 规格 §9.2 | ☐ |
| E6 | 页签 `close` → 删页签 + 注销 sink（`running \|\| stopping` 时不触发） | 规格 §7.5 | ☐ |
| E7 | exe 类型启动（`tabId === null`）→ **不建页签**，仅按钮变红 | 规格 §7.5 | ☐ |

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
| G3 | 真机 `npm run dev`：启动 cmd 配置 → 页签出现且自动激活 → 输入回显 → 停止 → `[x]` 可用 → 关页签 | 全流程可用 | ☐ |
| G4 | 真机重载（Ctrl+R）：运行中的终端重建空页签且继续接收输出 | 与 §7.6 一致 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/App.vue src/style.css src/App.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(app): 快捷启动接入第 3 列、终端页签数据路由与重载复原` | ☐ |

## I. 完成判据

- [ ] E1-E7 有测试
- [ ] D5 全量绿
- [ ] G3 / G4 真机流程走通（输出记入 J）
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 / 操作 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A3 | `npm test` 基线 |  |  |
| D5 | `npm test` |  |  |
| G3 | 真机流程 |  |  |
| G4 | 重载复原 |  |  |
