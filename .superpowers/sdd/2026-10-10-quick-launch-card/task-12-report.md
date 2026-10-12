# 任务 12 报告 · 新建/编辑弹窗 `QuickLaunchModal.vue`（含卡片挂载接线）

实现者：子代理（不 git add、不 commit，索引 K5）。判据表：docs/superpowers/checks/2026-10-10-quick-launch-card/task-12-quick-launch-modal.md（A-I 的勾留给主代理，K25）。命令与真实输出也已填进该表 J 段。

## 0 状态

DONE_WITH_CONCERNS —— G1/G2/G3 + 两条额外门全绿；六处变异各有牙（简报要求四处）。疑虑见 §7，其中第 2、3、4 条需要主代理裁定。

## 1 起点

- 简报写 HEAD = `8b79057`，实测 HEAD = **84fe0b9**（其后只有一笔 docs：`84fe0b9 docs: 账本记录任务 11 完成与任务 12 起点、K31 三条口径`）。代码状态与简报取证一致：`QuickLaunch.vue:41-48` 有 `modalOpen`/`editingId` 而无 import；`main.ts:1095/1100/1104/1139` 四个 handler 在位；词典 `ql.modal.*`（zh :167-184 / en :509-526）、`ql.term.*`（:158-161 / :500-503）、`err.ql.*`（:308-318 / :650-660）全在。我按当前表执行。
- 起点工作区只有未跟踪的 task-12-brief.md（简报本身）。基线未复跑：主代理已实测 46 files / 782 tests；改动后的全量见 §5。

## 2 改动范围（= B1-B3，无越界）

| 文件 | 动作 | 证据 |
|---|---|---|
| src/modules/QuickLaunchModal.vue | 新建 350 行 | 未跟踪新文件 |
| src/modules/QuickLaunchModal.test.ts | 新建 436 行 / 9 条用例 | 未跟踪新文件 |
| src/modules/QuickLaunch.vue | 修改（挂载接线）181 行 | `git diff --numstat` = 16 插入 / 2 删除（那 2 行是任务 11 留下的「弹窗待落地」注释，改成本任务的说明） |

- `git diff --name-only`（填 J 段之前）只有 `src/modules/QuickLaunch.vue`；`git diff --name-only -- src-main/i18n/dict.ts src/style.css src/App.vue` 输出为空 → 词典、全局样式、App 一字未动。
- `git diff -- src/modules/QuickLaunch.test.ts` 输出为空 → 卡片既有 7 条用例一字未改（K29）。
- 未碰 `src-main/**`、LogPanel、log-tabs、TerminalTabView。

## 3 TDD：先红 → 后绿

| 步 | 命令 | 真实输出 |
|---|---|---|
| D2 | `npx vitest run src/modules/QuickLaunchModal.test.ts` | `Error: Failed to resolve import "./QuickLaunchModal.vue" … File: …/QuickLaunchModal.test.ts:9:29` · `Test Files 1 failed (1)` · `Tests no tests` · exit 1 |
| D4 | 同上 | `✓ src/modules/QuickLaunchModal.test.ts (9 tests) 99ms` · `Test Files 1 passed (1)` · `Tests 9 passed (9)` · exit 0 |

D2 的形态是「整文件加载失败」而不是 9 条断言各自红 —— 与任务 9 / 任务 11 的 D2 同形；行为性的红由 §5 的六次变异提供。

**单飞用例的形态（取证）**：happy-dom 对 disabled 按钮不派发 click（实测探针：`b.disabled=true` 后 `b.click()` 与 `dispatchEvent(new MouseEvent('click'))` 的监听器命中数都是 0）。所以「点两次只保存一次」若跨 tick 就会被 `:disabled="saving"` 挡掉、去掉 JS 守卫也不红。用例因此把两次点击放在**同一 tick**（`btn.click(); btn.click();` 之后才 `await flush()`）：第一次点击同步进入 `save()` 并置 `saving=true`，DOM 上的 disabled 要到下一个 tick 才打上，第二次点击靠 `:124` 的守卫挡住 —— 这才是变异 ① 有牙的原因。

## 4 E1-E9 → 用例名映射（QuickLaunchModal.test.ts）

| 判据 | 用例名（行号） | 钉住的内容 |
|---|---|---|
| E1 | `defaults_to_shell_type_with_terminal_dropdown_and_cmd_input`（:102） | 标题 = `ql.modal.newTitle`；类型下拉当前值 = `ql.modal.type.shell`、选项恰两项；终端下拉存在 + 命令输入框空值；exe 字段不出现；新建态无 `.btn-delete` |
| E2 | `switching_to_exe_hides_terminal_and_cmd_shows_path_and_pick_button`（:131） | 切到 exe 后终端与命令 label 消失、exe 输入框出现；选择按钮走 `ql_pick_exe` 并写入返回路径；返回 null（取消）不改表单 |
| E3 | `terminal_options_come_from_ql_terminals_and_are_disabled_while_loading`（:166） | 打开即调 `ql_terminals` 恰一次；加载中 trigger 带 disabled 且 `.select-label` = `ql.modal.terminal.loading`；解析后选项 = 主进程返回序 powershell/cmd/pwsh/wsl（不重排，K31(3)）、标签取 `ql.term.*`；预选第一项 = powershell |
| E4 | `empty_name_blocks_save_and_shows_ql_err_nameRequired`（:195） | 空名点保存 → `ql_save` 调用数 0、错误文案 = `ql.err.nameRequired`、不关窗、不冒泡 saved；填上名字后该文案消失（F4：其余六条规则不复制） |
| E5 | `duplicate_name_from_main_process_shows_its_message_and_keeps_modal_open`（:217） | mock reject 带 Electron 外壳 → 错误区逐字 = `VALIDATION: 名字「webui」已存在`（主进程文案，含名字），不含 `ql.err.nameTaken` 的文案；不关窗、不冒泡 saved（K31(2)） |
| E6 | `delete_button_only_in_edit_mode_and_requires_confirm_dialog`（:237） | 新建态无删除按钮；编辑态有（aria-label = `ql.modal.btn.delete`）；点删除只开 ConfirmDialog（标题 + `ql.modal.delete.message` 含名字），`ql_delete` 调用数 0；[取消] 只关窗、无副作用；再点删除 + [确认] 才 `invoke('ql_delete', id)` 并冒泡 `deleted(id)` |
| E7 | `save_success_emits_saved_and_closes`（:286） | 同一 tick 连点两次 → `ql_save` 恰一次（K14(2)）；飞行中按钮 disabled；resolve 后 args = `[props.id, entry]`、冒泡 saved、不自己 emit close（关窗归持有者）；结束后按钮恢复可用 |
| E8 | `new_entry_passes_id_null_to_ql_save`（:312） | 新建态 `ql_save(null, {name,type:'shell',shell,cmd})`；另一段走 exe 类型 → payload 恰 `{name,type:'exe',exe}`，不带 shell/cmd（§5.3-6） |
| E9 | `card_mounts_modal_and_refreshes_on_saved_deleted`（:350） | 挂的是卡片：点「新建」→ 弹窗以空表单打开（无删除按钮）；close → 只关窗、无写操作、无 changed；点行内「编辑」→ 名字/命令/终端三项回填（终端不被「预选第一项」覆盖）；改名字保存 → 弹窗关 + 重拉 `ql_list` + 行名更新 + 冒泡 changed；删除确认 → 该行消失 + changed 两次；卡片 emits 里没有 new/edit |

E9 放在本文件而不是 QuickLaunch.test.ts，是为了让改动范围仍是 B1-B3（G3）：卡片测试文件一字不改，接线断言由本文件的卡片用例提供。

## 5 门与变异（真实计数）

| 门 | 命令 | 计数 |
|---|---|---|
| G1 | `npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModal.test.ts` | 3 files / **78 passed**（卡片 7 · 弹窗 9 · TemplateModal 62），exit 0 |
| G2 | `npx vitest run src-main/i18n src/i18n.test.ts` | 5 files / **25 passed**（index 3 · no-hardcoded 2 · key-coverage 2 · dict 11 · i18n 7），exit 0（未新增键） |
| G3 | `git diff --name-only` · `git status --porcelain -uall` · `git diff --numstat` | 只含 B1-B3（详见 §2） |
| 额外-1 | `npm test` | **47 files / 791 passed**，exit 0（基线 46/782 → +1 文件 / +9 用例，无减少） |
| 额外-2 | `npx tsc -p tsconfig.main.json --noEmit` | `tsc exit=0` |

| 变异 | 改动 | 红 |
|---|---|---|
| ① | 删 `QuickLaunchModal.vue:124` 的 `if (saving.value) return;` | **恰 1 红**：`save_success_emits_saved_and_closes`（E7） |
| ② | 删终端 Dropdown 的 `:disabled="terminalsLoading"` + `:placeholder=…`（:192-193） | **恰 1 红**：`terminal_options_…_disabled_while_loading`（E3） |
| ③ | `onDelete()` 直接 `void doDelete()`（:145，不开确认框） | **2 红**：E6 + E9（卡片用例也走删除确认路径）——要求是「E6 必须红」，已满足 |
| ④ | 卡片 `@saved="onModalSaved"` → 只关窗不重拉（QuickLaunch.vue:179） | **恰 1 红**：`card_mounts_modal_and_refreshes_on_saved_deleted`（E9），卡片 7 条仍绿 |
| ⑤（加做） | `terminals.value = [...found].sort(…)`（:99，K31(3) 的反面） | **恰 1 红**：E3 |
| ⑥（加做） | `invoke('ql_save', props.id ?? '', entry)`（:134，K31(1) 的反面） | **恰 1 红**：E8 |

六次还原后 SHA（SHA-256，`Get-FileHash`）：

- `src/modules/QuickLaunchModal.vue` = `372CF7FCD79867FFC8DD5072C1C65C270AE0072F22675C0F3456BEA007F52B55`（六次变异后均还原为此值）
- `src/modules/QuickLaunch.vue` = `0A34C322A00B7AD17C4F9FB4A30CE50FC6C151732A276172C56DAA56FAFB4056`（变异 ④ 还原后一致）
- `src/modules/QuickLaunchModal.test.ts` = `985102EC6A76ED11AC3D37F8EFD67FCE0DC5705AFEC6234087DE4D1621E7B312`（变异阶段未改测试）
- 还原后复跑：G1 = 78 passed；`npm test` = 47 files / 791 passed

## 6 契约落点（供逐行核对）

- **C1 props**：`QuickLaunchModal.vue:30-34` = `{ open: boolean; id: string | null; entry: QuickLaunchEntry | null }`；`:41` 的 isEdit = `props.id !== null`（K31(1)）。**C2 emits**：`:35-39` = `saved / deleted(id) / close`。**卡片 emits 未变**：`QuickLaunch.vue:30-34` 仍是 start/stop/changed。
- **C3 invoke**：`:110` 的 `watch(() => props.open, …, { immediate: true })` → `fill()` + `loadTerminals()`（:95-108，每次打开都实测、不缓存）；`:134` `ql_save(props.id, entry)`；`:150` `ql_delete(id)`；`:117` `ql_pick_exe`（null = 不改表单）。**单飞**：`:124` 守卫 + `:219` `:disabled="saving"`（与 TemplateModal.vue:442 同构）。
- **F1**：类型 `:184`、终端 `:191-194` 都是 `Dropdown`，无手写 select（E1 用例断 `.dropdown` 内没有 `<select>`）。**F2**：`:219` 右下 `.modal-save`（紫）、`:216` `v-if="isEdit"` 的左下 `.btn-delete`。**F3**：`:46-51` 的 `TERM_LABEL` 是四个 `t()` 字面量的查表，`:78` 用它取标签；主进程只给 `{id, path}`。**F4**：`:69-70` 只有空名一条即时提示，其余六条交主进程。**F5**：无启动参数 / 工作目录 / WSL 发行版字段。
- **K31(2)**：`:136` `saveError.value = errMsg(e)` —— 主进程文案原样进错误区（E5 用例断逐字），没有任何 `VALIDATION:` → `ql.err.nameTaken` 的映射；`ql.err.nameTaken` 仍未被引用（按 check E5 登记为冗余键不删）。
- **K20 / K21(1)**：渲染端 `import { t } from '../i18n'`（:8）；词典一字未改（`git diff --name-only -- src-main/i18n/dict.ts` 为空）；本文件注释里没有 `t(` + 字面量 key 的形态（key-coverage 连注释扫，绿）。
- **K29（B3）**：`QuickLaunch.vue:11` import；`:52-53` `onModalSaved/onModalDeleted` = 关窗 + `reload()` + `emit('changed')`（与 TemplateModule.vue:141-143 同构）；`:55-58` `entryFor()` 只在编辑态给条目；`:178-179` 挂载 `:open/:id/:entry` + `@saved/@deleted/@close`。
- **外壳复用**：`modal-overlay`（全局 style.css:47，未改）/ `modal-box` / `modal-head` / `modal-title` / `modal-close` / `modal-body` / `flag-grid` / `row-cell` / `file-btn` / `modal-actions` / `btn-delete` / `modal-save` —— 类名照抄 TemplateModal，样式是本文件 `<style scoped>` 里该弹窗所需的子集（不带 VRAM / 开关 / flag-tip 段）。style.css 一行未改。

## 7 疑虑（需要主代理裁定 / 登记）

1. **简报与 check 表 C3 对 `ql_save` 返回语义的描述不准**（不影响本任务实现）：简报 :24 与 check C3 写「`ql_save(id | null, entry) → string`（空串 = 成功，否则 VALIDATION:/YAML:/STATE: 前缀文案）」。实测 `main.ts:1095-1098` + `quick-launch-config.ts:123-141`：**成功 = resolve 最终 id；校验失败 = throw（渲染端 reject，带 VALIDATION:/YAML: 前缀）**，没有「空串 = 成功」这条路径（`STATE:` 也不在保存路径上，它在 `ql.start`）。我按实测实现（`try/catch` + `errMsg`），E5 用例按 reject 建模。若要三份文档一致，请改 C3 与简报那两行；我没有在渲染端加「返回串带前缀也算失败」的兼容分支（代码里不存在这种形态，加了就是无据的防御）。
2. **关闭按钮的 aria-label 复用了 `tplModal.close`**（`:171`，文案「关闭弹窗」）：`ql.modal.*` 没有 close 键，K20 不许新增键。备选是 `common.cancel`（语义不对）或给 `ql.modal.close` 建键（那要同步任务 8 表 C8 与本表 C 段）。我选了复用既有通用文案键 —— 若你认为跨模块复用 `tplModal.*` 不可接受，请裁定建键或换 `common.*`，改一处即可。
3. **E7 的「并关窗」由持有者做**：弹窗只 emit `saved`，不自己 emit `close`（与 TemplateModal/TemplateModule 既有分工同构）；「保存后窗口消失」这件事在 E9 的卡片用例里钉（`box()` 变 null）。若判据要求弹窗自身也 emit close，请说（一行的事，但会与既有弹窗的分工不一致）。
4. **删除确认对话框的名字未做视觉宽度截断**：TemplateModal 有 `truncDeleteName`（BUDGET=16 + grace=2）+ `tipName/tipFull` 的 hover 全名（TemplateModal.vue:231-243）。本弹窗直接把名字塞进 `ql.modal.delete.message`（`:158`）。理由：check E6 只要求二次确认，规格 §11-1 的预算只钉列表行（30）与页签（16），ConfirmDialog 自带 `word-break: break-all` 兜底（ConfirmDialog.vue:112），最长 64 字符会换行但不会撑破卡片。要照模板卡补截断 = 约 8 行、属既有 UI 语言，等你裁定，我没有顺手扩。
5. **终端标签未做 16 宽截断**：`ql.term.pwsh` = “PowerShell 7 (pwsh)”（视觉宽 19）、`ql.term.cmd` = 「命令提示符 (cmd)」（宽 19），超过 TemplateModal 给下拉选项用的 BUDGET=16。规格与计划都没要求这里截断，我没做；`style.css:294/:305` 的 CSS `text-overflow: ellipsis` 会兜住不换行，真机是否好看属任务 14 的 UI 复核（M15 那一类）。
6. **未测分支（如实登记）**：`ql_terminals` 失败 → 错误区（:103-106）无用例；`ql_delete` 失败（不存在 → VALIDATION:）无用例；`entryFor()` 的「列表不可用 → null」无用例；`loadTerminals` 里「编辑态终端已不可用 → 回落第一项」无用例。计划 步骤 1 的 6 条里没有它们，我没有扩用例（要钉就加 mock reject 的用例）。
7. **D2 的红是文件级 import 失败**（与任务 9 / 任务 11 同形），不是九条断言各自红；行为性的红由 §5 的六次变异提供。
8. **变异 ③ 出 2 红**（E6 + E9）：卡片用例也走「删除 → 确认」路径，属预期，不是用例耦合缺陷。
