# 任务 6 报告 · 主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts` 第二段）

> 派单：主代理（2026-10-15 13:1x，起点 HEAD `33ad064`（docs(checks): 登记 R-12/K45），`git status --porcelain` 干净）· 分支 `feat/quick-launch-admin`
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-06-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-06-elevated-pty-process.md` + 规格 §6.7 / §6.5（读侧）/ §6.10（最后一行）+ 复用的既有代码 `src-main/quick-launch.ts:175-182` / `:108-115` / `:122-142`、`src-main/shell-execute.ts:124-185`、任务 4 的第一段、任务 2 的帧、任务 5 的宿主侧实测（K44）
> 本表 A-I 段的勾**未落**（按 G8：验收归主代理）；J 段（J-1…J-3）已按派单要求填真实命令与真实输出。
> 未 `git add`、未 commit（G8）；代码改动只落在 B 段两个文件（G9 取证见 §4-6）。

## 1 状态

**DONE_WITH_CONCERNS** —— 10 条用例（plan 的 8 条逐字 + 2 条守 C7/C2）与五道门全绿，代码范围只有 B 段两个文件；三条疑虑在 §6（**疑虑 1 直接影响任务 7 的 `stopAll` 时序**，疑虑 2 是单测测不到、只有真机门能判的 connect 阻塞）。

| 门 | 命令 | 结果 |
|---|---|---|
| D1 先红 | `npx vitest run src-main/ql-elevated.test.ts` | `Tests 10 failed \| 8 passed (18)`、exit 1；10 条新用例全部 `TypeError: startElevatedHost is not a function`（第二段还不存在），任务 4 的 8 条仍绿 → 红的原因正确 |
| D2 后绿（= G1 定向） | 同上 | `Test Files 1 passed (1)` / `Tests 18 passed (18)`、exit 0、无 unhandled rejection |
| G2 相邻回归 | `npx vitest run src-main/quick-launch.test.ts src-main/shell-execute.test.ts src-main/ql-host-protocol.test.ts src-main/ql-pty-host.test.ts` | `Test Files 4 passed (4)` / `Tests 48 passed (48)`、exit 0；`git status --porcelain` 里没有这四个文件 → 一字未改（停止语义的既有门原样通过） |
| G3 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0`（实现后、加/删形状探针后各跑一次，都干净，见 §4-1） |
| G4 i18n 三门 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0（含 G6 反证取证，见 §4-5） |
| G5 全量 | `npm test` | `Test Files 51 passed (51)` / `Tests 871 passed (871)`、`Duration 8.87s`、exit 0 |

计数只增不减：起点 **51 份 / 861 条** → 现在 **51 份 / 871 条**（+0 份 / +10 条，全在既有文件 `src-main/ql-elevated.test.ts`）。与派单给的基线一致（本任务不新建测试文件）。
## 2 改动文件与真实行号（改后实测行号）

### `src-main/ql-elevated.ts`（361 → 678 行；`git diff --numstat` = 318 增 / 1 删）

| 位置 | 内容 |
|---|---|
| `:12-14` | **本文件唯一被改的既有行**：原 `:12` 的一行 import 拆成三行 —— 加 `import type { TerminalId } from './quick-launch-config'`、`{ HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol'`、`ShellExecProcess`（值导入：C5③ 要复用的就是它）。第一段的 `WinPipeApi` / `HostLauncher` / `startHost` / `hostStartError` 等签名一字未改（`git diff` 里第一段只有这一处删除行） |
| `:365-376` | 第二段边界注释：不改 `ShellProcess` 接口（B1/F3）；宿主句柄生命周期复用 `ShellExecProcess`（`shell-execute.ts:129-190`），不另写一套轮询；文案只在 `hostStartError` 里（K35/R-07）；R-11 的 `{err}` 形状；K45 可 await 工厂的理由 |
| `:378` `:379` | `POLL_READ_MS = 20`、`HOST_HANDSHAKE_TIMEOUT_MS = 15000` —— check C3 逐字（规格 §6.5 / §6.7） |
| `:380` | `CONNECT_POLL_MS = 50` —— 第三个常量，规格 §6.5「`ConnectNamedPipe` 用 50ms 轮询」的取值（P10 实测 61ms 连上）。见 §5 偏离 1 |
| `:382` `sleep()`、`:386` `messageOf()`、`:389` `parseObject()` | 与 `quick-launch.ts:47-53`、`ql-pty-host.ts:34-41` 同形的模块私有工具（那两处也未导出，跨模块复用要改别的文件 → G9） |
| `:402` `export class ElevatedPtyProcess` | 字段：`pipeHandle` / `hostHandle`（`startHost` 交回的两个句柄）、`host`（**READY 之后才建**的 `ShellExecProcess`）、`readTimer` / `handshakeTimer` / `settleHandshake`、`running` / `stopping` / `exitCode` / `exitFrameCode`、`exitCbs` / `dataCb` / `pendingData` |
| `:424` `constructor(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string })` | **逐字 = plan 任务 6 的签名块 / check C1**。构造即启动：`:430` `startHost(pipe, launcher)`（K40 / C5①，不重写建管道与 runas）；`:432` `hostExePath()` 抛的 `hostlink=…` 原样进 `err.proc.spawnFail` 的 `{err}`（§6.10 第三行）；`:438` `stage==='pipe'` → `err: 'pipe=create'`（K37 / R-08，`win32Error` 固定 0）；`:440` 其余一律 `hostStartError(started.win32Error, opts.logTarget)`（C5② / K35 / R-07：本模块不写第二份映射）；`:442-445` 存两个句柄 + token + 建 `createFrameParser` |
| `:452` `async handshake(): Promise<void>` | 内部方法（K45/R-12：构造函数不能 async）：`:455` `connect()` 轮询（50ms，§6.5）→ `:460` 发 `HELLO{token, shell, cols, rows, cwd}`（C4 / §6.5 帧表；argv 里没有这些）→ `:463` 建 READY 的 promise → `:471` 起 20ms 读轮询 → `:472` 起 15000ms 超时 → `await ready` |
| `:481` `abortHandshake(): void` | §6.7「抛出前关掉管道句柄与进程句柄」（RF4）：清两个定时器 + `pipe.close(pipeHandle)` + `winShell.close(hostHandle)`。此时**没有** `ShellExecProcess` 在轮询（READY 之后才建）→ 不会二次 `CloseHandle`；关管道句柄同时让宿主按 §6.6-8 自己收尾，不留孤儿 |
| `:493` / `:497` / `:501` / `:510` / `:519` / `:527` | 六个方法，签名逐字 = `quick-launch.ts:176-181`（C2；结构一致性有类型级取证，见 §4-1）。`write` → `WRITE` 帧（键盘输入原文）；`resize` → `RESIZE{cols,rows}`；`onData` 注册时把缓冲的首屏一次交出；`:510-517` `onExit` 已退出立即补发（`quick-launch.ts:108-115` 同口径）；`:529` `stopGraceful` 幂等守卫（`quick-launch.ts:123` 同口径）→ `:531` `STOP{timeoutSecs}`（K44②：必带数字）→ `:533` 宽限期内等 EXIT → `:537` 仍活则 `await this.host.stopGraceful(timeoutSecs)`（K44③ / RF6：真的走到委托） |
| `:543` `onFrame()` | `READY`（`:545`：K44① —— `shellPid` 实测 0，不参与任何判断；清超时定时器；`:547` `adoptHostHandle()`；唤醒工厂的 await）/ `DATA`（`:555`：K32 字符串原样交出去，未注册则缓冲）/ `EXIT`（`:561`：先存 `exitFrameCode` 再 `finish()` —— E3 的优先级就在这两行）/ `ERR`（`:567`：`failHandshake('host=' + stage)`，C7 / R-11）/ 其余丢弃（未知 type 已由任务 2 的解析器丢掉） |
| `:579` `adoptHostHandle()` | `new ShellExecProcess(winShell, this.hostHandle, winShell.pidOf(this.hostHandle))` + `:583` `onExit(code => this.finish(this.exitFrameCode ?? code))` —— 100ms 轮询、`isAlive`、`GetExitCodeProcess`、`CloseHandle` 全在既有实现里（C5③ / F3；G2 那两个文件一字未改） |
| `:586` `pollRead()` | `:591` `available() < 0` → 断管路径（K39：`ERROR_BROKEN_PIPE 109` / Peek 失败，与 0 可分）；`:595` 只在 `available() > 0` 时 `read(h, available)`（E8 / §9-R7：不存在阻塞读） |
| `:599` `onPipeGone()` | 停读轮询 + 让工厂按 §6.10 抛出；退出本身由 `ShellExecProcess` 的句柄轮询落地（不另写一套） |
| `:605` `finish(code)` | 只一次（`running` 守卫）：清两个定时器 + `failHandshake('handshake=exit')`（没发 READY 就来的 EXIT）+ 关管道句柄（进程句柄归 `ShellExecProcess` 关，§6.4 / §9-R6）+ 一次性把退出码交给所有 `onExit` |
| `:618` `sendFrame()` | 句柄已关 / 已退出不再写；写异常吞掉（没有可通知的一方，退出由读侧断管或句柄轮询落地） |
| `:627` `handshakeError()` / `:633` `failHandshake()` | §6.10 最后一行：`PROC: t('err.ql.ptySpawn', { exe: this.opts.logTarget, err: reason })` —— G1 只有 `PROC:` 前缀；`{exe}` 是用户那一行的目标，不是宿主 exe（C7） |
| `:664` `export async function startElevatedHost(pipe, launcher, opts): Promise<ElevatedPtyProcess>` | **可 await 的工厂**（K45 / R-12）：`:669` new（构造即启动）→ `:671` `await proc.handshake()` → `:673` catch 里 `proc.abortHandshake()` 后原样抛出。形参不越出 `{ shell, cols, rows, cwd, logTarget }` |

**不含**（B1 边界）：新词典键（G2：只用 `err.proc.uacCancelled` / `err.proc.spawnFail` / `err.ql.ptySpawn`）、任何日志行（F2 / §8-K10）、`VALIDATION:` / `STATE:` / `YAML:` 前缀（G1）、汉字字面量（G6，反证取证见 §4-5）、对 `ShellProcess` / `quick-launch.ts` / `shell-execute.ts` / `ql-host-protocol.ts` / `ql-pty-host.ts` 的任何改动（F3 / G9）。

### `src-main/ql-elevated.test.ts`（246 → 660 行；8 → 18 条）

| 位置 | 内容 |
|---|---|
| `:12-14`、`:17`、`:20`、`:24` | import 追加：`TerminalId`、`winShell`（要临时替换它的属性）、`HOST_FRAME` / `createFrameParser` / `encodeFrame`（**真**帧实现）、`ElevatedPtyProcess` / `startElevatedHost` / `type HostLauncher` |
| `:253-262` | 第二段边界注释：假接缝清单（B2）；假定时器就是「把 15s 压到几毫秒」的做法（同 `shell-execute.test.ts:63` / `quick-launch.test.ts:240` / `ql-pty-host.test.ts:264`）；帧判据一律用真解析器 |
| `:264-267` | `LOG_TARGET = 'cmd'`（`{exe}` 的判据）、`HELLO_OPTS`（`{ shell:'cmd', cols:120, rows:40, cwd:'D:\\lms', logTarget }`）、`READY_PAYLOAD`（**`shellPid: 0`** —— K44① 的实测形状就是喂进实现的输入） |
| `:287-320` | `hostPipe()` 假管道：`push(bytes)` = 宿主写来的字节；`breakPipe()` 后 `available()` 交 `-1`（K39）；`written` = 主进程写出的帧字节（用真解析器解码）；`closed` = 被关掉的管道句柄（E7 / RF4 的泄漏门）；`events` = `a<n>` / `r<n>` / `w<type>` 的时间线（E8 与 E6 的顺序判据都靠它） |
| `:322-335` | `hostLauncherStub()`：`launched` 存每次起宿主的完整实参（§6.4-4「argv 只带四项」的判据） |
| `:337-350` | `shellStub()`：真 `winShell` 的假属性（默认「宿主进程一直活着」；`close` 记录句柄） |
| `:352-362` | `withShell()`：逐属性替换/还原模块级 `winShell`（`ShellExecProcess` 拿的是单例）—— 与任务 4 的 `withKernel` 同一手法 |
| `:364-374` | `decodeFrames()` / `frameOf()`：用**真** `createFrameParser` 解码写出的字节，不手工拼协议字节 |
| `:376-381` | `handshaked()`：走完 §6.7 的握手（HELLO 已写出 → 推 READY → 推进一次读轮询） |
| `:386-411` | `hello_carries_token_shell_cols_rows_cwd`（E1 / C4）：`launch` 恰 4 个实参、管道名与 token 的形状、HELLO 载荷 `toEqual({ token, shell, cols, rows, cwd })` 且 token 与 argv 里那条一致；argv 里没有 cwd / shell |
| `:413-444` | `data_frames_are_forwarded_to_onData`（E2 / K32）：注册晚于帧到达不丢首屏；非 ASCII + 代理对逐字；半帧不产出、补齐后才产出 |
| `:446-468` | `exit_code_prefers_the_EXIT_frame`（E3 / RF5）：句柄侧 `exitCodeOf=9`、`isAlive=false`，EXIT 帧的 7 必须赢；再推进 500ms 也不得报第二次 |
| `:470-492` | `host_crash_falls_back_to_the_handle_exit_code`（E4 / P12 / K39）：断管 → 读轮询停、句柄轮询交 7；两个句柄都关（`closed==[HOST_HANDLE]`、`h.closed==[PIPE_HANDLE]`）、`vi.getTimerCount()===0` |
| `:494-512` | `registering_onExit_after_exit_replays_immediately`（E5）：退出后注册立即补发 3 |
| `:514-548` | `stopGraceful_delegates_after_the_EXIT_frame`（E6 / RF6 / K44②③）：`STOP{timeoutSecs:2}` 逐字；时间线恰为 `['w4','killTree','terminate','close']`（先 STOP 再委托，且真的走到 `TerminateProcess` 兜底）；再停一次不再发第二帧 STOP（幂等） |
| `:550-576` | `handshake_timeout_closes_pipe_and_host`（E7 / RF4）：READY 永不到来 → 15100ms 假定时器 → 抛 `PROC: … err.ql.ptySpawn` + `handshake=timeout`、文案不含 `node.exe`、两个句柄都关、`getTimerCount()===0` |
| `:578-608` | `read_polling_uses_available_not_blocking_read`（E8 / §9-R7）：200ms 空轮询里事件全是 `a0`（一次 read 都没有）；每条 `r<n>` 必须紧跟在同值的 `a<n>` 之后且 `n>0` |
| `:610-639` | `err_frame_in_the_handshake_maps_to_err_ql_ptyspawn_with_host_stage`（C7 / R-11）：`ERR{stage:'spawn'}` → `PROC: …` + `host=spawn`、不含宿主 exe、不含宿主的原始 message、两个句柄都关、无残留定时器 |
| `:641-659` | `write_and_resize_frames_reach_the_host`（C2）：帧序 `[HELLO, WRITE, RESIZE]`、`WRITE` payload 逐字 `'dir\r'`、`RESIZE` 载荷 `{cols:132,rows:44}` |

假接缝只有管道、起宿主、`winShell` 三处（B2）：不真起进程、不真建管道、不真提权。真跑的部分：`createFrameParser` / `encodeFrame`（任务 2 的真实现）、`ElevatedPtyProcess` 本身、`ShellExecProcess`（真实现：停止时序与句柄收尾）、`startHost`（真实现：管道名与 token 的生成）。

## 3 TDD 每步：命令与真实输出

### D1 先写失败测试 → 红（`Start at 13:26:17`）

命令：`npx vitest run src-main/ql-elevated.test.ts`

```
 FAIL  src-main/ql-elevated.test.ts > … > hello_carries_token_shell_cols_rows_cwd
TypeError: startElevatedHost is not a function
 ❯ handshaked src-main/ql-elevated.test.ts:377:20
 …
 Test Files  1 failed (1)
      Tests  10 failed | 8 passed (18)
```

红的原因正确：第二段还不存在（`startElevatedHost is not a function`），不是断言写错；任务 4 的 8 条同时仍绿。

### D2 实现第二段 → 绿（`Start at 13:29:30`）

```
 ✓ src-main/ql-elevated.test.ts (18 tests) 79ms
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

中间一次（`13:29:08`）是 `Tests 18 passed (18)` 但 `Errors 2 errors`：`PromiseRejectionHandledWarning` + 两条 unhandled rejection，来源是**测试**里拒绝处理器挂得晚（先 `await advanceTimersByTimeAsync` 才 `try/catch`），不是实现的缺陷。改成创建时即挂上处理器（`.then(onFulfilled, onRejected)`）后干净。

### D3 类型门（`13:29:43`）

`npx tsc --noEmit -p tsconfig.main.json` → 无诊断，回显 `TSC_EXIT=0`。

### D4 全量（`13:30:03`）

`npm test` → `Test Files 51 passed (51)` / `Tests 871 passed (871)` / `Duration 8.87s` / exit 0。

## 4 契约对照取证

### 4-1 C1 / C2 / K45：形状一致性（类型级，不是自述）

`ShellProcess` 未导出，所以用一次性探针（`src-main/zz-probe-shellprocess.ts`，跑完即删、不进 git）把 `quick-launch.ts:175-182` 的六个方法**逐字复制**成 `ShellProbe`，再写两条赋值：

```ts
export const asClass = (p: ElevatedPtyProcess): ShellProbe => p;
export const asFactory = (): Promise<ShellProbe> =>
  startElevatedHost(winPipe, hostLauncher, { shell: 'cmd', cols: 120, rows: 40, cwd: '.', logTarget: 'cmd' });
```

`npx tsc --noEmit -p tsconfig.main.json` → `TSC_WITH_PROBE=0`（零诊断）。三条一起成立：类结构上满足 `ShellProcess`（C2 / F3 不改接口）；`startElevatedHost` 是**可 await** 的且返回值满足 `ShellProcess`（K45 / R-12 / 规格 §6.8 的 `Promise<ShellProcess>`）；用生产侧单例 `winPipe` / `hostLauncher` 装配时形参形状正确。删掉探针后 `TSC_AFTER_DELETE=0`。

逐字对照（我的实现 → `quick-launch.ts:176-181`）：`write(data: string): void` / `resize(cols: number, rows: number): void` / `onData(cb: (d: string) => void): void` / `onExit(cb: (code: number) => void): void` / `isRunning(): boolean` / `stopGraceful(timeoutSecs: number): Promise<void>` —— 与 plan 任务 6 的签名块、check C1/C2 一致。

### 4-2 E1-E8 → 测试映射（check E 段逐行）

| E | 守它的用例（实测行号） | 关键断言 |
|---|---|---|
| E1 | `hello_carries_token_shell_cols_rows_cwd`（`:386`） | HELLO 载荷五字段逐字；argv 只四项 |
| E2 | `data_frames_are_forwarded_to_onData`（`:413`） | 帧 payload 原样进 `onData`（含代理对）；半帧不产出 |
| E3 | `exit_code_prefers_the_EXIT_frame`（`:446`） | EXIT 帧的 7 赢过句柄的 9；只报一次 |
| E4 | `host_crash_falls_back_to_the_handle_exit_code`（`:470`） | 断管 → 句柄退出码 7；两个句柄都关；无残留定时器 |
| E5 | `registering_onExit_after_exit_replays_immediately`（`:494`） | 退出后注册立即补发 |
| E6 | `stopGraceful_delegates_after_the_EXIT_frame`（`:514`） | `STOP{timeoutSecs:2}` → 时间线 `['w4','killTree','terminate','close']`；幂等 |
| E7 | `handshake_timeout_closes_pipe_and_host`（`:550`） | 15s 超时 → 抛错 + 两个句柄都关 + `getTimerCount()===0` |
| E8 | `read_polling_uses_available_not_blocking_read`（`:578`） | 空轮询只有 `a0`；每条 `r<n>` 紧跟同值 `a<n>` 且 `n>0` |

另两条：C7 / R-11（`:610`）、C2 的 `write` / `resize` 帧形状（`:641`）。

### 4-3 G1 / F1：错误前缀与文案键（全文件 grep 实测）

`PROC:` / `VALIDATION:` / `STATE:` / `YAML:` 在本文件只出现在 5 处，全部是 `PROC:`：`:109`（`err.proc.uacCancelled`）、`:111`（`err.proc.spawnFail` + `win32=`）—— 第一段的 `hostStartError`；`:432`（`err.proc.spawnFail` + `hostlink=`）、`:438`（`err.proc.spawnFail` + `pipe=create`）、`:630`（`err.ql.ptySpawn` + `host=` / `handshake=`）。零新词典键（G2）；`{exe}` 五处全是用户目标（`userTarget` / `opts.logTarget`），没有一处传宿主 exe。

### 4-4 K44①：`shellPid` 不参与任何判断

`grep shellPid src-main/ql-elevated.ts` → 只有 `:546` 的注释一处（说明为什么不用它）；测试侧 `READY_PAYLOAD`（`:267`）喂的就是 `{"hostPid":4242,"shellPid":0}`，握手照样完成，停止与退出码都不受影响。

### 4-5 G6 / F4：汉字字面量的**覆盖**取证（光跑绿不够）

反证：在第二段临时加 `const __probeHan = '汉字探针';` →

```
 ❯ src-main/i18n/no-hardcoded.test.ts (2 tests | 1 failed)
+     "file": "src-main/ql-elevated.ts",
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

删掉后 `npx vitest run src-main/i18n` → `Test Files 4 passed (4)` / `Tests 18 passed (18)`，且 `git diff --numstat -- src-main/ql-elevated.ts` 回到 `318 1`（与探针前一致）。即本文件确实在扫描集里，绿不是「没被扫到」。

### 4-6 G9 范围取证

`git status --porcelain` 只列出：`M src-main/ql-elevated.ts`、`M src-main/ql-elevated.test.ts`、`M docs/superpowers/checks/…/task-06-elevated-pty-process.md`（J 段，按派单要求填）。
`quick-launch.ts`、`quick-launch.test.ts`、`shell-execute.ts`、`shell-execute.test.ts`、`ql-host-protocol.*`、`ql-pty-host.*`、词典、spec、plan、索引、其它 check 表 —— 都不在改动列表里。

### 4-7 未跑的门

真机提权冒烟（`runas` + High IL + asar 内的原生模块）没有跑：那是任务 9 的 §7.2 真机门。本任务的 10 条全在假接缝 + 假定时器里。

## 5 偏离与理由（都在代码注释里标了出处）

1. **第三个常量 `CONNECT_POLL_MS = 50`**（`:380`）：check C3 只列两个常量，但规格 §6.5 明文「`ConnectNamedPipe` 用 50ms 轮询直到成功或超时」—— 不写这个常量就得写死字面量。取值有出处（§6.5 / P10）。→ 请主代理验收时确认 C3 那行要不要补第三行（我不改表）。
2. **类上多两个内部方法 `handshake()` / `abortHandshake()`**（`:452` / `:481`）：plan 的签名块只有构造 + 六个方法。但 K45 / R-12 要求 `startElevatedHost` 可 await，而构造函数不能 async —— 「等 READY」与「抛出前关两个句柄」必须有入口，放在类里是改动最小的做法（工厂只调它）。六个方法仍与 `ShellProcess` 逐字一致（§4-1 的类型级取证）；这两个方法不在 `ShellProcess` 里、任务 7 不应调（工厂内部用）。
3. **`ShellExecProcess` 只在 READY 到达时创建**（`:547` / `:579`），不在构造期：若构造期就创建，握手失败时工厂关进程句柄会留一个「轮询已关句柄」的定时器（或第二次 `CloseHandle`）。现在的顺序保证：握手失败 → 没有轮询在跑 → 工厂自己关（`:481`）；握手成功 → 句柄归 `ShellExecProcess` 管（C5③）。
4. **握手失败的四个 `{err}` 片段是我自造的**：R-11 只钉了 `host=<stage>`。`handshake=timeout` / `handshake=broken` / `handshake=connect` / `handshake=exit` 规格与索引都没给字面量，我按 `win32=` / `hostlink=` / `pipe=create` 的同风格写（零新词典键，G2）。→ 登记；要换写法请说，只改 `handshakeError()` 的调用点。
5. **`onData` 注册前到达的 `DATA` 帧先缓冲**（`:557` `pendingData`，注册时一次交出）：`quick-launch.ts:249-253` 的注册顺序里 READY 与首屏输出可能在同一次读里到达（真机取证：任务 5 报告 §4-1 里 READY 之后的第一帧就是 ConPTY 的初始序列），不缓冲就丢首屏。缓冲无上限（本期接受，见 §6-4）。
6. **委托时把同一个 `timeoutSecs` 交给 `ShellExecProcess.stopGraceful`**（`:537`）：§6.7 只说「仍活则委托」，没给第二个数值，同值是最字面的读法。代价见 §6 疑虑 1。
7. 未做（按边界）：任务 7 的接线（`spawnElevatedShell` / admin 分支 / `stopAll`）、真机提权门（任务 9）、真管道下的 connect / 超时行为（§6 疑虑 2）。

## 6 疑虑（要主代理处理 / 裁决）

1. **`stopGraceful` 最坏耗时 ≈ 2×`timeoutSecs` + 1s —— 直接影响任务 7 的 `stopAll`**：本段先自己等 `timeoutSecs`（§6.7 的「等 EXIT」），再委托 `ShellExecProcess.stopGraceful`，而它内部**又**等 `timeoutSecs` 才 `TerminateProcess`，再等 1000ms 让退出落地（`shell-execute.ts:160-175`、`quick-launch.ts:29` / `:32`）。按 `STOP_TIMEOUT_SECS = 3` 算，单个实例最坏约 7s；`stopAll` 若串行等多个实例会更久。规格没写第二个数值，我没擅自改（§5-6）。可选：委托时传 `Math.max(0, timeoutSecs - 已耗时)`，或任务 7 用更短的秒数 —— 需要主代理定（属规格口径）。
2. **`handshake=timeout` 在真机上可能兜不住 connect 阶段**（单测测不到）：`winPipe.connect` 走 `ConnectNamedPipe(h, null)`（`:257`，`lpOverlapped` 传 `null` = 阻塞模式）。阻塞模式下第一次 `connect()` 会在 syscall 里等到客户端连上才返回 —— 我的 50ms 轮询循环（`:455`）按 §6.5 写了，但对阻塞句柄它只在 `connect()` 返回 `false` 时才有意义。若宿主进程起来了却永不连管道（启动即崩、脚本路径不对），主线程会卡在 `connect()` 里，15s 的超时定时器不会触发。单测里 `connect` 是假的（恒 `true`），所以这条门测不到。→ 建议任务 9 的真机门加一条「起宿主后立刻杀掉，主进程不得卡住、必须按 §6.10 报错」；要不要改成 overlapped `ConnectNamedPipe` 属规格改动（按流程先改 spec / plan / 表，再改代码）。
3. **`read()` 失败交回空 Buffer**（第一段 `:301` 的契约）：我的 `feed(空字节)` 是 no-op，下一轮 `available()` 会交 `-1` → 走退出路径。没有丢帧风险（`ReadFile` 只在刚判过可读时调），但「`PeekNamedPipe` 说可读、`ReadFile` 却失败」这个 Win32 边角没有单测覆盖（假接缝不模拟这种不一致）。要不要补一条假接缝用例，请主代理定。
4. 小：`pendingData` 无上限（§5-5）。任务 7 在 `startElevatedHost` 返回后立即注册 `onData`，实际不会积压；若将来出现「注册前宿主输出很多」，需要上限或丢弃策略。

## 7 计数与门对照（给主代理复跑用）

| 项 | 起点（任务 5 收尾） | 现在 |
|---|---|---|
| `*.test.ts` 份数 | 51 | **51**（本任务不新建测试文件） |
| `npm test` | `51 passed (51)` / `861 passed (861)` | **`51 passed (51)` / `871 passed (871)`**（+10，全在 `src-main/ql-elevated.test.ts`） |
| `npx vitest run src-main/ql-elevated.test.ts` | 8 | **18**（8 旧 + 10 新） |
| `npx vitest run src-main/quick-launch.test.ts src-main/shell-execute.test.ts` | 27 / 10 | 27 / 10（两个文件未改） |
| `npx vitest run src-main/i18n` | 4 / 18 | 4 / 18 |
| `npx tsc --noEmit -p tsconfig.main.json` | 干净 | 干净（`TSC_EXIT=0`） |
| `git status --porcelain` | 干净 | 两个代码文件 + 本任务 check 表的 J 段（未 add、未 commit） |

## 8 交给任务 7 的接口（已可用）

- 装配：`startElevatedHost(winPipe, hostLauncher, { shell, cols, rows, cwd, logTarget })` → `Promise<ElevatedPtyProcess>`，返回值结构上就是 `ShellProcess`（§4-1 取证）。plan 任务 7 步骤 4 的 `spawnElevatedShell: (shell, cols, rows, cwd) => startElevatedHost(...)` 可直接接。
- `logTarget` 传法（§6.10 / C7）：shell 类型取 `shellExe(shell).exe`，exe 类型取用户填的 exe 路径 —— **不是**宿主 exe。
- 失败一律是 `Error`，message 已带 `PROC:` 前缀与最终文案（`err.proc.uacCancelled` / `err.proc.spawnFail` / `err.ql.ptySpawn`）：任务 7 按 `quick-launch.ts:244` 那侧的既有做法 `messageOf(err)` 交给 `ql_start` 的 IPC 即可，不要再包一层前缀（G1）。
- 生命周期：`startElevatedHost` 成功返回后，进程句柄由 `ShellExecProcess` 管（退出即 `CloseHandle`）；失败时两个句柄都已关（§6.7 / RF4）。任务 7 不需要自己关句柄。
- `stopGraceful(timeoutSecs)` 的委托语义与耗时见 §6-1；`isRunning()` 在 EXIT 帧或句柄退出后为 `false`；`onExit` 可在退出后安全注册（立即补发）—— 页签状态刷新可以照非提权路径那套写法。
- 不要调 `handshake()` / `abortHandshake()`：它们是工厂的内部入口（§5-2）。


---

## 9 返工轮（2026-10-15 13:5x）：两处按裁决的改动（check C8 / 裁决 R-13 + 索引 K39）

范围：只改 `src-main/ql-elevated.ts` 与 `src-main/ql-elevated.test.ts`；第一段的签名一字未动；`quick-launch.ts` / `shell-execute.ts` / `ql-host-protocol.*` / `ql-pty-host.*` 及其测试一字未改（`git status --porcelain` 只有这两份 `M`）。未 add、未 commit。

### 9-1 改动 1 · R-13 / 表 C8：委托时传**剩余预算**

- 实现：`src-main/ql-elevated.ts:523-549`（`ElevatedPtyProcess.stopGraceful`）。新增 `const startedAt = Date.now()`（`:530`），`deadline` 由它算（`:533`）；委托处改成 `:538-547` 的块——`const remainingSecs = Math.max(0, timeoutSecs - (Date.now() - startedAt) / 1000)`（`:545`）+ `await this.host.stopGraceful(remainingSecs)`（`:546`），注释钉住 R-13 / K50 / `shell-execute.ts:178-190` / `quick-launch.ts:322-333` / `main.ts:382` / `:648`。
- 效果：单实例最坏从 `2×timeoutSecs + 1s`（3s → 7s）变成 `timeoutSecs + FORCE_EXIT_WAIT_MS(1s)`（3s → 4s），与非提权路径同形；`stopAll` 逐个 `await` 时 N 个提权终端从 `N×7s` 降到 `N×4s`。
- 守它的用例（同一处更新）：`src-main/ql-elevated.test.ts:517-571`。`vi.spyOn(ShellExecProcess.prototype, 'stopGraceful')`（`:534`）记下委托实参——`vi.spyOn` 默认**透传**原实现，所以 `killTree → terminate → close` 的顺序断言仍是真 `ShellExecProcess.stopGraceful` 跑出来的；用例内 `mockRestore()`（`:566`）。宽限期取值从 2s 改成 **3s**（`:539` / `:543`），与 `main.ts:382` / `:648` 的 `ql.stopAll(3)` 同值；新增断言（`:555-559`）：委托恰一次、实参 `< 3`（不是原值）、`≤ 1`（剩余预算）、`≥ 0`；幂等段另加「不得第二次委托」（`:563`）。
- 测试侧另加 import：`src-main/ql-elevated.test.ts:16` 引入 `ShellExecProcess`（只为 spy 原型方法，不改 `shell-execute.ts` 一字）。第二段用例块的说明补两行（`:262-265`）指明这两处由哪条用例守。

### 9-2 改动 2 · 补 K39 的假接缝用例（本报告 §6-3 的处置）

- 新用例名逐字：`read_failure_after_available_falls_back_to_the_exit_path`，`src-main/ql-elevated.test.ts:633-680`（放在 E8 的读侧用例之后）。
- 形状：`available()` 照常交正值（Peek 说可读 = 那帧 DATA 的字节数），把 `h.api.read` 换成交回 `Buffer.alloc(0)`（`:657`）= 第一段 `:301` / `:321-325` 契约里「`ReadFile` 失败交回空 Buffer」。断言：本轮 `onData` 零产出、不造帧（`:660`）；只按刚判过的字节数读恰一次 `read(PIPE_HANDLE, frame.length)`（`:662`）；空 Buffer **不等于**断管——`isRunning()` 仍 true、无退出码（`:664-665`）；下一轮 `available()` 交 `-1` → 走 §6.7 的退出路径：退出码由句柄轮询落地（7）、两个句柄都关、两条轮询都清（`:666-675`）。
- 这条用例对**旧实现也是绿的**（它守的是既有行为，不是新契约），所以本轮的「先红」由 9-1 的断言逼出——见 9-3。

### 9-3 TDD：先红后绿（命令与真实输出，另见该表 J-4 ~ J-7）

1. 只改测试（13:54:08）：`npx vitest run src-main/ql-elevated.test.ts` → `Tests 2 failed | 17 passed (19)`，但**红得不干净**：`stopGraceful_delegates_after_the_EXIT_frame` 报 `Test timed out in 60000ms`（旧实现传同值 → 3+3+1 = 7s > 用例只推进的 6000ms，`await stopping` 永不落地），并连带把 `handshake_timeout_closes_pipe_and_host` 打成 `TypeError: Unexpected Object value, expected void *`（挂死用例泄漏的句柄轮询打到真 `winShell.isAlive`）。
2. 把推进时间提到 10000ms（够旧实现跑完，让红落在契约上）后重跑（13:55:57）：`AssertionError: expected 3 to be less than 3` @ `src-main/ql-elevated.test.ts:557`，`Tests 1 failed | 18 passed (19)`（新增的 K39 用例此时已绿）—— 这才是 C8 逼出的红。
3. 改实现（13:56:14）：`Test Files 1 passed (1)` / `Tests 19 passed (19)`，exit 0。
4. 类型门（13:57:49-13:57:50）：`npx tsc --noEmit -p tsconfig.main.json` → 无诊断输出，回显 `TSC_EXIT=0`。
5. 相邻回归（13:56:45）：`quick-launch.test.ts` + `shell-execute.test.ts` → `Tests 37 passed (37)`（27 / 10，两文件一字未改，含「7 stopGraceful 幂等」那条停止语义门）；i18n 三门（13:56:50）→ `Tests 18 passed (18)`（含 `no-hardcoded` 的汉字门）。
6. 全量（13:56:57）：`npm test` → `Test Files 51 passed (51)` / `Tests 872 passed (872)`、`Duration 8.75s`、exit 0。

### 9-4 计数对照（给主代理复跑用）

| 项 | 返工前 | 返工后 |
|---|---|---|
| `*.test.ts` 份数 | 51 | **51**（不新建测试文件） |
| `npm test` | `51 passed (51)` / `871 passed (871)` | **`51 passed (51)` / `872 passed (872)`**（+1，只在 `ql-elevated.test.ts`） |
| `npx vitest run src-main/ql-elevated.test.ts` | 18 | **19**（任务 4 的 8 条 + 第二段 11 条） |
| `quick-launch.test.ts` / `shell-execute.test.ts` | 27 / 10 | 27 / 10（未改） |
| `npx vitest run src-main/i18n` | 4 / 18 | 4 / 18 |
| `npx tsc --noEmit -p tsconfig.main.json` | 干净 | 干净（`TSC_EXIT=0`） |
| `git status --porcelain` | 两份代码文件 | 同样两份（本表 J 段与本报告的追加不算代码） |

### 9-5 新发现的疑虑（本轮新增，请主代理处置）

1. **`remainingSecs` 在现实现里几乎恒为 0**：外层宽限循环只有两个出口——`Date.now() >= deadline`（已等满 `timeoutSecs` → 剩余 0）或 `!this.running`（此时根本不委托）。所以 R-13 的实际效果等价于「委托那一跳只负责 `taskkill` / `TerminateProcess` + 1s 收尾」，总上限严格 = `timeoutSecs + 1s`。这与裁决一致（就是要与非提权路径同形）；保留 `Math.max(0, …)` 的算术是为了将来若把外层等待改成「更早的信号」（例如宿主回一个 STOP 的 ACK）时仍然成立。**不是缺陷，登记以免后来人误读成「剩余预算会给出正数」。**
2. **总时长仍随实例数线性增长**：R-13 把单实例从 7s 压到 4s，但 `stopAll`（`quick-launch.ts:322-333`）仍是逐个 `await` → N 个提权终端最坏 `N×4s`。要不要并发停、或给 `stopAll` 一个总预算，属 `quick-launch.ts` 的改动，不在本任务边界内（任务 7 接线时若认为 `N×4s` 不可接受，按流程先改 spec / plan / 表）。
3. **测试里新引入的取证手法**：`vi.spyOn(ShellExecProcess.prototype, 'stopGraceful')` 跨模块碰了 `shell-execute` 的原型（用例内 `mockRestore`，默认透传、不改行为）。若主代理不希望测试碰别的模块的原型，替代写法是按事件时间戳断言「委托发生在第 3s 而不是第 6s」——但那只能间接证，拿不到实参。
4. **K39 那条只覆盖假接缝**：真机上「`PeekNamedPipe` 说可读、`ReadFile` 却失败」仍未实测（要真管道 + 真宿主）。与索引 K51 的真机门同属任务 9 的 §7.2 门，本轮没有新增真机要求。
5. 顺带（不改）：第一次红暴露一个测试写法坑——**假定时器下 `advanceTimersByTimeAsync(N)` 必须 ≥ 被测路径的总耗时**，否则红以 `Test timed out` 出现，还会把后续用例连带打红（挂死用例泄漏的轮询打到真 `winShell`）。已在该用例注释里写明（`ql-elevated.test.ts:544-546`）。
