# 快捷启动弹窗 [程序路径] 的多行输入（[+] / [-] 逐行、按序启动多个程序） 实现计划

> 规格：`docs/superpowers/specs/2026-10-17-quick-launch-exe-rows.md`（下文 §n 全部指它）。
> 分支：`feat/quick-launch`，文档撰写时 HEAD = `8d5eec1 docs: 补记实现提交与提交前全量门…`，**代码一行未改**。
> 基线（§3-P1，实测 2026-10-17 20:13）：`npm test` → `Test Files 53 passed (53)`、`Tests 932 passed (932)`，exit 0（留档 `.temp/ql-exe-rows-baseline/baseline.log`）。
> 工具链取证（§3-P2）：生效的是 **npm + `package-lock.json`**（mtime 2026-10-17），`pnpm-lock.yaml` 是 2026-10-09 的陈旧遗留 → 本次不碰任何 lockfile，也不得用 `pnpm` 跑门。
> 本次不生成 check 表，理由见规格 R-13（AGENTS.md 的「check 表」一节已在 `d989afa` 删除，第 10 行是悬空引用）。同一职责由本文的 G 组 / RF 组 / 执行记录承担。

**目标：** 让 [可执行程序] 的 [程序路径] 支持逐行输入多条路径（默认行不变高、不换行；[+] 加行、[-] 删行；每行都有自己的 [选择文件]），落盘为有序字符串数组，启动时先全量预检、再按顺序依次发起、不等待退出；一条配置在卡片上仍是一个按钮。

**架构：** 三层各改一处，互不越界。① 配置层：`QuickLaunchEntry.exe` 由 `string` 变 `string[]`，归一/校验按数组走，标量写法一律非法（不做兼容）。② 启动层：`Instance.proc` → `Instance.procs`，`start()` 的 exe 分支变成「预检循环 + 启动循环」，`isRunning()` 取「任一存活」，`stop()` 逐个停，退出上报只在「全部退出」时发生一次；新增一个 `QlDeps.checkExe` 接缝接已导出的 `isLaunchableExe`。③ 渲染端：照抄 [命令行] 已经做完的行模型（`QuickLaunchModal.vue:74-88 / :311-328`），所有行放在**同一个** `.field-cell` 内 → `.flag-grid` 网格行不增加、218px 定高推导一字不改。

**技术栈：** Vue 3 SFC（`<script setup>`）+ `@vue/test-utils` + Vitest + happy-dom（渲染端与 CSS 契约门）；`koffi` + `ShellExecuteExW`（主进程 exe，真机门）；`yaml`（落盘形状）；Electron + 真 Chromium 做布局量取（沿用 `.temp/ql-cmd-rows-probe/shot.js` 的手法）。

## 全局约束

- **G1 默认那一行一字不改**：32px 高、单行 `<input>`、不换行、不增高；[选择文件] 仍在输入框右侧，[+] 在 [选择文件] 右侧。既有门 `switching_to_exe_hides_terminal_and_cmd_shows_path_and_pick_button` 只允许按 §8 的方式改写（补 [+] 断言），不得删。
- **G2 定高门不动**：`.flag-grid` 的直接子控件格仍数到 3、`min-height: 218px` 与 `max-width: 520px` 一字不改；`modal_height_is_fixed_to_the_shell_form_height_in_both_types`（`:970-1010`）不得改动。多行只长 `.exe-cell`。
- **G3 shell / 命令行分支一行不碰**：`cmd` 仍是 `string`，落盘 `\n`、提交 `\r` 的口径不动；`quick-launch.ts` 的 shell 分支时序不动（`procs` 数组对 shell 只是「长度为 1」）。
- **G4 提权口径不动**：`launchShellExe` 的第三参、`qlStartContext` 槽、`main.ts` 的 `spawnExeProcess` 分工一字不改；`admin` 仍在条目上，逐条路径用同一个 verb。
- **G5 预检函数不改**：`isLaunchableExe`（`shell-execute.ts:242-261`）与 `launchShellExe` 内部那道预检（`:272-274`）一字不动；新增的只是调用位置（`QlDeps.checkExe`）。
- **G6 不做旧格式兼容**：`normalizeEntry` 遇到标量 `exe` 一律判非法（进 `invalid`）；不写迁移脚本、不碰 `config-migrate.ts`（它本来也不碰 quick_launch.yaml）。
- **G7 i18n 双语同增**：`ql.modal.btn.addExe` / `ql.modal.btn.removeExe` 在 `src-main/i18n/dict.ts` 的 zh 与 en 两处都加，且以字面量 `t('…')` 出现在组件里；`key-coverage` / `dict` / `no-hardcoded` 三门不得变红；错误文案只复用既有键。
- **G8 不新增依赖、不新增 IPC 通道、不改 `.flag-grid` 网格结构、不加调序 / 多选 / 每行提权**（§5 非目标即边界）。
- **G9 收尾门（每任务）**：`npx tsc -p tsconfig.main.json --noEmit` 干净 + 该任务定向测试绿 + `npm test` 全量绿。总数下限：任务 1 → ≥941、任务 2 → ≥944、任务 3 → ≥949（实际数以执行记录为准，不得少于基线 932 + 本文列出的新增门数）。
- **G10 子代理不 `git add`、不 commit**（AGENTS.md 硬规则 3）；改动留工作区等主代理验收，提交由主代理做（硬规则 2/4）。
- **G11 只改该任务「文件」行列出的文件**：`git diff --name-only` 与该行逐字对照。

## 审查重点（Review Focus）

| 编号 | 重点 | 钉住的任务与测试 |
|---|---|---|
| RF1 | **删行删的是被点的那一行**，不得把后面几行的值串位（`:key` 用 index 就会串） | 任务 3 的「删中间行后断剩余行逐字」门（照抄 cmd 先例 E1 的断言形状） |
| RF2 | **默认行不可删、只有默认行有 [+]**；追加行有 [-] 且**每行都有 [选择文件]**；[选择文件] 只写它自己那一行 | 任务 3 的两条门（可见性 + 逐行填充） |
| RF3 | **要么全起要么都不起**：任一路径预检失败 → 一次 `shellExecute` / `spawnExe` 都不调，错误指出是哪条 | 任务 2 的预检门（`spawnExe` 调用次数 = 0）+ 既有 `ipc-ql` 的「路径不存在 → 不调 Shell」门仍绿 |
| RF4 | **依次发起、不等退出**：`start()` 里不得出现 `await` 进程退出；N 条 → N 次 `spawnExe`，顺序 = 数组顺序 | 任务 1 的顺序门（假接缝记录调用序列） |
| RF5 | **聚合状态只发一次退出**：任一存活 = running；`deps.onExit` / `ql-exit` 只在最后一个进程退出时一次；`stop()` 覆盖全部进程 | 任务 1 的三条门（running 聚合 / 单次退出 / 停全部） |
| RF6 | **中途失败不回滚已起的**：第 k 条抛错 → 第 k+1…N 条不调、前 k-1 条留在实例里、错误原样抛 | 任务 2 的失败门 |
| RF7 | **定高与两态同高不被带歪**：加行只长 `.exe-cell`，`controlCells` 仍 3、`min-height` 仍 218px | 任务 3 的 CSS 契约断言 + 任务 4 的真 Chromium 量取（`.temp/ql-exe-rows-probe/`） |
| RF8 | **旧标量写法静默失效**：进 `invalid`，不出现在 `qlLoad().items`，不抛错 | 任务 1 的「标量 → invalid」门 + 真机 §9-R11 |

## 文件结构

| 文件 | 动作 | 任务 |
|---|---|---|
| `src-main/quick-launch-config.ts` | 改（`:14` 类型、`:74-78` 归一、`:97-100` 校验） | 1 |
| `src-main/quick-launch.ts` | 改（`:104-115` `procs`、`:143-145` 聚合 running、`:308-327` 启动循环、`:330-333` 退出聚合、`:369-383` 停全部） | 1 |
| `src-main/main.ts` | 改（`:1102-1128` 的 `deps` 里加 `checkExe`；`:1076-1098` 不动） | 1（占位接线）→ 2（生效） |
| `src-main/quick-launch-config.test.ts` | 改（§8 列出的载荷与 fixture 改写 + 新增 invalid 门） | 1 |
| `src-main/quick-launch.test.ts` | 改（假接缝扩展 + §8 改写 + 新增 RF4/RF5 门） | 1 |
| `src-main/ipc-ql.test.ts` | 改（§8 列出的载荷改写） | 1 |
| `src-main/quick-launch.ts` | 改（`QlDeps.checkExe` + 预检循环 + 中途失败停止后续） | 2 |
| `src-main/quick-launch.test.ts` / `src-main/ipc-ql.test.ts` | 改（新增 RF3 / RF6 门） | 2 |
| `src/modules/QuickLaunchModal.vue` | 改（行模型、判据、回填、加/删行、`pickExe(row)`、载荷、模板 `:350-361`、样式 `.exe-cell`） | 3 |
| `src-main/i18n/dict.ts` | 改（zh / en 各两键） | 3 |
| `src/modules/QuickLaunchModal.test.ts` | 改（§8 改写 + 新增 RF1/RF2 门） | 3 |
| `.temp/ql-exe-rows-probe/` | 取证（真组件 markup + 真 CSS + 真 Chromium 量取与出图） | 4 |

---

### 任务 1：主进程——`exe` 变有序数组 + 聚合实例（配置层与启动层同一编译单元）

**文件：** `src-main/quick-launch-config.ts`、`src-main/quick-launch.ts`、`src-main/main.ts`、`src-main/quick-launch-config.test.ts`、`src-main/quick-launch.test.ts`、`src-main/ipc-ql.test.ts`（边界：不碰 `shell-execute.ts`、不碰 `QuickLaunchModal.vue`、不碰 `config-migrate.ts`）

> 为什么配置层与启动层不能拆成两个任务：`QuickLaunchEntry.exe` 一改类型，`quick-launch.ts:308-327` 就编译不过，G9 的 tsc 门会红。拆了必然违反「每任务收尾门」。

- [x] **步骤 0：起点核对**：读 `quick-launch-config.ts:14/:74-78/:97-100`、`quick-launch.ts:104-115/:143-145/:308-327/:330-333/:369-383/:396-409`、`main.ts:1076-1098/:1102-1128`、`quick-launch.test.ts:79-81/:165-172/:186/:348/:394`——确认「一实例一进程」的假设被哪些行依赖，以及 `onInstanceExit` 的无条件上报点在哪。
- [x] **步骤 1：配置层**：`exe?: string[]`；`normalizeEntry` / `validateEntry` 的 exe 分支按 §6.1 走（数组才继续、逐元素 trim、丢空串、空数组非法、标量非法）。
- [x] **步骤 2：实例聚合**：`Instance.procs: Array<ShellProcess | ExeProcess>` + 与 `procs` 同序的 `procExited: boolean[]`（`exited` 保持单一布尔 = 「全部退出」，`exitCode` = 最后退出者；措辞按 R-A2 校正）；`isRunning()` = 任一存活；`stop()` 按启动顺序逐个 `stopGraceful`；退出回调只在「全部退出」时 `removeInstance` + `deps.onExit`（§6.5）。
- [x] **步骤 3：启动循环**：`start()` 的 exe 分支按 §6.3 的 1/3/4/5 步实现（预检留到任务 2，本任务先按「逐条起、失败停止后续」）；每条各写一行 `log.launcher.start.cmd`。
- [x] ~~**步骤 4：`main.ts` 接线**：`deps` 里加 `checkExe`~~ —— **登记偏离：本任务未做**（裁决 R-PF2：`QlDeps`（`quick-launch.ts:181`）此刻没有 `checkExe` 成员，往 `main.ts:1102-1128` 的内联 deps 字面量多加一个属性会触发 TS2353 → G9 的 tsc 门必红）。`QlDeps` 成员 + `main.ts` 接线 + 预检循环整体归**任务 2**；本任务实现者 `main.ts` 一行未碰（实测 `git diff --name-only` 不含它）。划线 + 「未做」即登记处，不算完成。
- [x] **步骤 5：改写既有门**：按规格 §8 逐条改写 `quick-launch-config.test.ts` / `quick-launch.test.ts` / `ipc-ql.test.ts` 的载荷与 fixture（**不得删断言**，只改形状）。
- [x] **步骤 6：新增门**：E1 标量写法 → invalid；E2 数组落盘 round-trip（顺序逐字）；E3 空数组 / 全空串 → `VALIDATION:`；E4 元素 trim + 丢空行；E5 启动顺序 = 数组顺序、不 await 退出；E6 聚合 running（任一存活）；E7 `stop()` 停全部；E8 全部退出才一次 `onExit`；E9 中途抛错 → 后续不调、已起保留。
- [x] **步骤 7：收尾门（G9）**：`npx tsc -p tsconfig.main.json --noEmit` + `npx vitest run src-main/quick-launch-config.test.ts src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` + `npm test`，把命令与真实输出填进「执行记录」。

### 任务 2：主进程——启动前全量预检（要么全起，要么都不起）

**文件：** `src-main/quick-launch.ts`、`src-main/main.ts`、`src-main/quick-launch.test.ts`、`src-main/ipc-ql.test.ts`（边界：不碰 `shell-execute.ts`、不碰渲染端）

- [ ] **步骤 0：起点核对**：读 `shell-execute.ts:242-261/:272-274`（预检已存在、已导出、不得改）与 `ipc-ql.test.ts:470/:493-496`（既有的「路径不存在 → 不调 Shell」门）——确认新增的预检不会与它冲突。
- [ ] **步骤 1：接缝**：`QlDeps` 加 `checkExe(exe: string): boolean`；`main.ts` 的 `deps` 接 `isLaunchableExe`。
- [ ] **步骤 2：预检循环**：`start()` 在启动循环之前对全部路径调 `checkExe`，任一条 false → 抛 `PROC: err.proc.exeNotFound`（`{exe}` = 该条），且此前一次 `spawnExe` 都没调（§6.3-2）。
- [ ] **步骤 3：新增门**：E10 三条里第二条不可用 → `spawnExe` 调用次数 0 + 错误文案含第二条路径；E11 全部可用 → 三次调用顺序逐字；E12 `ipc-ql` 端到端：假 `shellExecute` 一次都没被调。
- [ ] **步骤 4：收尾门（G9）**：同任务 1 步骤 7。

### 任务 3：渲染端——多行路径 + 每行 [选择文件] + [+] / [-] + i18n

**文件：** `src/modules/QuickLaunchModal.vue`、`src-main/i18n/dict.ts`、`src/modules/QuickLaunchModal.test.ts`（边界：不碰 `QuickLaunch.vue`、不碰 `Dropdown.vue`、不碰 `.flag-grid` 的规则、不碰 `.cmd-cell` 的既有规则）

- [ ] **步骤 0：起点核对**：读 `QuickLaunchModal.vue:74-88/:177-187/:311-328/:350-361/:499-502` 与 `QuickLaunchModal.test.ts:970-1010`（`controlCells` 计数器）、`:419-449`（报错位置门）——确认「行放进同一个 `.field-cell`」不改变 `controlCells` 的数法（G2）。
- [ ] **步骤 1：行模型**：`ExeRow { id, text }` + 自增序号 + `newExeRow` / `addExeRow`（`nextTick` 后聚焦）/ `removeExeRow(id)`；回填按 `entry.exe` 逐条映射（§6.2）。
- [ ] **步骤 2：判据与载荷**：`exeError` 改判「所有行 trim 后全空」（既有报错门一字不改照样绿）；保存载荷 `exe` = trim + 丢空行后的数组。
- [ ] **步骤 3：模板与样式**：`.exe-cell`（flex 列 + `gap: 6px`）内 `v-for` 行；每行 = 输入框 + [选择文件]（`pickExe(row)`）+（`i===0` ? [+] : [-]）；[+] / [-] 复用 `.row-btn`，**不带** `.tip-up`（§6.2 最后一条）。
- [ ] **步骤 4：i18n**：`ql.modal.btn.addExe` / `ql.modal.btn.removeExe` 两键 zh / en 同增（G7）。
- [ ] **步骤 5：改写既有门**：按规格 §8 改 `:165-199`（默认行含 [+]、无 [-]）、`:578/:1168`（载荷数组）、`:1117`（回填数组）；`:419-449`、`:970-1010`、`:1079-1107`、`:298-418` **一字不动**。
- [ ] **步骤 6：新增门**：E13 默认行有 [+] 且无 [-]、追加行有 [-] 且无 [+]、每行都有 [选择文件]；E14 删中间行不串位（断剩余行逐字）；E15 保存载荷 = 数组且丢空行；E16 两条路径回填两个输入框；E17 [选择文件] 只填它自己那一行。
- [ ] **步骤 7：收尾门（G9）**：`npx tsc -p tsconfig.main.json --noEmit` + `npx vitest run src/modules/QuickLaunchModal.test.ts src-main/i18n` + `npm test`。

### 任务 4：真机门与打包（用户执行，主代理准备清单与探针）

**文件：** `.temp/ql-exe-rows-probe/`（取证）、`docs/superpowers/plans/2026-10-17-quick-launch-exe-rows.md`（填执行记录）

- [ ] **步骤 1：布局量取探针**：照 `.temp/ql-cmd-rows-probe/shot.js` 的手法，用真组件 markup + 真 CSS + 真 Chromium 量 1 行 / 3 行两态：`modalBox`、`bodyClient`、`grid`、`exeCell`、每行高度、有无横向滚动条；出图两张。
- [ ] **步骤 2：打包**：`build.bat`（或既有打包脚本）产物核对——`asar` 里能看到改动后的 `dist-main` 与 `dist` 产物。
- [ ] **步骤 3：真机清单**：规格 §9 的 R1-R12 交用户执行并回报；不得用「自动化已过」代替真机门。

## 执行记录（实现时填写：命令 + 真实输出摘要）

| # | 命令 / 操作 | 真实输出摘要 |
|---|---|---|
| 0 | `npm test`（基线，主代理已跑） | `Test Files 53 passed (53)` / `Tests 932 passed (932)`，exit 0（20:13，`.temp/ql-exe-rows-baseline/baseline.log`） |
| 1 | `npx tsc -p tsconfig.main.json --noEmit`（任务 1 门 1/3） | exit 0，**无任何输出**（干净）。2026-10-18 00:00:50（+08）；报告排版修完后复跑一次仍 exit 0 无输出（00:06） |
| 2 | `npx vitest run src-main/quick-launch-config.test.ts src-main/quick-launch.test.ts src-main/ipc-ql.test.ts`（任务 1 门 2/3） | `Test Files 3 passed (3)` / `Tests 99 passed (99)`，exit 0，`Duration 10.03s`（00:01:01）。其中 quick-launch-config.test.ts 26、quick-launch.test.ts 42、ipc-ql.test.ts 31（基线 23/36/31 → 26/42/31，**净增 9**：E1/E2/E4 + E5..E9 共 8 条编号门 + 1 条聚合 `-1` 收尾补充门；**E3 无新门**，并入既有 E10 门的断言） |
| 3 | `npm test`（任务 1 门 3/3，G9 全量） | `Test Files 53 passed (53)` / `Tests 941 passed (941)`，exit 0，`Duration 11.70s`（00:01:13；00:06 复跑仍 `53 passed (53)` / `941 passed (941)`，`Duration 13.40s`）932 + 净增 9（口径同上两行：8 条编号门 + 1 条聚合补充门，E3 无新门）= 941，≥ G9 下限 941。主代理独立复跑同一命令：`53 passed (53)` / `941 passed (941)`，exit 0，`Duration 11.72s`（00:08）。未改 `src/` 任何文件：`git status --porcelain` 只有 brief「文件」行的 5 份 + 本 plan |
| 4 | 任务 1 修复轮 1（审查关键 1：真接缝 `ExeProcess.onExit` 单槽被二次注册覆盖；重要 2：既有门被删两条 `STATE:` 断言）→ `npx tsc -p tsconfig.main.json --noEmit` / `npx vitest run src-main/quick-launch.test.ts src-main/quick-launch-config.test.ts src-main/ipc-ql.test.ts` / `npm test` | 先红后绿取证：只加夹具与新门时 `Tests 1 failed \| 42 passed (43)`，失败断言 = `同一个进程只准注册一次 onExit: expected 2 to be 1`（`quick-launch.test.ts:815`）。修后 tsc exit 0 无输出；定向 26 / 43 / 31 → `Tests 100 passed (100)`；`npm test` → `53 passed (53)` / `942 passed (942)`，exit 0（实现者 00:38；主代理独立复跑 `942 passed (942)`、exit 0、`Duration 14.22s`）。改动仅 `quick-launch.ts` + `quick-launch.test.ts`，`main.ts`/`shell-execute.ts`/`src/` 未碰 |
| 5 | 验收门（主代理，提交前独立复跑）：`npx tsc -p tsconfig.main.json --noEmit` / `npm test` / `git status --porcelain` | tsc exit 0 无输出；`Test Files 53 passed (53)` / `Tests 942 passed (942)`，exit 0，`Duration 14.43s`（00:58）。改动范围实测 7 个文件 = 5 份 `src-main`（brief「文件」行，其中 `main.ts` 未碰见 R-PF2 登记）+ 本 plan + 本 spec（R-A2 措辞校正）；无未跟踪文件 |
| 6 |  |  |
| 7 |  |  |
| 8 |  |  |
| 9 |  |  |
| 10 |  |  |
