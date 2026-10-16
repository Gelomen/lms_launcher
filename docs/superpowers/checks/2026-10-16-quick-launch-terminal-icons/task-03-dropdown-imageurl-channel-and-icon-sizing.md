# 任务 3 · `Dropdown` 的 `imageUrl` 通道 + 图标尺寸样式 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 3 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.4 / §6.6-2 / §7.1-8..10 · 关联审查重点 **RF4 RF5**
> 前置：无接口依赖（不 import 任务 1/2 的产物）；按 plan 编号串行，排在 2 之后
> 索引：[00-index.md](00-index.md) 的 G6 G7 G8 G9 G10、RF4 RF5、**K3**（面板 + trigger 都显示）、**K9**（14×14 与基线对齐）、**K10**（不改宽度）、**K12**（`flexGrow` 断言的搬家）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置：任务 2 已提交 | `git log --oneline -1` | 上一条 = `feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）` | ☐ |
| A2 | 既有 `icon` 通道锚点属实（本次与它并列，不替换） | 读 `src/components/Dropdown.vue:19-22`（为什么扩 `icon` 的注释）、`:23-32`（props，`options` 元素类型在 `:25`）、`:82-85`（`currentOption` / `triggerLabel` / `triggerIcon`，`:85` = `const triggerIcon = computed(() => currentOption.value?.icon)`）、`:127-130`（trigger 图标位，`:128` = `<FontAwesomeIcon v-if="triggerIcon" … class="select-icon">`）、`:135-140`（选项，`:140` = `… <FontAwesomeIcon v-if="o.icon" … class="option-icon" />{{ o.label }}</li>`） | 与本表引用逐字一致 | ☐ |
| A3 | 既有图标样式锚点属实 | 读 `src/style.css:343-350`（为什么这么写的取证注释）、`:351`（`.select-trigger .select-icon { flex: none; }`）、`:352`（`.dropdown-panel .option .option-icon { margin-right: 6px; }`）、`:353-359`（相邻兄弟只给紧跟图标的标签 `flex: 1 1 auto`） | 与本表引用逐字一致；`:319`（`.select-trigger` 是 flex + `gap: 8px` + `space-between`）、`:320`（`.select-label { min-width: 0 … }`）也属实 | ☐ |
| A4 | 字号基准属实（`1em` = 14px） | 读 `src/style.css:116`（`.btn { font-size: var(--fs-body) }`）与 `:31`（`--fs-body: 14px`）；`:346-348` 的注释记 FA 在 14px 下实测 17.5×14 | 属实 → 本次 img 取 `1em` = 14×14（索引 K9） | ☐ |
| A5 | 既有测试的牙在位（G6 / RF4） | 读 `src/components/Dropdown.test.ts:182-237`：`WITH_ICONS`（`:183-186`）、`NO_ICONS`（`:187-190`）、`iconTags`（`:192-194`）、带图标用例（`:196-223`）、无图标用例（`:225-237`） | 属实 → 本任务只在 `:225-237` 里**加**一条断言，其余一字不改 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src/components/Dropdown.vue` | 改四处：① `:25` 的 `options` 元素类型加 `imageUrl?: string`；② `:85` 之后加 `triggerImageUrl`；③ `:128` 的 trigger 图标位改成 `imageUrl` 优先的 `<img class="select-image">` + `v-else-if` 走既有 FA；④ `:140` 的选项图标位同理（`<img class="option-image">`） | 面板定位（`place()` / `PANEL_GAP`）、`pick()`、tooltip、`.select-caret`（`:130`）一字不改；不引入新 props 之外的公共 API | ☐ |
| B2 | `src/style.css` | 在 `:352` 之后加两条 img 规则（C4）；把 `:359` 的选择器扩成 `.select-icon + .select-label, .select-image + .select-label` | `:343-350` 的取证注释与 `:351` / `:352` / `:353-358` 一字不改（只在 `:359` 那行加一个选择器 + 一段说明注释）；`.term-field` / `.type-field` 不在本文件（G7） | ☐ |
| B3 | `src/components/Dropdown.test.ts` | 新增 2 条用例（E1/E2 名字逐字）；在既有 `:225-237` 用例末尾加一条 `flexGrow` 断言（E3） | 既有 `:196-223` 用例一字不改；`WITH_ICONS` / `NO_ICONS` / `iconTags` 三个夹具不扩形状（新增用例自带自己的夹具） | ☐ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | props 的 options 元素类型 = `Array<{ value: string; label: string; tip?: string; icon?: IconDefinition; imageUrl?: string }>` | 规格 §6.4 | ☐ |
| C2 | `const triggerImageUrl = computed(() => currentOption.value?.imageUrl);`（与 `triggerIcon` 同一份 `currentOption` 来源 → 图标随选中项走） | 规格 §6.4 / RF5 | ☐ |
| C3 | trigger 与选项的渲染优先级：有 `imageUrl` → `<img class="select-image">` / `<img class="option-image">`（`:src` 原样）；否则有 `icon` → 既有 `<FontAwesomeIcon>`；两者都无 → 一字不变 | 规格 §6.4 / RF5 | ☐ |
| C4 | 新增两条样式规则（逐字）：`.select-trigger .select-image { flex: none; width: 1em; height: 1em; object-fit: contain; }` 与 `.dropdown-panel .option .option-image { margin-right: 6px; width: 1em; height: 1em; object-fit: contain; vertical-align: -0.125em; }` | 规格 §6.4 / 索引 K9 | ☐ |
| C5 | `:359` 改成 `.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto; }` | 规格 §6.4 | ☐ |
| C6 | 无新 i18n 键、无新 IPC、无新依赖；`index.html` 不加 CSP（`data:` URL 直接进 `<img>`，规格 §3-P7） | 规格 §5-3 / §6.4 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（E1/E2 + E3 的加行） | — | 只碰 B3 | ☐ |
| D2 | 跑红 | `npx vitest run src/components/Dropdown.test.ts` | E1/E2 红（`imageUrl` 被忽略 → 没有 `<img>`）；E3 的 `flexGrow` 断言此时**绿**（无图标本就不该吸收宽度）——红/绿分布贴 J 段 | ☐ |
| D3 | 实现 B1（组件） | — | 只碰 B1 | ☐ |
| D4 | 实现 B2（样式） | — | 只碰 B2 | ☐ |
| D5 | 跑绿 | `npx vitest run src/components/Dropdown.test.ts` | 该文件全绿，条数 = 原条数 + 2 | ☐ |
| D6 | 相邻回归（索引 V2） | `npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts` | 三个文件全绿，后两个**条数与断言一字未改**（G6） | ☐ |
| D7 | 类型 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | exit 0；`Tests 921 passed (921)`（919 + 2） | ☐ |

## E. 必须钉住的行为断言

| # | 用例名（逐字） | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel` | trigger 子节点序列 = `['img:select-image', 'select-label', 'select-caret']`、`img` 的 `src` 逐字等于传入值；`li` 的 `firstElementChild` 是 `img.option-image` 且 `src` 对得上；`setProps({ value })` 换选中项 → trigger 的 `src` 跟着换 | 规格 §7.1-8 / RF5 / 索引 K3 | ☐ |
| E2 | `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon` | 同时给 `imageUrl` 与 `icon` → 只有 `<img>`（`iconTags` 里没有它）；只给 `icon` → 只有 svg（既有行为不回归） | 规格 §7.1-9 / RF5 | ☐ |
| E3 | 既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret`（`:225-237`）末尾加：`getComputedStyle(w.find('.select-label').element).flexGrow` **不是** `'1'` | 「不传图标就不受影响」的牙从 `QuickLaunchModal.test.ts:735` 搬到组件层（任务 4 删原处） | 规格 §6.6-2 / 索引 K12 / RF4 | ☐ |
| E4 | 既有 `options_with_icon_render_the_icon_before_the_label_in_trigger_and_panel`（`:196-223`）一字不改且仍绿 | 加 img 通道没把 FA 通道带偏 | 规格 §5-5 / G6 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G6：不传 `imageUrl` 的调用方一字不变 | `TemplateModal.test.ts` / `LaunchBar.test.ts` 的 diff 为空且绿 | ☐ |
| F2 | G7 / 索引 K10：不改宽度 | `git diff src/modules/QuickLaunchModal.vue` 为空（本任务不碰它）；`QuickLaunchModal.test.ts:711-721`（180px 门）仍绿 | ☐ |
| F3 | 索引 K9：尺寸与基线 | 新增规则里只有 `1em` 与 `-0.125em`，没有写死 14px 像素值 | ☐ |
| F4 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空 | ☐ |
| F5 | G9 / G10 | `git diff --name-only` = B1/B2/B3 三份；`git log --oneline -1` 仍是任务 2 的提交 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src/components/Dropdown.test.ts` | 全绿，条数 +2 | ☐ |
| G2 | 共享组件的三个调用方 | `npx vitest run src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/QuickLaunchModal.test.ts` | 全绿；前两个文件 diff 为空；`QuickLaunchModal.test.ts` 的 [类型] 图标门（`:669-700`）仍绿 | ☐ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | `Tests 921 passed (921)`，exit 0 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src/components/Dropdown.vue src/style.css src/components/Dropdown.test.ts` | ☐ |
| H2 | commit message（逐字） | `feat(ui): Dropdown 支持选项图片图标（imageUrl，与 FontAwesome 并列且优先）` | ☐ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1–A5 实测过（锚点原文在 J 段）
- [ ] B1–B3 落地、无越界
- [ ] C1–C6 与 spec §6.4 逐字一致
- [ ] D1→D7 先红后绿，J 段有真实输出
- [ ] E1–E4 在位且绿
- [ ] F1–F5 无越界
- [ ] G1–G5 全绿，总数 921
- [ ] H1–H3 由主代理执行

## J. 执行记录（实现时填）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
| J-3 | | |
| J-4 | | |
| J-5 | | |
