# 任务 6 · IPC 接线（12 通道 + 2 事件） — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 6 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §8
> 前置：任务 3（配置层）、任务 4（探测）、任务 5（进程管理）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 既有事件订阅模式 | 读 `src-main/preload.ts` 的 `onLogLine` | listener + removeListener 模式，照抄 | ☐ |
| A3 | `emitLog` 现有签名 | 读 `src-main/main.ts` | `emitLog(line, 'sys', tabs?)` 可用，`onSysLine` 走它 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 修改 | 注册 12 通道 + 2 事件；`ql` 单例 | ☐ |
| B2 | `src-main/preload.ts` | 修改 | 白名单 + 两个事件订阅 | ☐ |
| B3 | `src/ipc.ts` | 修改 | 封装与类型 | ☐ |
| B4 | `src/App.test.ts` | 追加用例 | 既有用例不改 | ☐ |

## C. 通道契约（严格照规格 §8，名称/参数/返回逐字）

| # | 通道 | 参数 | 返回 | ✓ |
|---|---|---|---|---|
| C1 | `ql_list` | — | `QuickLaunchList` | ☐ |
| C2 | `ql_save` | `id: string \| null, entry` | `string`（最终 id） | ☐ |
| C3 | `ql_delete` | `id` | `void`（不存在 → `VALIDATION:`） | ☐ |
| C4 | `ql_terminals` | — | `TerminalInfo[]` | ☐ |
| C5 | `ql_start` | `id` | `{ tabId: string \| null }` | ☐ |
| C6 | `ql_stop` | `id` | `void`（幂等） | ☐ |
| C7 | `ql_write` | `id, data: string` | `void` | ☐ |
| C8 | `ql_resize` | `id, cols, rows` | `void` | ☐ |
| C9 | `ql_states` | — | `Record<string, { running: boolean; stopping: boolean }>` | ☐ |
| C10 | `ql_pick_exe` | — | `string \| null`（`.exe` 过滤对话框） | ☐ |
| C11 | `clipboard_read` / `clipboard_write` | — / `text: string` | `string` / `void` | ☐ |
| C12 | 事件 `ql-data` = `{ tabId, data }`；`ql-exit` = `{ configId, code }` |  |  | ☐ |

## D. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | `typeof mod.onQlData === 'function'`、`typeof mod.onQlExit === 'function'` | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | `onData` → `ql-data`；`onExit` → `ql-exit`；`onSysLine` → 既有 `emitLog(line, 'sys')`；`clipboard_*` 用 Electron `clipboard` | ☐ |
| D4 | 步骤 4-1：单测 | `npx vitest run src/App.test.ts` | PASS | ☐ |
| D5 | 步骤 4-2：类型 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| D6 | 步骤 4-3：真机形状 | `npm run dev` → DevTools 依次调 `ql_list` / `ql_terminals` / `ql_save` / `ql_start` | 返回形状与 C 表一致；输出记入 J | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `src/ipc.ts` 导出 `onQlData` / `onQlExit` 两个订阅封装 | 计划 步骤 1 | ☐ |
| E2 | 12 个通道全部在 `preload.ts` 白名单里（漏一个 → 渲染端 invoke 报 no handler） | 规格 §8 | ☐ |
| E3 | 事件订阅用 removeListener 清理，重复订阅不叠加 | 照 `onLogLine` 模式 | ☐ |
| E4 | `onSysLine` 不新建通道，复用既有日志通道（exe 类型的无页签反馈） | 计划 步骤 3 | ☐ |
| E5 | `ql_pick_exe` 取消对话框 → 返回 `null`，不抛错 | 规格 §8 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 通道名与规格 §8 逐字一致（大小写、下划线） | 渲染端调不到 | ☐ |
| F2 | 主进程错误消息走 `t()`，前缀只用 G7 五种 | 渲染端无法分类 | ☐ |
| F3 | 不改 `src-main/process.ts`（G4） | llama-server 链路受影响 | ☐ |
| F4 | 不加规格外的通道（如 `ql_restart`） | 违反 G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/App.test.ts src/main 相关既有测试` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B4 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/main.ts src-main/preload.ts src/ipc.ts src/App.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(ipc): 快捷启动与终端通道接线` | ☐ |

## I. 完成判据

- [ ] C1-C12 全部落地且与规格 §8 一致
- [ ] D4-D6 三项都过（真机形状验证不可跳）
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 / 调用 | 实际返回（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D6 | `ql_list` |  |  |
| D6 | `ql_terminals` |  |  |
| D6 | `ql_save` |  |  |
| D6 | `ql_start` |  |  |
