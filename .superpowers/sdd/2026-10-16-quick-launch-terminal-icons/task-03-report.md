# 任务 3 报告 · `Dropdown` 的 `imageUrl` 通道 + 图标尺寸样式

- 计划：`docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` §任务 3（全局约束 G1–G10）
- 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` §6.4 / §6.6-2 / §7.1 的 8–10 / §8-Q3 K5 K6 / §9-R5
- check 表：`docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-03-dropdown-imageurl-channel-and-icon-sizing.md`（**J 段已填 J-1..J-14；A–I 段的 `☐` 一个没动**）
- 索引：G6 G7 G8 G9 G10、RF4 RF5、K3 K9 K10 K12 **K21**（K17/K20 的行号口径）
- 状态：**DONE**（TDD 先红后绿、顺序未颠倒；G1–G5 全绿；总数 `Tests 921 passed (921)` = 919 + 2；`tsc` exit 0；无越界；未 `git add`、未 commit、未 stash）
- 起点 HEAD = `c3f5746`（任务 2 的提交），分支 `feat/quick-launch`；收尾时 HEAD 未变（F5 / G9）

## 1 改动清单（三份，与 B 段逐字一致；G10 无越界）

| 文件 | 动作 | 内容（改后真实行号；表里的旧行号按索引 K20 是改前坐标） |
|---|---|---|
| `src/components/Dropdown.vue` | 改四处（`git diff` 只有这四个 hunk + 三段说明注释；`+14/−4`） | ① `:30`（原 `:25`）props 的 options 元素类型 = `Array<{ value: string; label: string; tip?: string; icon?: IconDefinition; imageUrl?: string }>`（C1 逐字）；② `:92`（原 `:85` 之后）加 `const triggerImageUrl = computed(() => currentOption.value?.imageUrl);`（C2 逐字，与 `triggerIcon` 同一份 `currentOption` → 图标随选中项走，索引 K3）；③ `:137-138`（原 `:128`）trigger 图标位 = `<img v-if="triggerImageUrl" :src="triggerImageUrl" class="select-image" alt="" />` + `<FontAwesomeIcon v-else-if="triggerIcon" … class="select-icon" />`；④ `:150`（原 `:140`）选项图标位 = `<img v-if="o.imageUrl" :src="o.imageUrl" class="option-image" alt="" /><FontAwesomeIcon v-else-if="o.icon" … class="option-icon" />`（C3 的优先级：`imageUrl` → `icon` → 两者都无则一字不变） |
| `src/style.css` | `:352` 之后加注释 + 两条规则；改 `:359` 那行选择器（`+13/−1`，唯一删除 = 被替换的选择器行） | 新规则在改后 `:360-361`，与 C4 逐字：`.select-trigger .select-image { flex: none; width: 1em; height: 1em; object-fit: contain; }` 与 `.dropdown-panel .option .option-image { margin-right: 6px; width: 1em; height: 1em; object-fit: contain; vertical-align: -0.125em; }`；改后 `:371` = `.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto; }`（C5 逐字）。注释按 plan 任务 3 步骤 4 写清 `1em` = 14px 的依据（`.btn` 的 `--fs-body`，`:116` / `:31`）与 `-0.125em` 与 vue-fontawesome 对齐的理由（索引 K9） |
| `src/components/Dropdown.test.ts` | 新增 2 条用例 + 既有用例末尾加一条断言（新增 84 行 / 删除 0 行 = **纯新增**） | `:257` `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel`、`:295` `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon`（名字逐字，各自自带夹具 `IMAGES` / `BOTH`）；`:241-248` 在既有 `options_without_icon…`（`:225`）末尾加「注入真实 `src/style.css`（`:241-245`，同一个 `__real-css__` id 去重）+ `.select-label` 的 `flexGrow` 不是 `'1'`（`:247-248`）」 |

**未改（实测 diff = 0 字符）**：`src/modules/QuickLaunchModal.vue`（G7 / 索引 K10：`.term-field` / `.type-field` 一字未动）、`src/modules/QuickLaunchModal.test.ts`（含 `:669-700` 的 [类型] 图标门与 `:711-721` 的 180px 门）、`src/modules/TemplateModal.test.ts`、`src/modules/LaunchBar.test.ts`（G6 / F1）、`src-main/i18n`（G2 / F4）、`package.json` 与两份 lockfile（G3）、`index.html`（C6：不加 CSP）。组件内 `place()` / `PANEL_GAP` / `pick()` / tooltip / `.select-caret` 无 hunk。

## 2 TDD 顺序与真实输出（先红后绿，顺序未颠倒）

### D1 先写测试（只碰 B3）

`git diff --name-only` → 只有 `src/components/Dropdown.test.ts`；`--numstat` → 新增 84 行 / 删除 0 行。

### D2 跑红：`npx vitest run src/components/Dropdown.test.ts`（exit 1）

```
 ❯ src/components/Dropdown.test.ts (10 tests | 2 failed) 64ms
   × … > options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel 5ms
     → trigger 子节点顺序不对：["select-label","select-caret"]: expected [ 'select-label', 'select-caret' ] to deeply equal [ 'img:select-image', …(2) ]
   × … > imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon 2ms
     → trigger 里的 img 数量不对: expected +0 to be 1
      Tests  2 failed | 8 passed (10)
```

红只在两条新用例（`imageUrl` 被忽略 → 没有 `<img>`），与 D2 预期一致；**E3 的 `flexGrow` 断言此时绿**（无图标本就不该吸收宽度）。红跑同时给出「原条数 = 8」，D5 的「+2」由此取证，不靠猜。

### K21 的「有牙验证」（在实现之前做，隔离出 CSS 这一个变量）

1. 基线：`npx vitest run src/components/Dropdown.test.ts -t "options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret"` → exit 0，`Tests 1 passed | 9 skipped (10)`。
2. 临时把 `style.css:359` 改成对所有 `.select-label` 生效（`.select-trigger .select-label { flex: 1 1 auto; }`）→ 重跑同一条命令 → **exit 1**：

```
   × … > options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret 33ms
     → 不传图标时 .select-label 不该吸收剩余宽度（flexGrow 不该是 1）: expected '1' not to be '1'
      Tests  1 failed | 9 skipped (10)
```

3. 改回原选择器 → `git diff --name-only` 不含 `src/style.css`（当时只剩测试文件 + 主代理落勾用的三份文档）→ 无残留。

**结论**：这条断言真的有牙 —— 注入真实 CSS 后 happy-dom 确实应用了 `.select-icon + .select-label` 这条规则（改宽选择器 → `flexGrow` 变 `'1'` → 断言红）。若不注入（该 describe 原本就没有），断言恒真 = 假勾（索引 K21 的担心成立，已按 K21 处理）。

### D3 实现 B1（只碰组件）→ D4 实现 B2（只碰样式）→ D5 跑绿

`npx vitest run src/components/Dropdown.test.ts`（exit 0）：

```
 ✓ src/components/Dropdown.test.ts (10 tests) 62ms
      Tests  10 passed (10)
```

= 原 8 + 2（G1）。既有两条用例一字未改仍绿（E4：删除 0 行的 numstat 就是「一字未改」的机械证据）。

### D6 / 索引 V2 相邻回归：`npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts`（exit 0）

```
 ✓ src/components/Dropdown.test.ts (10 tests) 61ms
 ✓ src/modules/LaunchBar.test.ts (11 tests) 44ms
 ✓ src/modules/TemplateModal.test.ts (62 tests) 3341ms
 Test Files  3 passed (3)
      Tests  83 passed (83)
```

后两个文件 diff 为空、条数与断言一字未改（G6 / F1）。

### G2 三个调用方：`npx vitest run src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/QuickLaunchModal.test.ts`（exit 0）

`Tests 101 passed (101)`（QuickLaunchModal 28 条一字未改仍绿，含 [类型] 图标门与 `.type-field` 180px 宽度门）。

### G3 类型门：`npx tsc --noEmit -p tsconfig.main.json`

无输出，`tsc exit code: 0`。

### G4 i18n 三门：`npx vitest run src-main/i18n`（exit 0）

`Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 · no-hardcoded 2 · dict 11 · key-coverage 2）；`git diff -- src-main/i18n` = 0 字符。

### G5 / D7 全量：`npm test`（exit 0）

```
 Test Files  53 passed (53)
      Tests  921 passed (921)
```

= 919（任务 2 后）+ 2，与 D7 / 索引 G8 的预期逐字一致，**无差额需要解释**。

## 3 E 段：每条断言靠什么钉住

| # | 靠什么 | 实测 |
|---|---|---|
| E1 | 新用例 `:257`：trigger 子节点序列映射成 `['img:select-image','select-label','select-caret']`（`kidsOf` 与既有 FA 用例同一口径，只是多认 `img`）；`img` 的 `getAttribute('src')` 与夹具 `IMAGES[i].imageUrl` 逐字 `toBe`；面板每项 `firstElementChild` 的 tagName = `img`、class = `option-image`、`src` 逐字；`setProps({ value: 'cmd' })` 后再取 trigger 的 `src` | 绿。换选中项 → `src` 从 `AAAA` 换成 `BBBB`（RF5 / 索引 K3：图标随选中项走，不写死第一项）。同时钉住 `li` 的 `textContent` 仍是 `['PowerShell 7 (pwsh)', 'Command Prompt (cmd)']`（加 img 不带偏文案） |
| E2 | 新用例 `:295`：夹具 `BOTH` 第一项同时给 `icon` + `imageUrl`，第二项只给 `icon`。断言 trigger 里 `querySelectorAll('img').length === 1` 且 `iconTags(trigger) === ['fas:list']`（既有 ▼ 除外，没有第二个图标）；第一项 `iconTags(li) === []` 且只有 1 个 img；第二项 img 数量 0 且 `iconTags = ['far:file-code']` | 绿。`imageUrl` 优先级 + 「只给 icon 时 FA 通道一字不回归」两头都钉住 |
| E3 | 既有用例 `:225` 末尾新增 `:241-248`：先注入真实 `src/style.css`（`:241-245`，同文件 `:106-112` 的手法、同一个 `__real-css__` id 去重），再断 `.select-label` 的 `flexGrow` 不是 `'1'` | 绿；**并且验过它有牙**（见 §2 的 K21 三步：改宽选择器 → 该断言红 `expected '1' not to be '1'`）。这是从 `QuickLaunchModal.test.ts:735` 搬到组件层的那一半（索引 K12）；原处由任务 4 改写 |
| E4 | 既有 `options_with_icon_render_the_icon_before_the_label_in_trigger_and_panel`（`:196`）一字未改（删除 0 行） | 绿（在 10 passed 里）。FA 通道没被带偏：`iconTags` 断言、`firstElementChild` 断言、换选项后 `['far:file-code','fas:list']` 全过 |

## 4 自审：与 spec / plan / check 表的取舍（都在 B 段允许的文件内）

1. **`<img>` 上多写了 `alt=""`**：C3 只写「`<img class="select-image">` / `<img class="option-image">`（`:src` 原样）」。我按仓库既有写法（`src/App.vue:539` 的 `<img class="winbar__logo" :src="logoUrl" alt="" …>`）加了 `alt=""`：图标按规格 §4-4 是装饰，空 alt 让读屏器跳过。它不改变 class、`src`、渲染优先级，也不被任何断言依赖（新用例只读 class / src / 节点序列）。若主代理要严格照 C3 字面去掉 `alt`，删两个属性即可，测试不受影响。
2. **注释扩了三段**（组件 props 处 5 行、`triggerImageUrl` 上方 1 行、trigger 图标位 3 行；样式两处各一段）：plan 任务 3 步骤 4 明确要求样式注释写清 `1em` = 14px 的依据与 `-0.125em` 的对齐理由；组件侧沿用该文件既有风格（`:19-22` 就是同类口径注释），否则「两条通道谁优先」只存在于代码里。B2 的边界（`:343-350` 取证注释、`:351`、`:352`、`:353-358` 一字不改）已守住 —— 实测 `git diff` 里那几行没有 hunk。
3. **E3 的 CSS 注入写在用例内、没有提共享 helper**：check 表 E3 写的是「该用例内注入」。提到 describe 外会新增一个跨用例的公共函数（B3 未列）；写在内联里 diff 最小，且 `__real-css__` 的 id 去重保证与 `:106-112` 那份不会重复灌入。
4. **新用例自带夹具**（`IMAGES` / `BOTH`），没有扩 `WITH_ICONS` / `NO_ICONS` / `iconTags` 的形状（B3 边界）。新用例复用了既有 `iconTags`（只是调用，不是改它）。
5. **行号漂移（索引 K20）**：`Dropdown.vue` 净增 10 行 → props `25→30`、`triggerIcon 85→92`、trigger 图标位 `128→137-138`、选项图标位 `140→150`；`style.css` 净增 12 行 → 新规则在 `352` 之后 = `360-361`、相邻兄弟规则 `359→371`；`Dropdown.test.ts` 净增 84 行 → 新用例在 `:257` / `:295`。文档里的历史行号未改写。
6. **文档只填 J 段**：spec / plan / 索引 / 本表 A–I 一行未动。普查脚本 `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → exit 0，本表 `☑=0 裸☐=38 I段 -[ ]=8 H2=未提交`（落勾与 H1–H3 是主代理验收后的动作）。J 段每行的未转义 `|` 数与表头一致（脚本核对：不符行数 = 0）。

## 5 疑虑（不阻塞，交给主代理裁）

- **`imageUrl` 与 `icon` 同时存在只渲染一个**（C3 的优先级）已由 E2 钉住；但「调用方同时给两条通道」在真实调用点不会出现（[终端] 只给 `imageUrl`，[类型] 只给 `icon`），所以这条是防御性契约，不是本次任何真实路径的行为。留着它是因为 C3 逐字要求。
- **本任务没有真实图标可用**：`imageUrl` 是纯管道，真实 data URL 要到任务 4 才接进 [终端] 下拉。§7.2 真机门（图标显示、不截断、换选跟手）都在任务 5；本任务的绿只证明「管道 + 尺寸规则 + 不传时一字不变」。
- **宽度门（索引 K10 / 规格 §9-R5/R6）本任务未重测**：`.term-field` 356.7px 来自 2026-10-15 的取证（P8），本次没碰宽度、也没跑无头 Chromium 复测；按 R6 由真机门 §7.2-1/2 兜。
- **happy-dom 的 `getComputedStyle` 只用于 `flexGrow` 一条**：它确实应用了注入的真 CSS 与后代 / 相邻兄弟选择器（K21 有牙验证 = 证据），但**不**计算 `1em` 的实际像素（happy-dom 不做布局）。所以「14×14 与 FA 同高同基线」仍只有 CSS 取值 + 真机门两级证据，自动化不证 —— 与索引 K9 的口径一致，不是缺陷。

## 6 留给主代理（H 段）

- H1 暂存：`git add src/components/Dropdown.vue src/style.css src/components/Dropdown.test.ts`（我未 `git add`、未 commit、未 stash，G9 / F5）
- H2 commit message（逐字）：`feat(ui): Dropdown 支持选项图片图标（imageUrl，与 FontAwesome 并列且优先）`
- H3 落勾普查：验收通过后把本表 A–I 的 `☐` 改 `☑`，再跑 `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs`
- 任务 4 的承接点：`QuickLaunchModal.vue:110-113` 加 `imageUrl: info.icon`；并按 §6.6-2 改写 `QuickLaunchModal.test.ts:726-737`（删原处那条；组件层的牙已在 `Dropdown.test.ts:225` 那条里）。
