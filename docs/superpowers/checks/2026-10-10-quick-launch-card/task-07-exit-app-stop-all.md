# 任务 7 · `exit_app` 停止全部终端 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 7 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §7.5（应用退出行） · 关联审查重点 **R3**（孤儿 PTY）
> 前置：任务 5（`stopAll`）、任务 6（`ql` 单例已在 `main.ts`）
> 现状锚点：`src-main/main.ts:371-375` = `stopGpuStats(); await ps.stopGraceful(3); app.exit(0);`

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 插入点确认 | 读 `src-main/main.ts:371-375` | `await ql.stopAll(3)` 必须在 `await ps.stopGraceful(3)` **之后**、`app.exit(0)` **之前** | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 修改 `exit_app` | 只加一行 await | ☐ |
| B2 | `src-main/quick-launch.ts` | 修改 `stopAll` | 逐个 await；空表直接返回 | ☐ |
| B3 | `src-main/quick-launch.test.ts` | 追加幂等用例 |  | ☐ |

## C. 契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `async stopAll(timeoutSecs: number): Promise<void>` 对**未运行**的配置不抛错（幂等） | 计划 步骤 1 | ☐ |
| C2 | `exit_app` 顺序：`stopGpuStats()` → `await ps.stopGraceful(3)` → `await ql.stopAll(3)` → `app.exit(0)` | 规格 §7.5 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：补一条断言（`stopAll` 对未运行配置不抛错） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/quick-launch.test.ts` | 新用例 FAIL | ☐ |
| D3 | 步骤 3：实现 | — | `stopAll` 逐个 await、空表早退；`exit_app` 插入 await | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 空表调用 `stopAll` → 立即返回、不抛错 | 计划 步骤 1 | ☐ |
| E2 | `stopAll` 对每个运行实例都调用 `stopGraceful(timeoutSecs)`（杀进程树，非只杀直接子进程） | 规格 §7.5 | ☐ |
| E3 | `stopAll` 后 `states()` 为空 | 规格 §7.5 | ☐ |
| E4 | 某个实例停止失败不得中断其余实例（逐个 await 且吞掉单点异常） | R3 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 不得把 `ql.stopAll` 放在 `app.exit(0)` 之后 | 进程来不及被杀 → 孤儿 PTY | ☐ |
| F2 | 不改 `ps.stopGraceful(3)` 与 `stopGpuStats()`（G4） | llama-server / GPU 采样链路受影响 | ☐ |
| F3 | 不新增「退出确认」之类交互 | 违反 G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | 真机：`npm run dev` 开一个终端 → 退出应用 → `tasklist \| findstr -i "cmd pwsh conpty OpenConsole"` | 无残留进程 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/main.ts src-main/quick-launch.ts src-main/quick-launch.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(main): exit_app 一并终止所有快捷启动终端` | ☐ |

## I. 完成判据

- [ ] D1-D4 先红后绿
- [ ] E1-E4 有测试或真机证据
- [ ] G1-G3 通过（G3 输出记入 J）
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| G3 |  |  |  |
