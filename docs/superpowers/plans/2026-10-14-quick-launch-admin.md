# 快捷启动「管理员」开关 实现计划

> 规格：`docs/superpowers/specs/2026-10-14-quick-launch-admin.md`（下文 §n 全部指它）。
> 执行载体：`subagent-driven-development`（一个任务 = 一个子代理，串行按任务号），任务内部 TDD。
> 分支：`feat/quick-launch-admin`。前置 feature 的 check 表未勾行由任务 9 一并收尾（§7.2-9）。

## 全局约束

- **G1 错误前缀**只用 `VALIDATION:` / `STATE:` / `PROC:`（`src-main/quick-launch-config.ts:22`、`quick-launch.ts:12` 的既有口径），不新增前缀。
- **G2 词典**只新增 `ql.modal.admin` 一个键（zh `dict.ts:176` 之后、en `:519` 之后）。其余文案一律复用既有键（§6.10）。
- **G3 不勾选的路径逐字节不变**：exe 仍 `lpVerb=null`（前置规格 §6.1 / E8）、非 admin 的 shell 仍走 `createShellProcess`（`quick-launch.ts:223-225`）。
- **G4 不动** `src-main/process.ts`、llama-server 启动路径、`QuickLaunchManager` 的构造签名（`quick-launch.ts:215-217`）。
- **G5 每个任务的收尾门**：`npx tsc --noEmit -p tsconfig.main.json` 干净 + 该任务定向测试绿 + `npm test` 全量绿。（仓库根只有 `tsconfig.main.json`，没有 `tsconfig.json`——索引 K27）
- **G6 i18n 三门**（`key-coverage.test.ts` / `dict.test.ts` / `no-hardcoded.test.ts`）在任何任务后都不得变红；新文件不得含汉字字面量（`no-hardcoded.test.ts:26-28` 扫全部 `src-main/*.ts`）。
- **G7 不新增依赖**、不改 `package.json` 的依赖段。
- **G8 子代理不 `git add`、不 commit**；改动留在工作区等验收（AGENTS.md 工作流第 4 步）。
- **G9 只改该任务 B 段列出的文件**，越界即不勾。

## 审查重点（Review Focus）

| 编号 | 重点 | 钉住的任务与测试 |
|---|---|---|
| RF1 | 自动命令释放顺序：先 `deps.onData` 再 `releaseAutoCommand`（`quick-launch.ts:249-253`）在提权路径上不能被复制成另一套 | 任务 7 `admin:true 的自动命令在首批输出之后释放` |
| RF2 | 「不勾选 = 行为不变」：exe 的 `verb===null` 分支、shell 的非 admin 分支 | 任务 3 `admin_absent_keeps_lpVerb_null`；任务 7 `admin_falsy_uses_the_plain_local_pty` |
| RF3 | 定高 218px 与「3 个控件格」门在两态同时成立（§6.2） | 任务 8 改 `QuickLaunchModal.test.ts:681-683` 的计数器 + 新增 exe 态计数断言 |
| RF4 | 失败路径不泄漏句柄 / 管道（§6.7） | 任务 4 `launch_failures_close_both_handles`；任务 6 `handshake_timeout_closes_pipe_and_host` |
| RF5 | 退出码来源优先级：`EXIT` 帧 > `GetExitCodeProcess`（§6.7） | 任务 6 `exit_code_prefers_the_EXIT_frame` / `host_crash_falls_back_to_the_handle` |
| RF6 | [停止] 与 `stopAll` 不留孤儿 ConPTY：STOP 帧 → 宿主自己杀树（§6.6-7、§6.7） | 任务 5 `stop_frame_runs_stopGraceful`；任务 6 `stopGraceful_delegates_after_the_EXIT_frame` |
| RF7 | 提权宿主脚本在 asar 内的可执行性与原生模块解析（P9 / R1） | 任务 9 的打包产物核对 + 真机门 §7.2-1 |

## 文件结构

| 文件 | 动作 | 任务 |
|---|---|---|
| `src-main/quick-launch-config.ts` | 改（`:14`、`:72`、`:77`、`:95`、`:100`） | 1 |
| `src-main/quick-launch-config.test.ts` | 改（新增 admin 用例） | 1 |
| `src-main/ql-host-protocol.ts` | 新建 | 2 |
| `src-main/ql-host-protocol.test.ts` | 新建 | 2 |
| `src-main/shell-execute.ts` | 改（`:14` 签名、`:80-102` 实现、`:191-201`） | 3 |
| `src-main/shell-execute.test.ts` | 改 | 3 |
| `src/main.ts` 的 `spawnExeProcess`（`src-main/main.ts:1050-1072`） | 改 | 3 |
| `src-main/ipc-ql.test.ts` | 改（`:245` 加载结果夹具加 `admin: false`） | 1 |
| `src-main/ipc-ql.test.ts` | 改（exe 提权形状门） | 3 |
| `src-main/ql-elevated.ts` | 新建（管道接缝 + 起宿主 + `ElevatedPtyProcess`） | 4、6 |
| `src-main/ql-elevated.test.ts` | 新建 | 4、6 |
| `src-main/ql-pty-host.ts` | 新建（宿主入口） | 5 |
| `src-main/ql-pty-host.test.ts` | 新建 | 5 |
| `src-main/quick-launch.ts` | 改（`:166-172`、`:223-225`、`:232-266`） | 7 |
| `src-main/quick-launch.test.ts` | 改（`:151-156` 夹具 + admin 用例） | 7 |
| `src-main/main.ts` | 改（`:1076-1085` 接线） | 7 |
| `src-main/i18n/dict.ts` | 改（`:176` 后、`:519` 后各一行） | 8 |
| `src/modules/QuickLaunchModal.vue` | 改（`:60-64`、`:106-117`、`:149-168`、`:229-261`、`<style scoped>`） | 8 |
| `src/modules/QuickLaunchModal.test.ts` | 改（`:29`、`:407`、`:425`、`:681-683` + 新用例） | 8 |
| `build.bat` | 改（`:102` 之后加预建硬链接） | 9 |

---

### 任务 1：配置层 `admin` 字段

**改什么**：`QuickLaunchEntry` 加 `admin?: boolean`；`normalizeEntry` / `validateEntry` 的两个返回字面量带 `admin`（§6.1）。
**为什么单独一个任务**：它是后面所有任务的类型前提，且只碰数据层，测试自成闭环。

- [ ] **步骤 0：起点核对**：`quick-launch-config.ts:14`（类型）、`:63-80`（`normalizeEntry`）、`:84-103`（`validateEntry`）、`:138-139`（`qlSave` 整表写回）。
- [ ] **步骤 1：先写失败测试**（`quick-launch-config.test.ts`）：
  - `entry_without_admin_loads_as_false`（沿用 `:81-82` 的既有夹具，断言里加 `admin: false`）
  - `admin_true_round_trips_through_save_and_load`
  - `non_boolean_admin_values_normalize_to_false`（`'yes'` / `1` / `null`）
  - `saved_yaml_contains_an_explicit_admin_key`（读原文断言含 `admin: false`）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/quick-launch-config.test.ts` → 新用例失败（缺 `admin` 键）。
- [ ] **步骤 3：实现**：`:14` 加字段；`:72` / `:77` / `:95` / `:100` 加 `admin: ... === true`。
- [ ] **步骤 4：跑绿** + 修 `quick-launch-config.test.ts:81`、`:82`、`:103`、`:241`、`:250` 与 `ipc-ql.test.ts:245` 的 `toEqual` 字面量（加 `admin: false`）。
- [ ] **步骤 5：类型门 + 全量回归**（G5）。`src/modules/QuickLaunchModal.test.ts` 的 `toEqual` 此时**不应**变红——它断言的是渲染端发出的 payload，`admin` 要到任务 8 才进 payload。`src-main/ipc-ql.test.ts:245` 断言的是 `ql_list` 的**加载结果**，本任务之后必红：属预期，与其余夹具一样加 `admin: false`（索引 K28）。除这一处之外还有别处变红，说明 `admin` 被写进了不该写的地方，停下来报告。
- [ ] **步骤 6：Commit（主代理）**：`feat: 快捷启动配置增加 admin 字段（总是显式落盘）`

---

### 任务 2：帧协议 `src-main/ql-host-protocol.ts`

**改什么**：新建纯函数模块（§6.5）。无 Win32、无 i18n、无汉字。

`@
export const HOST_FRAME = { HELLO: 0x01, WRITE: 0x02, RESIZE: 0x03, STOP: 0x04, READY: 0x81, DATA: 0x82, EXIT: 0x83, ERR: 0x84 } as const;
export type HostFrameType = (typeof HOST_FRAME)[keyof typeof HOST_FRAME];
export function encodeFrame(type: HostFrameType, payload: string): Buffer;
export function createFrameParser(onFrame: (type: number, payload: string) => void): (chunk: Buffer) => void;
`@

- [ ] **步骤 1：先写失败测试**（`ql-host-protocol.test.ts`）：`round_trip`、`two_frames_in_one_chunk_are_split`（粘帧）、`half_frame_waits_for_the_rest`（半帧）、`unknown_type_is_dropped_without_breaking_the_stream`、`payload_with_multibyte_utf8_survives`（按字节切，不按字符）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-host-protocol.test.ts`。
- [ ] **步骤 3：实现**（`len` 用 `writeUInt32LE`；解析器按字节累积 + `subarray`，不 `toString` 半帧）。
- [ ] **步骤 4：跑绿** + G5。
- [ ] **步骤 5：Commit（主代理）**：`feat: 提权 PTY 宿主的帧协议（长度前缀 + 方向高位）`

---

### 任务 3：可执行程序的「管理员」= `runas`

**改什么**：`WinShellApi.shellExecute` 加可选第三参（§6.9 / §6.4-3）；`launchShellExe` 透传 `verb`；`main.ts:1050-1072` 的适配器从 `qlStartContextOrThrow(...)` 取当前条目的 `admin`。

`@
shellExecute(file: string, nShow: number, opts?: { verb?: string | null; parameters?: string | null }):
  { ok: boolean; handle: unknown; win32Error: number };
export function launchShellExe(api: WinShellApi, exe: string, verb?: string | null): ShellExecProcess;
`@

- [ ] **步骤 0：起点核对**：`shell-execute.ts:14`（接口）、`:80-102`（真实现，`lpVerb: null` 在 `:87`、`lpParameters: null` 在 `:89`）、`:191-201`（`launchShellExe`）、`main.ts:1050-1072`、`main.ts:1082`（槽守卫接线，**不删**）。
- [ ] **步骤 1：先改测试**（`shell-execute.test.ts`）：`verb_runas_is_passed_through_to_the_shell`（假 api 记录入参）、`no_opts_keeps_verb_and_parameters_null`（RF2 的门）、`uac_cancelled_still_maps_to_err_proc_uacCancelled`（沿用既有用例，不改文案）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/shell-execute.test.ts`。
- [ ] **步骤 3：实现**：`:87` → `lpVerb: opts?.verb ?? null`；`:89` → `lpParameters: opts?.parameters ?? null`；`launchShellExe` 第三参透传。**其余取值逐字不动**（`fMask`、`nShow`、`lpDirectory`）。
- [ ] **步骤 4：改 `main.ts`**：`spawnExeProcess(exe, configId)` 的签名加 `admin: boolean`（或从 `qlStartContextOrThrow` 的槽里取当前 entry 的 `admin`——两种都行，选定后写进该任务 check 表的 C 段），`admin===true` 时传 `'runas'`。
- [ ] **步骤 5：`ipc-ql.test.ts` 加形状门**：保存 `admin:true` 的 exe 条目 → `ql_start` 走假 `WinShellApi` 时收到 `verb='runas'`；`admin` 缺省 → `null`。
- [ ] **步骤 6：跑绿 + G5 + G6**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 可执行程序启动项的管理员开关走 ShellExecuteEx runas`

---

### 任务 4：主进程侧的命名管道与起宿主（`ql-elevated.ts` 第一段）

**改什么**：把 Win32 管道与进程启动收在一个可注入的接缝后面（照抄 `shell-execute.ts` 的「真实现 + 假实现可替换」手法）。

`@
export interface WinPipeApi {
  createServer(pipeName: string): unknown;              // CreateNamedPipeW + SDDL（§6.5）
  connect(h: unknown): boolean;                        // ConnectNamedPipe，535 也算成功
  available(h: unknown): number;                       // PeekNamedPipe
  read(h: unknown, n: number): Buffer;                 // ReadFile
  write(h: unknown, buf: Buffer): boolean;             // WriteFile
  close(h: unknown): void;
}
export interface HostLauncher {
  hostExePath(): string;                               // 硬链接 node.exe 的解析（§6.4-1）
  hostScriptPath(): string;                            // path.join(__dirname, 'ql-pty-host.js')
  launch(exe: string, script: string, pipeName: string, token: string): { ok: boolean; handle: unknown; win32Error: number };
}
export function newPipeName(): string;                 // \\.\pipe\lms-ql-<8 位随机>
// 主代理裁决 R-07（2026-10-14 22:4x，索引 K35）：§6.10 前两行的文案映射单独导出一个纯函数，
// launch() 自身不带文案（B1 边界「不含 i18n 文案」不变）；任务 6 用 opts.logTarget 作 userTarget 调它
export function hostStartError(win32Error: number, userTarget: string): Error;
`@

- [ ] **步骤 1：先写失败测试**（`ql-elevated.test.ts`，假 `WinPipeApi` + 假 `HostLauncher`）：
  - `server_is_created_with_the_sddl_descriptor`（假接缝记录入参，断言 SDDL 串逐字 = `D:(A;;GA;;;WD)`）
  - `launch_passes_runas_and_three_quoted_arguments`
  - `host_exe_resolution_reuses_an_existing_link_only_when_size_matches`（`fs.linkSync` / `fs.statSync` 用临时目录真跑一次）
  - `launch_failures_close_both_handles`（RF4）
  - `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target`（§6.10：断言 `hostStartError(1223, <用户目标>)` 的文案里出现的是用户那一行的目标，**不是**宿主 exe 名 —— 见上面的 R-07 行）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts`。
- [ ] **步骤 3：实现**：koffi 绑定（`CreateNamedPipeW` / `ConvertStringSecurityDescriptorToSecurityDescriptorW` / `PeekNamedPipe` / `ReadFile` / `WriteFile` / `ConnectNamedPipe`）；`WriteFile` 形参声明 `uint8 *@（§6.5 的 `lastErr=998` 教训）；起宿主复用 `winShell.shellExecute(file, 0, {verb:'runas', parameters})`。
- [ ] **步骤 4：跑绿 + G5 + G6**。
- [ ] **步骤 5：Commit（主代理）**：`feat: 提权宿主的命名管道服务端与 runas 启动接缝`

---

### 任务 5：宿主入口 `src-main/ql-pty-host.ts`

**改什么**：被 `node.exe` 直接执行的宿主（§6.6）。它 import `net`、`@lydell/node-pty`、`./quick-launch` 的 `shellExe`、`./ql-host-protocol.js`。**不 import `electron`**。

`@
// argv: [node, script, pipeName, token]
export function runHost(deps: { connect(name: unknown): HostSocket; spawn: typeof pty.spawn }): void;
`@
（`runHost` 只做装配，`main` 判断 `require.main === module` 才调用 —— 这样单测能注入假 socket 与假 pty。）

- [ ] **步骤 1：先写失败测试**（`ql-pty-host.test.ts`，假 socket = 一个 EventEmitter + 收集写出的帧）：
  - `hello_with_a_wrong_token_exits_2_and_sends_err`
  - `spawn_options_match_the_non_elevated_path`（断言 `name/cols/rows/cwd` 与 `quick-launch.ts:155-161` 逐字一致，且**没有** `encoding`）
  - `ready_then_data_then_exit_frame_order`（RF6）
  - `write_and_resize_frames_reach_the_pty_handle`
  - `stop_frame_runs_stopGraceful_with_the_given_timeout`（RF6）
  - `socket_close_runs_the_stop_path`（§6.6-8）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-pty-host.test.ts`。
- [ ] **步骤 3：实现**（§6.6 的 1–9 步逐条）。
- [ ] **步骤 4：跑绿 + G5 + G6**（`no-hardcoded` 会扫这个新文件 —— 汉字只能出现在注释里，字面量里不能有）。
- [ ] **步骤 5：本机冒烟（不测 ConPTY）**：`node -e` 起硬链接 `node.exe` 跑编译后的 `dist-main/ql-pty-host.js`，喂一个假的 `HELLO` 到假管道 —— 若本环境因 `EPERM conpty-*-in` 失败，**这是预期的**（§2-5），把输出贴进 check 表 J 段，不算失败。
- [ ] **步骤 6：Commit（主代理）**：`feat: 提权 PTY 宿主入口（管道 ↔ node-pty 转发）`

---

### 任务 6：主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts` 第二段）

**改什么**：把任务 4 的接缝 + 任务 2 的帧拼成 `ShellProcess` 形状（`quick-launch.ts:175-182` 逐字）。

`@
export class ElevatedPtyProcess {
  constructor(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string });
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  stopGraceful(timeoutSecs: number): Promise<void>;
}
`@

- [ ] **步骤 1：先写失败测试**：
  - `hello_carries_token_shell_cols_rows_cwd`（§6.4-4：argv 里没有这些）
  - `data_frames_are_forwarded_to_onData`
  - `exit_code_prefers_the_EXIT_frame`（RF5）
  - `host_crash_falls_back_to_the_handle_exit_code`（RF5）
  - `registering_onExit_after_exit_replays_immediately`（`quick-launch.ts:108-115` 同口径）
  - `stopGraceful_delegates_after_the_EXIT_frame`（RF6：断言委托顺序 = 先发 STOP，再走 `ShellExecProcess.stopGraceful`）
  - `handshake_timeout_closes_pipe_and_host`（RF4，假接缝把超时压到几毫秒）
  - `read_polling_uses_available_not_blocking_read`（断言假接缝的 `read` 只在 `available()>0` 时被调用，R7 的门）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts`。
- [ ] **步骤 3：实现**（`POLL_READ_MS = 20`、`HOST_HANDSHAKE_TIMEOUT_MS = 15000`；宿主句柄生命周期复用 `ShellExecProcess`，不重写轮询）。
- [ ] **步骤 4：跑绿 + G5**。
- [ ] **步骤 5：Commit（主代理）**：`feat: ElevatedPtyProcess —— 提权宿主的 ShellProcess 形状`

---

### 任务 7：`QuickLaunchManager` 的 admin 分支 + `main.ts` 接线

**改什么**：§6.8。`QlDeps` 加必填 `spawnElevatedShell`；加 `createElevatedShellProcess` 接缝；`start()` 的 shell 分支按 `e.admin === true` 分流。

- [ ] **步骤 0：起点核对**：`quick-launch.ts:166-172`（`QlDeps`）、`:175-182`（`ShellProcess`）、`:223-225`（`createShellProcess`）、`:232-266`（shell 分支）、`:242-245`（失败不残留）、`:249-258`（onData/onExit）、`:264`（自动命令）、`main.ts:1076-1085`（`new QuickLaunchManager(...)`）。
- [ ] **步骤 1：先改测试**（`quick-launch.test.ts`）：`:151-156` 的 `QlDeps` 夹具补 `spawnElevatedShell` 假实现（否则类型门红）；新增：
  - `admin_true_starts_through_the_elevated_host`（断言 `createElevatedShellProcess` 被调用、本地 `pty.spawn` 没被调用）
  - `admin_falsy_uses_the_plain_local_pty`（RF2）
  - `admin_true_failure_leaves_no_instance`（`:242-245` 的语义在提权路径同样成立）
  - `admin_true_auto_command_released_after_first_output`（RF1：断言写入顺序 = 先转 `onData` 再放命令）
  - `admin_true_stop_goes_through_the_same_path`
- [ ] **步骤 2：跑红**：`npx vitest run src-main/quick-launch.test.ts`。
- [ ] **步骤 3：实现**：`start()` 里 `const proc = e.admin === true ? await this.createElevatedShellProcess(...) : this.createShellProcess(...)`，`try/catch` 的 `PROC:` 包装与错误文案（`err.ql.ptySpawn`，`{exe} = shellExe(shell).exe`）不变。
- [ ] **步骤 4：`main.ts` 接线**：`new QuickLaunchManager({..., spawnElevatedShell: (shell, cols, rows, cwd) => startElevatedHost(...) }, ...)`；`startElevatedHost` 里解析硬链接、失败按 §6.10 先 `emitLog('[lms_launcher] ' + msg, 'sys')` 再抛（与 `main.ts:1064` 同一分工）。
- [ ] **步骤 5：`ipc-ql.test.ts` 加端到端形状门**：`admin:true` 的 shell 条目 → 走假宿主接缝 → 页签事件 / `ql_write` / `ql_resize` / [停止] 与非提权用例同一断言集。
- [ ] **步骤 6：跑绿 + G5 + G6 + 全量**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 快捷启动按 admin 分流到提权 PTY 宿主`

---

### 任务 8：弹窗两态的「管理员」开关 + 词典键

**改什么**：§6.2。先改测试（含把 `QuickLaunchModal.test.ts:681-683` 的计数器扩到覆盖新控件格），再改组件。

- [ ] **步骤 0：起点核对**：`QuickLaunchModal.vue:60-64`（表单 ref）、`:106-117`（`fill`）、`:149-168`（`save` 的两个 payload）、`:229-245`（shell 态）、`:248-261`（exe 态）、`:291-307`（定高注释与 `min-height`）、`:356-385`（`.flag-grid` / `.row-cell` / `.type-field`）；`TemplateModal.vue:398-406`（开关 markup）、`:567-588`（开关样式）。
- [ ] **步骤 1：先改测试**（`QuickLaunchModal.test.ts`）：
  - 夹具与 payload 断言加 `admin`：`:29`、`:383`、`:407`、`:425`
  - `admin_switch_defaults_off_and_is_a_role_switch`（`role="switch"`、`aria-checked="false"`）
  - `admin_switch_sits_in_the_right_segment_of_the_terminal_row`（同一行内：下拉在前、开关在后；且**不新增网格行**）
  - `admin_switch_row_is_above_the_program_path_row_in_exe_type`
  - `edit_mode_reflects_admin_true_from_the_entry`
  - `save_payload_carries_admin_true_when_toggled`
  - 改 `modal_height_is_fixed_to_the_shell_form_height_in_both_types`：`controlCells` 过滤器加 `.switch-cell` 之外**不需要**（控件格用 `.field-cell`，见 §6.2），但**新增**一行断言「可执行程序态也数到 3 个控件格」
- [ ] **步骤 2：跑红**：`npx vitest run src/modules/QuickLaunchModal.test.ts`。
- [ ] **步骤 3：加词典键**（先改行号大的 en `:519` 之后，再改 zh `:176` 之后，避免行号漂移）：`'ql.modal.admin': '管理员'` / `'Admin'`。
- [ ] **步骤 4：实现组件**：markup + 复制 `.bool-switch` 样式（G15/K15）。`.term-field { flex:1 1 auto; min-width:0 }`、`.switch-cell`、`.admin-label { flex:none; white-space:nowrap }`。
- [ ] **步骤 5：宽度取证**（无头 Chromium，与 218px 同一手法）：520px 弹窗里终端行的下拉可用宽度 ≥ 300px、最长终端标签 `Command Prompt (cmd)` 不被截断、左列宽度与改动前一致（「程序路径」仍是最宽）。输出贴进 check 表 J 段。
- [ ] **步骤 6：跑绿 + G5 + G6 + 全量**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 新建/编辑启动项弹窗的管理员开关（两态各一行）`

---

### 任务 9：`build.bat` 预建硬链接 + 打包真机门（用户执行）

- [ ] **步骤 1：`build.bat`**：在 `:102`（`:pack_done`）之后插入预建步骤（§6.11）：已存在则跳过；`mklink /H` 失败只警告不中断（运行时会自建，§6.4-1）。echo 行里不得出现未转义的 `)`（`build.bat:91-92` 的既有告诫）。
- [ ] **步骤 2：跑 `build.bat`**（主代理），核对产物：
  - `dist-release\win-unpacked\node.exe` 存在且与 `lms_launcher.exe` 同 inode（`fsutil hardlink list node.exe`）
  - `resources\app.asar\dist-main\ql-pty-host.js` 在包里（`npx asar list`）
  - `resources\app.asar.unpacked\node_modules\@lydell\**` 与 `koffi` / `@koromix` 在
- [ ] **步骤 3：把 §7.2 的 9 条清单逐字交给用户**，并**同时**交前置 feature 的六步（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7）。本实现环境起不了 ConPTY（§2-5），**不得用「自动化已过」代替这一条**。
- [ ] **步骤 4：等回报**，逐条把「通过 / 不通过 + 现象」填进本任务 check 表的 J 段；R1 命中时按 §9-R1 的回退口径改 `electron-builder.yml` 并**同一 commit** 同步 spec/plan/check 表。
- [ ] **步骤 5：Commit（主代理）**：`build: 预建提权宿主的 node.exe 硬链接 + 真机门清单`

### 任务 10：真机缺陷修复 —— 连接不阻塞 + 宿主早退可见 + 宿主失败留痕

> 来源：2026-10-15 18:0x 用户真机回报（[命令行] + 管理员：UAC 点「是」后不出页签、**应用卡死无响应**）。主代理取证：阻塞 `ConnectNamedPipe` 让超时分支不可达（§6.5 / R-17）；宿主侧失败一个字节也带不回来（R-18）。**先改文档再改代码**（本节与 spec §6.5 / §6.6-10..12 / §6.7 / §6.10 / §7.2-10 / §9-R9 同一 commit）。

- [ ] **步骤 0：起点核对**：`ql-elevated.ts:449-476`（`handshake()` 的 while 循环）、`:586-605`（`adoptHostHandle` / 进程句柄）、`ql-pty-host.ts:53-151`（`runHost` / `fail` / `main`）、`shell-execute.ts` 的 `WinShellApi.isAlive` / `exitCodeOf`。
- [ ] **步骤 1：先改测试**（`src-main/ql-elevated.test.ts` / `src-main/ql-pty-host.test.ts`）：
  - `handshake_polls_without_calling_blocking_connect`（连接未成前**不得**调 `pipe.connect`；只轮询 `available()`）
  - `handshake_detects_the_client_through_peek`（`available() >= 0` → 已连，随后补一次 `connect()` 并接受 535）
  - `handshake_times_out_when_nobody_connects`（到点抛 `handshake=connect`，且**主线程没有被阻塞**）
  - `handshake_fails_fast_when_the_host_died`（`isAlive=false` → `handshake=exit(code=N)`，不再等满 15s）
  - `host_pipe_failure_exits_3_and_writes_the_trace_file`
  - `host_fatal_error_exits_4_and_writes_the_trace_file`
  - `host_trace_line_is_merged_into_the_exit_fragment`（只有 `pipe=` 匹配才采信；不匹配 / 无文件 → 只报退出码）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts`。
- [ ] **步骤 3：实现**：
  - `ql-elevated.ts`：`handshake()` 的连接等待换成 50ms 异步轮询（`available() >= 0` = 已连；`-1` = 继续等），轮次里判宿主退出 + 到点超时，连上后补一次 `connect()`；`HostLauncher` 加 `isAlive` / `exitCodeOf`（转调 `WinShellApi`）；`handshake=exit(code=N)` 前并留痕最后一行（§6.10）。
  - `ql-pty-host.ts`：`fail()` 分类退出码（pipe → 3）；`main()` 外层 `try/catch` → `stage='fatal'` → 4；四类失败各追加一行到 `%TEMP%\lms-ql-host.log`。
- [ ] **步骤 4：跑绿 + G5 + G6 + 全量**（`npm test` 只增不减）。
- [ ] **步骤 5：Commit（主代理）**：`fix: 提权终端连接不再阻塞主线程（有界等待 + 宿主早退可见 + 失败留痕）`

### 任务 11：宿主启动机制重做 —— 应用 exe + 「应用入口参数」（R-19 → R-21）

> 来源：用户真机 2026-10-15 18:0x-18:4x（类型 [命令行] + 管理员：UAC 点「是」后不出页签；任务 10 修掉卡死后日志给出 `handshake=exit(code=0)`）。主代理取证（spec §3-P13）：硬链接 `node.exe` 那条路**根本不进 Node 模式**——Electron 28.3.3 只认 `ELECTRON_RUN_AS_NODE` 环境变量，而提权不继承环境块（P2）、无命令行开关（P3），于是提权子进程其实是**又起了一遍应用**、不连管道、干净退 0。**先改文档再改代码**（本节与 spec §3-P13/§6.4 同一 commit）。
>
> **第一轮（R-19：`--ql-pty-host` 开关 + `boot.ts` 转发入口）已实现，但被主代理的本地门打回**（spec §3-P14，2026-10-15 19:5x-20:1x）：打包态下 `lms_launcher.exe --ql-pty-host …` → `bad option: --ql-pty-host`、退出码 9 —— Node 的命令行解析器在跑任何应用代码之前就拒绝未知 `--x`；`--ql-pty-host=<值>` 同样被拒；`--` 之后的第一个位置参数又被 Electron 当成**应用入口路径**去 require。成立的形状是「**应用 exe + 入口参数 = 宿主脚本绝对路径**」：管道不存在 → 退 3；接真实管道 → 活着等 `HELLO`（`@lydell/node-pty` 已加载、`net.connect` 已成功）。工作区那一轮改动**整体丢弃**（未提交，无需 revert），本轮文档与代码同一 commit：spec §3-P14/§6.3/§6.4/§6.6-1/§6.11/§7.1/§7.2/§8-K2/K12/K13/§9-R1/R10。

- [ ] **步骤 0：起点核对**（起点 = HEAD，任务 10 已提交的状态；第一轮的改动先 `git restore` + 删新文件，不 revert）：`ql-elevated.ts` 的 `HOST_EXE_NAME` / `HOST_SCRIPT_NAME` `:32-33`、`HostLauncher` `:45-54`、`resolveHostLink` `:126-156`、`createHostLauncher` `:158-188`、`hostLauncher` `:191`、`startHost` `:346-375`；`ql-pty-host.ts` 的 `main()` `:189-205` + `require.main` 块 `:207-211`（**本轮不改这个文件**）；`build.bat:108-128`；`ipc-ql.test.ts:446/491-492/523`；`ql-elevated.test.ts:137-138`（`hostScriptPath` 断言）+ `:141-177`（`resolveHostLink` 用例）+ `:329-330`（假 launcher 夹具）。**`package.json` 与 `src-main/main.ts` 不在改动范围内**（R-21：不改 `main` 字段、不加转发入口）。
- [ ] **步骤 1：先改测试**（只动 `src-main/ql-elevated.test.ts` 与 `src-main/ipc-ql.test.ts` 的接缝）：
  - 删 `resolveHostLink` 那条用例（`:141-177`，机制退场）。
  - 新增 `host_exe_is_the_app_executable`：`createHostLauncher(假 shell).hostExePath()` 恒等 `process.execPath`（dev / 打包同一条式子，**没有** `process.defaultApp` 分支）。
  - 新增 `start_host_passes_the_app_exe_and_script_to_launch`：`startHost(假管道, createHostLauncher(假 shell))` 交出的 `exe` 逐字 = `process.execPath`、`script` 逐字 = `path.join(__dirname, 'ql-pty-host.js')`，`parameters` 逐字 = `'"' + <宿主脚本绝对路径> + '" "' + pipe + '" "' + token + '"'`、`nShow = SW_HIDE`、`verb='runas'`；再走一遍注入接缝（`{execPath}`）确认交出去的就是注入的那个 exe。（参数串本身仍由既有用例 `launch_passes_runas_and_three_quoted_arguments` 守，不写重复的第三条。）
  - 改写 `launch_failures_close_both_handles` 的场景 2（`:191-203`）：旧断言「路径解析抛 `hostlink=ENOENT`、不去起进程」随机制退场，改成「`hostExePath()` 走 `paths.execPath` 接缝、路径不存在也**不抛**、交出去的就是注入的那个 exe」。`startHost` 只剩 `pipe` / `launch` 两个 stage 由 C7 的 `git grep hostlink` 零命中 + 既有场景 1 守。
  - 假夹具 `hostLauncherStub` 换成 `{ hostExePath, hostScriptPath, launch(exe, script, pipe, token), isAlive, exitCodeOf }`；五条 `not.toContain('node.exe')` 改钉 `not.toContain('lms_launcher.exe')`（宿主就是应用自己的 exe）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts`。
- [ ] **步骤 3：实现**：
  - `ql-elevated.ts`：删 `resolveHostLink` / `HOST_EXE_NAME` / `errnoOf` / `HostPaths.hostDir`（`HostPaths` 本身与 `HOST_SCRIPT_NAME` **保留**，它们正是新机制的取值点，C3/C6）；`HostLauncher` = `{ hostExePath(): string; hostScriptPath(): string; launch(exe, script, pipeName, token), isAlive, exitCodeOf }`；`hostExePath()` **恒 `process.execPath`**；`hostScriptPath()` 沿用任务 4 的 `path.join(__dirname, 'ql-pty-host.js')`；`launch` 里 `shellExecute(exe, SW_HIDE, { verb: 'runas', parameters })`，`parameters` 按上面那条逐字拼；`startHost` 去掉路径解析那一步（stage 只剩 `pipe` / `launch`，抛前 `pipe.close(pipeHandle)`）。
  - `ql-host-protocol.ts` / `quick-launch.ts` / `package.json`：**一字不改**；`ql-pty-host.ts` / `main.ts` 只允许 check 表 C7 ② 那 4 处**注释**编辑（R-22 / K63：那些注释对新机制为假；条件 = 不碰代码 token、行数不变）。
  - **不新建** `boot.ts` / `ql-host-boot.ts`。
  - `build.bat`：删掉 R-16 的硬链接块（`:108` 空行 + `:109-128`），恢复 `echo.` 在前；文件回到 111 行、纯 ASCII、全 CRLF。
- [ ] **步骤 4：跑绿 + G5 + 全量**（`npm test` 只增不减：删 1 条、加 2 条 → 预期 51 文件 / **896** 用例。原写「加 3 条 / 897」是算术错，与 check 表 D1 不自洽，见索引 K63）。**本地无 UAC 门由主代理跑**（步骤 5），子代理不打包。
- [ ] **步骤 5：本地无 UAC 门（主代理）**：`cmd /c build.bat` → 核对 `app.asar\dist-main\ql-pty-host.js` 在包里、**包内无 `node.exe`**、`package.json` 的 `main` 仍是 `dist-main/main.js`；`lms_launcher.exe "<…app.asar\dist-main\ql-pty-host.js>" "\\.\pipe\x" tok` → 无窗口（**D6′：dev 布局同一条式子也要跑**：`node_modules\electron\dist\electron.exe <仓库绝对路径>\dist-main\ql-pty-host.js "\\.\pipe\x" tok`，同样无窗口 / 退出码 3 —— 补掉「dev 态没有门」，K63）、退出码 **3**；接真实管道 → 活着等 `HELLO`。脚本已在 `.temp/ql-admin-probe/`（`d6-variants4.ps1` / `real-pipe-run2.ps1` / `verify-pack.ps1`），直接复用。
- [ ] **步骤 6：Commit（主代理）**：`fix: 提权宿主改用应用 exe 的应用入口参数启动（R-21，硬链接与命令行开关机制退场）`

---

## 计划自检（写完当场跑过）

- 规格 §4 的 4 条目标 → 任务 1（持久化）、3（exe 提权）、7（终端提权 + 页签保真）、8（弹窗）、9（真机）；§5 的每条非目标都没有对应任务。
- 规格 §6.1–§6.11 每节都有任务承载；§9 的 R1–R8 落在任务 9 的真机门与任务 4/6 的用例里。
- 无占位符 / 无「二选一」遗留（`main.ts` 适配器取 `admin` 的两种方式在任务 3 步骤 4 里明确「选定后写进 C 段」——那是实现选择，不是规格空洞）。
- 每个任务都有「先红」的步骤与定向命令；每个任务的收尾都带 G5/G6。
- **任务 10 是任务 9 真机门打回来的缺陷修复**（2026-10-15 18:0x），不是新功能：它只修「有界等待 / 早退可见 / 失败留痕」，不改协议、不改 §5 的任何非目标。
- **任务 11 同理**（2026-10-15 18:4x 起，两轮）：它只重做「宿主怎么起」这一个机制（K13 的硬链接被 P13 证伪；R-19 的开关又被 P14 证伪），**不改**帧协议、**不改** `ql-pty-host.ts`、**不改** `main.ts`、**不改** `package.json`、**不改** §5 的任何非目标。
