# 任务 8 报告 · 弹窗两态的「管理员」开关 + 词典键

> 派单：主代理（2026-10-15 14:4x，起点 HEAD `802e5de`（docs(checks): 任务 7 验收落勾 + K52/K53 补注）· 分支 `feat/quick-launch-admin`）
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-08-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-08-modal-admin-switch.md` + 规格 §6.2 / §8-K5 / K7 / K8 / K15 + 要改/要照抄的四处既有代码
> 本表 A-I 段的勾**未落**（验收归主代理）；J 段（J-1…J-7）已按派单要求填真实命令与真实输出。
> 未 `git add`、未 commit（G8）；改动只落在 B 段三个文件（G9 取证见 §4-6）。

## 1 状态

**DONE** —— 6 条新用例 + 夹具/payload 门 + 「exe 态也数到 3」的计数门全部先红后绿；两态布局按用户原话与 §8-K8 落地（命令行态**不新增网格行**、可执行程序态在「程序路径」**之前**加一行）；只新增一个词典键；`.bool-switch` 三段样式逐字复制（脚本比对为字节相同）；`min-height: 218px` 与 `BOX_H = 218` 一字未改；D4 宽度取证真跑（无头 Chromium），三个数字见 §5。

| 门 | 命令 | 结果 |
|---|---|---|
| D1 先红 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | `Test Files 1 failed (1)` / `Tests 8 failed \| 17 passed (25)`、exit 1。红的 8 条：5 条新开关用例（`admin_switch_defaults_off_and_is_a_role_switch` / `admin_switch_sits_in_the_right_segment_of_the_terminal_row` / `admin_switch_row_is_above_the_program_path_row_in_exe_type` / `edit_mode_reflects_admin_true_from_the_entry` / `save_payload_carries_admin_true_when_toggled`）+ 两条 payload 门（`:414` / `:432` 因缺 `admin` 红）+ 新增的 exe 态计数门（`expected 2 to be 3`）。红的原因都正确：开关不存在 / payload 少字段 / exe 态只有 2 格。第 6 条新用例 `card_list_row_shows_no_admin_marker` 首跑即绿（它守 F4「列表行不加提权标记」，本就该绿） |
| D2 词典键 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0（`index` / `no-hardcoded` / `key-coverage` / `dict`）。按 K25 先改行号大的 en（`:520` 之后）再改 zh（`:176` 之后），改后 zh `:177` / en `:521`，`git diff` 只有两行 |
| D3 实现后跑绿 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | `Test Files 1 passed (1)` / `Tests 25 passed (25)`、exit 0；`:676` / `:695` / `:930` 三处 218px 门不破 |
| D4 宽度取证 | `node .temp/ql-admin-probe/ql-t8-build.cjs` → 再用本仓 `electron.exe` 跑 `ql-t8-main.js`（命令见 §5） | 真跑（无头 Chromium，与 218px 那条同一手法）。三个数字见 §5，全部达标；原始 JSON 在 `.temp/ql-admin-probe/ql-t8.out.json` |
| G1 定向 | 同 D3 | 全绿 |
| G2 相邻回归 | `npx vitest run src/modules` | `Test Files 13 passed (13)` / `Tests 314 passed (314)`、exit 0；`TemplateModal.test.ts`（62 条）**一字未改**且绿（它不在 `git status` 里） |
| G3 i18n 三门 | 同 D2 | 全绿（新键 zh/en 都有、无占位符差异） |
| G4 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0` |
| G5 全量 | `npm test` | `Test Files 51 passed (51)` / `Tests 888 passed (888)`、exit 0、`Duration 8.67s` |

计数只增不减：起点 **51 份 / 882 条**（主代理实测基线）→ 现在 **51 份 / 888 条**（+0 份 / +6 条，全部在 `QuickLaunchModal.test.ts`：19 → 25）。本任务不新建测试文件，与派单口径一致。

## 2 改动文件与真实行号（改后实测行号，按改后文件重新取过）

### `src-main/i18n/dict.ts`（713 → 715 行；numstat 2 增 / 0 删）

| 位置 | 内容 |
|---|---|
| `:177` | `'ql.modal.admin': '管理员',` —— 紧跟 `:176` 的 `'ql.modal.exe': '程序路径',`（表 C1 / 规格 §6.2 末行 / §8-K7） |
| `:521` | `'ql.modal.admin': 'Admin',` —— 紧跟 `:520` 的 `'ql.modal.exe': 'Program path',`（表 C2） |

只这一个键、两语都无占位符（`git diff` 全文只有这两行加号，见 §4-6）。

### `src/modules/QuickLaunchModal.vue`（442 → 523 行；numstat 96 增 / 4 删）

| 位置 | 内容 |
|---|---|
| `:65-67` | `const formAdmin = ref(false);`（表 C4 第一句）。注释写明「只有字面量 `true` 算真」，与主进程 `normalizeEntry` 同一口径 |
| `:119` | `fill()` 里 `formAdmin.value = e?.admin === true;`（表 C4 第二句；用 `=== true` 而非 `?? false`：缺字段 / 非真值 = 关） |
| `:161-164` | `save()` 两个 payload 字面量都带 `admin: formAdmin.value`（`:163` exe 分支 / `:164` shell 分支）。注释钉「交**真布尔**」：主进程按 `e.admin === true` 分流（任务 7）、配置层把非布尔规整成 `false`（任务 1 / §8-K4） |
| `:236-262` | 命令行态的终端行（表 C5 逐字）：`:237` 终端 label 不变；`:241` 控件格 `<div class="field-cell">` → `:242` `<div class="row-cell">` → `:243` `<div class="dropdown term-field">`（内含原 `Dropdown`，`:244-247` 的 `disabled` / `placeholder` / `@update:value` 一字未改）→ `:249` `<label class="label admin-label">` + `t('ql.modal.admin')` → `:250-258` `.switch-cell` 开关。**网格仍是 2 列、行数仍 3**（`.flag-grid` / `.flag-label` 规则未动） |
| `:271-289` | 可执行程序态：`:276` `<label class="label flag-label admin-label">` + `:277-287` `.field-cell > .row-cell > .switch-cell` 开关，位置在 `:290` 的「程序路径」label **之前**（表 C6 / E3）。`:291-301` 的路径格一字未改 |
| `:251-257` / `:280-286` | 开关 markup 照抄 `TemplateModal.vue:398-406`（表 C3 / §8-K5）：`<button type="button" role="switch" class="bool-switch"` + `:class="{ 'bool-switch--on': formAdmin }"` + `:aria-checked="formAdmin ? 'true' : 'false'"` + `:aria-label="t('ql.modal.admin')"` + `@click="formAdmin = !formAdmin"` + `<span class="bool-switch__knob">`。两处共用同一个 `formAdmin`；`v-if` / `v-else` 保证同屏只有一个开关（用例钉了 `.bool-switch` 数量 = 1） |
| `:486-510` | `.switch-cell` / `.bool-switch` / `.bool-switch__knob` / `.bool-switch--on`(:hover) / `.bool-switch--on .bool-switch__knob` / `.bool-switch:focus-visible` —— 从 `TemplateModal.vue:567-588` **逐字复制**（`--sw-w: 44px` 在 `:487`）。脚本核对：`TemplateModal.vue` 的 567-588 行原文作为子串出现在本文件里 → 字节级一致（表 C7 / §8-K15） |
| `:511-518` | `.row-cell .term-field { flex: 1 1 auto; min-width: 0; }`（表 C7 第一条，逐字两条声明）。注释里记了取证的真实数字与「为什么不需要 `width: auto`」（§6 偏离 4） |
| `:519-521` | `.admin-label { flex: none; white-space: nowrap; }`（表 C7 第二条） |
| `:330-332` / `:340-341` / `:345-346` | **仅注释**：三处随代码变陈旧的说法（「本弹窗没有…开关行」「可执行程序态因此表单下方留白 38px」「钉着『命令行态 3 行控件』」）按现状改写。见 §6 偏离 3 |

**一字未改**（表 B3 / F2 / F3 边界）：`.modal-box` 的 `min-height: 218px`（`:350`）与 `max-height: 85vh`；`.flag-grid` / `.flag-label` / `.row-cell` / `.name-cell` / `.field-cell` / `.row-cell .type-field` / `.file-btn` 各条规则；`terminalOptions` 的「标签传全名、不做宽度预算」口径（`:95-104`）；`loadTerminals` / `pickExe` / `onDelete` / `doDelete`；`src/modules/TemplateModal.vue` 与 `src/style.css`（两者都不在 `git status` 里）。

### `src/modules/QuickLaunchModal.test.ts`（755 → 935 行；19 → 25 条；numstat 185 增 / 2 删）

| 位置 | 内容 |
|---|---|
| `:29-31` | 夹具 `SHELL_ENTRY` 加 `admin: false`（表 B2 / brief 的 `:29`）。理由：`:389` 的 `expect(saveCalls()[0].args).toEqual(['qla1b2c3d4', SHELL_ENTRY])` 逐字比对 payload，而 payload 现在总带 `admin`（§8-K4「落盘总是显式写」）→ 夹具与 payload 必须同一取值；取 `false` 才同时守住「默认关」 |
| `:92-99` | `dropdownOf()` 加一行退让：控件格本身不是 `.dropdown` 时在控件格里取 `.dropdown`。**必要的连带改动**（brief / B2 未列，见 §6 偏离 1）：C5 把终端行的控件格换成 `.field-cell` 后，label 的相邻兄弟不再是 `.dropdown`，`:138` / `:205` / `:601` / `:648` / `:686` / `:913` 六处既有用例会全部取不到控件。返回值仍是那个 `.dropdown`（trigger 与面板都在它子树里），**既有断言一字未改** |
| `:413-414` / `:432` | 两条 payload 断言加 `admin: false`（brief 的 `:407` / `:425`，改后行号 `:414` / `:432`；表 E5 的「未开关」半边） |
| `:697-704` | 在 `modal_height_is_fixed_to_the_shell_form_height_in_both_types` 的 exe 态 218px 门（`:695`）之后新增 exe 态计数：同一个 `controlCells` 过滤器再数一遍 → `expect(exeCells.length).toBe(3)`（表 B2 / E6）。计数器本体（`:688-690`）一字未改 |
| `:727-745` | `admin_switch_defaults_off_and_is_a_role_switch`（E1 / §8-K5）：`role="switch"`、`aria-checked="false"`、无 `bool-switch--on`、有 `.bool-switch__knob`、标签与 `aria-label` 都取 `t('ql.modal.admin')` 的取值（G6） |
| `:747-775` | `admin_switch_sits_in_the_right_segment_of_the_terminal_row`（E2 / 用户澄清原话 / §8-K8）：网格里的 label 仍 3 个、`.switch-cell` 不是网格直接子节点；终端 label 的控件格是 `.field-cell`、`.row-cell` 在其内部；`.row-cell` 的 children 里 `.switch-cell` 的索引 > `.dropdown` 的索引且是最后一段；命令格不带开关 |
| `:776-804` | `admin_switch_row_is_above_the_program_path_row_in_exe_type`（E3 / 用户原话）：`.flag-grid` 的 children 里「管理员」label 的索引 ≥ 0 且 < 「程序路径」label 的索引；它的控件格 `.field-cell > .row-cell > .switch-cell .bool-switch` 存在且默认关；路径格不带开关；整屏只有一个开关 |
| `:805-830` | `edit_mode_reflects_admin_true_from_the_entry`（E4 / 规格 §4-1）：shell 条目 `admin: true` → `aria-checked="true"` + `bool-switch--on`；exe 条目 `admin: true` → 同样回填；条目**没有** `admin` 字段 → 关（与 `normalizeEntry` 同口径） |
| `:831-869` | `save_payload_carries_admin_true_when_toggled`（E5）：点一下 → `aria-checked="true"` + 开启类；payload 的 `typeof admin === 'boolean'` 且 `=== true`，并逐字 `toEqual({ …, admin: true })`（shell 与 exe 两条路径各一次） |
| `:870-886` | `card_list_row_shows_no_admin_marker`（F4 / 索引 K6 / 规格 §5）：卡片行 `admin: true` 时列表行 HTML 不含 `bool-switch`、不含 `t('ql.modal.admin')` 的取值。见 §6 偏离 2 |

**一字未改**：`:676` / `:695` / `:930` 的 218px 三处门、`:915` 的 `BOX_H = 218`、`:688-690` 的 `controlCells` 过滤器、`TERMS` 夹具与「不重排」门、`:596-615` 的「终端标签不截断」门、`injectRealCss()`、卡片接线那条大用例（`:437-`）。

## 3 接口契约逐条自查（表 C1-C7）

| # | 怎么核的 | 结果 |
|---|---|---|
| C1 / C2 | `git diff src-main/i18n/dict.ts` 全文只有两行加号：`+    'ql.modal.admin': '管理员',` 与 `+    'ql.modal.admin': 'Admin',` | 逐字一致，无占位符 |
| C3 | 与 `TemplateModal.vue:398-406` 并排比对（`.switch-cell` + `role="switch"` + `:class` + `:aria-checked` + `.bool-switch__knob`） | 结构逐字；表达式按本组件的 `formAdmin` 布尔写（TemplateModal 的 `formValues[key]` 是字符串 `'true'`/`'false'`，那是它的值形态；本任务的值是真布尔） |
| C4 | 见 §2 的 `:67` / `:119` / `:163-164` | 逐字 |
| C5 | 见 §2 的 `:241-258` | 逐字（`.field-cell` → `.row-cell` → `.dropdown.term-field` → `label.admin-label` → `.switch-cell`） |
| C6 | 见 §2 的 `:276-287`（在 `:290` 的「程序路径」label 之前） | 逐字 |
| C7 | 脚本核对：`TemplateModal.vue` 的 567-588 行原文是 QuickLaunchModal.vue 的子串 → 三段样式字节相同；`.row-cell .term-field` 与 `.admin-label` 两条按表逐字 | 一致 |

## 4 回归与边界取证

1. **G2**：`npx vitest run src/modules` → 13 份 / 314 条全绿；`TemplateModal.test.ts` 62 条未改且绿。
2. **G3**：`npx vitest run src-main/i18n` → 4 份 / 18 条全绿（`key-coverage` 认到组件里的字面量键 `ql.modal.admin`，两侧都有）。
3. **G4**：`npx tsc --noEmit -p tsconfig.main.json` → `TSC_EXIT=0`。
4. **G5**：`npm test` → 51 份 / 888 条全绿。
5. **F3**：`git diff` 里 `min-height: 218px` 与 `BOX_H = 218` 都不在 hunk 内；三处 218px 断言（`:676` / `:695` / `:930`）全绿。
6. **G9 改动范围**：`git status --porcelain` = 恰好三行 —— `M src-main/i18n/dict.ts` / `M src/modules/QuickLaunchModal.test.ts` / `M src/modules/QuickLaunchModal.vue`；`git diff --stat` = `3 files changed, 275 insertions(+), 14 deletions(-)`。`.temp/` 下的探针在 gitignore 内，不进工作区改动。
7. **F4 / F5**：卡片列表行无提权标记（新用例守）；无新校验、无主进程文案改动（`src-main/` 只有词典两行）。

## 5 D4 宽度取证的真实数字（无头 Chromium，2026-10-15 14:5x）

脚本（都在 gitignore 的 `.temp/ql-admin-probe/` 下）：`ql-t8-build.cjs`（生成复刻页）+ `ql-t8-measure.js`（量测）+ `ql-t8-main.js`（Electron 跑）+ 产物 `ql-t8.out.json` / `ql-t8.err.txt`。手法与 218px 那条一致：灌真实 `src/style.css` + 本组件 `<style scoped>` **原文** + 两态静态复刻；五个复刻：`shell-before`（改动前）/ `shell-final`（改动后）/ `shell-verbatim`（反例，见 §6 偏离 4）/ `exe-before` / `exe-final`。

```
node .temp/ql-admin-probe/ql-t8-build.cjs
Remove-Item Env:ELECTRON_RUN_AS_NODE        # 不清掉的话 electron.exe 退化成纯 node，require('electron').app 是 undefined
node_modules/electron/dist/electron.exe --no-sandbox ^
  --user-data-dir=D:\Dev\Projects\lms_launcher\.temp\ql-admin-probe\profile-t8 ^
  D:\Dev\Projects\lms_launcher\.temp\ql-admin-probe\ql-t8-main.js
```

退出码 0（stderr 只有两行 GPU 提示，与取数无关）。

**三个数字（表 D4 / E7 的三条判据）**

| 判据 | 改动前 | 改动后 | 判定 |
|---|---|---|---|
| 终端行里下拉的可用宽度（520px 弹窗） | `.dropdown` = **452.7px**（`.select-trigger` 同宽） | `.term-field` = **356.7px**（`.select-trigger` 同宽） | ≥ 300px ✅（让出 96px = 「管理员」36 + 开关 44 + 两个 gap 8×2） |
| 最长终端标签 `Command Prompt (cmd)` 是否被截断 | `.select-label` clientW 153 / scrollW 153、文本自然宽 153.3 | clientW **153** / scrollW **153**、自然宽 **153.3** → `truncated=false` | 不截断 ✅（可用 356.7px ≫ 153px，`text-overflow: ellipsis` 没触发） |
| `.flag-grid` 左列宽度 / 最宽标签 | 命令行态 `grid-template-columns: 24px 452.667px`；可执行程序态 `48px 428.667px`（最宽 = 「程序路径」自然宽 48px） | 命令行态 `24px 452.667px`；可执行程序态 `48px 428.667px` —— **一字不差**；「管理员」自然宽 36px < 48px | 左列不变、「程序路径」仍是最宽 ✅ |

**顺带取到（不是判据，是佐证）**

- 两态 `.modal-box` 高度：五个复刻全部 **218px**（`min-height` 未改）；`.modal-body` 的 `scrollHeight == clientHeight == 153` → 不出滚动条、内容不被裁。
- 控件格计数（与 `test.ts` 的 `controlCells` 同一个过滤器）：`shell-before` 3 → `shell-final` 3；`exe-before` 2 → `exe-final` **3**。网格直接子节点数：命令行态 6 → 6（**没有新增网格行**）、可执行程序态 4 → 6（新增的正是「管理员」那一行）。
- 开关不被挤窄：`.switch-cell` = 44px、`.bool-switch` = 44×24px，`switchOverflowsCell=false` / `switchOverflowsRow=false`；「管理员」标签 36px = 自然宽，未被裁。

## 6 偏离与理由

1. **`test.ts` 的 `dropdownOf()` 加了一行退让（`:92-99`）** —— brief 与表 B2 没列这一处。它是表 C5 markup 的**必要连带**：终端行的控件格按 C5 变成 `.field-cell` 后，label 的相邻兄弟不再是 `.dropdown`，六处既有用例（`:138` / `:205` / `:601` / `:648` / `:686` / `:913`）会取不到控件而全红。改法只加「控件格不是 `.dropdown` 时在其内部取 `.dropdown`」的退让，返回值仍是同一个 `.dropdown` 元素，**既有断言一字未改**（G2 全绿就是取证）。不改 helper 的替代做法是给控件格同时挂 `.field-cell` 与 `.dropdown` 两个类，那会偏离 C5 的逐字 markup —— 取舍按「C5 逐字优先」。
2. **第 6 条新用例 `card_list_row_shows_no_admin_marker`（`:870-886`）** —— brief 的清单是「5 条具名新用例 + 改 `modal_height_…` 那条」，表 B2 写的是「新增 6 条用例」。两种读数的差就在这一条：它守 F4 / 索引 K6 / 规格 §5「卡片列表行不加提权标记」，而这条硬约束原本没有任何用例守。它不改任何产品代码（首跑即绿），只把「不做的事」钉成回归门。若主代理认为它超出本任务范围，删掉即可（删后全量 887 条）。
3. **组件里三处注释按现状改写（`:330-332` / `:340-341` / `:345-346`）** —— 纯注释、零代码。原话「本弹窗没有…开关行」「可执行程序态因此表单下方留白 38px」「钉着『命令行态 3 行控件』」在本任务之后变成假话；按本项目 SDD 口径（spec 落后于代码就算缺陷），代码注释与 spec §6.2 矛盾同样是缺陷。改写后的说法与 spec §6.2 对齐（「原本 38px 的留白被这一行填掉」「两态各 3 行控件」）。
4. **`.row-cell .term-field` 最终只写表 C7 那两条声明** —— 我先按 `style.css:316` 的 `.dropdown--stretch` 先例加了 `width: auto`（担心 `flex-basis: auto` 取到 `.dropdown { width: 100% }` 的基准、把开关格按比例挤窄），随后 D4 的反例复刻（`shell-verbatim`）实测：加与不加数字**一字不差**（`.term-field` 356.7 / `.switch-cell` 44 / 无溢出）—— 因为收缩只分摊给能收缩的项，开关格与 nowrap 标签的自动最小尺寸（min-content 44px / 36px）把它们钉住，全部收缩由带 `min-width: 0` 的下拉吸收。于是**删掉** `width: auto`，回到 C7 逐字。这条结论留在 `:511-517` 的注释里，免得下一个读代码的人再去「补」它。

## 7 疑虑

1. **可执行程序态的开关靠左、命令行态的开关靠右**（同一个控件在两态的水平位置不同）：这是 spec §6.2 逐字规定的形状（exe 态 = `.field-cell > .row-cell > .switch-cell`，没有任何对齐声明；命令行态 = 终端行的右段），我没有自行加 `justify-content` 之类去「对齐」它（不扩范围）。真机上观感是否可接受，建议进任务 9 的真人清单肉眼过一遍；若要改，先改 spec §6.2 再改代码。
2. ~~探针用的是本仓已装的 `electron.exe`（`--version` 报 v18.18.2，而 `package.json` 声明的是 `^28.3.0`）~~ —— **这条是我误读，已作废（索引 K54，主代理 2026-10-15 15:2x 实测）**：`node_modules/electron/package.json` = **28.3.3**，与声明的 `^28.3.0` 一致；`electron.exe --version` 在 `ELECTRON_RUN_AS_NODE=1` 下打印的是**内置 Node** 的版本 v18.18.2（Electron 28 内置 Node 18.18.2），不是 Electron 的版本。依赖没有不一致，我没动过任何依赖（G7）。取数方式与 218px 那条一致、复刻页实测 `boxHeight = 218` 与文档推导吻合 —— 这两点仍成立，D4 的数字可信。
3. 本会话环境里预置了 `ELECTRON_RUN_AS_NODE=1`，跑 Electron 探针必须先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`（已写进 `ql-t8-main.js` 的头注释）。任务 9 若要再跑无头探针会踩同一个坑。

## 8 给任务 9（打包 + 真机门）的交接

- 渲染端到此收口：两态的开关、`admin` 真布尔进 payload、编辑态回填、词典键 `ql.modal.admin`（zh/en）。任务 9 不需要再动 `src/`。
- 真机清单建议加三条（本任务无法自动化的部分）：① 命令行态勾选 → UAC 弹窗 → 终端页签能力不变（输入 / 尺寸 / [停止] / 退出 / 自动命令）；② UAC 点「否」→ 该行按钮回落 + 日志一行原因（复用既有文案，F5）；③ 两态布局肉眼过：终端行「左下拉 + 右开关」不换行、不截断，可执行程序态的「管理员」行在「程序路径」之上、弹窗高度与命令行态一致（218px）、开关的紫色与焦点环与 [保存] 同语言。
- 打包面零影响：无新依赖（G7）、无新词典文件、无 IPC 通道与页签语义变化（G3）、`src/style.css` 与 `TemplateModal.vue` 未改（F2）。提权宿主与 `node.exe` 硬链接的打包事项都在任务 9 自己的范围里，与本任务无耦合。
- 探针留在 `.temp/ql-admin-probe/ql-t8-*`（gitignore 内），任务 9 不必复跑；若要复跑，命令与前置（清 `ELECTRON_RUN_AS_NODE`、`--no-sandbox` + 本地 `--user-data-dir`）在 `ql-t8-main.js` 的头注释里。
- 提交门（H1/H2）归主代理：暂存范围 = 三个文件；message 逐字 `feat: 新建/编辑启动项弹窗的管理员开关（两态各一行）`。H3 的普查脚本我没跑（属主代理的验收动作）。
