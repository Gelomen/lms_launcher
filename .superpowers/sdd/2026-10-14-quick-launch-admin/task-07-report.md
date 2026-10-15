# 任务 7 报告 · `QuickLaunchManager` 的 admin 分支 + `main.ts` 接线

> 派单：主代理（2026-10-15 14:0x，起点 HEAD `fc2871b`（docs(checks): 裁决 R-14/K52）· 分支 `feat/quick-launch-admin`）
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-07-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-07-manager-admin-branch.md` + 规格 §6.8 / §6.10（另读 §6.7 的停止口径、§7.2-4、§9-R8）+ 要改的四处既有代码
> 本表 A-I 段的勾**未落**（验收归主代理）；J 段（J-1…J-7）已按派单要求填真实命令与真实输出。
> 未 `git add`、未 commit（G8）；代码改动只落在 B 段四个文件（G9 取证见 §4-6）。

## 1 状态

**DONE_WITH_CONCERNS** —— 10 条新用例（plan 任务 7 步骤 1 的 5 条逐字 + 表 E6 的 `two_elevated_entries_run_independently` + 守表 C5 的 1 条 + `ipc-ql.test.ts` 的 3 条端到端形状门）与五道门全绿；改动只落在 B 段四个文件。两条实质疑虑在 §6（**疑虑 1 是表 F2/K10 与 plan 步骤 4 / 规格 §7.2-4 的口径冲突，需要主代理裁决**；疑虑 2 是 C5 的 pass-through 按表 C5 写成「不按分支门控」）。

| 门 | 命令 | 结果 |
|---|---|---|
| D1 先红 | `npx vitest run src-main/quick-launch.test.ts` | `Test Files 1 failed (1)` / `Tests 6 failed \| 28 passed (34)`、exit 1。红的 6 条全是本任务新增（`admin_true_starts_through_the_elevated_host` / `admin_true_failure_leaves_no_instance` / `admin_true_final_message_has_exactly_one_proc_prefix` / `admin_true_auto_command_released_after_first_output` / `admin_true_stop_goes_through_the_same_path` / `two_elevated_entries_run_independently`），失败原因都是「提权接缝没被走到」（`elevatedRequests` 为空 / `elevatedHandles[0]` 为 undefined）→ 红的原因正确。夹具补上 `spawnElevatedShell` 后既有 27 条一字未改仍绿。`admin_falsy_uses_the_plain_local_pty` 首跑即绿：它守的是「非提权路径一字不改」（R-2 / RF2），本就该绿 |
| D2 后绿 | 同上 | `Test Files 1 passed (1)` / `Tests 34 passed (34)`、exit 0 |
| D3 | `npx vitest run src-main/ipc-ql.test.ts` | `Test Files 1 passed (1)` / `Tests 27 passed (27)`、exit 0（24 条既有 + 3 条新增） |
| G1 定向 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Test Files 2 passed (2)` / `Tests 61 passed (61)`、exit 0 |
| G2 相邻回归 | 同 G1 | 既有用例一字未改（`git diff` 里 `quick-launch.test.ts` 只有夹具的注释/字段与新增 describe，既有断言零改动）且全绿 |
| G3 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0`（接线前、接线后各跑一次，两次同结果） |
| G4 i18n 三门 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（`index` / `no-hardcoded` / `key-coverage` / `dict`）、exit 0 → 零新词典键（G2）、无汉字字面量（G6） |
| G5 全量 | `npm test` | `Test Files 51 passed (51)` / `Tests 882 passed (882)`、exit 0 |

计数只增不减：起点 **51 份 / 872 条**（主代理给的实测基线）→ 现在 **51 份 / 882 条**（+0 份 / +10 条：`quick-launch.test.ts` 27→34、`ipc-ql.test.ts` 24→27）。本任务不新建测试文件，与派单口径一致。

## 2 改动文件与真实行号（改后实测行号，全部按改后文件重新取过）

### `src-main/quick-launch.ts`（388 → 413 行；`git diff --numstat` = 27 增 / 2 删）

| 位置 | 内容 |
|---|---|
| `:172-178` | `QlDeps` 新成员（**必填**，表 F1）：`spawnElevatedShell(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess>` —— 表 C1 逐字（规格 §6.8）。注释写明「必填而非可选」的理由（可选会让忘了接线退化成静默降级）与可 await 的出处（索引 K45 / 裁决 R-12）。`ShellProcess` 仍不导出（`:182-189` 一字未改；`tsconfig.main.json` 不开 `declaration`，接口成员引用未导出类型不报错 —— 类型门 `TSC_EXIT=0` 就是取证） |
| `:234-241` | 新接缝 `protected async createElevatedShellProcess(shell, cols, rows, cwd): Promise<ShellProcess>`（表 C2）：与 `:230-232` 的 `createShellProcess` 同一手法，唯一区别是 `async`（K45 / R-12）；体内只有一行 `return this.deps.spawnElevatedShell(...)`。构造签名 `:222` 一字未改（表 F4 / G4） |
| `:255-261` | `start()` 的 shell 分支分流：`proc = e.admin === true`（`:259`）→ `await this.createElevatedShellProcess(...)`（`:260`）/ `this.createShellProcess(...)`（`:261`）。表 C3：`=== true`，不是 truthy；K45：提权分支带 `await`，非提权分支保持原同步形状。两条路径实参完全相同（`DEFAULT_COLS` / `DEFAULT_ROWS` / `deps.homedir()`） |
| `:262-270` | catch：`:264` 先 `const msg = messageOf(err)`；`:268` `if (msg.startsWith('PROC: ')) throw err;`（原样上抛，表 C5 / 索引 K52 / 裁决 R-14）；`:269` 否则 `throw new Error('PROC: ' + t('err.ql.ptySpawn', { exe: shellExe(shell).exe, err: msg }))`（表 C4：非提权文案逐字不变，只是把 `messageOf(err)` 提成局部变量）。失败仍不进 Map（`:271` 的 `inst` 构造在 try 之后）→ §12.4 的「失败不残留」在两条路径同形 |

**一字未改**（表 B1 / G3 / G4 边界，`git diff` 里这些行不在 hunk 内）：`stop`（`:332`）/ `stopAll`（`:347-358`）/ `stopInternal`（`:361`）/ `states`（`:378`）/ `finalize`（`:389`）/ `scheduleAutoCommand`（`:397`）/ `releaseAutoCommand`（`:404`）；`onData` 先转渲染端再放自动命令的 `:274-278`、`onExit → finalize` 的 `:279-283`、`scheduleAutoCommand` 的调用点 `:289`；`PtyProcess` / `spawnShell` / `shellExe` / `ShellProcess` 接口本身。

### `src-main/quick-launch.test.ts`（640 → 790 行；27 → 34 条；numstat 151 增 / 1 删）

| 位置 | 内容 |
|---|---|
| `:9` | 加 `import { t } from './i18n'`：C5 的文案断言按译文写（照 `ipc-ql.test.ts` 既有做法）。`.test.ts` 不在 `key-coverage` / `no-hardcoded` 的扫描范围内，写字面量键不影响 i18n 三门 |
| `:150-157` | `makeDeps()` 新增三个观察点：`elevatedHandles`（假宿主实例）、`elevatedRequests`（每次接缝调用的完整实参）、`elevatedCtl.fail`（置位则提权启动抛这个错，用于 E3 与 C5 的两条文案路径） |
| `:172-180` | 夹具补 `spawnElevatedShell`（表 F1：`QlDeps` 新成员必填，缺它 `const deps: QlDeps = {...}` 都赋不了值）。返回的是既有 `FakeShell` —— 它本就满足 `ShellProcess` 的六个方法，且带 `emit()` / `exit()` / `stopArgs` / 时间线，于是提权与非提权用**同一个**假进程形状，「同形」这条判据不需要第二套夹具。单测不真起提权进程、不真建管道（真工厂 `startElevatedHost` 由 `ql-elevated.test.ts` 守） |
| `:181` | `makeDeps()` 返回值加三个新键（既有键的名字与顺序不变） |
| `:586-709` | 新 describe「提权分支（admin:true → 提权宿主；规格 §6.8 / 表 E1-E6 / C5）」7 条：`:592` `admin_true_starts_through_the_elevated_host`（E1：接缝实参 = `{shell:'cmd', cols:80, rows:24, cwd:homedir()}`，且 `m.shells` 为空 = 本地 `pty.spawn` 没被调用）、`:604` `admin_falsy_uses_the_plain_local_pty`（E2：`false` / 缺省 / `'yes'`（truthy 但非 `true`）三种都走本地 PTY）、`:616` `admin_true_failure_leaves_no_instance`（E3：`states()` 空、无 `onExit`；失败那次没留进程，第二次启动只有一个实例）、`:632` `admin_true_final_message_has_exactly_one_proc_prefix`（**表 C5**：注入 `PROC: ` + `t('err.proc.uacCancelled', {exe:'cmd.exe'})` → 最终 message 与注入值逐字相等、`PROC:` 只出现 1 次、不含 `err=PROC:`、不含 `err.ql.ptySpawn` 的渲染；对照：注入 `host boom` → 得到 `PROC: ` + `t('err.ql.ptySpawn', { exe: 'cmd.exe', err: 'host boom' })`）、`:652` `admin_true_auto_command_released_after_first_output`（E4 / 审查重点 RF1：时间线严格 `['deps.onData','pty.write']`，只写一次）、`:669` `admin_true_stop_goes_through_the_same_path`（E5 / RF6：提权实例的 `stopGraceful` 收到 `[3]`（默认 `STOP_TIMEOUT_SECS`）、`stopAll(7)` 透传 7、幂等与非提权同一条早退路径）、`:689` `two_elevated_entries_run_independently`（E6 / §9-R8：并发两条 → 两个不同实例、停一条不影响另一条、输出只进各自页签） |

### `src-main/main.ts`（1197 → 1213 行；numstat 17 增 / 1 删）

| 位置 | 内容 |
|---|---|
| `:21` | `import { QuickLaunchManager, shellExe } from './quick-launch';`（加 `shellExe`：`logTarget` 与非提权路径取同一个函数） |
| `:23-24` | `import { hostLauncher, startElevatedHost, winPipe } from './ql-elevated';` |
| `:1093-1106` | deps 里的 `spawnElevatedShell`（`:1099` 成员，`:1101` `return await startElevatedHost(winPipe, hostLauncher, { shell: term, cols, rows, cwd, logTarget: shellExe(term).exe })`，`:1102-1105` catch → `emitLog('[lms_launcher] ' + …, 'sys')`（`:1103`）后 `throw e`）。要点：① `logTarget` 取 `shellExe(term).exe`（表 C5 末句 / §6.10 第一行：`{exe}` 是用户那一行的目标，两条路径同值，绝不是宿主 `node.exe`）；② 失败**先写原因行再原样抛出**，与 `spawnExeProcess`（`:1057-1079`，其 `emitLog` 在 `:1071`）同一分工（渲染端 `src/App.vue:477-478` 只回落按钮，原因行只由主进程负责）——见 §6 疑虑 1；③ 形参取名 `term` 是为了不遮蔽 `:1` 导入的 electron `shell` |

**一字未改**：`:1083-1092` 的其余 deps（含 `spawnExe` 的 `:1089-1092`）与 `:1108` 的 `(id) => qlStartContextOrThrow('terminalAvailable').available.has(id)` 槽守卫（表 B3）、`qlStartContextOrThrow`（`:1028-1033`）、`ql_start` handler（`:1131-1148`，含 `:1142` 的 `admin: entry.admin === true`）、`:384` / `:650` 的 `ql.stopAll(3)`、日志通道与前缀（`emitLog` 的 `log-line` / `'sys'`，未新增通道）。

### `src-main/ipc-ql.test.ts`（584 → 820 行；24 → 27 条；numstat 236 增 / 0 删）

| 位置 | 内容 |
|---|---|
| `:106-108` | 加 import：`{ hostLauncher, winPipe } from './ql-elevated'`、`{ encodeFrame, HOST_FRAME } from './ql-host-protocol'`（帧判据用**真**编解码，不手工拼协议字节） |
| `:419-531` | `fakeHostSeam()`：替换 `winPipe` 六个方法 + `hostLauncher` 三个方法 + `winShell` 六个句柄方法（`pidOf` / `isAlive` / `exitCodeOf` / `terminate` / `close` / `killTree`），**其余跑真实现**：`startElevatedHost` → `ElevatedPtyProcess`（构造即启动、`HELLO`/`READY` 握手、20ms 读轮询、`ShellExecProcess` 的 100ms 句柄轮询）→ `QuickLaunchManager`。假管道按帧应答：收到 `HELLO` 回 `READY{shellPid:0}`（索引 K44① 的实测形状），收到 `STOP` 回 `EXIT{code:0}`（§6.6-7 宿主自己杀树）。不真起提权进程、不真建管道、不真解析硬链接（`hostExePath` 只交 `'node.exe'` 字符串）——那些是规格 §7.2 的打包真机门。`:519` 的 `restore()` 先把假宿主标死再等 200ms，让 `ShellExecProcess` 的轮询自己 `clearInterval`（否则还原后真 koffi 会收到假句柄：`TypeError: Unexpected Object value, expected void *`） |
| `:534-646` | 新 describe「任务 7 · 提权 shell 条目的端到端形状门」3 条：`:537` 端到端形状门（plan 步骤 5：`ql_start` 返回 `{tabId:'ql:<id>'}`、`ql_states` 形状、`ql-data` 载荷键名逐字、自动命令的 `WRITE` 帧只在首批 DATA 之后出现、`ql_write` / `ql_resize` 的帧 payload 逐字、`ql_stop` 的 `STOP{timeoutSecs:3}`、`ql-exit` 载荷键名与退出码 —— 与非提权那条用例（`:297`）同一断言集）；`:591` `two_elevated_entries_run_independently`（E6 / §9-R8：两条并发 → 两个**不同**的管道名（`nMaxInstances=1` + 每次新名字）与两个不同的宿主句柄、token 各不相同、停一条另一条仍可输入）；`:624` 提权启动失败（`launch` 交回 `win32Error=1223`）：`ql_start` 的 rejection message 逐字等于 `'PROC: ' + t('err.proc.uacCancelled', { exe: 'cmd.exe' })`、`PROC:` 只出现 1 次、不含 `node.exe`；sys 通道**恰好一行** `'[lms_launcher] ' + msg`；`ql_states` 为空；一条帧都没写出去（表 C5 + §6.10 第一行 + §7.2-4 的自动化对应物） |

## 3 TDD 每步的命令与真实输出

1. **D1 先红**（plan 步骤 1→2）：只改测试（夹具 + 7 条）→ `npx vitest run src-main/quick-launch.test.ts` → `Tests 6 failed \| 28 passed (34)`、exit 1（原因见 §1 的 D1 行）。
2. **D2 后绿**（plan 步骤 3）：实现 `quick-launch.ts` 三处（`QlDeps` / 接缝 / 分流 + catch）→ 同命令 → `Tests 34 passed (34)`、exit 0。
3. **D3**（plan 步骤 4→5）：`main.ts` 接线 → `npx tsc --noEmit -p tsconfig.main.json` → `TSC_EXIT=0`；再写 `ipc-ql.test.ts` 的 3 条 → 中途两次红并修好（① 还原接缝时真 koffi 收到假句柄；② 配置层对 shell 条目要求非空 `cmd`、configId 必须小写字母开头 —— 是用例补齐，不是实现问题）→ `Tests 27 passed (27)`、exit 0。
4. **D4 / G1-G5**（plan 步骤 6）：定向 61 条绿 → 类型门 `TSC_EXIT=0` → i18n 三门 18 条绿 → 全量 `npm test` → `Test Files 51 passed (51)` / `Tests 882 passed (882)`、exit 0。

## 4 取证

1. **A1 起点**：`git log --oneline -1` = `fc2871b docs(checks): 裁决 R-14/K52（提权失败不得二次包装）—— 任务 7 表新增 C5`；`git status --porcelain` 只有 ` M .superpowers/sdd/2026-10-14-quick-launch-admin/progress.md`（主代理派单前已存在的账本改动，不含 `src/` / `src-main/` → 按索引 K30 的实质判据成立）。分支 `feat/quick-launch-admin`。
2. **A3 锚点**：用 `git show HEAD:…` 实测。`quick-launch.ts` 的锚点**逐条属实**：`QlDeps` 166、`ShellProcess` 175、`createShellProcess` 223、接缝调用点 241、`err.ql.ptySpawn` 包装 244、`scheduleAutoCommand` 调用点 264、`stopAll` 322；`quick-launch.test.ts` 的 `const deps: QlDeps = {` 在 151、`spawnExe:` 在 156。`main.ts` 的锚点**内容属实、行号已漂移**（本表生成后任务 3 的 admin 上下文块落了进去）：`new QuickLaunchManager(` 在 HEAD 是 **1081**（表写 1076）、`spawnExe:` **1087**（表写 1082）、`qlStartContextOrThrow` **1026**（表写 1002-1025）、`emitLog('[lms_launcher] ' + …)` 的分工 **1069**（表写 1064）。本任务在 `main.ts:23-24` 加了两行 import，故改后工作区里它们分别是 1083 / 1089 / 1028 / 1071（`ql.stopAll(3)` 382→384、648→650）—— 全部是 +2 的整体位移，不是语义变化。按派单要求未改 A 段文字，只在此登记。
3. **A4 前置接口**：`ql-elevated.ts:674-687` 的 `startElevatedHost(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell; cols; rows; cwd; logTarget }): Promise<ElevatedPtyProcess>` 可用；`ElevatedPtyProcess` 的六个方法与 `ShellProcess` 逐字同形（本任务的类型门与 34+27 条用例都是它的消费证据）。未调 `handshake()` / `abortHandshake()`（索引 K47）——`git diff` 里两个源文件都没有这两个名字。
4. **计数**：`npm test` → 51 份 / 882 条（基线 51 / 872）。分文件：`quick-launch.test.ts` 27→34、`ipc-ql.test.ts` 24→27。
5. **G6 / G2**：`npx vitest run src-main/i18n` 全绿（`no-hardcoded` 扫全部 `src-main` 非测试文件 → 新增的都是注释与英文标识符；`key-coverage` / `dict` 绿 → 零新词典键，只复用 `err.ql.ptySpawn` / `err.proc.uacCancelled`）。
6. **G9 范围**：`git status --porcelain` = 四个 B 段文件（+`progress.md`，非本任务改动）+`docs/superpowers/checks/…task-07-manager-admin-branch.md`（J 段，按派单要求填）。`git diff --numstat`：`quick-launch.ts` 27/2、`quick-launch.test.ts` 151/1、`main.ts` 17/1、`ipc-ql.test.ts` 236/0。`ql-elevated.ts` / `ql-pty-host.ts` / `ql-host-protocol.ts` / `shell-execute.ts` / `quick-launch-config.ts` 及它们的测试都不在 diff 里。
7. **F3 / 索引 K9**：没有任何 WSL 或「已提权」特判（`start()` 只看 `e.admin === true`）；`wsl` 终端走同一条分流（`shellExe` 的映射表未改）。
8. **索引 K50 / 裁决 R-13**：本任务没碰停止路径的一行代码 —— `stop` / `stopInternal` / `stopAll` 与非提权完全同一条调用路径（E5 钉 `stopGraceful(3)` 与 `stopAll(7)` 的透传；`main.ts:384` / `:650` 的 `ql.stopAll(3)` 未改）。「剩余预算 → 总上限 `timeoutSecs + 1s`」在任务 6 的 `ql-elevated.ts` 里；本任务的端到端用例只观察到「STOP 帧带 `timeoutSecs:3` + 宿主回 EXIT 后立刻收尾」，没走到委托分支（真机门 §7.2-7 才判委托）。

## 5 偏离与理由

1. **新增第 7 条用例 `admin_true_final_message_has_exactly_one_proc_prefix`**（plan 步骤 1 只列 5 条）：表 C5 明确要求「要有一条用例断言最终 message 里只有一个 `PROC:` 前缀、只渲染一次」。plan 的 5 条名字全部逐字保留，这条是 C5 的必需守卫，不是扩范围。
2. **`ipc-ql.test.ts` 写了 3 条而不是 1 条**：第 1 条是 plan 步骤 5 要求的端到端形状门；第 2 条是表 E6（派单点名「也要有」）——manager 层那份看两个实例与独立停止，IPC 层那份能真看到两个管道名与两个宿主句柄，两层判据不同；第 3 条是表 C5 + §6.10 第一行 + §7.2-4 的自动化对应物，同时是「日志分工」这条实现的唯一自动化守卫（见疑虑 1）。
3. **`main.ts` 的接线里加了 `try/catch` + `emitLog`**（plan 步骤 4 明确要求，不是我自行加的）：`spawnElevatedShell` 的签名与表 C1 逐字一致，只是实现体多一层「先写原因行再原样抛出」。与表 F2 / 索引 K10 的张力见疑虑 1。
4. **提权假进程复用既有 `FakeShell`**，没有新造「假宿主」类：`ShellProcess` 的六个方法就是契约（规格 §6.7「形状 = `ShellProcess` 逐字」），复用同一夹具正好把「两条路径同形」变成夹具层面的事实，也避免第二套断言。
5. **J 段除 J-1…J-4 外另加 J-5…J-7 三行**（G1 定向、G4 i18n、`git diff` 边界）：G1/G4 是本表 G 段的门，J 段没有对应行，就把命令与真实输出补在 J 段末尾便于逐行核对。列数已按 AGENTS.md 自检核对（每行 3 列）。

## 6 疑虑

1. **表 F2 / 索引 K10 与 plan 步骤 4 / 规格 §7.2-4 的口径冲突（需要主代理裁决）**。我按 plan 步骤 4 逐字实现了「提权启动失败 → 先 `emitLog('[lms_launcher] ' + msg, 'sys')` 再抛」，依据三条：① plan 任务 7 步骤 4 明写；② 规格 §7.2-4 的真机判据是「UAC 点『否』：按钮回落 `[启动]`，**日志一行取消原因**且带的是终端名不是宿主名」——不写这行，真机门第 4 条必然不通过；③ `src/App.vue:478` 的注释「原因行由主进程的 sys 日志负责，渲染端不重复」说明渲染端不替它兜。但表 F2 写的是「不新增日志行」（索引 K10），而**非提权的 shell 失败路径今天一行都不写**（`ql_start` handler 不 catch，`quick-launch.ts` 只抛），于是 §6.10 末句「日志通道与条数与非提权路径完全一致」与 §7.2-4「日志一行」在 shell 提权这条路上只能满足一个。我选 plan + §7.2-4，并把它做成可验收的用例（`ipc-ql.test.ts:624`：恰好一行、`[lms_launcher] ` 前缀、`sys` 通道、带 `cmd.exe` 不带 `node.exe`）。**若主代理判定 F2 优先**，删掉 `main.ts:1102-1105` 的 catch 即可（其余实现不受影响），但那条用例与真机门第 4 条要同步改口径。顺带登记一个既有缺口（本任务未动）：非提权 shell 启动失败今天没有任何原因行。
2. **表 C5 的 pass-through 按表 C5 写成「不按分支门控」**：`if (msg.startsWith('PROC: ')) throw err;`（`:268`）对两条路径都生效。非提权路径今天不可能命中（node-pty 的失败 message 不带 `PROC: `；既有那条「shell spawn 失败不残留状态」用的 `spawn boom` 仍走包装分支，实测绿），所以「非提权文案逐字不变」成立；但严格说它把「带 `PROC: ` 前缀的异常」定义成了全局的「不再包装」规则。若希望只针对提权分支，得写成 `e.admin === true && msg.startsWith('PROC: ')` —— 表 C5 的措辞没有这个限定，我照表实现。
3. **`ipc-ql.test.ts` 的 `restore()` 里那 200ms 等待**：`ShellExecProcess` 的 100ms 句柄轮询在假句柄上不会自己收尾，还原后真 koffi 会 `TypeError`。等 200ms 是最小代价（该文件单跑 7s 量级、全量 9s 量级，两次实测分别 6.85s / 7.62s）。真机上不存在这个问题（句柄是真的）。
4. **端到端用例没覆盖「委托停止」分支**（`stopGraceful` 里对宿主句柄的委托）：假宿主对 `STOP` 回了 `EXIT`，宽限期内就收尾。委托路径由任务 6 的 `ql-elevated.test.ts` 守、真机由 §7.2-7 守 —— 本任务没有再复制一遍（G9 不扩范围）。

## 7 给任务 8 的交接

1. **主进程侧已经全通**：`ql_save` 收 `admin` 并按 `e.admin === true` 规整（`quick-launch-config.ts:95` / `:100`，任务 1）；`ql_start` 把 `admin: entry.admin === true` 写进槽（`main.ts:1142`）；`ql_start` 的 shell 分支按 `e.admin === true` 分流（本任务）；exe 分支按 `ctx.admin` 走 `verb='runas'`（任务 3）。任务 8 只需要弹窗里的开关 + payload，**不需要**再动主进程。
2. **payload 必须是真布尔 `true`**：配置层把非布尔规整成 `false`，而 `start()` 的分流是 `=== true`（本任务的 `admin_falsy_uses_the_plain_local_pty` 钉了 `'yes'` → 走本地 PTY）。渲染端若交 `'true'` / `1`，界面看着像开了、实际不提权。
3. **词典键**：本任务受 G2（零新键）约束，只复用 `err.ql.ptySpawn` / `err.proc.uacCancelled`；`ql.modal.admin` 是任务 8 该加的那一个（plan 步骤 3：先改 en 再改 zh，避免行号漂移）。加完 `npx vitest run src-main/i18n` 必须仍绿。
4. **真机门 §7.2-4 的自动化对应物已存在**：`ipc-ql.test.ts:624`（一行 sys 日志、带终端名、只包一层 `PROC:`）。任务 9 把真机清单第 4 条交给用户时可按这条用例的现象核对；若主代理在疑虑 1 上改口径，记得同时改这条用例与真机清单的措辞。
5. **别在渲染端复制失败文案**：`src/App.vue:477-478` 的 catch 只回落按钮，原因行归主进程（`main.ts:1071` / `:1103`）。任务 8 若给弹窗加错误提示，注意别造成同一原因两处出现。
