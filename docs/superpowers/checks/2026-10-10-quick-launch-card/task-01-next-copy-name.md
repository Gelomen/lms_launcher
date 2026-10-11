# 任务 1 · 公共命名工具 `nextCopyName` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 1 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.4 / §12.2
> 用法：A→I 顺序逐行执行并勾选；命令必须真跑，输出写进 J。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑ |
| A2 | 现有复制逻辑定位 | 读 `src/modules/TemplateModule.vue` 第 70-80 行（70-72 为「方案 A」注释，73-80 为代码） | 找到 `COPY_SUFFIX = / - copy( \d+)?$/` 与递增循环 | ☑ |
| A3 | `src/util/` 目录状态 | `glob src/util/**` | 不存在则新建目录，不额外造 `index.ts` 之类 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/util/copy-name.ts` | 新建 | 只导出 `nextCopyName` | ☑ |
| B2 | `src/util/copy-name.test.ts` | 新建 | 计划给出的 3 个用例 | ☑ |
| B3 | `src/modules/TemplateModule.vue` | 第 70-80 行整体改为引用：删 73-80 的代码 + 70-72 那段描述它的注释，加一行 import | 该文件其余行不动；注释不得留在原地成为悬空注释（口径见 `00-index.md` K7） | ☑ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export function nextCopyName(base: string, taken: Set<string>): string` | 计划 §任务 1 接口 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | 三个用例落盘（`- copy` / 递增 / 剥后缀重算） | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/util/copy-name.test.ts` | FAIL：无法解析 `./copy-name` | ☑ |
| D3 | 步骤 3：实现 | — | 正则与循环**原样搬入**，无新逻辑 | ☑ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts` | 全 PASS | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 钉它的测试 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | 首次复制加 `- copy`：`nextCopyName('Qwen', {'Qwen'})` → `Qwen - copy` | `copy-name.test.ts` 用例 1 | 规格 §12.2 | ☑ |
| E2 | 已占用时递增：`{'Qwen','Qwen - copy'}` → `Qwen - copy 2` | 用例 2 | 规格 §12.2 | ☑ |
| E3 | 源名本身是复制品时剥后缀重算：`'Qwen - copy'` → `Qwen - copy 2`；`'Qwen - copy 2'` → `Qwen - copy` | 用例 3 | 规格 §12.2 | ☑ |
| E4 | 搬出的正则与旧实现逐字一致（含空格与 `( \d+)?$`） | 与 A2 读到的旧代码对照 | 计划 步骤 3「行为不许变」 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 搬移不是重写：行为不许变 | 模板卡复制行为漂移，既有测试兜不住语义 | ☑ |
| F2 | `TemplateModule.vue` 只做「引用替换」 | 无关 diff 混进 refactor 提交 | ☑ |
| F3 | 不扩范围（不做多语言后缀、不做可配置后缀） | 违反规格 §2 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/TemplateModule.test.ts` | 全 PASS（既有测试兜底） | ☑ |
| G2 | `git diff --name-only` | 只含 B1-B3 三个文件 | ☑ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/util/copy-name.ts src/util/copy-name.test.ts src/modules/TemplateModule.vue` → 已执行（主代理，验收通过后） | ☑ |
| H2 | 提交信息逐字 | `refactor(util): 抽出 nextCopyName 供模板卡与快捷启动卡共用` → `1e313bb`；口径同步另做 `662880b`（docs，按 K5/AGENTS.md 与代码分开） | ☑ |

## I. 完成判据

- [x] D1-D4 全部按序发生（先见红再见绿）
- [x] E1-E4 全部有测试或 diff 证据
- [x] G1-G2 通过
- [x] H1-H2 完成，HEAD 即本任务提交（`1e313bb`）

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain`；`git rev-parse --short HEAD` | 前者空输出；HEAD = `341319a`（与简报取证一致） | 起点干净，起点正确 |
| A2 | `read src/modules/TemplateModule.vue`（60-120 行） | 70-72 行是方案 A 注释，73 行 `const COPY_SUFFIX`，74-80 行递增循环；调用点原第 95 行 | 定位成立 |
| A3 | `glob src/util/**` | 目录已存在：`linkify` / `log-search` / `truncate` 三对 `.ts` + `.test.ts`，无 `index.ts` | 未新建目录、未造聚合文件 |
| D1 | 新建 `src/util/copy-name.test.ts`（计划用例逐字抄录） | 3 个用例落盘（首次 `- copy` / 已占用递增 / 剥后缀重算），换行 CRLF 与仓库一致 | 先红测试就位 |
| D2 | `npx vitest run src/util/copy-name.test.ts` | exit 1；`Error: Failed to load url ./copy-name (resolved id: ./copy-name) in .../src/util/copy-name.test.ts. Does the file exist?`；`Test Files 1 failed (1)` / `Tests no tests` | 红：无法解析 `./copy-name`，符合预期 |
| D3 | 新建 `src/util/copy-name.ts`；两次 `edit` 改 `TemplateModule.vue` | 正则与循环原样搬入（仅加 `export`）；`.vue` 删除 70-80 行、在第 10 行加 `import { nextCopyName } from '../util/copy-name';` | 实现完成，无新逻辑 |
| D4 | `npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts` | exit 0；`✓ src/util/copy-name.test.ts (3 tests)`、`✓ src/modules/TemplateModule.test.ts (20 tests)`；`Test Files 2 passed (2)` / `Tests 23 passed (23)` | 绿 |
| E4 | `git show HEAD:src/modules/TemplateModule.vue`（73-80 行）与 `src/util/copy-name.ts`（5-12 行）逐行比对 | 8 行中 7 行逐字相同，唯一差异是签名行多出 `export `；`/ - copy( \d+)?$/` 与 `` `${root} - copy ${i}` `` 完全一致；旧注释 3 行原样保留在新文件头（另加 1 行来源说明） | 搬移非重写 |
| G1 | `npx vitest run src/modules/TemplateModule.test.ts` | exit 0；`Tests 20 passed (20)`，含 `copy_click_dups_config_after_source_with_copy_name_and_new_id` / `copying_a_copy_strips_suffix_and_increments_number` / `copy_skips_taken_numbers_and_reuses_free_slot` | 既有兜底测试全绿 |
| G2 | `git diff --name-only`；`git status --porcelain`；`git diff --stat` | 仅 `src/modules/TemplateModule.vue`（M）+ `src/util/copy-name.ts`、`src/util/copy-name.test.ts`（??）；`git diff --stat` = `1 file changed, 1 insertion(+), 12 deletions(-)` | 改动范围 = B1-B3 |
| H1/H2 | `git add`（三个代码文件）+ `git commit`；`git log --oneline -3`；`git status --porcelain` | `1e313bb refactor(util): 抽出 nextCopyName 供模板卡与快捷启动卡共用`（3 files, +28/−12）；其前一笔 `662880b docs: …K7…`；工作区干净 | 提交门完成，HEAD 即本任务提交 |
| 额外（非本表要求，提前跑 V5） | `npx vitest run`（全量） | exit 0；`Test Files 40 passed (40)` / `Tests 667 passed (667)` / `Duration 8.39s` | 无跨文件回归 |
