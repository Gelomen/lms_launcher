# 任务 3 · `Dropdown` 的 `imageUrl` 通道 + 图标尺寸样式 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 3 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.4 / §6.6-2 / §7.1-8..10 · 关联审查重点 **RF4 RF5**
> 前置：无接口依赖（不 import 任务 1/2 的产物）；按 plan 编号串行，排在 2 之后
> 索引：[00-index.md](00-index.md) 的 G6 G7 G8 G9 G10、RF4 RF5、**K3**（面板 + trigger 都显示）、**K9**（14×14 与基线对齐）、**K10**（不改宽度）、**K12**（`flexGrow` 断言的搬家）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置：任务 2 已提交 | `git log --oneline -1` | 上一条 = `feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）` | ☑ |
| A2 | 既有 `icon` 通道锚点属实（本次与它并列，不替换） | 读 `src/components/Dropdown.vue:19-22`（为什么扩 `icon` 的注释）、`:23-32`（props，`options` 元素类型在 `:25`）、`:82-85`（`currentOption` / `triggerLabel` / `triggerIcon`，`:85` = `const triggerIcon = computed(() => currentOption.value?.icon)`）、`:127-130`（trigger 图标位，`:128` = `<FontAwesomeIcon v-if="triggerIcon" … class="select-icon">`）、`:135-140`（选项，`:140` = `… <FontAwesomeIcon v-if="o.icon" … class="option-icon" />{{ o.label }}</li>`） | 与本表引用逐字一致 | ☑ |
| A3 | 既有图标样式锚点属实 | 读 `src/style.css:343-350`（为什么这么写的取证注释）、`:351`（`.select-trigger .select-icon { flex: none; }`）、`:352`（`.dropdown-panel .option .option-icon { margin-right: 6px; }`）、`:353-359`（相邻兄弟只给紧跟图标的标签 `flex: 1 1 auto`） | 与本表引用逐字一致；`:319`（`.select-trigger` 是 flex + `gap: 8px` + `space-between`）、`:320`（`.select-label { min-width: 0 … }`）也属实 | ☑ |
| A4 | 字号基准属实（`1em` = 14px） | 读 `src/style.css:116`（`.btn { font-size: var(--fs-body) }`）与 `:31`（`--fs-body: 14px`）；`:346-348` 的注释记 FA 在 14px 下实测 17.5×14 | 属实 → 本次 img 取 `1em` = 14×14（索引 K9） | ☑ |
| A5 | 既有测试的牙在位（G6 / RF4） | 读 `src/components/Dropdown.test.ts:182-237`：`WITH_ICONS`（`:183-186`）、`NO_ICONS`（`:187-190`）、`iconTags`（`:192-194`）、带图标用例（`:196-223`）、无图标用例（`:225-237`） | 属实 → 本任务只在 `:225-237` 里**加**一条断言，其余一字不改 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src/components/Dropdown.vue` | 改四处：① `:25` 的 `options` 元素类型加 `imageUrl?: string`；② `:85` 之后加 `triggerImageUrl`；③ `:128` 的 trigger 图标位改成 `imageUrl` 优先的 `<img class="select-image">` + `v-else-if` 走既有 FA；④ `:140` 的选项图标位同理（`<img class="option-image">`） | 面板定位（`place()` / `PANEL_GAP`）、`pick()`、tooltip、`.select-caret`（`:130`）一字不改；不引入新 props 之外的公共 API | ☑ |
| B2 | `src/style.css` | 在 `:352` 之后加两条 img 规则（C4）；把 `:359` 的选择器扩成 `.select-icon + .select-label, .select-image + .select-label` | `:343-350` 的取证注释与 `:351` / `:352` / `:353-358` 一字不改（只在 `:359` 那行加一个选择器 + 一段说明注释）；`.term-field` / `.type-field` 不在本文件（G7） | ☑ |
| B3 | `src/components/Dropdown.test.ts` | 新增 2 条用例（E1/E2 名字逐字）；在既有 `:225-237` 用例末尾加一条 `flexGrow` 断言（E3） | 既有 `:196-223` 用例一字不改；`WITH_ICONS` / `NO_ICONS` / `iconTags` 三个夹具不扩形状（新增用例自带自己的夹具） | ☑ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | props 的 options 元素类型 = `Array<{ value: string; label: string; tip?: string; icon?: IconDefinition; imageUrl?: string }>` | 规格 §6.4 | ☑ |
| C2 | `const triggerImageUrl = computed(() => currentOption.value?.imageUrl);`（与 `triggerIcon` 同一份 `currentOption` 来源 → 图标随选中项走） | 规格 §6.4 / RF5 | ☑ |
| C3 | trigger 与选项的渲染优先级：有 `imageUrl` → `<img class="select-image">` / `<img class="option-image">`（`:src` 原样）；否则有 `icon` → 既有 `<FontAwesomeIcon>`；两者都无 → 一字不变。两个 `<img>` 另带 `alt=""`（装饰图，同 `App.vue:539` 写法，索引 K22）——**不在契约内、不钉测试**，代价登记在 K22 | 规格 §6.4 / RF5 / 索引 K22 | ☑ |
| C4 | 新增两条样式规则（逐字）：`.select-trigger .select-image { flex: none; width: 1em; height: 1em; object-fit: contain; }` 与 `.dropdown-panel .option .option-image { margin-right: 6px; width: 1em; height: 1em; object-fit: contain; vertical-align: -0.125em; }` | 规格 §6.4 / 索引 K9 | ☑ |
| C5 | `:359` 改成 `.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto; }` | 规格 §6.4 | ☑ |
| C6 | 无新 i18n 键、无新 IPC、无新依赖；`index.html` 不加 CSP（`data:` URL 直接进 `<img>`，规格 §3-P7） | 规格 §5-3 / §6.4 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（E1/E2 + E3 的加行） | — | 只碰 B3 | ☑ |
| D2 | 跑红 | `npx vitest run src/components/Dropdown.test.ts` | E1/E2 红（`imageUrl` 被忽略 → 没有 `<img>`）；E3 的 `flexGrow` 断言此时**绿**（无图标本就不该吸收宽度）——红/绿分布贴 J 段 | ☑ |
| D3 | 实现 B1（组件） | — | 只碰 B1 | ☑ |
| D4 | 实现 B2（样式） | — | 只碰 B2 | ☑ |
| D5 | 跑绿 | `npx vitest run src/components/Dropdown.test.ts` | 该文件全绿，条数 = 原条数 + 2 | ☑ |
| D6 | 相邻回归（索引 V2） | `npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts` | 三个文件全绿，后两个**条数与断言一字未改**（G6） | ☑ |
| D7 | 类型 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | exit 0；`Tests 921 passed (921)`（919 + 2） | ☑ |

## E. 必须钉住的行为断言

| # | 用例名（逐字） | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel` | trigger 子节点序列 = `['img:select-image', 'select-label', 'select-caret']`、`img` 的 `src` 逐字等于传入值；`li` 的 `firstElementChild` 是 `img.option-image` 且 `src` 对得上；`setProps({ value })` 换选中项 → trigger 的 `src` 跟着换 | 规格 §7.1-8 / RF5 / 索引 K3 | ☑ |
| E2 | `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon` | 同时给 `imageUrl` 与 `icon` → 只有 `<img>`（`iconTags` 里没有它）；只给 `icon` → 只有 svg（既有行为不回归） | 规格 §7.1-9 / RF5 | ☑ |
| E3 | 既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret`（`:225-237`）末尾加：`getComputedStyle(w.find('.select-label').element).flexGrow` **不是** `'1'` | 「不传图标就不受影响」的牙从 `QuickLaunchModal.test.ts:735` 搬到组件层（任务 4 删原处） ；**前置：该用例内注入真实 `src/style.css`**（同文件 `:106-112` 的 `injectRealCss` 手法）——不注入则这条断言恒真、没有牙（索引 K21） | 规格 §6.6-2 / 索引 K12 K21 / RF4 | ☑ |
| E4 | 既有 `options_with_icon_render_the_icon_before_the_label_in_trigger_and_panel`（`:196-223`）一字不改且仍绿 | 加 img 通道没把 FA 通道带偏 | 规格 §5-5 / G6 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G6：不传 `imageUrl` 的调用方一字不变 | `TemplateModal.test.ts` / `LaunchBar.test.ts` 的 diff 为空且绿 | ☑ |
| F2 | G7 / 索引 K10：不改宽度 | `git diff src/modules/QuickLaunchModal.vue` 为空（本任务不碰它）；`QuickLaunchModal.test.ts:711-721`（180px 门）仍绿 | ☑ |
| F3 | 索引 K9：尺寸与基线 | 新增规则里只有 `1em` 与 `-0.125em`，没有写死 14px 像素值 | ☑ |
| F4 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空 | ☑ |
| F5 | G9 / G10 | `git diff --name-only` = B1/B2/B3 三份；`git log --oneline -1` 仍是任务 2 的提交 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src/components/Dropdown.test.ts` | 全绿，条数 +2 | ☑ |
| G2 | 共享组件的调用方（原写「三个」，实测六个，索引 K23） | `npx vitest run src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/QuickLaunchModal.test.ts`；**独立审查另补**：`npx vitest run src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts` | 全绿；前两个文件 diff 为空；`QuickLaunchModal.test.ts` 的 [类型] 图标门（`:669-700`）仍绿；补跑的两份 = `Tests 82 passed (82)`（见 J-18） | ☑ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | `Tests 921 passed (921)`，exit 0 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src/components/Dropdown.vue src/style.css src/components/Dropdown.test.ts` | ☑ |
| H2 | commit message（逐字） | `feat(ui): Dropdown 支持选项图片图标（imageUrl，与 FontAwesome 并列且优先）` | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1–A5 实测过（锚点原文在 J 段）
- [x] B1–B3 落地、无越界
- [x] C1–C6 与 spec §6.4 逐字一致
- [x] D1→D7 先红后绿，J 段有真实输出
- [x] E1–E4 在位且绿
- [x] F1–F5 无越界
- [x] G1–G5 全绿，总数 921
- [x] H1–H3 由主代理执行

## J. 执行记录（实现时填）

> 所有命令在仓库根由 PowerShell 执行并捕获输出（实际调用带 `2>&1` 与 `Out-String`，下表按等价命令写）；exit 码逐条给出。

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `git log --oneline -3`；`git status --porcelain`；读 `Dropdown.vue:19-32/:82-85/:127-130/:135-140`、`style.css:31/:116/:319-320/:343-359`、`Dropdown.test.ts:100-112/:182-238` | **A 段起点核对**。A1：HEAD = `c3f5746 feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）`（= 任务 2 的提交），分支 `feat/quick-launch`；改动前工作区只有主代理落勾用的三份文档 + `.superpowers/sdd/…` 未跟踪报告。A2 属实：`:25` = `options: Array<{ value: string; label: string; tip?: string; icon?: IconDefinition }>;`、`:85` = `const triggerIcon = computed(() => currentOption.value?.icon);`、`:128` = `<FontAwesomeIcon v-if="triggerIcon" :icon="triggerIcon" class="select-icon" />`、`:140` = `…<FontAwesomeIcon v-if="o.icon" … class="option-icon" />{{ o.label }}</li>`。A3 属实：`:351` `.select-trigger .select-icon { flex: none; }`、`:352` `.option-icon { margin-right: 6px; }`、`:359` `.select-trigger .select-icon + .select-label { flex: 1 1 auto; }`、`:319`（flex + `gap: 8px` + `space-between`）、`:320`（`min-width: 0`）。A4 属实：`:31 --fs-body: 14px` + `:116 .btn { font-size: var(--fs-body) }` → `1em` = 14px。A5 属实：`WITH_ICONS:183-186` / `NO_ICONS:187-190` / `iconTags:192-194` / 带图标用例 `:196-223` / 无图标用例 `:225-237`；`injectRealCss` 只在另一个 describe（`:106-112`）→ **索引 K21 属实**（本 describe 无注入）。exit 0 |
| J-2 | 编辑 `src/components/Dropdown.test.ts`（D1，只碰 B3） | 新增 2 条用例（名字逐字：`options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel`、`imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon`；各自自带夹具 `IMAGES` / `BOTH`，未扩 `WITH_ICONS`/`NO_ICONS`/`iconTags` 的形状）；在既有无图标用例末尾加 `getComputedStyle(…).flexGrow` 不是 `'1'` 的断言，并在**该用例内**注入真实 `src/style.css`（同一个 `__real-css__` id 去重，K21）。取证：`git diff --numstat` → `src/components/Dropdown.test.ts` = 新增 84 行 / **删除 0 行**（既有用例一字未改） |
| J-3 | `npx vitest run src/components/Dropdown.test.ts`（D2 跑红） | exit 1：`Tests 2 failed · 8 passed (10)`。红只在两条新用例：① `trigger 子节点顺序不对：["select-label","select-caret"]: expected … to deeply equal [ 'img:select-image', …(2) ]`；② `trigger 里的 img 数量不对: expected +0 to be 1`（`imageUrl` 被忽略 → 没有 `<img>`）。**E3 的 `flexGrow` 断言此时绿**（无图标本就不该吸收宽度），与 D2 预期一致。红跑同时给出「原条数 = 8」→ D5 的「+2」有取证 |
| J-4 | `npx vitest run src/components/Dropdown.test.ts -t "options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret"` | K21 基线：exit 0，`Tests 1 passed · 9 skipped (10)` → 注入真 CSS 后该断言通过（`flexGrow` 不是 1） |
| J-5 | 临时把 `style.css:359` 的选择器改成对所有 `.select-label` 生效（`.select-trigger .select-label { flex: 1 1 auto; }`）→ 重跑 J-4 → 再改回 | **K21 的「有牙验证」（验收证据）**：exit 1，`Tests 1 failed · 9 skipped (10)`，失败信息逐字 =`不传图标时 .select-label 不该吸收剩余宽度（flexGrow 不该是 1）: expected '1' not to be '1'` → 这条断言真的有牙（happy-dom 确实应用了注入的真 CSS 与后代选择器）。改回后 `git diff --name-only` 不含 `src/style.css`（当时只剩测试文件 + 主代理的三份文档）→ 已完全还原，无残留 |
| J-6 | 编辑 `src/components/Dropdown.vue`（D3，只碰 B1） | 四处：`:30` props 加 `imageUrl?: string`（C1 逐字）；`:92` 加 `const triggerImageUrl = computed(() => currentOption.value?.imageUrl);`（C2 逐字，与 `triggerIcon` 同一份 `currentOption`）；`:137-138` trigger = `<img v-if="triggerImageUrl" :src="triggerImageUrl" class="select-image" alt="" />` + `<FontAwesomeIcon v-else-if="triggerIcon" …>`；`:150` 选项 = `<img v-if="o.imageUrl" :src="o.imageUrl" class="option-image" alt="" /><FontAwesomeIcon v-else-if="o.icon" …>`。`git diff` 只有这四处 + 三段说明注释；`place()` / `PANEL_GAP` / `pick()` / tooltip / `.select-caret` 无 hunk。`alt=""` 照 `src/App.vue:539` 既有写法（装饰图） |
| J-7 | 编辑 `src/style.css`（D4，只碰 B2） | `：352` 之后加一段注释 + 两条规则（C4 逐字，改后在 `:360-361`）；`:359` 改成 `.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto; }`（C5 逐字，改后 `:371`）。取证：`git diff --numstat` → `src/style.css` = 新增 13 行 / 删除 1 行（那唯一删除 = 被替换的选择器行）；`:343-350` 取证注释、`:351`、`:352`、`:353-358`（现 `:362-367`）一字未改。新增规则里的取值只有 `1em` / `-0.125em` 与 `margin-right: 6px`（与 `.option-icon` 同值，C4 逐字）；`git diff` 的新增行里 `14px` 只出现在注释（说明依据），**没有**任何写死的 14px 取值（F3 / 索引 K9） |
| J-8 | `npx vitest run src/components/Dropdown.test.ts`（D5 跑绿） | exit 0：`✓ src/components/Dropdown.test.ts (10 tests)` / `Tests 10 passed (10)` = 原 8 + 2（G1）。既有两条用例（含 E4 的 FA 用例）一字未改仍绿 |
| J-9 | `npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts`（D6 / 索引 V2） | exit 0：`Test Files 3 passed (3)` / `Tests 83 passed (83)`（Dropdown 10 · LaunchBar 11 · TemplateModal 62）；后两个文件 `git diff` = 0 字符（F1 / G6） |
| J-10 | `npx vitest run src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/QuickLaunchModal.test.ts`（G2 三个调用方） | exit 0：`Tests 101 passed (101)`（QuickLaunchModal 28 条一字未改仍绿，含 [类型] 图标门与 `.type-field` 180px 宽度门）；`git diff -- src/modules/QuickLaunchModal.vue` = 0 字符（F2 / 索引 K10） |
| J-11 | `npx tsc --noEmit -p tsconfig.main.json`（G3） | 无输出，`tsc exit code: 0` |
| J-12 | `npx vitest run src-main/i18n`（G4） | exit 0：`Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 · no-hardcoded 2 · dict 11 · key-coverage 2）；`git diff -- src-main/i18n` = 0 字符（F4 / G2） |
| J-13 | `npm test`（G5 / D7） | exit 0：`Test Files 53 passed (53)` / `Tests 921 passed (921)` = 919（任务 2 后）+ 2，与 D7 / 索引 G8 的预期逐字一致，**无差额需要解释** |
| J-14 | `git diff --name-only`；`git diff --numstat`；`git log --oneline -1` | F5 / G10：源码改动只有 B1/B2/B3 三份（numstat：测试 +84/−0、组件 +14/−4、样式 +13/−1）；`QuickLaunchModal.vue`、`QuickLaunchModal.test.ts`、`TemplateModal.test.ts`、`LaunchBar.test.ts`、`src-main/i18n`、`package.json` 与两份 lockfile、`index.html` 的 diff 全为 0 字符（F1/F2/F4/C6：无新依赖、无新 i18n 键、无 CSP）。HEAD 仍是 `c3f5746` → 未 `git add`、未 commit、未 stash（G9）。工作区里另有主代理落勾用的三份文档改动与 `.superpowers/sdd/…` 报告，本任务未触碰 |
| J-15 | **主代理独立复跑（验收，19:4x）**：`npm test`；`npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts`（索引 V2）；`npx tsc --noEmit -p tsconfig.main.json` | 全量 = `Test Files 53 passed (53)` / `Tests 921 passed (921)` exit 0；V2 = `Test Files 3 passed (3)` / `Tests 83 passed (83)`；`TSC_EXIT=0` → 与 J 段自述逐字一致 |
| J-16 | **主代理亲自复做 K21 的「有牙验证」**：备份 `src/style.css` → 把 `:371` 的选择器临时改成 `.select-trigger .select-label { flex: 1 1 auto; }` → `npx vitest run src/components/Dropdown.test.ts -t "options_without_icon"` → 还原 | 改宽后该用例**红**：`AssertionError: 不传图标时 .select-label 不该吸收剩余宽度（flexGrow 不该是 1）: expected '1' not to be '1'`（1 failed / 9 skipped）；还原后 `git diff -U0 src/style.css` 回到 2 个 hunk、+13/-1 → 这条断言确实有牙，K21 不是纸面要求 |
| J-17 | 主代理核边界：`git diff --name-only` | 只有 B 段三份（`Dropdown.vue` / `style.css` / `Dropdown.test.ts`）+ 我为 K21/K22 改的两份文档；`QuickLaunchModal.*` / `TemplateModal*` / `LaunchBar*` / `src-main/i18n` / `package.json` 的 diff 全为空（G6/G7/F1–F5） |
| J-18 | **独立审查（任务 3 审查者，只读）补跑名单外的两个调用方**：`npx vitest run src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts`；并抽查复现 J-4/J-8/J-11/J-13/J-14 | 补跑 = `Tests 82 passed (82)`；抽查五条逐字复现；判定 **Approved-with-minors**（无 Critical / 无 Important）。审查者指出「三个调用方」不实 → 索引 K23 补全六处名单，plan G6 / 索引 G6·V2 / task-03 G2 / task-04 G2 同步改 |
