# 任务 4 · `QuickLaunchModal` 接上真实图标 + 改写既有 CSS 契约门 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 4 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.4 / §6.5 / §6.6-2 / §7.1-11..13 · 关联审查重点 **RF1 RF2 RF5**
> 前置：任务 2（`TerminalInfo.icon` 已在类型里）、任务 3（`Dropdown` 的 `imageUrl` 通道已可用）
> 索引：[00-index.md](00-index.md) 的 G2 G6 G7 G8 G9 G10、RF1 RF2 RF5、**K3**（面板 + trigger）、**K5**（无图标项不渲染 img）、**K10**（不改宽度）、**K12**（`:726-737` 的改写口径）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置任务 2、3 已提交 | `git log --oneline -3` | 上两条分别是 `feat(main): ql_terminals 带可选 icon…` 与 `feat(ui): Dropdown 支持选项图片图标…` | ☑ |
| A2 | 接线点属实 | 读 `src/modules/QuickLaunchModal.vue:110-113`（`terminalOptions`：`terminals.value.map(info => ({ value: info.id, label: TERM_LABEL[info.id]() }))`）、`:56-61`（`TERM_LABEL`，**不改**）、`:242-254`（[终端] 那一行，`Dropdown` 用法在 `:250-253`，**不改**） | 与本表引用逐字一致 | ☑ |
| A3 | 测试夹具与助手属实 | 读 `src/modules/QuickLaunchModal.test.ts:22-27`（`TERMS` 四项，顺序 = powershell → cmd → pwsh → wsl）、`:95-100`（`dropdownOf` / `triggerOf` / `triggerText`）、`:104-106`（`iconTags`）、`:68`（`injectRealCss`）、`:43`（`mockLms`）、`:59`（`mountModal`） | 属实 → 新用例复用这些助手，不另造 | ☑ |
| A4 | 要改写的两条既有门在位（索引 K12） | 读 `src/modules/QuickLaunchModal.test.ts:711-721`（`type_field_is_widened_to_180px`，**不改**）与 `:722-737`（`trigger_label_after_an_icon_absorbs_the_free_space_others_do_not`：`:733` 断 [类型] 的 `flexGrow === '1'`、`:735) 断 [终端] 的 `not.toBe('1')`） | 属实 → 本任务按 C4 改写 `:735) 那一半；`:722-725` 的注释同步改写 | ☑ |
| A5 | 宽度取证（不改宽度的依据） | 读 `src/modules/QuickLaunchModal.vue:527-534`（注释记 `.term-field` 实测 356.7px；规则在 `:534`） | 属实 → 本任务不碰这两行（G7 / 索引 K10）；真机门 §7.2-1/2 兜（规格 §9-R6） | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src/modules/QuickLaunchModal.vue` | 改一处：`:110-113` 的 map 里加 `imageUrl: info.icon` | `:56-61`（标签表）、`:100-103`（`typeOptions`，[类型] 的 FA 图标）、`:131-143`（`loadTerminals`）、`:242-254`（模板）、`:444` 与 `:534`（两条宽度规则）**一字不改** | ☑ |
| B2 | `src/modules/QuickLaunchModal.test.ts` | ① `:22-27` 的 `TERMS` 四项各加一个可区分的 `icon` 值；② 新增 2 条用例（E1/E2 名字逐字）；③ 按 C4 改写 `:722-737` | 其余用例一字不改，含 `:669-700`（[类型] 图标门）与 `:711-721`（180px 门）；`SHELL_ENTRY`（`:31`）等其它夹具不动 | ☑ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `terminalOptions` 的元素 = `{ value: info.id, label: TERM_LABEL[info.id](), imageUrl: info.icon }`（`info.icon` 为 `undefined` → Vue 不写 `src`、不渲染 img） | 规格 §6.4 | ☑ |
| C2 | [类型] 的 `typeOptions`（`:100-103`）保持 `icon`（FA），**不**混用 `imageUrl` | 规格 §5-5 / G6 | ☑ |
| C3 | 标签文案仍来自 `t('ql.term.*')`（`:56-61`）：主进程不带文案（索引 K7 的既有口径不变） | 规格 §6.3 | ☑ |
| C4 | 改写 `:722-737`：用例名改成 `trigger_labels_after_an_icon_absorb_the_free_space`；[类型] 与 [终端] 两个下拉的 `.select-label` 都断 `flexGrow === '1'`；注释改成「[终端] 现在也带图标（2026-10-16 §6.4）；不传图标的下拉由 `Dropdown.test.ts` 的 `options_without_icon…` 钉住」 | 规格 §6.6-2 / 索引 K12 | ☑ |
| C5 | 无新 i18n 键、无新 IPC、无新依赖、无新样式规则（样式在任务 3 已加） | 规格 §5 / G2 G3 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改夹具 + 写 2 条失败测试 + 改写 `:722-737` | — | 只碰 B2 | ☑ |
| D2 | 跑红 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | E1/E2 红（没有 img）；改写后的那条红在 [终端] 的 `flexGrow`（还没接上图标）→ 三条红都贴 J 段 | ☑ |
| D3 | 实现 B1（一行） | — | 只碰 B1 | ☑ |
| D4 | 跑绿 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 该文件全绿，条数 = 原条数 + 2 | ☑ |
| D5 | 相邻回归（索引 V3） | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts` | 全绿；[类型] 图标门与 180px 门仍绿且一字未改 | ☑ |
| D6 | 类型 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | exit 0；`Tests 923 passed (923)`（921 + 2） | ☑ |

## E. 必须钉住的行为断言

| # | 用例名（逐字） | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `terminal_options_and_trigger_carry_the_real_terminal_icons` | 打开 [终端] 面板：四项 `li` 的 `textContent` 与 `t('ql.term.*')` 逐字相同（不重排、不加字）；每项 `firstElementChild` 是 `img.option-image` 且 `src` = 该项夹具的 `icon`；trigger 首个子节点是 `img.select-image` 且 `src) = 当前选中项（默认第一项 = powershell）；点第二项（`cmd)）→ trigger 的 `src) 换成 `cmd) 的 | 规格 §7.1-11 / RF2 RF5 / 索引 K3 | ☑ |
| E2 | `terminal_option_without_icon_renders_no_img` | 夹具里 `cmd` 不带 `icon` → 那一项没有 `<img>`、文字照常；其余三项有。**另加另一半**（实测多出的覆盖面，出处仍是同一口径、不是扩范围）：换选到缺图标那一项 → trigger 也不带 `<img>`、文字照常（与 E1 的 ④ 成对） | 规格 §7.1-12 / §8-Q5 / RF1 / 索引 K5 | ☑ |
| E3 | 改写后的 `trigger_labels_after_an_icon_absorb_the_free_space` | 两个带图标的下拉的 `.select-label` 都断 `flexGrow === '1'`（`min-width: 0` 仍在 → 吸收宽度后照样能收缩 + ellipsis） | 规格 §6.6-2 / 索引 K12 | ☑ |
| E4 | 既有 [类型] 图标门（`:669-700)）与 180px 宽度门（`:711-721)）一字不改且绿 | 本次没把 [类型] 带偏 | 规格 §5-5 / G6 G7 | ☑ |
| E5 | 弹窗高度定高门（`:739`) 起的 218px 契约）仍绿 | 加图标不改变弹窗高度 | 规格 §7.2-5 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G7 / 索引 K10：不改宽度 | `git diff -U0 src/modules/QuickLaunchModal.vue` 只允许 `:110-113` 一处 hunk；`:444` 与 `:534` 不得出现在 diff 里 | ☑ |
| F2 | G6：[类型] 与另两个调用方不受影响 | `git diff src/modules/TemplateModal.vue src/components/LaunchBar.vue` 为空 | ☑ |
| F3 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空；新代码字面量无汉字 | ☑ |
| F4 | G9 / G10 | `git diff --name-only` = B1/B2 两份；`git log --oneline -1` 仍是任务 3 的提交 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全绿，条数 +2 | ☑ |
| G2 | 索引 V3 + K23（六个调用方） | `npx vitest run src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts` | 全绿 | ☑ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | `Tests 923 passed (923)`，exit 0 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts` | ☑ |
| H2 | commit message（逐字） | `feat(ui): 快捷启动 [终端] 下拉每一项显示真实图标` | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1–A5 实测过
- [x] B1/B2 落地、无越界（组件 diff 只有一处）
- [x] C1–C5 与 spec §6.4/§6.6 逐字一致
- [x] D1→D6 先红后绿，J 段有真实输出
- [x] E1–E5 在位且绿
- [x] F1–F4 无越界
- [x] G1–G5 全绿，总数 923
- [x] H1–H3 由主代理执行

## J. 执行记录（实现时填）

> 所有命令在仓库根由 PowerShell 执行并捕获输出（实际调用带 `2>&1`）；exit 码逐条给出。
> vitest 汇总行原文里的竖线（`3 failed | 27 passed`）在本表写成 `·`，以免打断 Markdown 表格列。
> 表里的旧行号按索引 K20 = 取证时位置；改后真实行号在各行内注明。

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `git log --oneline -5`；`git status --porcelain`；读 `QuickLaunchModal.vue:110-113` / `:56-61` / `:242-254` / `:527-534`、`QuickLaunchModal.test.ts:22-27` / `:95-106` / `:68` / `:669-700` / `:711-721` / `:722-737` / `:739`、`Dropdown.vue:87-92/:137-140/:150`、`style.css:351-352/:360-361/:371` | **A 段起点核对**。A1 属实：HEAD = `646d81a feat(ui): Dropdown 支持选项图片图标（imageUrl，与 FontAwesome 并列且优先）`（任务 3），上两条 = `c3f5746 feat(main): ql_terminals 带可选 icon…`（任务 2）与 `2175f9d feat(main): 终端图标提取层…`（任务 1）；分支 `feat/quick-launch`；工作区只有 `.superpowers/sdd/…` 四份未跟踪报告。A2 属实：`:110-113` = `terminalOptions`（只有 `value` + `label`）、`:56-61` = `TERM_LABEL` 四个 `t('ql.term.*')`、`:250-253` = [终端] 的 `Dropdown` 用法。A3 属实：`TERMS` 四项顺序 = powershell → cmd → pwsh → wsl；`dropdownOf` / `triggerOf` / `triggerText` / `iconTags` / `injectRealCss` / `mockLms` / `mountModal` 全在位 → 新用例复用它们，未另造助手。A4 属实：`:711-721`（180px 门）与 `:722-737`（`:733` 断 [类型] `flexGrow === '1'`、`:735` 断 [终端] `not.toBe('1')`）逐字对上 → 本任务只改写后者。A5 属实：`:527-534` 注释记 `.term-field` 实测 356.7px、规则在 `:534`（改后 `:537`）→ 本任务不碰（G7 / 索引 K10），真机门 §7.2-1/2 兜（§9-R6）。exit 0 |
| J-2 | `npx vitest run src/modules/QuickLaunchModal.test.ts`（改前基线） | exit 0：`✓ src/modules/QuickLaunchModal.test.ts (28 tests)` / `Tests 28 passed (28)` → 本文件原条数 = 28，D4 的「+2」由此取证（不靠猜） |
| J-3 | D1：改夹具 + 写 2 条失败测试 + 改写 `:722-737`（只碰 B2） | `git diff -U0 src/modules/QuickLaunchModal.test.ts` 的 hunk 头逐条：`@@ -21,0 +22,4 @@`（夹具注释）、`@@ -23,4 +27,4 @@`（`TERMS` 四项各加**可区分**的 `icon`：`data:image/png;base64,` + AAAA / BBBB / CCCC / DDDD）、`@@ -701,0 +706,78 @@`（E1/E2 两条新用例，名字逐字）、`@@ -724,3 +806,7 @@` + `@@ -735 +821 @@`（C4 改写：用例名 → `trigger_labels_after_an_icon_absorb_the_free_space`、注释按 C4 改写、[终端] 断言从 `not.toBe('1')` 改成 `toBe('1')`）。**`:669-700`（[类型] 图标门）、`:711-721`（180px 门）、`:739` 起的 218px 门不在任何 hunk 里** → E4/E5「一字未改」有机械证据 |
| J-4 | `npx vitest run src/modules/QuickLaunchModal.test.ts`（D2 跑红） | exit 1：`Tests 3 failed · 27 passed (30)`。三条红逐字：① `terminal_options_and_trigger_carry_the_real_terminal_icons` → `选项 0 的图标不在文字之前: expected '' to be 'img'`；② `terminal_option_without_icon_renders_no_img` → `不带 icon 的那一项不该渲染 img，其余三项照常: expected [ null, null, null, null ] to deeply equal [ 'data:image/png;base64,AAAA', …(3) ]`；③ `trigger_labels_after_an_icon_absorb_the_free_space` → `[终端] 现在带真实图标，它的 .select-label 也该吸收剩余宽度: expected '' to be '1'`。③ 的 [类型] 那一半（`flexGrow === '1'`）此时**绿** → 红只在新改的 [终端] 那一半，与 D2 预期逐条对上 |
| J-5 | D3 实现 B1（只碰 B1）：`git diff -U0 src/modules/QuickLaunchModal.vue` | **只有一个 hunk**：`@@ -112,0 +113,3 @@ const terminalOptions = computed(() => terminals.value.map((info) => ({` → 加两行说明注释 + `imageUrl: info.icon,`（改后 `:115`；C1 逐字）。两条宽度规则（原 `:444` / `:534`，改后 `:447` / `:537`）**不在 diff 里**；`:56-61` / `:100-103` / `:131-143` / `:242-254` 无 hunk → F1 / G7 / 索引 K10 过 |
| J-6 | `npx vitest run src/modules/QuickLaunchModal.test.ts`（D4 跑绿） | exit 0：`✓ src/modules/QuickLaunchModal.test.ts (30 tests)` / `Tests 30 passed (30)` = 原 28 + 2（G1）。既有 28 条一字未改仍绿，含 [类型] 图标门（现 `:673`）、180px 门（现 `:793`）、218px 定高门（现 `:833`）→ E1–E5 全在位且绿 |
| J-7 | `npx vitest run src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts`（D5 / 索引 V3 + G2 / K23 六个调用方） | exit 0：`Test Files 5 passed (5)` / `Tests 165 passed (165)`（QuickLaunch 10 · LaunchBar 11 · SettingsModal 12 · UpdateModal 70 · TemplateModal 62）。注：索引 K23 写的 `LaunchBar.vue:118` 实测路径 = `src/modules/LaunchBar.vue`（不是 `src/components/`）；按 K17/K20 不改文档，这里登记实测位置 |
| J-8 | `npx tsc --noEmit -p tsconfig.main.json; $LASTEXITCODE`（G3 / G8） | 无任何诊断输出，`TSC_EXIT=0` |
| J-9 | `npx vitest run src-main/i18n`（G4 / G2 三门） | exit 0：`Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 · no-hardcoded 2 · dict 11 · key-coverage 2）；`git diff src-main/i18n` = 0 字符；B1 新增行只有 `imageUrl: info.icon,` 一个代码字面量，无汉字（测试里的中文是断言消息，与本文件既有写法一致） |
| J-10 | `npm test`（G5 / G8 全量） | exit 0：`Test Files 53 passed (53)` / `Tests 923 passed (923)` = 921（任务 3 后）+ 2，与 D6 / 索引 G8 的预期总数逐字一致，**无差额需要解释**。（文件数 53 = 任务 1 新增 `ql-terminal-icons.test.ts` 后 52→53，非本次引入） |
| J-11 | `git diff --name-only`；`git diff --stat src/modules/TemplateModal.vue src/modules/LaunchBar.vue src-main/i18n src/style.css src/components/Dropdown.vue src-main/quick-launch-terminals.ts src-main/main.ts package.json pnpm-lock.yaml package-lock.json`；`git log --oneline -1`（F2/F3/F4 / G6 G9 G10） | 源码改动只有 B1/B2 两份（`QuickLaunchModal.vue` +3/−0、`QuickLaunchModal.test.ts` +97/−8，删除的 8 行 = 夹具四行 + 被改写的注释与断言行）。上面那串 diff **全为空**（G6：[类型] 与另五个调用方一字不变；G3/G2：无新依赖、无新 i18n 键；任务 1/2/3 的产物未被本次触碰）。HEAD 仍是 `646d81a` → 未 `git add`、未 commit、未 stash（G9） |
| J-12 | **主代理独立复跑（验收，20:4x）**：`npm test`；`npx vitest run src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts src/modules/QuickLaunchModal.test.ts`（索引 V3 + K23 六个调用方）；`npx tsc --noEmit -p tsconfig.main.json` | 全量 = `Test Files 53 passed (53)` / `Tests 923 passed (923)` exit 0；六文件 = `Test Files 6 passed (6)` / `Tests 195 passed (195)`；`TSC_EXIT=0` → 与 J 段自述一致（自述 165 = 不含 QuickLaunchModal 本身，加它的 30 = 195，对得上） |
| J-13 | 主代理核边界：`git diff -U0 -- src/modules/QuickLaunchModal.vue \| Select-String "^@@"` 计数；`git diff -- TemplateModal.vue LaunchBar.vue Dropdown.vue style.css src-main/i18n` 行数；`git diff --name-only` | 组件 = **1 个 hunk**（只在 :110-113 的 map 里）；其余五处 diff = **0 行**；改动清单只有 B 段两份 + 本表 |
| J-14 | 主代理裁 B1 的两行注释与 E2 的「另一半」：都在边界内（一处 hunk / 同一 Q5 口径），**接受**；K23 的 `LaunchBar.vue` 路径已补全为 `src/modules/LaunchBar.vue` | 见本表 E2 行与索引 K23 现文 |
