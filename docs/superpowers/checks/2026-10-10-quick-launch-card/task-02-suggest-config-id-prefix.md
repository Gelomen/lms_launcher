# 任务 2 · `suggestConfigId` 支持前缀 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 2 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.4
> 现状锚点：`src-main/config.ts:117-124`（现签名 `suggestConfigId(existing: string[]): string`，候选串 `'tpl' + Date.now().toString(36) + rand()`，100 次重试后抛 `VALIDATION: err.config.idGen`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 现有调用点清单 | `grep -n "suggestConfigId" src-main/*.ts` | 生产调用点仅 `src-main/main.ts:292`（`suggestConfigId(existingConfigIds(p))`）；测试调用点 `config.test.ts:138,144` | ☐ |
| A3 | id 契约确认 | 读 `config.ts:174` `validateConfigId` | 小写字母开头、`[a-z0-9]`、≤32 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/config.ts` | 修改 117-124 | 只改签名与候选串前缀来源 | ☐ |
| B2 | `src-main/config.test.ts` | 追加 2 个用例 | 既有用例一行不改 | ☐ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export function suggestConfigId(existing: string[], prefix = 'tpl'): string` | 计划 §任务 2 接口 | ☐ |
| C2 | 候选串 = `prefix + Date.now().toString(36) + rand()` | 计划 步骤 3 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | 两个用例落盘（自定义前缀 / 默认前缀仍 tpl） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/config.test.ts` | 第一个用例 FAIL（第二参数被忽略） | ☐ |
| D3 | 步骤 3：实现（加默认参数） | — | 签名带默认值，其余逻辑不动 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/config.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 钉它的测试 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | `suggestConfigId([], 'ql')` 以 `ql` 开头且 `validateConfigId` 为 true | 新增用例 1 | 规格 §5.4 | ☐ |
| E2 | `suggestConfigId([])` 仍以 `tpl` 开头（默认值不变） | 新增用例 2 | 规格 §5.4「默认值不变」 | ☐ |
| E3 | 防重与重试逻辑保留：`existing` 命中则换候选；100 次仍冲突才抛 `VALIDATION:` | 既有 `config.test.ts:138,144` 用例继续绿 | 计划 全局约束 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 默认参数必须是 `'tpl'`，既有调用点（`main.ts:292`）不改 | 模板 id 前缀漂移，既有测试与用户数据受影响 | ☐ |
| F2 | 前缀必须满足 id 契约（小写字母开头、`[a-z0-9]`）；本期只用 `'ql'` | 生成的 id 被 `validateConfigId` 拒掉 | ☐ |
| F3 | 不改 `validateConfigId`、不改 `existingConfigIds` | 契约面扩大 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/config.test.ts` | 全 PASS（含既有 id 生成用例） | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/config.ts src-main/config.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(config): suggestConfigId 支持自定义 id 前缀` | ☐ |

## I. 完成判据

- [ ] D1-D4 先红后绿
- [ ] E1-E3 有测试证据
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
