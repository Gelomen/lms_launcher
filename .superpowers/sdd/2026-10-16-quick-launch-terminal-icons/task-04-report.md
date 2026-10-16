# 任务 4 报告 · `QuickLaunchModal` 接上真实图标 + 改写既有 CSS 契约门

- 计划：`docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` §任务 4（全局约束 G1–G10）
- 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` §6.4 / §6.5（不改宽度）/ §6.6-2 / §7.1 的 11–13 / §8-Q3 K3 K5 / §9-R6
- check 表：`docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-04-quick-launch-modal-wires-real-icons.md`（**J 段已填 J-1..J-11；A–I 段的 `☐` 一个没动**：改后实测 `☑=0` / `☐=36` / `I 段 -[ ]=8`，与改前一致）
- 索引：G2 G6 G7 G8 G9 G10、RF1 RF2 RF5、K3 K5 K10 K12 K20 K21 K22 **K23**（K17/K20 的行号口径）
- 状态：**DONE**（TDD 先红后绿、顺序未颠倒；G1–G5 全绿；总数 `Tests 923 passed (923)` = 921 + 2；`tsc` exit 0；无越界；未 `git add`、未 commit、未 stash）
- 起点 HEAD = `646d81a`（任务 3 的提交），分支 `feat/quick-launch`；收尾时 HEAD 未变（F4 / G9）

## 1 改动清单（两份，与 B 段逐字一致；G10 无越界）

| 文件 | 动作 | 内容（改后真实行号；表里的旧行号按索引 K20 是改前坐标） |
|---|---|---|
| `src/modules/QuickLaunchModal.vue` | 改一处（`git diff -U0` = **一个 hunk**：`@@ -112,0 +113,3 @@`，`+3/−0`） | `terminalOptions`（原 `:110-113`）的 map 里加 `imageUrl: info.icon,`（改后 `:115`，C1 逐字）+ 两行说明注释（spec §6.4 / §8-Q5 的降级口径：不带 icon 的项 = `undefined` → Vue 不写 `src`、不渲染 img）。**:444 / :534 两条宽度规则（改后 :447 / :537）不在 diff 里**；`:56-61`（`TERM_LABEL`）、`:100-103`（`typeOptions`）、`:131-143`（`loadTerminals`）、`:242-254`（模板）无 hunk |
| `src/modules/QuickLaunchModal.test.ts` | 改夹具 + 新增 2 条用例 + 改写一条既有门（`+97/−8`；删除的 8 行 = 夹具四行 + 被改写的注释与断言行） | ① `:26-31`（原 `:22-27`）`TERMS` 四项各加**可区分**的 `icon`（`data:image/png;base64,` + AAAA / BBBB / CCCC / DDDD）；② `:715` `terminal_options_and_trigger_carry_the_real_terminal_icons`、`:756` `terminal_option_without_icon_renders_no_img`（名字逐字，复用既有 `mockLms` / `mountModal` / `dropdownOf` / `triggerOf` / `triggerText`，未另造助手）；③ `:812`（原 `:726`）改写为 `trigger_labels_after_an_icon_absorb_the_free_space`：[类型] 与 [终端] 两个下拉的 `.select-label` 都断 `flexGrow === '1'`，注释按 C4 逐字改成「[终端] 现在也带图标（… §6.4）；不传图标的下拉由 `src/components/Dropdown.test.ts` 的 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret` 钉住」 |

**未改（实测 diff = 0 字符）**：`src/modules/TemplateModal.vue`、`src/modules/LaunchBar.vue`（F2 / G6）、`src-main/i18n`（G2）、`src/style.css` 与 `src/components/Dropdown.vue`（样式与 `imageUrl` 通道都在任务 3 已加，本次一行未动）、`src-main/quick-launch-terminals.ts` / `src-main/main.ts`（任务 1/2 的产物）、`package.json` 与两份 lockfile（G3）。测试里 `git diff -U0` 的 hunk 头只有五处（夹具 2 + 新用例 1 + C4 改写 2）→ **`:669-700` 的 [类型] 图标门（现 :673）、`:711-721` 的 180px 门（现 :793）、`:739` 起的 218px 定高门（现 :833）不在任何 hunk 里** = E4/E5「一字未改」的机械证据。

## 2 TDD 顺序与真实输出（先红后绿，顺序未颠倒）

### D1 先改夹具 + 写 2 条失败测试 + 改写 `:722-737`（只碰 B2）

`git diff -U0 src/modules/QuickLaunchModal.test.ts` 的 hunk 头：`@@ -21,0 +22,4 @@`、`@@ -23,4 +27,4 @@`、`@@ -701,0 +706,78 @@`、`@@ -724,3 +806,7 @@`、`@@ -735 +821 @@`。改前先取本文件基线：`npx vitest run src/modules/QuickLaunchModal.test.ts` → `Tests 28 passed (28)`（exit 0）→ 「+2」有取证。

### D2 跑红：`npx vitest run src/modules/QuickLaunchModal.test.ts`（exit 1）

```
 ❯ src/modules/QuickLaunchModal.test.ts (30 tests | 3 failed) 244ms
   × QuickLaunchModal > terminal_options_and_trigger_carry_the_real_terminal_icons 8ms
     → 选项 0 的图标不在文字之前: expected '' to be 'img' // Object.is equality
   × QuickLaunchModal > terminal_option_without_icon_renders_no_img 5ms
     → 不带 icon 的那一项不该渲染 img，其余三项照常: expected [ null, null, null, null ] to deeply equal [ 'data:image/png;base64,AAAA', …(3) ]
   × QuickLaunchModal > trigger_labels_after_an_icon_absorb_the_free_space 9ms
     → [终端] 现在带真实图标，它的 .select-label 也该吸收剩余宽度: expected '' to be '1' // Object.is equality
      Tests  3 failed | 27 passed (30)
```

三条红逐条对上 D2 的预期：E1/E2 红在「没有 img」；改写那条红在 [终端] 的 `flexGrow`（`''` = 没有该规则），而**同一条用例里 [类型] 的 `flexGrow === '1'` 断言此时绿** → 红只在新改的 [终端] 那一半，没有把 [类型] 带偏。

### D3 实现 B1（只碰 B1，一行代码）

`git diff -U0 src/modules/QuickLaunchModal.vue`：

```
@@ -112,0 +113,3 @@ const terminalOptions = computed(() => terminals.value.map((info) => ({
+  // 真实图标（2026-10-16-quick-launch-terminal-icons 规格 §6.4 / §8-Q5）：主进程不带 icon 的项 = undefined
+  // → Vue 不写 src、不渲染 img，那一项退回纯文字。
+  imageUrl: info.icon,
```

### D4 跑绿：`npx vitest run src/modules/QuickLaunchModal.test.ts`（exit 0）

```
 ✓ src/modules/QuickLaunchModal.test.ts (30 tests) 244ms
      Tests  30 passed (30)
```

= 原 28 + 2（G1 / D4「条数 = 原条数 + 2」）。既有 28 条一字未改仍绿。

## 3 新用例钉住的东西（逐条对 E 段）

- **E1**（`:715`）：① 面板四项 `li` 的 `textContent` 与 `t('ql.term.powershell' / 'ql.term.cmd' / 'ql.term.pwsh' / 'ql.term.wsl')` 逐字相同（不重排、不加字，图标不混进文本 = RF2）；② 逐项 `firstElementChild` = `img.option-image` 且 `src` = **该项**夹具的 `icon`（逐项对应，不是「渲染出了某个图标」就算过）；③ trigger 子节点序列 = `['img:select-image','select-label','select-caret']` 且 `src` = 当前选中项（默认第一项 = powershell，索引 K3 / K31(3)）；④ 点第二项（cmd）→ trigger 的 `src` 换成 cmd 的（RF5：图标随选中项走，不写死第一项），文字仍 = `t('ql.term.cmd')`。
- **E2**（`:756`）：`TERMS_CMD_HAS_NO_ICON`（`cmd` 不带 `icon`）→ 条数仍 4、文字照常；`src` 数组 = `[AAAA, null, CCCC, DDDD]`（那一项没有 img、其余三项照常 = Q5 / 索引 K5 / RF1）；另加半条：选中项没有图标时 trigger 也**没有** img（同一口径的另一半，见 §5 疑虑 2）。
- **E3**（`:812`）：两个带图标的下拉的 `.select-label` 都断 `flexGrow === '1'`（`min-width: 0` 仍在 → 吸收宽度后照样能收缩 + ellipsis）。这条的牙在任务 3 已建（索引 K21 的有牙验证），本次只把 [终端] 从「不是 1」改成「是 1」→ 实现前红、实现后绿，牙仍在。
- **E4 / E5**：[类型] 图标门、180px 宽度门、218px 定高门三条既有用例**不在任何 diff hunk 里**且全绿。

## 4 回归门（G1–G5，全部真实运行）

| 门 | 命令 | 真实结果 |
|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | exit 0，`Tests 30 passed (30)`（28 + 2） |
| G2 / D5（索引 V3 + K23 六个调用方） | `npx vitest run src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts` | exit 0，`Test Files 5 passed (5)` / `Tests 165 passed (165)`（QuickLaunch 10 · LaunchBar 11 · SettingsModal 12 · UpdateModal 70 · TemplateModal 62） |
| G3 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断输出，`TSC_EXIT=0` |
| G4 | `npx vitest run src-main/i18n` | exit 0，`Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 · no-hardcoded 2 · dict 11 · key-coverage 2）；`git diff src-main/i18n` = 0 字符 |
| G5 | `npm test` | exit 0，`Test Files 53 passed (53)` / `Tests 923 passed (923)` = 921 + 2，与索引 G8 的预期总数逐字一致，**无差额需要解释**（文件数 53 自任务 1 起就是 53，非本次引入） |
| F1–F4 | `git diff --name-only` / `git log --oneline -1` | 源码改动只有 B1/B2 两份；HEAD 仍是 `646d81a`；未 `git add`、未 commit、未 stash（G9） |

## 5 疑虑与请主代理留意的小点（都不影响勾）

1. **B1 的 hunk 里含两行注释**：代码只有 `imageUrl: info.icon,` 一行（plan 步骤 3 的「一行」），另两行是说明注释（spec §6.4 / §8-Q5 的降级口径）。仍在「`:110-113` 的 map 里一处 hunk」的边界内（`git diff -U0` 只有一个 hunk），但若验收要求严格「只加一行」，删掉注释即可，不影响任何测试。
2. **E2 多加了半条断言**（超出 check 表 E2 的字面范围）：换选到不带图标的那一项后，断言 trigger **没有** img、文字照常。这是 Q5 / 索引 K5 同一口径在 trigger 侧的另一半（`triggerImageUrl` 与 `triggerIcon` 同源），与 E1 的 ④ 对称。若认为超出范围，删掉 `:774-780`（那段注释 + 换选到缺图标项之后对 trigger 的两条断言）即可，`:767-772` 的 E2 字面部分不受影响。
3. **新用例的缩进**沿用所在块（原 `:665-737` 那段 [类型] 图标门与 CSS 契约门本来就是 0 缩进，文件其余部分是 2 缩进）—— 沿用邻居，不顺手改既有风格（B2「其余用例一字不改」）。
4. **索引 K23 的 `LaunchBar.vue:118` 未写目录**：实测该文件在 `src/modules/LaunchBar.vue`（不在 `src/components/`）。按 K17/K20 不改文档，只在 check 表 J-7 登记实测位置。
5. 本次**没有**遇到 spec / plan / check 表互相矛盾：§6.4 的接线、§6.6-2 的改写口径、§7.1-11..13 的用例名与断言、索引 K3/K5/K12/K21/K23 全部可直接执行；夹具加 `icon` 也没有带偏任何既有用例（既有用例断的是 `li` 的 `textContent` 与 `.select-label` 文本，28 条一字未改全绿）→ 无需报缺陷。
