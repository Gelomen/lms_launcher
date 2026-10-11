# 任务 2 · `suggestConfigId` 支持前缀 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 2 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.4
> 现状锚点：`src-main/config.ts:117-124`（现签名 `suggestConfigId(existing: string[]): string`，候选串 `'tpl' + Date.now().toString(36) + rand()`，100 次重试后抛 `VALIDATION: err.config.idGen`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑ |
| A2 | 现有调用点清单 | `grep -n "suggestConfigId" src-main/*.ts` | 生产调用点仅 `src-main/main.ts:292`（`suggestConfigId(existingConfigIds(p))`）；测试调用点 `config.test.ts:138,144` | ☑ |
| A3 | id 契约确认 | 读 `config.ts:174` `validateConfigId` | 小写字母开头、`[a-z0-9]`、≤32 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/config.ts` | 修改 117-124 | 只改签名与候选串前缀来源 | ☑ |
| B2 | `src-main/config.test.ts` | 追加 2 个用例 | 既有用例一行不改 | ☑ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export function suggestConfigId(existing: string[], prefix = 'tpl'): string` | 计划 §任务 2 接口 | ☑ |
| C2 | 候选串 = `prefix + Date.now().toString(36) + rand()` | 计划 步骤 3 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | 两个用例落盘（自定义前缀 / 默认前缀仍 tpl） | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/config.test.ts` | 第一个用例 FAIL（第二参数被忽略） | ☑ |
| D3 | 步骤 3：实现（加默认参数） | — | 签名带默认值，其余逻辑不动 | ☑ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/config.test.ts` | 全 PASS | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 钉它的测试 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | `suggestConfigId([], 'ql')` 以 `ql` 开头且 `validateConfigId` 为 true | 新增用例 1 | 规格 §5.4 | ☑ |
| E2 | `suggestConfigId([])` 仍以 `tpl` 开头（默认值不变） | 新增用例 2 | 规格 §5.4「默认值不变」 | ☑ |
| E3 | 防重与重试逻辑保留：`existing` 命中则换候选；100 次仍冲突才抛 `VALIDATION:` | 既有 `config.test.ts:138,144` 用例继续绿 | 计划 全局约束 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 默认参数必须是 `'tpl'`，既有调用点（`main.ts:292`）不改 | 模板 id 前缀漂移，既有测试与用户数据受影响 | ☑ |
| F2 | 前缀必须满足 id 契约（小写字母开头、`[a-z0-9]`）；本期只用 `'ql'` | 生成的 id 被 `validateConfigId` 拒掉 | ☑ |
| F3 | 不改 `validateConfigId`、不改 `existingConfigIds` | 契约面扩大 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/config.test.ts` | 全 PASS（含既有 id 生成用例） | ☑ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☑ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☑ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/config.ts src-main/config.test.ts` → 已执行（主代理，验收通过后） | ☑ |
| H2 | 提交信息逐字 | `feat(config): suggestConfigId 支持自定义 id 前缀` → `7b65a98`；K8 口径另做 `d8c11bc`（docs，与代码分开） | ☑ |

## I. 完成判据

- [x] D1-D4 先红后绿
- [x] E1-E3 有测试证据
- [x] G1-G3 通过
- [x] H1-H2 完成（`7b65a98`）

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain`；`git rev-parse --short HEAD` | 前者无输出；后者 `e97f79c` | 工作区干净，起点 = 任务 1 提交后 |
| A2 | grep 工具搜 `suggestConfigId`（等价 `grep -n "suggestConfigId" src-main/*.ts`） | 命中 `config.ts:117`、`main.ts:8,292`、`config.test.ts:3,138,144`；全仓复查除 docs 三份文档外无其他调用点 | 生产调用点仅 `main.ts:292`，未改 |
| A3 | 读 `src-main/config.ts:174-178` | `id.length === 0 \|\| id.length > 32` → false；`^[a-z]`；`^[a-z0-9]+$` | id 契约与表内预期一致，未改 |
| D1 | 编辑 `src-main/config.test.ts`（在 `suggest_config_id_is_unique_and_yaml_safe` 之后追加，现 148-155 行） | 落盘核对：148-152 自定义前缀用例、153-155 默认前缀用例，文本逐字同计划步骤 1 | 先红测试就位，既有用例未动 |
| D2 | `npx vitest run src-main/config.test.ts` | exit 1；`× config.ts > suggestConfigId 支持自定义前缀且仍满足 id 契约 → AssertionError: expected false to be true`，失败点 `src-main/config.test.ts:150:33`；`Tests 1 failed \| 75 passed (76)` | 第一个用例 FAIL（第二参数被忽略），符合预期 |
| D3 | 编辑 `src-main/config.ts:117,120` | `git diff` 仅两行：签名改 `suggestConfigId(existing: string[], prefix = 'tpl'): string`、候选串改 `prefix + Date.now().toString(36) + rand()`；`rand()`、100 次重试、防重、`VALIDATION: err.config.idGen` 均未动 | 实现完成，其余逻辑不动 |
| D4 | `npx vitest run src-main/config.test.ts` | exit 0；`✓ src-main/config.test.ts (76 tests) 194ms`；`Test Files 1 passed (1)`、`Tests 76 passed (76)` | 全绿 |
| E1 | `npx vitest run src-main/config.test.ts -t "suggestConfigId 支持自定义前缀且仍满足 id 契约"` | exit 0；`Tests 1 passed \| 75 skipped (76)` | `ql` 前缀且 `validateConfigId` 为 true |
| E2 | `npx vitest run src-main/config.test.ts -t "suggestConfigId 默认前缀仍是 tpl"` | exit 0；`Tests 1 passed \| 75 skipped (76)` | 默认前缀仍 `tpl` |
| E3 | `npx vitest run src-main/config.test.ts -t "suggest_config_id_is_unique_and_yaml_safe"` | exit 0；`Tests 1 passed \| 75 skipped (76)` | 既有防重 + 连取 50 个不碰撞用例（`config.test.ts:135-146`）继续绿 |
| G1 | `npx vitest run src-main/config.test.ts` | exit 0；`Tests 76 passed (76)`（含既有 id 生成用例） | 定向回归通过 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无诊断输出；回显 `TSC_EXIT=0` | 类型门通过 |
| G3 | `git diff --name-only`；`git status --porcelain` | 仅 `src-main/config.test.ts`、`src-main/config.ts`（后者 diff 只有 2 行，前者只有新增行） | 改动范围 = B1+B2，无越界 |
| 额外 | `npx vitest run`（全量 40 个测试文件） | exit 0；`Test Files 40 passed (40)`、`Tests 669 passed (669)`（含 `src-main/i18n/key-coverage.test.ts`、`no-hardcoded.test.ts`；本任务未新增 i18n 键） | 全仓回归无破坏 |
| H1/H2 | 主代理执行：`git add src-main/config.ts src-main/config.test.ts` + `git commit`；`git log --oneline -4` | `7b65a98 feat(config): suggestConfigId 支持自定义 id 前缀`（2 files, +11/−2）；其前一笔 `d8c11bc docs: 登记 K8…` | 提交门完成 |
| 验收（主代理复跑） | `npx vitest run src-main/config.test.ts`；`npx tsc -p tsconfig.main.json --noEmit`；`git diff --name-only`；`git status --porcelain \| ForEach-Object { "[{0}]" -f $_ }` | `Tests 76 passed (76)`；`TSC_EXIT=0`；范围仅两个源码文件；索引为空（`git diff --cached --name-only` 无输出） | 与 J 段自述一致；任务审查 Important #1（「check 表已暂存」）经核实是审查包生成时对 status 段做 `trim()` 吞掉首行前导空格造成的假象，索引实际为空，无需 `git restore --staged` |
