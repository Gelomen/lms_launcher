# 修复轮 B1 · 一处我验收时发现的真实缺陷（只改 2 个文件）

B 轮把 I-1 做成了「运行中禁用 [删除] + `data-tooltip` 说明原因」。jsdom 只断言了属性存在，**真机上看不到 tooltip**。取证：
- `src/style.css:414-425` 的 tooltip 是 **类选择器**：`.tip-up::after { content: attr(data-tooltip) }`、`.tip-up:hover::after { opacity: 1 }`（另有 `.tip-down`、`.icon-btn::after`）。
- `src/modules/QuickLaunchModal.vue:338-353` 的 `.btn-delete` 没有任何 `::after` 规则，也没挂 `tip-up` → 光有 `data-tooltip` 属性不会渲染任何东西。
- 对照正确用法：`src/App.vue:565` 是 `class="winbtn winbtn--github tip-down"` + `:data-tooltip`（类 + 属性成对）。

## 要做的三件事（都在 `src/modules/QuickLaunchModal.vue` 与其测试）

1. **挂上 tooltip 类，且只在禁用时挂**：`class="btn-delete"` 改为 `class="btn-delete"` + `:class="{ 'tip-up': running }"`。
   **为什么条件挂**：`content: attr(data-tooltip)` 在属性缺失时求值为**空串**，`.tip-up` 仍会渲染一个带 padding 的空盒子 → 未运行时 hover 删除按钮会出现一个空白小气泡。所以 `tip-up` 与 `data-tooltip` 必须同条件（`running` 为真才挂）。
2. **禁用态要有可见样式**：在该组件的 scoped style 里加 `.btn-delete:disabled { color: #C7CCD4; cursor: not-allowed; }`（与 `src/style.css:232` 的通用禁用口径、本文件 `:370` 的 `.modal-save:disabled` 同语言）。只禁用不改外观 = 用户看不出为什么点不动。
3. **测试要钉住机制**（不是钉属性）：在既有的 `delete_button_is_disabled_for_running_entry_and_shows_ql_err_running` 用例里加断言——运行时按钮 `class` 含 `tip-up`；**并加一条负面对照**：非运行时 `class` 不含 `tip-up` 且无 `data-tooltip`。注释指到 `src/style.css:414-425`（类选择器才是渲染条件）。

## 边界

- 只改 `src/modules/QuickLaunchModal.vue` 与 `src/modules/QuickLaunchModal.test.ts`。**`src/style.css` 一字不动**（`.tip-up` 已存在，复用即可；它内部有重复块属既有问题，本轮不碰）。不新建 i18n 键；不动其他文件；不 `git add`、不 commit（K5）。
- 现有断言一字不改，用例数只增不减。

## 门（真实输出贴进回传）

1. 基线：`npx vitest run src/modules/QuickLaunchModal.test.ts` 记下用例数（应为 13）
2. TDD：新断言先红（贴红摘要），实现后绿
3. `npx vitest run src/App.test.ts src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts` → 全 PASS（基线 79）
4. `npm test` → 47 files 全绿，总数 ≥ **811** + 新增（基线 811）
5. `npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS（基线 25）
6. 变异门：(a) 去掉 `:class=` 的条件挂载 → 新断言红；(b) 把 `tip-up` 改成无条件挂载（不随 `running`）→ 负面对照红。还原后报两个文件的 `git hash-object`，`git diff --numstat` 只含这两个文件（在 B 轮已有改动之上叠加，属正常）