# 任务 11 · 快捷启动卡片 `QuickLaunch.vue` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 11 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §4 / §9.4 / §11-1 / §12.5
> 前置：任务 1（`nextCopyName`）、任务 2（`ql` 前缀）、任务 3（配置层）、任务 8（`ql.*` 键）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 复用对象确认 | 读 `src/modules/TemplateModule.vue` | `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm` 与长名 fixed 浮层可复用 | ☐ |
| A3 | 按钮样式确认 | 读 `src/modules/LaunchBar.vue:125` | `state.running ? 'btn btn-danger' : 'btn btn-launch'` 同构 | ☐ |
| A4 | 截断工具 | 读 `src/util/truncate.ts:23` + `src/modules/TemplateModule.vue:113` | `truncateByWidth(s, budget, grace = 2)`，列表预算 **30**；**模板卡实际也是 30**（`const BUDGET = 30`），`style.css:340` 注释里的「25」是过时注释，不作依据（索引 K30） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/modules/QuickLaunch.vue` | 新建 | 不订阅事件，运行态由 App 下发 | ☐ |
| B2 | `src/modules/QuickLaunch.test.ts` | 新建 | 计划给出的 6 个用例 | ☐ |
| B3 | `src-main/i18n/dict.ts` | 修改（**仅一行**） | 索引 M2：en `ql.invalid`（:492）由 `{n} invalid entries skipped` 改为 `invalid entries skipped: {n}`（n=1 时原句语法不成立；本任务是首个调用点）。zh 侧不动、不新增键（索引 M2 / K28(2)） | ☐ |

## C. 接口契约（逐字）

| # | 契约 | ✓ |
|---|---|---|
| C1 | props：`{ states: Record<string, { running: boolean; stopping: boolean }> }` | ☐ |
| C2 | emits：`{ start: [configId: string]; stop: [configId: string]; changed: [] }` | ☐ |
| C3 | 内部 invoke：`ql_list` / `ql_save`（复制走 `ql_save` + `nextCopyName`） | ☐ |
| C4 | **不订阅** `ql-data` / `ql-exit`（与 `LaunchBar` 同构，单向数据流） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（6 条，见 E） | — | 用例落盘（invoke 用 mock） | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/modules/QuickLaunch.test.ts` | FAIL | ☐ |
| D3 | 步骤 3：实现 | — | 见 F 组 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src/modules/QuickLaunch.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 空列表显示空态文案（`ql.empty.none`） | 计划 步骤 1 | ☐ |
| E2 | 行显示截断后的名字；长名带 `data-tooltip` 全名（**预算 30**） | 规格 §11-1 | ☐ |
| E3 | 名字含 emoji 且超长时截断**不切断代理对** | 计划 步骤 1 | ☐ |
| E4 | 未运行 = 紫底「启动」；运行中 = 红底「停止」；`stopping` = **半角三点 `...`** 且禁用（索引 K30：与既有 `LaunchBar.vue:129` 逐字一致，计划 :406 也写半角三点；本表原写 U+2026 是我转录错，已更正） | 计划 :406 / 既有 `LaunchBar.vue:129` / 索引 K30 | ☐ |
| E5 | 复制的名字为 `X - copy`（走 `nextCopyName`，不自己拼后缀），且**卡片本地把新行插到源行正后方**——与既有 `TemplateModule.vue:86-93` 同一手法（遍历现有键序、源 id 后插入新 id）。**边界（索引 K28(1)）**：`ql_save` 落盘是追加语义（`quick-launch-config.ts:137-139`），文件里没有 insert-after 通道，所以「正后方」只存在于卡片本地显示序；重新加载后按文件序（末尾）。规格 §5.4 只讲 id 与复制命名，不讲位置——原引用已更正 | 计划 步骤 1 + 既有 `TemplateModule.vue:71-95` / 索引 K28(1) | ☐ |
| E6 | `invalid` 非空时显示「N 条配置无效」提示（`ql.invalid`） | 规格 §5.2 | ☐ |
| E7 | 每行按钮顺序 = `[复制][编辑][启动/停止]` | 规格 §4 | ☐ |

## F. 实现口径

| # | 口径 | 出处 | ✓ |
|---|---|---|---|
| F1 | 复用 `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm`，不新造一套行样式 | 计划 步骤 3 | ☐ |
| F2 | 启动按钮 `.btn-launch`（紫）/ 运行中 `.btn-danger`（红），图标 `faRocket` / `faStop` | 计划 步骤 3 | ☐ |
| F3 | 长名 tooltip 用模板卡同款 `position: fixed` 浮层 | 计划 步骤 3 | ☐ |
| F4 | 卡片标题「快捷启动」+ 新建图标按钮（`faFileCirclePlus` / `.icon-btn--sm`） | 规格 §4 | ☐ |
| F5 | 全部文案走 `t()` | G6 | ☐ |
| F6 | 不做拖动排序 / 命令历史 / 工作目录字段 | G10 | ☐ |
| F7 | **弹窗归卡片持有（索引 K29）**：本任务只留本地状态 `modalOpen`/`editingId`（新建/编辑按钮写它），**不 import** `QuickLaunchModal`（任务 12 才存在，挂载接线在任务 12 的 B3/E9）。卡片 emits 仍是 `start/stop/changed`，**不加 `new`/`edit` 事件**（规格 §9.4 的 emits 清单） | 索引 K29 / 规格 §9.4 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src-main/i18n` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B3 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/modules/QuickLaunch.vue src/modules/QuickLaunch.test.ts src-main/i18n/dict.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(module): 快捷启动卡片（列表/复制/编辑/启动停止）` | ☐ |
| H3 | **验收勾完整性（索引 K25）**：本表 A-I 不得有裸 `☐` 或 `- [ ]`；确实未满足的项写成 `☐（原因 + 去处）`。带附加列的段（如 zh / en）每一列都要落勾 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` → 本表行必须显示 `裸☐=0` 且 `I段 -[ ]=0`（H2 已勾时普查整体退出码 0） | ☐ |

## I. 完成判据

- [ ] E1-E7 有测试
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现者填写 · 2026-10-12；A-I 的勾留给主代理，索引 K5 / K25）

起点：HEAD `dd498d5`（简报写的 a4dd3ca 之后又有两笔 docs 提交：96d2d7d 补 F7、dd498d5 记 K28/K29）；`git status --porcelain` 只有未跟踪的 task-11-brief.md。基线由主代理实测 45 files / 775 tests（账本 :245），本次未改动前未复跑。

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D1 | 写 src/modules/QuickLaunch.test.ts（7 条用例，invoke 全 mock） | 9902 字节落盘；mock 只提供 invoke（不提供 onQlData/onQlExit → C4 的被动守卫） | 用例落盘 |
| D2 | `npx vitest run src/modules/QuickLaunch.test.ts` | `Error: Failed to resolve import "./QuickLaunch.vue" … File: …QuickLaunch.test.ts:8:24` · `Test Files 1 failed (1)` · `Tests no tests` · exit 1 | 先红（组件不存在；与任务 9 的 D2 同形） |
| D3 | 新建 src/modules/QuickLaunch.vue · 改 src-main/i18n/dict.ts 一行 | dict en ql.invalid → `invalid entries skipped: {n}`；`git diff --numstat` = 1 插入 / 1 删除 | 实现完成 |
| D4 | `npx vitest run src/modules/QuickLaunch.test.ts` | `✓ src/modules/QuickLaunch.test.ts (7 tests) 56ms` · `Test Files 1 passed (1)` · `Tests 7 passed (7)` | 后绿 |
| G1 | `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` | `✓ src/util/copy-name.test.ts (3 tests)` · `✓ src/modules/QuickLaunch.test.ts (7 tests)` · `Test Files 2 passed (2)` · `Tests 10 passed (10)` | 通过 |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts` | index 3 · no-hardcoded 2 · key-coverage 2 · dict 11 · i18n 7 → `Test Files 5 passed (5)` · `Tests 25 passed (25)` | 通过（B3 改文案后 i18n 硬门全绿；未新增键） |
| G3 | `git diff --name-only` · `git status --porcelain` · `git diff --numstat` | 代码侧只有 `src-main/i18n/dict.ts`（numstat `1 1` = 恰好一行）；另一处 diff 是本表的 J 段（18 插入 / 3 删除，填执行记录所致，前例见账本 :255）；未跟踪新增 = `src/modules/QuickLaunch.vue` / `src/modules/QuickLaunch.test.ts`（B1/B2，git diff 不列未跟踪）+ 报告 task-11-report.md + 起点就在的 brief | 代码改动 = B1-B3，无越界；未碰 App.vue / style.css / LogPanel·log-tabs / src-main 其余文件 |
| 额外-1 | `npm test` | `Test Files 46 passed (46)` · `Tests 782 passed (782)` · exit 0 | 基线 45/775 之上 +1 文件 / +7 用例，无减少 |
| 额外-2 | `npx tsc -p tsconfig.main.json --noEmit` | `tsc exit=0` | 通过 |
| 变异 ① | onCopy 的本地重排（QuickLaunch.vue:77-81）改为 `{ ...cur.items }; items[newId] = copy`（追加到末尾） | `× copy_uses_nextCopyName_and_inserts_locally_right_after_source` · `Tests 1 failed \| 6 passed (7)` | E5 有牙（恰 1 红） |
| 变异 ② | 删掉模板里的 `<span v-else-if="stateOf(id).stopping">…</span>`（:161） | `× start_stop_button_three_states_by_states_prop` · `Tests 1 failed \| 6 passed (7)` | E4 有牙（恰 1 红） |
| 变异 ③ | 删掉 invalid 计数提示 `<p v-if="list && list.invalid.length > 0" …>`（:140） | `× invalid_ids_render_count_hint` · `Tests 1 failed \| 6 passed (7)` | E6 有牙（恰 1 红） |
| 变异 ④（加做） | `const BUDGET = 30`（:104）改 25 | `× row_name_is_truncated_to_budget_30…` · `× emoji_long_name_is_not_split_at_surrogate_pair` · `Tests 2 failed \| 5 passed (7)` | 预算 30 被钉住（§11-1） |
| 变异还原 | 四次还原后 `Get-FileHash src/modules/QuickLaunch.vue` | 四次均为 `0A0739585295C2FAABC36AD533F2716BBFA9D4543D023CBE4F41FD091A4C213C`；还原后复跑 7 passed | 实现文件字节级一致 |
| 报告 | .superpowers/sdd/2026-10-10-quick-launch-card/task-11-report.md | 先红/后绿计数、E→用例映射、变异计数、疑虑清单 | 已写 |
