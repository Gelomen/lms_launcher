# 任务 4 · `QuickLaunchModal` 接上真实图标 + 改写既有 CSS 契约门 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 4 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.4 / §6.5 / §6.6-2 / §7.1-11..13 · 关联审查重点 **RF1 RF2 RF5**
> 前置：任务 2（`TerminalInfo.icon` 已在类型里）、任务 3（`Dropdown` 的 `imageUrl` 通道已可用）
> 索引：[00-index.md](00-index.md) 的 G2 G6 G7 G8 G9 G10、RF1 RF2 RF5、**K3**（面板 + trigger）、**K5**（无图标项不渲染 img）、**K10**（不改宽度）、**K12**（`:726-737` 的改写口径）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置任务 2、3 已提交 | `git log --oneline -3` | 上两条分别是 `feat(main): ql_terminals 带可选 icon…` 与 `feat(ui): Dropdown 支持选项图片图标…` | ☐ |
| A2 | 接线点属实 | 读 `src/modules/QuickLaunchModal.vue:110-113`（`terminalOptions`：`terminals.value.map(info => ({ value: info.id, label: TERM_LABEL[info.id]() }))`）、`:56-61`（`TERM_LABEL`，**不改**）、`:242-254`（[终端] 那一行，`Dropdown` 用法在 `:250-253`，**不改**） | 与本表引用逐字一致 | ☐ |
| A3 | 测试夹具与助手属实 | 读 `src/modules/QuickLaunchModal.test.ts:22-27`（`TERMS` 四项，顺序 = powershell → cmd → pwsh → wsl）、`:95-100`（`dropdownOf` / `triggerOf` / `triggerText`）、`:104-106`（`iconTags`）、`:68`（`injectRealCss`）、`:43`（`mockLms`）、`:59`（`mountModal`） | 属实 → 新用例复用这些助手，不另造 | ☐ |
| A4 | 要改写的两条既有门在位（索引 K12） | 读 `src/modules/QuickLaunchModal.test.ts:711-721`（`type_field_is_widened_to_180px`，**不改**）与 `:722-737`（`trigger_label_after_an_icon_absorbs_the_free_space_others_do_not`：`:733` 断 [类型] 的 `flexGrow === '1'`、`:735) 断 [终端] 的 `not.toBe('1')`） | 属实 → 本任务按 C4 改写 `:735) 那一半；`:722-725` 的注释同步改写 | ☐ |
| A5 | 宽度取证（不改宽度的依据） | 读 `src/modules/QuickLaunchModal.vue:527-534`（注释记 `.term-field` 实测 356.7px；规则在 `:534`） | 属实 → 本任务不碰这两行（G7 / 索引 K10）；真机门 §7.2-1/2 兜（规格 §9-R6） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src/modules/QuickLaunchModal.vue` | 改一处：`:110-113` 的 map 里加 `imageUrl: info.icon` | `:56-61`（标签表）、`:100-103`（`typeOptions`，[类型] 的 FA 图标）、`:131-143`（`loadTerminals`）、`:242-254`（模板）、`:444` 与 `:534`（两条宽度规则）**一字不改** | ☐ |
| B2 | `src/modules/QuickLaunchModal.test.ts` | ① `:22-27` 的 `TERMS` 四项各加一个可区分的 `icon` 值；② 新增 2 条用例（E1/E2 名字逐字）；③ 按 C4 改写 `:722-737` | 其余用例一字不改，含 `:669-700`（[类型] 图标门）与 `:711-721`（180px 门）；`SHELL_ENTRY`（`:31`）等其它夹具不动 | ☐ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `terminalOptions` 的元素 = `{ value: info.id, label: TERM_LABEL[info.id](), imageUrl: info.icon }`（`info.icon` 为 `undefined` → Vue 不写 `src`、不渲染 img） | 规格 §6.4 | ☐ |
| C2 | [类型] 的 `typeOptions`（`:100-103`）保持 `icon`（FA），**不**混用 `imageUrl` | 规格 §5-5 / G6 | ☐ |
| C3 | 标签文案仍来自 `t('ql.term.*')`（`:56-61`）：主进程不带文案（索引 K7 的既有口径不变） | 规格 §6.3 | ☐ |
| C4 | 改写 `:722-737`：用例名改成 `trigger_labels_after_an_icon_absorb_the_free_space`；[类型] 与 [终端] 两个下拉的 `.select-label` 都断 `flexGrow === '1'`；注释改成「[终端] 现在也带图标（2026-10-16 §6.4）；不传图标的下拉由 `Dropdown.test.ts` 的 `options_without_icon…` 钉住」 | 规格 §6.6-2 / 索引 K12 | ☐ |
| C5 | 无新 i18n 键、无新 IPC、无新依赖、无新样式规则（样式在任务 3 已加） | 规格 §5 / G2 G3 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改夹具 + 写 2 条失败测试 + 改写 `:722-737` | — | 只碰 B2 | ☐ |
| D2 | 跑红 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | E1/E2 红（没有 img）；改写后的那条红在 [终端] 的 `flexGrow`（还没接上图标）→ 三条红都贴 J 段 | ☐ |
| D3 | 实现 B1（一行） | — | 只碰 B1 | ☐ |
| D4 | 跑绿 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 该文件全绿，条数 = 原条数 + 2 | ☐ |
| D5 | 相邻回归（索引 V3） | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts` | 全绿；[类型] 图标门与 180px 门仍绿且一字未改 | ☐ |
| D6 | 类型 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | exit 0；`Tests 923 passed (923)`（921 + 2） | ☐ |

## E. 必须钉住的行为断言

| # | 用例名（逐字） | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `terminal_options_and_trigger_carry_the_real_terminal_icons` | 打开 [终端] 面板：四项 `li` 的 `textContent` 与 `t('ql.term.*')` 逐字相同（不重排、不加字）；每项 `firstElementChild` 是 `img.option-image` 且 `src` = 该项夹具的 `icon`；trigger 首个子节点是 `img.select-image` 且 `src) = 当前选中项（默认第一项 = powershell）；点第二项（`cmd)）→ trigger 的 `src) 换成 `cmd) 的 | 规格 §7.1-11 / RF2 RF5 / 索引 K3 | ☐ |
| E2 | `terminal_option_without_icon_renders_no_img` | 夹具里 `cmd` 不带 `icon` → 那一项没有 `<img>`、文字照常；其余三项有 | 规格 §7.1-12 / RF1 / 索引 K5 | ☐ |
| E3 | 改写后的 `trigger_labels_after_an_icon_absorb_the_free_space` | 两个带图标的下拉的 `.select-label` 都断 `flexGrow === '1'`（`min-width: 0` 仍在 → 吸收宽度后照样能收缩 + ellipsis） | 规格 §6.6-2 / 索引 K12 | ☐ |
| E4 | 既有 [类型] 图标门（`:669-700)）与 180px 宽度门（`:711-721)）一字不改且绿 | 本次没把 [类型] 带偏 | 规格 §5-5 / G6 G7 | ☐ |
| E5 | 弹窗高度定高门（`:739`) 起的 218px 契约）仍绿 | 加图标不改变弹窗高度 | 规格 §7.2-5 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G7 / 索引 K10：不改宽度 | `git diff -U0 src/modules/QuickLaunchModal.vue` 只允许 `:110-113` 一处 hunk；`:444` 与 `:534` 不得出现在 diff 里 | ☐ |
| F2 | G6：[类型] 与另两个调用方不受影响 | `git diff src/modules/TemplateModal.vue src/components/LaunchBar.vue` 为空 | ☐ |
| F3 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空；新代码字面量无汉字 | ☐ |
| F4 | G9 / G10 | `git diff --name-only` = B1/B2 两份；`git log --oneline -1` 仍是任务 3 的提交 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全绿，条数 +2 | ☐ |
| G2 | 索引 V3 | `npx vitest run src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts` | 全绿 | ☐ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | `Tests 923 passed (923)`，exit 0 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts` | ☐ |
| H2 | commit message（逐字） | `feat(ui): 快捷启动 [终端] 下拉每一项显示真实图标` | ☐ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1–A5 实测过
- [ ] B1/B2 落地、无越界（组件 diff 只有一处）
- [ ] C1–C5 与 spec §6.4/§6.6 逐字一致
- [ ] D1→D6 先红后绿，J 段有真实输出
- [ ] E1–E5 在位且绿
- [ ] F1–F4 无越界
- [ ] G1–G5 全绿，总数 923
- [ ] H1–H3 由主代理执行

## J. 执行记录（实现时填）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
| J-3 | | |
| J-4 | | |
| J-5 | | |
