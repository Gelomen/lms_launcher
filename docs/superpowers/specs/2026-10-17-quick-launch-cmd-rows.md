# 快捷启动弹窗 [命令] 的多行输入（[+] / [-] 逐行） 设计规格

> 规格即真相源（AGENTS.md「术语」SDD）。实现、验收、偏离处理都以本文为准；代码领先规格不算进步。
> 用户原话（逐字，两段；第二段作废第一段的相关部分）：
> 1. 需求：「[快捷启动] 卡片的 [新建/编辑启动项] 弹窗, 增大弹窗的固定高度, 让 [命令行] 类型的 [命令] 输入框增加高度, 并且输入框文本自动换行, 当文本超过输入框高度后, 有滚动条可以滚动输入框的文本」
> 2. 改口径（在追问「是不是要加 ^ 之类的符合再换行」之后）：「更改策略, 默认依然是现状的输入框, 不改变输入框高度, 也不需要自动换行, 然后在这个输入框的右侧, 添加 [+] 按钮, 点击会自动在当前输入框下方创建新的输入框, 只有默认的输入框有 [+] 按钮, 下方被手动创建的输入框右侧只有 [-] 按钮, 点击删除该输入框」
> **本文以第 2 段为准。** 第 1 段的「增大弹窗固定高度 / 输入框增高 / 自动换行 / 滚动条」被第 2 段逐条作废（登记在 §5-1、§5-2）。
> 前置规格：`docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` §7.3（自动命令的写入）与 §9.4（表单字段）——该文件已在 `b330a5c chore: clean docs and temp working files` 中被删除（与 2026-10-16 规格 P12 的登记同一件事）。本文按**现存载体**修订它：代码 `src-main/quick-launch.ts:419-427`、`src/modules/QuickLaunchModal.vue:74-78 / 111-114 / 209 / 311-327`，测试 `src-main/quick-launch.test.ts:239 / :308`、`src/modules/QuickLaunchModal.test.ts:298-420`。

## 1 需求

「新建/编辑启动项」弹窗在 [类型] = 「命令行」时有一行 [命令] 输入框（改动前：`QuickLaunchModal.vue:272-276`，一个 32px 的单行 `<input>`）。一条配置只能写**一条**命令。

要做的是：在这个输入框**右侧**加一个 [+] 按钮，点它在**当前输入框下方**再开一个同样的输入框；只有默认那一行有 [+]，手动加出来的行右侧只有 [-]，点 [-] 删掉它自己那一行。默认那一行本身（高度、单行不换行）一字不改。

「多行」的语义 = **启动这个配置时几条命令依次执行**，不是把多行拼成一条命令送进去。这条语义由 §3-P2/P3/P4 的实测决定，不是选出来的。

## 2 现状（改动前，HEAD = `d989afa`）

| 环节 | 位置（改动前行号） |
|---|---|
| 命令表单值（单值） | `src/modules/QuickLaunchModal.vue:67`（`const formCmd = ref('')`） |
| 「命令不能为空」判据 | `:91-92`（`formCmd.value.trim().length === 0` → `err.ql.cmdRequired`） |
| 保存载荷 | `:173`（`cmd: formCmd.value.trim()`） |
| 命令那一格 | `:272-276`（`.field-cell > .row-cell > input.input`，报错 `<p>` 同格内） |
| 弹窗定高 | `:409-410`（`max-width: 520px` / `min-height: 218px`，注释里带 2026-10-13 的推导） |
| 自动命令写入 | `src-main/quick-launch.ts:400`（`inst.auto = { cmd: trimmed, … }`）、`:411`（`write(auto.cmd + '\r')`） |
| 钉住定高的测试 | `src/modules/QuickLaunchModal.test.ts:990-992`（`controlCells` 数 `.flag-grid` 的直接子控件格 = 3） |
| 钉住写入形状的测试 | `src-main/quick-launch.test.ts` E4（`expect(shell.writes).toEqual(['echo HI\r'])`） |

## 3 现状取证（本机实测 2026-10-17；探针在 `.temp/ql-cmd-rows-newline/` 与 `.temp/ql-cmd-rows-probe/`，`.temp/` 由 `.gitignore` 的 `.*/` 一行覆盖）

| 编号 | 场景 | 真实输出（原样） |
|---|---|---|
| P1 | 基线 | `npm test` → `Test Files 53 passed (53)`、`Tests 926 passed (926)`，exit 0（留档 `.temp/ql-cmd-rows-baseline.log`） |
| P2 | **裸 `\n` 送进 ConPTY 会被吞掉**（真 `@lydell/node-pty` + `cmd.exe`，写入形状与 `quick-launch.ts:411` 逐字同构） | 写 `"ver\necho SECOND-RAN\r"` → 输入回显成 `verecho SECOND-RAN`，执行的是 `verecho` → 「不是内部或外部命令」；`SECOND-RAN` 从未出现 |
| P3 | **`^` 续行不是解**（用户问的就是这个） | 写 `"echo A^\recho B\r"` → 进 `More?` 续行态，两行拼成**一条**命令，输出 `Aecho B`（**不补空格**）；写 `"echo A^\necho B\r"` → 无任何输出，卡在续行态等输入 |
| P4 | **`\r` 才是「依次执行」** | 写 `"echo A\recho B\r"` → 先 `A` 再 `B`；写 `"ver\r\necho SECOND-RAN\r"` → 两条依次执行 |
| P5 | 落盘格式（`yaml` 包 round-trip） | `cmd` 里带 `\n` → 写成 block scalar（`cmd` 的值用 `\|-` 块），读回逐字一致；配置 schema（`QuickLaunchEntry.cmd: string`）与主进程校验（`quick-launch-config.ts:94/:99`）**一字不用改** |
| P6 | 默认态布局（真组件导出的 markup + 真 `style.css` + 真 scoped CSS + 真 Chromium 量取，`.temp/ql-cmd-rows-probe/measure.json`） | 1 行 = `.modal-box` **520 × 218.0**、`.cmd-cell` 452.7 × 32、输入框高 32、按钮 36 × 32、`.modal-body` 无滚动条（`scroll == client`）——与改动前逐像素一致 |
| P7 | **带 `.tip-up` 悬浮气泡会把弹窗顶高 10px**（第一版就是这么写的） | 气泡居中挂在 36px 按钮上、向右探出 `.flag-grid` 边界：`grid clientWidth 487 / scrollWidth 507` → `.modal-body` 出 10px **横向**滚动条 → 弹窗 218 → **227.3**。去掉气泡（只留 `aria-label`）后回到 487/487、519/519、218.0 |
| P8 | 加行之后的自然长高 | 3 行 = `.modal-box` **520 × 293.3**、`.cmd-cell` 452.7 × 108、三个输入框各 32、1× [+] 与 2× [-]、仍无滚动条。每加一行 = 32（`--h-control`）+ 6（行距，与 `.flag-grid` 的 `gap` 同口径）= **38px** |
| P9 | 卡片列表会不会被多行撑坏 | `src/modules/QuickLaunch.vue` 全文不渲染 `cmd`（只渲染 `name` 等）→ 多行 `cmd` 不会出现在卡片行里 |
| P10 | 取不到证的部分 | `powershell.exe` 起不来（内部错误 8009001d）；`pwsh` / `wsl` 本机未安装（`where` 无命中）→ **只有 cmd.exe 是实测**，PowerShell / WSL 是推断（§8-1） |

## 4 目标

1. 默认那一行 = 今天那个输入框，**一字不改**（32px 高、单行、不换行）；[+] 在它的右侧。
2. 点 [+] 在**当前所有行的下方**追加一行空输入框，并把焦点交给它（用户点 [+] 就是准备接着打字）。
3. [+] **只**在默认行；追加出来的行右侧只有 [-]，点 [-] 删掉的必须是**被点的那一行**，且删行不得把后面几行的值串位。
4. 默认行删不掉（它没有 [-]，代码里再守一道）。
5. 落盘口径不变：一条配置仍是**一条** `cmd` 字符串，行间以 `\n` 连接、空行丢弃；配置 schema、主进程校验、`ql_save` 载荷形状一字不改。
6. 回读：`cmd` 里带换行（`\n` / `\r\n` / `\r`）→ 一行一个输入框；单行 `cmd`（现存所有配置）→ 仍是一行。
7. 启动时按行依次执行：主进程写入 PTY 前把行分隔规整成 `\r`（P2/P3/P4）。提权与非提权 shell 走同一个 `releaseAutoCommand`，两条路一起生效。
8. 弹窗定高门不被带歪：`.flag-grid` 的直接子控件格仍是 3、`min-height: 218px` 一字不改（`min-height` 是地板不是天花板，加行按内容长高，见 P6/P8）。
9. 「命令不能为空」的判据等价迁移：一行有效内容都没有才报错，报错位置（命令那一格内、输入框标红）不变。

## 5 非目标

1. **不**做「增大弹窗固定高度」——第 1 段需求里这一条被第 2 段作废；定高地板 218px 不动，加行按内容自然长高。
2. **不**做输入框增高、自动换行、`<textarea>`、文本滚动条——用户逐字：「不改变输入框高度, 也不需要自动换行」。
3. **不**改存储 schema：`cmd` 仍是 `string`，不引入 `cmds: string[]` 之类的字段，不动 `quick-launch-config.ts` 的校验与归一。
4. **不**做 shell 语法/引号校验，**不**做「一行拆成多条命令」的解析（一行就是一条命令，怎么切是 shell 的事）。
5. **不**做命令历史、模板、参数助手；**不**给 [可执行程序] 类型加多行（`exe` 只有一条路径）。
6. **不**为多行命令做终端侧的额外 UI（页签里就是 shell 自己的回显，不加工）。
7. **不**新增依赖、**不**新增 IPC 通道、**不**改 `.flag-grid` 的网格结构。

## 6 设计

### 6.1 渲染端：行模型（`QuickLaunchModal.vue:74-78`、`:111-114`、`:148`、`:177-187`）

```ts
interface CmdRow { id: number; text: string }
let cmdRowSeq = 0;
const newCmdRow = (text = ''): CmdRow => ({ id: cmdRowSeq++, text });
function splitCmdRows(cmd: string | undefined): CmdRow[];   // 按 \r\n | \r | \n 拆；空/缺 → 一行空输入框
const formCmdRows = ref<CmdRow[]>([newCmdRow()]);
const cmdLines = computed(() => formCmdRows.value.map((r) => r.text.trim()).filter((s) => s.length > 0));
```

- **行对象带稳定 id**，`v-for` 的 `:key` 用它（`:312`）。按 index 做 key 会在删中间一行时把后面几行的值串位——`src/modules/QuickLaunchModal.test.ts:298` 那条用例专门钉这一点。
- **拆行认三种行分隔**，与主进程写入端（§6.4）同一口径：回读 yaml block scalar 给的是 `\n`，用户手改配置文件可能是 `\r\n`。
- **空行丢弃**（`cmdLines` 的 `filter`）：空行送进终端就是一条空命令，没有意义。
- **报错判据** = `cmdLines.value.length === 0`（`:113-114`），与单行时代的 `formCmd.value.trim().length === 0` 完全等价 → 2026-10-13 那条「报错在命令输入框下方」的用例一字不改照样成立。

### 6.2 渲染端：按钮（`QuickLaunchModal.vue:311-327`）

- 命令那一格仍是**一个** `.field-cell`（`:311`，加 `cmd-cell` 类），行在它内部纵向排布 → `.flag-grid` 的直接子元素数量不变（`controlCells` 仍数到 3）。
- 第一行（`i === 0`）渲染 [+]（`v-if`），其余行渲染 [-]（`v-else`）。图标走既有 FA 通道：`faPlus` / `faMinus` 挂 `fas` 键（`:4-11`，与 `faTerminal` 同一处注册）。
- `addCmdRow()`：`push` 一行 → `await nextTick()` → 把焦点交给 `.cmd-cell` 里最后一个 `input`。
- `removeCmdRow(id)`：按 **id** 找下标（不是按 index），`if (i > 0)` 才删——默认行永远删不掉，键盘 Enter / 程序化点击都挡得住。
- 按钮盒：`.row-cell .row-btn { flex: none; width: 36px; padding: 0 }`（`:502`），36 × 32 与 `.modal-close` / `.btn-delete` 的命中区同尺寸。
- **不带 `.tip-up` 悬浮气泡**（P7）：气泡会把弹窗顶高 10px，把定高门与「两态同高」全带歪。可访问性靠 `aria-label`（`t('ql.modal.btn.addCmd')` / `t('ql.modal.btn.removeCmd')`），测试也用它定位按钮。

### 6.3 落盘与载荷（`QuickLaunchModal.vue:209`）

`cmd: cmdLines.value.join('\n')`。除此之外载荷一字不改：仍只带该类型的字段（`name/type/shell/cmd/admin`），`exe` 分支不受影响。落盘由 `yaml` 写成 block scalar（P5），`QuickLaunchEntry` 类型不动。

### 6.4 主进程：写入端规整（`src-main/quick-launch.ts:66-68`、`:427`）

```ts
function toPtyInput(cmd: string): string { return cmd.replace(/\r\n|\r|\n/g, '\r'); }
// :427
(inst.proc as ShellProcess).write(toPtyInput(auto.cmd) + '\r');
```

- 模块私有（不导出）：外部只经 `releaseAutoCommand` 走它，测试钉的是行为不是函数。
- 三种行分隔都归一（P2/P4），末尾再补一个 `\r` 提交最后一行；**仍是一次 `write()`**，不是一行一次——E4/E5 的时序口径不变。
- 提权 shell（2026-10-14 规格 §6.8）与非提权共用这段代码，两条路一起生效。

### 6.5 布局与定高门（`QuickLaunchModal.vue:499-502`）

`.cmd-cell { display: flex; flex-direction: column; gap: 6px; }`。定高推导不变：三行控件 × 32 + 两处 `gap` × 6 = 108，+ `margin-top` 12 + `.modal-body` 上下内边距 32 + 头/尾 32+32 + 边框 2 = 218（`min-height` 地板）。加行只长 `.cmd-cell`：实测 1 行 218.0 / 3 行 293.3（P6/P8；293.3 而非 294 是「1 行态内容高本就 217.3、被地板盖住」的亚像素，不是新引入的）。

### 6.6 i18n（`src-main/i18n/dict.ts:180-181` zh / `:527-528` en）

`ql.modal.btn.addCmd` = 「新增命令行」/ "Add command line"；`ql.modal.btn.removeCmd` = 「删除该行」/ "Remove this line"。两个键都以字面量 `t('…')` 出现在组件里，`key-coverage` / `dict` / `no-hardcoded` 三门照常。

## 7 验收（新增 6 条门，逐字名）

| # | 位置 | 用例 | 钉住 |
|---|---|---|---|
| E1 | `src/modules/QuickLaunchModal.test.ts:298` | `only_the_default_cmd_row_has_plus_and_added_rows_have_minus` | §4-1/2/3/4、§6.2；并断默认态仍是 `<input>`（不换行）、`controlCells === 3`、`min-height: 218px` 不变 |
| E2 | `:349` | `multi_row_cmd_saves_joined_by_newline_and_drops_blank_rows` | §4-5、§6.3（载荷逐字 `{name,type,shell,cmd:'…\n…',admin}`） |
| E3 | `:374` | `editing_a_multiline_cmd_refills_one_row_per_line` | §4-6（多行按行回填；单行仍是一行；回填出来的行不带 [+]） |
| E4 | `:395` | `all_blank_cmd_rows_block_save_with_the_error_below_the_first_row` | §4-9（全空行 = 「命令不能为空」，位置不变、不发 `ql_save`；填上任意一行即时消错） |
| E5 | `src-main/quick-launch.test.ts:308` | `多行命令按行提交：写入的只有 \r，不留裸 \n` | §6.4（假进程收到的那一次 `write` 全是 `\r`、零裸 `\n`；仍只写一次） |
| E6 | `src-main/quick-launch.test.ts:239` | `多行 cmd 在真 cmd.exe 里按行依次执行` | §4-7 真机门。判据 = `dir /b C:\Windows` 的输出里有 `System32`；没归一时送进去的是 `echo ALPHA-MARKERdir /b C:\Windows`，永远不会有它。（**不用** `echo A\necho B` 做判据：拼起来那条 echo 的输出同时含 A、B 两个子串，测不出区别） |

既有门不得改动：`empty_cmd_shows_the_error_below_the_cmd_input_not_at_the_top`、`modal_height_is_fixed_to_the_shell_form_height_in_both_types`（`:990-992`）、`cmd_row_has_no_switch_cell`、`src-main/i18n/*` 三门，以及原有的 E4/E5（`writes === ['echo HI\r']`）。

**收尾门**：`npx tsc -p tsconfig.main.json --noEmit` 干净 + `npm test` 全量 = 基线 + 6 = `Test Files 53 passed (53)` / `Tests 932 passed (932)`（实测 2026-10-17 18:17，exit 0）。

**变异检验（门是否咬人）**：把 `toPtyInput(auto.cmd)` 换回 `auto.cmd` → 恰好 E5、E6 两条红（E6 真机门 25069ms 超时等 `System32`），其余 34 条照过。

## 8 边界与未证

1. **只有 cmd.exe 是实测**（P2/P3/P4/P6/P8/E6）。PowerShell / pwsh / WSL 本机取不到证（P10）：`\r` 归一对它们是**推断**。若那三类终端里 `\r` 语义不同，要改的是 `toPtyInput` 一处，不影响 §6.1-6.3。
2. **`\n` 是落盘分隔，不是执行分隔**：落盘用 `\n`（P5 的 block scalar），执行用 `\r`（§6.4）。两端由 `toPtyInput` / `splitCmdRows` 对接，都认 `\r\n` / `\r` / `\n` 三种。
3. **删行不得串位**靠稳定 id 做 `:key`（§6.1）——这是 E1 的断言之一，不是附带效果。
4. **[+] / [-] 不带悬浮气泡**（P7）：这是布局取证逼出来的，不是审美选择。要加回来必须先解决它撑出的 10px 横向溢出。
5. 一行里的引号、管道、`&&` 等由 shell 自己解释；本设计不解析、不校验、不转义（§5-4）。
6. 提权 shell 的多行命令**没有单独的真机门**（走同一段代码，E5/E6 覆盖的是非提权路径）；提权路径的既有门（`ipc-ql.test.ts` 的任务 7 组）不受本次影响。

## 9 真机核对清单（用户执行，dev 或打包版）

| # | 步骤 | 预期 |
|---|---|---|
| R1 | 打开一条**已有**单行配置的编辑弹窗 | 与今天完全一样：一行、218px、右侧一个 [+] |
| R2 | 点 [+] 两次，三行分别填 `echo A` / `echo B` / `echo C`，保存，启动该配置 | 弹窗按行长高、无横向滚动条；终端里三条命令**依次**执行，顺序 = 从上到下 |
| R3 | 中间留一行空，保存后重开该配置 | 空行不在配置里（`cmd` 只有两行）；重开时按两行回填 |
| R4 | 点第二行的 [-] | 删掉的正是第二行，第三行的内容还在；默认行没有 [-] |
| R5 | 手工把 `configs/lms_launcher.yaml` 里某条 `cmd` 改成 block scalar 再打开 | 一行一个输入框，不报错、不合并 |
| R6 | [类型] = 可执行程序 | 完全没有 [+] / [-]，那一行一字不变 |
