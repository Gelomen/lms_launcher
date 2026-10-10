# 任务 1 · 公共命名工具 `nextCopyName` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 1 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.4 / §12.2
> 用法：A→I 顺序逐行执行并勾选；命令必须真跑，输出写进 J。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 现有复制逻辑定位 | 读 `src/modules/TemplateModule.vue` 第 73-80 行 | 找到 `COPY_SUFFIX = / - copy( \d+)?$/` 与递增循环 | ☐ |
| A3 | `src/util/` 目录状态 | `glob src/util/**` | 不存在则新建目录，不额外造 `index.ts` 之类 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/util/copy-name.ts` | 新建 | 只导出 `nextCopyName` | ☐ |
| B2 | `src/util/copy-name.test.ts` | 新建 | 计划给出的 3 个用例 | ☐ |
| B3 | `src/modules/TemplateModule.vue` | 修改第 73-80 行改为引用 | 该文件其余行不动 | ☐ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export function nextCopyName(base: string, taken: Set<string>): string` | 计划 §任务 1 接口 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | 三个用例落盘（`- copy` / 递增 / 剥后缀重算） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/util/copy-name.test.ts` | FAIL：无法解析 `./copy-name` | ☐ |
| D3 | 步骤 3：实现 | — | 正则与循环**原样搬入**，无新逻辑 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 钉它的测试 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | 首次复制加 `- copy`：`nextCopyName('Qwen', {'Qwen'})` → `Qwen - copy` | `copy-name.test.ts` 用例 1 | 规格 §12.2 | ☐ |
| E2 | 已占用时递增：`{'Qwen','Qwen - copy'}` → `Qwen - copy 2` | 用例 2 | 规格 §12.2 | ☐ |
| E3 | 源名本身是复制品时剥后缀重算：`'Qwen - copy'` → `Qwen - copy 2`；`'Qwen - copy 2'` → `Qwen - copy` | 用例 3 | 规格 §12.2 | ☐ |
| E4 | 搬出的正则与旧实现逐字一致（含空格与 `( \d+)?$`） | 与 A2 读到的旧代码对照 | 计划 步骤 3「行为不许变」 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 搬移不是重写：行为不许变 | 模板卡复制行为漂移，既有测试兜不住语义 | ☐ |
| F2 | `TemplateModule.vue` 只做「引用替换」 | 无关 diff 混进 refactor 提交 | ☐ |
| F3 | 不扩范围（不做多语言后缀、不做可配置后缀） | 违反规格 §2 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/TemplateModule.test.ts` | 全 PASS（既有测试兜底） | ☐ |
| G2 | `git diff --name-only` | 只含 B1-B3 三个文件 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/util/copy-name.ts src/util/copy-name.test.ts src/modules/TemplateModule.vue` | ☐ |
| H2 | 提交信息逐字 | `refactor(util): 抽出 nextCopyName 供模板卡与快捷启动卡共用` | ☐ |

## I. 完成判据

- [ ] D1-D4 全部按序发生（先见红再见绿）
- [ ] E1-E4 全部有测试或 diff 证据
- [ ] G1-G2 通过
- [ ] H1-H2 完成，HEAD 即本任务提交

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
