# 快捷启动弹窗 [命令] 的多行输入（[+] / [-] 逐行） 实现计划

> 规格：`docs/superpowers/specs/2026-10-17-quick-launch-cmd-rows.md`（下文 §n 全部指它）。
> **本文是补写的。** 用户在第一道门选的是「直接实现/修改」（不产出 spec/plan），实现与验证已按该路线完成；按 AGENTS.md 工作流第 4 步与硬规则 6/7，代码领先规格就是缺陷，故补写本文与规格，把口径与取证落到文档上。任务已勾（`[x]`）＝ 已做完，证据在「执行记录」。**没有子代理派单**（直接实现路线），因此本次不生成 check 表；验收证据 = 本文执行记录 + `.temp/ql-cmd-rows-newline/probe.md` + `.temp/ql-cmd-rows-probe/probe.md`。
> 分支：`feat/quick-launch`，文档撰写时 HEAD = `d989afa update AGENTS.md`，代码改动留在工作区待验收。
> 基线（§3-P1，实测 2026-10-17）：`npm test` → `Test Files 53 passed (53)`、`Tests 926 passed (926)`，exit 0（留档 `.temp/ql-cmd-rows-baseline.log`）。

**目标：** 让 [命令] 支持逐行输入多条命令（默认行不变高、不换行；[+] 加行、[-] 删行），落盘仍是一条 `cmd` 字符串，启动时按行依次执行。

**架构：** 渲染端把单值 `formCmd` 换成行模型 `CmdRow[]`（稳定 id 做 `:key`），全部行放在**同一个** `.field-cell` 内纵向排布（`.flag-grid` 的网格结构不变 → 218px 定高推导不变）；保存时 `cmdLines.join("\n")`、空行丢弃。主进程只在写入端加一处归整 `toPtyInput`（`\r\n|\r|\n` → `\r`），schema、校验、IPC、载荷形状一字不改。

**技术栈：** Vue 3 SFC（`<script setup>`）+ `@vue/test-utils` + Vitest + happy-dom（渲染端与 CSS 契约门）；`@lydell/node-pty`（ConPTY，真机门）；Electron + 真 Chromium 做布局量取（`.temp/ql-cmd-rows-probe/shot.js`）。

## 全局约束

- **G1 默认那一行一字不改**：32px 高、单行 `<input>`、不换行、不增高（用户逐字）。E1 断 `tagName === 'INPUT'`。
- **G2 定高门不动**：`.flag-grid` 的直接子控件格仍数到 3、`min-height: 218px` 与 `max-width: 520px` 一字不改；既有门 `modal_height_is_fixed_to_the_shell_form_height_in_both_types` 不得改动。
- **G3 存储与校验不动**：`QuickLaunchEntry.cmd` 仍是 `string`；`quick-launch-config.ts` 的校验/归一、`ql_save` 载荷形状一字不改。
- **G4 写入仍是一次 `write()`**：归整不改时序（不是一行一次），既有 E4/E5 的时序断言不得改动。
- **G5 i18n 双语同增**：两个新键在 `src-main/i18n/dict.ts` 的 zh 与 en 两处都加，且以字面量 `t('…')` 出现在组件里；`key-coverage` / `dict` / `no-hardcoded` 三门不得变红。
- **G6 不新增依赖、不新增 IPC 通道、不改 `.flag-grid` 网格结构。**
- **G7 收尾门**：`npx tsc -p tsconfig.main.json --noEmit` 干净 + 该任务定向测试绿 + `npm test` 全量绿（总数 = 基线 + 累计新增：任务 1 → 930、任务 2 → 932）。
- **G8 改动留工作区**：本次由主代理直接实现（用户选定路线），提交由主代理在验收后做。

## 审查重点（Review Focus）

| 编号 | 重点 | 钉住的任务与测试 |
|---|---|---|
| RF1 | **删行删的是被点的那一行**，且不得把后面几行的值串位（`:key` 用 index 就会串） | 任务 1 E1（删中间行后断剩余行的值逐字 `['', 'B']`） |
| RF2 | **默认行不可删、只有默认行有 [+]**；追加行只有 [-] | 任务 1 E1（`v-if` / `v-else` 的可见性 + `removeCmdRow` 的 `if (i > 0)`） |
| RF3 | **多行 = 依次执行，不是拼成一条**：裸 `\n` 会被 ConPTY 吞掉（P2），`^` 会把两行拼成一条且不补空格（P3） | 任务 2 E5（写入形状全 `\r`、零裸 `\n`）+ E6（真 `cmd.exe` 里 `System32` 必须出现） |
| RF4 | **定高与两态同高不被带歪**：加行只长 `.cmd-cell`，`controlCells` 仍 3、`min-height` 仍 218px；默认态实测 218.0 | 任务 1 E1（CSS 契约断言）+ 任务 3 的真 Chromium 量取（`measure.json`） |

## 文件结构

| 文件 | 动作 | 任务 |
|---|---|---|
| `src/modules/QuickLaunchModal.vue` | 改（行模型 `:74-78`、判据 `:111-114`、回填 `:148`、加/删行 `:177-187`、载荷 `:209`、模板 `:311-327`、样式 `:499-502`、FA 图标注册 `:4-11`） | 1 |
| `src-main/i18n/dict.ts` | 改（`:180-181` zh、`:527-528` en 各两个键） | 1 |
| `src/modules/QuickLaunchModal.test.ts` | 改（新增 E1-E4，`:298-420`） | 1 |
| `src-main/quick-launch.ts` | 改（`toPtyInput` `:66-68`、写入 `:427`） | 2 |
| `src-main/quick-launch.test.ts` | 改（新增 E5 `:308`、E6 `:239`） | 2 |
| `.temp/ql-cmd-rows-newline/` | 取证（真 PTY 的 `\n` / `^` / `\r` 三组对照 + yaml round-trip） | 2 |
| `.temp/ql-cmd-rows-probe/` | 取证（真组件 markup + 真 CSS + 真 Chromium 量取与出图） | 3 |

---

### 任务 1：渲染端行模型 + [+] / [-] + i18n + 四条组件门

**文件：** `src/modules/QuickLaunchModal.vue`、`src-main/i18n/dict.ts`、`src/modules/QuickLaunchModal.test.ts`（边界：不碰 `QuickLaunch.vue`、不碰 `Dropdown.vue`、不碰 `.flag-grid` 的规则）

- [x] **步骤 0：起点核对**：读 `QuickLaunchModal.vue:67 / :91-92 / :173 / :272-276 / :409-410`（单值表单、判据、载荷、命令那一格、定高）与 `QuickLaunchModal.test.ts:990-992`（`controlCells` 计数器）、`:253-279`（报错位置门）——确认「行放进同一个 `.field-cell`」不会改变 `controlCells` 的数法（G2）。
- [x] **步骤 1：行模型**：`CmdRow { id, text }` + 模块内自增 `cmdRowSeq`；`splitCmdRows` 按 `\r\n|\r|\n` 拆行、空/缺给一行空行；`formCmdRows` 取代 `formCmd`；`cmdLines` 逐行 trim + 丢空行（§6.1）。
- [x] **步骤 2：判据与载荷迁移**：`cmdError` 改判 `cmdLines.value.length === 0`（与单行等价，既有报错门一字不改照样绿）；`save()` 用 `cmdLines.value.join('\n')`；`fill()` 用 `splitCmdRows`（§6.1/§6.3）。
- [x] **步骤 3：按钮与焦点**：`addCmdRow`（`push` → `nextTick` → 聚焦最后一个 `input`）、`removeCmdRow(id)`（按 id 找、`if (i > 0)`）；模板 `v-if="i === 0"` 出 [+]、`v-else` 出 [-]；`faPlus` / `faMinus` 挂 `fas` 键（§6.2）。
- [x] **步骤 4：样式**：`.cmd-cell { display:flex; flex-direction:column; gap:6px }` + `.row-cell .row-btn { flex:none; width:36px; padding:0 }`（§6.5）。
- [x] **步骤 5：i18n**：`ql.modal.btn.addCmd` / `ql.modal.btn.removeCmd` 在 zh（`dict.ts:180-181`）与 en（`:527-528`）各加一条（G5）。
- [x] **步骤 6：四条组件门** E1-E4（`:298 / :349 / :374 / :395`，名字逐字见规格 §7）。E1 同时钉住「默认态还是 `<input>`」「`controlCells === 3`」「`min-height: 218px`」三条（RF2 / RF4）。
- [x] **步骤 7：收尾门（G7）**：`npx vitest run src/modules/QuickLaunchModal.test.ts` → 34 passed；`npx vitest run src-main/i18n` → 18 passed；`npm test` → `Tests 931 passed (931)`（此时主进程门还没加）。

### 任务 2：主进程写入端归整 + 两条主进程门（含真机门）

**文件：** `src-main/quick-launch.ts`、`src-main/quick-launch.test.ts`、取证 `.temp/ql-cmd-rows-newline/probe.md`（G3 / G4 边界：不碰 `quick-launch-config.ts`、不碰 `inst.auto` 的时序）

- [x] **步骤 0：先取证再定口径**（真 `@lydell/node-pty` + `cmd.exe`，写入形状与 `quick-launch.ts:411` 逐字同构）：`"ver\necho SECOND-RAN\r"` → 回显 `verecho SECOND-RAN`、执行 `verecho`；`"echo A^\recho B\r"` → `More?` 续行、输出 `Aecho B`；`"echo A\recho B\r"` → 依次执行。结论：`^` 不是解，`\r` 才是（P2 / P3 / P4）。
- [x] **步骤 1：落盘格式取证**：`yaml` 包 round-trip，`cmd` 带 `\n` → block scalar、读回逐字一致（P5）→ 决定「schema 不动、`\n` 连接」。
- [x] **步骤 2：实现** `toPtyInput`（模块私有，`:66-68`）+ `:427` 改成 `write(toPtyInput(auto.cmd) + '\r')`（§6.4）。
- [x] **步骤 3：E5**（`:308`）：假进程断那一次 `write` 逐字 `'echo A\recho B\recho C\recho D\r'`、`includes('\n') === false`、时序仍是 `['deps.onData','pty.write']`（一次写入，G4）。
- [x] **步骤 4：E6 真机门**（`:239`）：真 `cmd.exe`，判据 = `dir /b C:\Windows` 的输出里有 `System32`（两行被拼成一条命令时永远不会出现）。
- [x] **步骤 5：变异检验（门是否咬人）**：把 `toPtyInput(auto.cmd)` 换回 `auto.cmd` → `2 failed | 34 passed`，红的恰是 E5 与 E6（E6 在 25069ms 超时等 `System32`）；改回后 `npx tsc -p tsconfig.main.json --noEmit` exit 0。
- [x] **步骤 6：收尾门（G7）**：`npm test` → `Test Files 53 passed (53)` / `Tests 932 passed (932)`，exit 0（2026-10-17 18:17）。

### 任务 3：布局取证（真 Chromium 量取）+ 修掉自己引入的 10px

**文件：** `.temp/ql-cmd-rows-probe/`（`dump.test.ts` / `vitest.dump.config.ts` / `measure.html` / `shot.js` / `probe.md`）

- [x] **步骤 1：真组件导出 markup**：`npx vitest run --config .temp/ql-cmd-rows-probe/vitest.dump.config.ts` → `real-markup.json`（1 行与 3 行两份 `.modal-box`）。
- [x] **步骤 2：真 Chromium 量取**：`electron.exe … shot.js` → `measure.json` + 两张出图。1 行 **520 × 218.0**、无滚动条；3 行 **520 × 293.3**、`.cmd-cell` 108、三个输入框各 32（P6 / P8，RF4）。
- [x] **步骤 3：发现并修掉第一版引入的 10px**：带 `.tip-up` 气泡 → `grid 487/507` → `.modal-body` 横向滚动条 10px → 弹窗 227.3。去掉气泡（只留 `aria-label`）后回到 218.0（P7，登记进规格 §8-4）。
- [x] **步骤 4：探针自身的两个坑留档**：`capturePage` 会回上一帧（截图前等两帧 rAF）；Electron 的 `console.log` 走管道会 EPIPE 弹错误窗（结果改写文件）。

## 执行记录

| # | 命令 | 真实输出摘要 |
|---|---|---|
| 1 | 真 PTY 探针（`.temp/ql-cmd-rows-newline/probe.md`） | `ver\necho …` → `verecho`「不是内部或外部命令」；`echo A^\recho B` → `Aecho B`；`echo A\recho B` → 依次执行 |
| 2 | `yaml` round-trip 探针 | `cmd` 带 `\n` → block scalar，读回逐字一致 |
| 3 | `npm test`（改动前基线） | `Test Files 53 passed (53)` / `Tests 926 passed (926)`，exit 0 |
| 4 | `npx vitest run src/modules/QuickLaunchModal.test.ts src-main/quick-launch.test.ts`（实现后） | `2 passed` / `69 passed (69)` |
| 5 | `npx vitest run src/modules/QuickLaunchModal.test.ts src-main/quick-launch.test.ts src-main/i18n` | `6 passed` / `87 passed (87)`（含 `key-coverage` / `dict` / `no-hardcoded`） |
| 6 | `npx tsc -p tsconfig.main.json --noEmit` | exit 0，无输出 |
| 7 | `npm test`（任务 1 后） | `53 passed (53)` / `931 passed (931)`，exit 0 |
| 8 | 变异：`toPtyInput(auto.cmd)` → `auto.cmd` | `2 failed \| 34 passed (36)`，红在 E5 与 E6（E6 25069ms 超时）；其余照绿 |
| 9 | 改回后 `npm test`（终态） | `Test Files 53 passed (53)` / `Tests 932 passed (932)`，exit 0（18:17） |
| 10 | `electron.exe … .temp/ql-cmd-rows-probe/shot.js` | `rows1: modalBox 520×218, bodyClient 152/152, grid 487/487`；`rows3: 520×293.3, cmdCell 108, 3×32`；出图两张 |

**顺序偏离登记（诚实）**：本次是「实现 → 测试」，不是 TDD 的「测试先于实现」——因为口径本身要先靠真 PTY 探针才能定（P2 / P3 / P4 决定用 `\r`，P5 决定不动 schema）。取证在前、实现在中、门在后；E1-E6 全部跑过并做了变异检验（第 8 行）。

**待办（验收后）**：代码改动仍在工作区（五个文件，见 `git status`），提交由主代理做；真机核对清单见规格 §9（R1-R6，用户执行）。
