# 任务 8 · 弹窗两态的「管理员」开关 + 词典键 — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 8 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.2 / §8-K5 / §8-K7 / §8-K15 · 关联审查重点 **RF3**（索引 R 组）
> 前置：任务 1（`admin` 字段在类型里）、任务 7（保存后能真的启动提权）
> 现状锚点（本表生成时实测，2026-10-14）：`src/modules/QuickLaunchModal.vue`：表单 ref `:60-64`、`fill()` `:106-117`、`save()` 的两个 payload `:156` / `:158`、命令行态模板 `:229-245`（终端标签 `:230`、`<div class="dropdown">` `:231-236`）、可执行程序态 `:248-261`（路径标签 `:249`、`.field-cell` `:251-260`）、定高推导注释 `:291-303`、`.modal-box { min-height: 218px }` `:307`、`.flag-grid` `:356-362`、`.flag-label` `:363-366`、`.row-cell` `:367`、`.row-cell .input` `:368`、`.name-cell` `:374`、`.field-cell` `:378`、标签顶对齐规则 `:383`、`.row-cell .type-label` `:384`、`.row-cell .type-field` `:385`、`.file-btn` `:386-389`、`<style scoped>` 末尾 `:442`；`src/modules/TemplateModal.vue`：`.switch-cell` + 开关 markup `:398-406`、开关样式 `:567-588`（`--sw-w` 在 `:569`）；`src/modules/QuickLaunchModal.test.ts`：夹具 `SHELL_ENTRY` `:29`、保存 payload 断言 `:407` / `:425`、`controlCells` 计数器 `:681-683`（只数 `grid.children` **直接**子节点）、定高断言 `:669` / `:688`、浮动测试 `BOX_H = 218` `:736`；`src-main/i18n/dict.ts`：`'ql.modal.exe'` zh `:176` / en `:519`
> 索引：[00-index.md](00-index.md) 的 G2、G3、G6、K5、K7、K8、K15

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 7 的提交；porcelain 干净 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | 起点基线写在索引头部「测试基线」行；本任务后用例数只增不减 | ☐（原因：本环境跑 vitest 需完全访问沙箱，审批未通过 → spawn EPERM；去处：派单前主代理实测后填索引头部「测试基线」行与本行） |
| A3 | 本表引用的锚点行号属实 | 读上表点名的每一处行号（组件、TemplateModal 的开关、测试计数器、词典两处） | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `quick-launch-config.ts:14` 确认 `admin?: boolean` 已在类型里（否则 payload 加字段会类型红） | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/i18n/dict.ts` | 改：zh 在 `:176` 之后、en 在 `:519` 之后各加一行 `ql.modal.admin` | 只这一个键；两语占位符无（无 `{}`） | ☐ |
| B2 | `src/modules/QuickLaunchModal.test.ts` | 改：夹具 `:29` 与 payload 断言 `:407` / `:425` 加 `admin` + 新增 6 条用例 + 在 `:683` 之后补「exe 态也数到 3」 | 不改 `:669` / `:688` 的 218px 字面量（两态都仍是 3 行控件） | ☐ |
| B3 | `src/modules/QuickLaunchModal.vue` | 改：`formAdmin` ref、`fill()` 回填、`save()` 两个 payload、`:231-236` 换成 `.field-cell` 内含 `.row-cell`、`:248` 之前插入管理员行、`<style scoped>` 追加 `.switch-cell` / `.bool-switch` / `.term-field` / `.admin-label` | 不改 `.modal-box` 的 `min-height`（`:307`）；不改 `TemplateModal.vue`；不改 `src/style.css` | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 词典键（zh） | `'ql.modal.admin': '管理员',` —— 规格 §6.2 / §8-K7 | ☐ |
| C2 | 词典键（en） | `'ql.modal.admin': 'Admin',` —— 同上 | ☐ |
| C3 | 开关 markup | 照抄 `TemplateModal.vue:398-406`：`<div class="switch-cell">` + `<button type="button" role="switch" class="bool-switch" :class="{ 'bool-switch--on': … }" :aria-checked="…" @click="…">` + `<span class="bool-switch__knob">` —— 索引 K5 / K15 | ☐ |
| C4 | 表单状态与 payload | `const formAdmin = ref(false)`；`fill()` 里 `formAdmin.value = e?.admin === true`；两个 payload 都带 `admin: formAdmin.value` | ☐ |
| C5 | 命令行态的控件格 | `<div class="field-cell"><div class="row-cell"><div class="dropdown term-field">…</div><label class="label admin-label">…</label><div class="switch-cell">…</div></div></div>` —— 规格 §6.2 / §8-K8 | ☐ |
| C6 | 可执行程序态的新行 | 在 `:249` 的「程序路径」标签**之前**：`<label class="label flag-label admin-label">` + `<div class="field-cell"><div class="row-cell"><div class="switch-cell">…` —— 规格 §6.2 | ☐ |
| C7 | 新样式 | `.row-cell .term-field { flex: 1 1 auto; min-width: 0 }`、`.admin-label { flex: none; white-space: nowrap }`、`.switch-cell` 与 `.bool-switch` 三段从 `TemplateModal.vue:567-588` 逐字复制 —— 索引 K15 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 8 步骤 1 的 6 条 + 夹具 + exe 态计数） | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 新用例红；`:407` / `:425` 因缺 `admin` 红 | ☐ |
| D2 | 加词典键（先改行号大的 en `:519`，再改 zh `:176`） | `npx vitest run src-main/i18n` | `key-coverage` 由红转绿（组件还没用这个键时它不红，因为键已存在） | ☐ |
| D3 | 实现组件 markup + 样式 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全绿；`:669` / `:688` 的 218px 断言不破 | ☐ |
| D4 | 宽度取证（无头 Chromium，与 218px 同一手法） | 复刻两态 DOM + 真实 `style.css` + 本组件 scoped 样式，量：终端行下拉可用宽度、最长标签 `Command Prompt (cmd)` 是否被截断、左列宽度与改动前是否一致 | 下拉可用宽度 ≥ 300px；标签不截断；左列宽度不变（「程序路径」仍最宽）。输出贴 J 段 | ☐ |
| D5 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 开关默认关，且是 `role="switch"` + `aria-checked="false"` | 规格 §8-K5 | `admin_switch_defaults_off_and_is_a_role_switch` | ☐ |
| E2 | 开关在「终端」那一行的右段，且不新增网格行 | 用户澄清原话 / 规格 §8-K8 | `admin_switch_sits_in_the_right_segment_of_the_terminal_row` | ☐ |
| E3 | exe 态的开关行在「程序路径」之上 | 用户原话 / 规格 §6.2 | `admin_switch_row_is_above_the_program_path_row_in_exe_type` | ☐ |
| E4 | 编辑态按条目的 `admin: true` 回填 | 规格 §4-1 | `edit_mode_reflects_admin_true_from_the_entry` | ☐ |
| E5 | 保存 payload 带 `admin: true` | 规格 §4-1 / 任务 1 C4 | `save_payload_carries_admin_true_when_toggled` + `:407` / `:425` 的 payload 门 | ☐ |
| E6 | 两态都数到 3 个控件格、`min-height` 都是 218px | 规格 §6.2 / RF3 | `:681-683` 既有门 + 新增 exe 态计数断言 + `:669` / `:688` 不破 | ☐ |
| E7 | 终端标签不被截断（全名，不做宽度预算） | `QuickLaunchModal.vue:95-100` 的既有口径 | D4 的宽度取证 + 既有 `:596` 附近的标签断言 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 只新增一个词典键 | 索引 G2 / 规格 §8-K7 | ☐ |
| F2 | 不改 `TemplateModal.vue`、不改 `src/style.css` | 索引 K15 | ☐ |
| F3 | 不改 `min-height: 218px` 与浮动测试的 `BOX_H` | `QuickLaunchModal.vue:307` / `test.ts:736` / RF3 | ☐ |
| F4 | 卡片列表行不加提权标记 | 索引 K6 / 规格 §5 | ☐ |
| F5 | 不新增校验、不改主进程文案 | 索引 G3 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（共享 Dropdown 与样式的使用方） | `npx vitest run src/modules` | 全绿；`TemplateModal.test.ts` 一字未改且绿 | ☐ |
| G3 | i18n 三门 | `npx vitest run src-main/i18n` | `key-coverage` 绿（新键 zh/en 都有、无占位符差异） | ☐ |
| G4 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/i18n/dict.ts`、`src/modules/QuickLaunchModal.vue`、`src/modules/QuickLaunchModal.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 新建/编辑启动项弹窗的管理员开关（两态各一行）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B3 之外没有文件被改
- [ ] C1-C7 逐字一致
- [ ] D1→D5 先红后绿 + D4 取证贴 J 段
- [ ] E1-E7 有对应测试或取证且绿
- [ ] G1-G5 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src/modules/QuickLaunchModal.test.ts` |  |
| J-2 | `npx vitest run src-main/i18n` |  |
| J-3 | `无头 Chromium 宽度取证脚本（.temp/ql-admin-probe/）` |  |
| J-4 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-5 | `npm test` |  |
