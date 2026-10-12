# 任务 11 报告 · 快捷启动卡片 QuickLaunch.vue

实现者：子代理（不 git add、不 commit，索引 K5）。判据表：docs/superpowers/checks/2026-10-10-quick-launch-card/task-11-quick-launch-card.md（A-I 的勾留给主代理，K25）。命令与真实输出也已填进该表 J 段。

## 0 状态

DONE_WITH_CONCERNS —— 三条门 + 两条额外门全绿，四处变异各有牙；疑虑见 §7（其中第 1 条需要主代理裁定）。

## 1 起点

- 简报写 HEAD = a4dd3ca，实测 HEAD = dd498d5（其后两笔 docs：96d2d7d 给本表补 F7、dd498d5 记 K28/K29 与写表笔误）。我按当前表执行，F7 已包含。
- 起点工作区只有未跟踪的 task-11-brief.md（简报本身）。基线未复跑：主代理已在账本 :245 实测 45 files / 775 tests；改动后的全量见 §5。

## 2 改动范围（= B1-B3，无越界）

| 文件 | 动作 | 证据 |
|---|---|---|
| src/modules/QuickLaunch.vue | 新建 167 行 | 未跟踪新文件 |
| src/modules/QuickLaunch.test.ts | 新建 7 条用例 | 未跟踪新文件 |
| src-main/i18n/dict.ts | 仅 en ql.invalid 一行 | git diff --numstat = 1 插入 / 1 删除 |

git diff --name-only → 只有 src-main/i18n/dict.ts（两份新建文件未跟踪，git diff 不列未跟踪）；git status --porcelain → 上述三处 + 起点就在的 brief 文件。未碰 App.vue / style.css / LogPanel·log-tabs / src-main 其余文件。

## 3 TDD：先红 → 后绿

| 步 | 命令 | 真实输出 |
|---|---|---|
| D2 | npx vitest run src/modules/QuickLaunch.test.ts | Error: Failed to resolve import "./QuickLaunch.vue" … File: …/QuickLaunch.test.ts:8:24 → Test Files 1 failed (1) / Tests no tests / exit 1 |
| D4 | 同上 | ✓ src/modules/QuickLaunch.test.ts (7 tests) 56ms → Test Files 1 passed (1) / Tests 7 passed (7) |

D2 的形态是「整文件加载失败」而不是 7 条断言各自红 —— 与任务 9 的 D2（同为 Failed to resolve import）同形；行为性的红由 §5 的四次变异提供。

## 4 E1-E7 → 用例名映射

| 判据 | 用例名 | 钉住的内容 |
|---|---|---|
| E1 | empty_list_renders_empty_state_text | 标题 ql.title + 空态 ql.empty.none + 0 行 + 新建按钮类名 icon-btn icon-btn--sm（F4） |
| E2 | row_name_is_truncated_to_budget_30_and_long_name_carries_full_tooltip | 拉丁 35 → 前 30 + 省略号；汉字 24（宽 48）→ 前 15 + 省略号；恰 30 → 全名且不挂 data-tooltip（grace=2 口径） |
| E3 | emoji_long_name_is_not_split_at_surrogate_pair | 火箭 emoji ×40 → ×30 + 省略号，且无孤立代理项（正则 LONE_SURROGATE） |
| E4 | start_stop_button_three_states_by_states_prop | 未运行 = btn btn-launch + ql.btn.start + 无 disabled；running = btn btn-danger + ql.btn.stop；stopping = 文本省略号 + disabled；点击 → start(id) / stop(id) / 不冒泡（顺带钉 C2） |
| E5 | copy_uses_nextCopyName_and_inserts_locally_right_after_source | ql_save(null, entry) 且 entry 除 name 外原样；name = X - copy，重名时 X - copy 2；本地显示序 a → 新行 → b；冒泡 changed |
| E6 | invalid_ids_render_count_hint | zh：2 条配置无效；en：invalid entries skipped: 2 与 n=1 的 invalid entries skipped: 1（顺带钉 B3 / 索引 M2）；无效 id 不渲染行；全无效时仍是空态 |
| E7 | row_action_buttons_order_is_copy_edit_start_stop | 行内恰 3 个按钮，tooltip 顺序 = 复制 / 编辑 / 停止；前两个 icon-btn--sm，第三个 btn btn-danger |

C4（不订阅 ql-data / ql-exit）用被动守卫钉：测试的 window.lms mock 只提供 invoke，卡片一旦订阅就 TypeError。

## 5 门与变异（真实计数）

| 门 | 命令 | 计数 |
|---|---|---|
| G1 | npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts | 2 files / 10 tests passed |
| G2 | npx vitest run src-main/i18n src/i18n.test.ts | 5 files / 25 tests passed（index 3 · no-hardcoded 2 · key-coverage 2 · dict 11 · i18n 7） |
| G3 | git diff --name-only · git status --porcelain | 只含 B1-B3；dict.ts numstat 1 1 |
| 额外-1 | npm test | 46 files / 782 tests passed（基线 45/775 → +1 文件 / +7 用例，无减少） |
| 额外-2 | npx tsc -p tsconfig.main.json --noEmit | exit 0 |

| 变异 | 改动 | 红 |
|---|---|---|
| ① | 本地重排（QuickLaunch.vue:77-81）改为追加到末尾 | 1 红：copy_uses_nextCopyName_and_inserts_locally_right_after_source（E5） |
| ② | 删 stopping 分支的 span（:161） | 1 红：start_stop_button_three_states_by_states_prop（E4） |
| ③ | 删 invalid 计数提示（:140） | 1 红：invalid_ids_render_count_hint（E6） |
| ④（加做） | const BUDGET = 30（:104）改 25 | 2 红：E2 + E3 两条用例 |

四次还原后 Get-FileHash src/modules/QuickLaunch.vue 恒为 0A0739585295C2FAABC36AD533F2716BBFA9D4543D023CBE4F41FD091A4C213C，还原后复跑 7 passed。

## 6 契约落点（供逐行核对）

- C1 props：QuickLaunch.vue:26；C2 emits：:29-33（只有 start/stop/changed，无 new/edit）；C3：:54 拉 ql_list、:76 走 ql_save(null, copy) + :75 的 nextCopyName；C4：全文无 onQlData/onQlExit（:14-16 注释写明所有权在 App）。
- K28(1) 本地重排：:77-81（按现有键序遍历、源 id 后插入新 id），与 TemplateModule.vue:86-93 同手法；未加 IPC 参数、未改主进程。
- F1/F2/F3：.tpl-rows/.tpl-row/.tpl-row__id/.tpl-row__actions（:143-148）、.btn-launch/.btn-danger + rocket/stop（:158-161）、.tpl-tip fixed 浮层（:115-125、:141）。style.css 一行未改（.tpl-row__actions 在 CSS 里本来就没有规则，只是模板卡用的钩子类）。
- F5：全部文案走 t()；注释里没有 t( 加字面量 key 的形态（K21(1)），key-coverage 绿。未新增键。
- F7：:41-48 只有本地 modalOpen/editingId，未 import QuickLaunchModal。
- 根节点类名：section class="module module-quick"（:130）——与既有 module-dir/launch/template/gpu 同族，纯接线/测试钩子，CSS 无规则；任务 13 若要别的名字请说。

## 7 疑虑（需要主代理裁定 / 登记）

1. E4 的省略号字符（请裁定）：check 表 E4 与简报写「stopping = 「…」」（U+2026），而计划 :406 写三个半角点，既有 LaunchBar.vue:129 用的是半角三点。我按判据表取 U+2026 并让用例断该字符。若要跟 LaunchBar 一致，只需改 QuickLaunch.vue:161 的一处字符并同步用例一处，其它判据不受影响。
2. 简报对模板卡预算的描述不准（不影响本任务）：简报 :13 说「模板卡用 25」，实测 TemplateModule.vue:113 是 const BUDGET = 30（25 只出现在 style.css:340 的过时注释里）。本卡按规格 §11-1 用 30，与模板卡实际值一致；style.css:340 那句注释是既有文档瑕疵，本任务不改。
3. 未测分支（如实登记）：:50-59 的 catch → :138 的 .error-text（ql_list 只剩 YAML: 这类真错误，规格 §5.2）照模板卡 :167 同构，但没有用例 —— 计划 步骤 1 的 6 条里没有它，我没有扩用例。要钉就加一条 mock 抛 YAML: 的用例。
4. F7 无自动化断言：modalOpen/editingId 只写不读（本任务没有弹窗可开），按 K24(2)/K27(4) 不为无消费者的状态造断言；F7 的成立靠代码核对（:41-48 无 import）。任务 12 的 E9 会真正钉它。
5. nameOf 的 id 回退：:105-107 沿用 TemplateModule.vue:114-117（名字为空时显示 id）。快捷启动的 items 里 name 必非空（配置层校验），这条回退是防御冗余，无用例。
6. 复制后 emit changed 但不重拉 ql_list：这是 K28(1) 的必然取舍（重拉就回到文件序，E5 的「紧跟源行」当场失效）。重新加载后复制项在末尾 —— 与模板卡既有行为一致，按 K28(1) 记为预期。

## 8 定向修复轮 1（2026-10-12 · 索引 K30，唯一一处字符口径）

状态：完成。只改 `stopping` 占位符字符，其余一字未动；未 `git add`、未 commit（K5）。

### 改了什么

| 位置 | 改前 | 改后 |
|---|---|---|
| `src/modules/QuickLaunch.vue:161` | `<span v-else-if="stateOf(id).stopping">…</span>`（U+2026） | `<span v-else-if="stateOf(id).stopping">...</span>`，与既有 `LaunchBar.vue:129` 逐字一致 |
| `src/modules/QuickLaunch.vue:157` | 注释「stopping → 「…」并禁用（与 LaunchBar.vue:125-130 同构）」 | 注释写半角三点 `...` 并指到 `LaunchBar.vue:129` + 索引 K30 |
| `src/modules/QuickLaunch.test.ts:124` | `expect(stateBtn(2).text()).toBe('…')` | `expect(stateBtn(2).text()).toBe('...')` |
| `src/modules/QuickLaunch.test.ts:99` / `:123` | 注释里把该占位符写成「…」 | 同步为半角三点（同一字符口径，纯注释，无逻辑改动）——超出简报列的三处，若要严格回退请说 |

**未误伤截断省略号**（U+2026 保留）：改后实测 `QuickLaunch.vue` 仍含 U+2026 的行只有 `:103`（`truncateByWidth` 的 `+…(U+2026)` 说明），`QuickLaunch.test.ts` 只有 `:73/:74/:76/:77/:93`（E2/E3 的截断断言）。这些是 `truncateByWidth` 产生的截断省略号，与 `stopping` 占位符无关。

### TDD 先红后绿

1. 只改断言（实现未动）→ `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts`：`× start_stop_button_three_states_by_states_prop` · `AssertionError: expected '…' to be '...'` · `Tests 1 failed | 9 passed (10)` · exit 1 —— 真红，红点正是该字符。
2. 再改实现 → 同命令：`Test Files 2 passed (2)` · `Tests 10 passed (10)` · exit 0。

### 三条门（真实计数）

| 门 | 命令 | 计数 |
|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` | 2 files / **10 passed**（copy-name 3 + QuickLaunch 7），exit 0 |
| G2 | `npm test` | **46 files / 782 passed**，exit 0（与验收时逐字相同，无减少） |
| G3 | `npx tsc -p tsconfig.main.json --noEmit` | `tsc exit=0` |

范围核对：`git status --porcelain` 跟踪文件只有 `src-main/i18n/dict.ts`（`git diff --numstat` = `1 1`，即验收时那一行 en `ql.invalid`，本轮未再动）；未跟踪只有 `src/modules/QuickLaunch.vue` / `.test.ts` 与本任务的 brief/report/check 表。HEAD 仍是 `9412e78`。

### 变异自检（一处）

把 `:161` 的半角三点改回 U+2026 → **恰 1 红**：`× start_stop_button_three_states_by_states_prop`（E4），`Tests 1 failed | 9 passed (10)`。还原后复跑 10 passed。

### SHA（`Get-FileHash src/modules/QuickLaunch.vue`，SHA-256）

- 改前（验收态）：`0A0739585295C2FAABC36AD533F2716BBFA9D4543D023CBE4F41FD091A4C213C`
- **改后：`672CF3A76FE295023702FE53F14FBB02BC1861C3B9F77C88093C37599A424E9E`（/12 = `672CF3A76FE2`）**
- 变异态：`166F5676FAB2…`；还原后 = 改后值，逐字节一致 → 新 SHA 稳定

### 对既有报告的影响

- §7 疑虑 1（E4 省略号字符）已按 K30 裁定关闭：取半角三点。
- §5 表里「变异 ② 删 stopping span」的计数不变（仍 1 红 E4）；本轮新增的变异是「字符改回 U+2026」，同样恰 1 红 —— 说明 E4 现在同时钉住了 span 的存在与占位符的字符口径。
- §7 疑虑 2-6 未触碰，仍待主代理处置。

