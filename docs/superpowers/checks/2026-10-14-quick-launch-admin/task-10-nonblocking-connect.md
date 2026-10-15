# 任务 10 · 真机缺陷修复：连接不阻塞 + 宿主早退可见 + 宿主失败留痕 — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 10 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.5 / §6.6-10..12 / §6.7 / §6.10 / §7.2-10 / §9-R9
> 前置：任务 1–9 全部已提交（任务 9 的真机门打回了本缺陷）
> 来源（用户原话，2026-10-15 18:0x）：「[快捷启动] 类型为 [可执行程序] 可以正常让程序以管理员权限启动，但类型为 [命令行] 时，启动后弹出 node.exe 的 UAC 窗口，点击 [是] 按钮后，应用日志区没有打开对应的命令行标签页，同时应用卡死无响应」
> 现状锚点（本表生成时实测，2026-10-15 18:2x）：`src-main/ql-elevated.ts`：`HostLauncher` `:45-49`、`createHostLauncher` `:157-176`、`winPipe.connect` `:313-316`、`HOST_HANDSHAKE_TIMEOUT_MS` `:379`、`CONNECT_POLL_MS` `:380`、`ElevatedPtyProcess` 构造 `:424`、`async handshake()` `:452-476`（`while (!this.pipe.connect(...))` `:455` + `sleep(CONNECT_POLL_MS)` `:457`）、`adoptHostHandle()` `:589`、`handshakeError()` `:637`、`startElevatedHost` `:674`；`src-main/ql-pty-host.ts`：`runHost` `:53`、`fail()` `:71-75`、`main()` `:154-159`；`src-main/main.ts`：`spawnElevatedShell` `:1099-1101`；测试条数：`ql-elevated.test.ts` 19、`ql-pty-host.test.ts` 6
> **主代理验收（2026-10-15 18:4x，G 段全部命令由主代理独立复跑）**
> G1 定向 → `Test Files 2 passed (2)` / **`Tests 32 passed (32)`**（19+6+7）；G2 相邻 → **61 passed (61)**（34+27）；G3 → 无输出、`TSC_EXIT=0`；G4 i18n → `4 passed` / `18 passed`；G5 全量 → **`51 passed (51)` / `895 passed (895)`**（基线 888 → +7，测试文件仍 51 份）。范围：`git status --porcelain` 恰好 B 段四个代码文件 + 本表 J 段 + 报告。
> 逐条核对属实（我读了改后的原文，不采信自述）：`handshake()` `:478-489` 是 `for(;;)` 里先判 `available() >= 0` → 补一次 `connect()` → `break`，**等待期间没有阻塞的 `connect` 调用**（C1/C2）；然后判 `!this.launcher.isAlive(this.hostHandle)` → `hostExitReason()`（C4），再判 `Date.now() >= deadline` → `handshake=connect`（C3）；`hostExitReason()` `:673-681` 把 `exitCodeOf` 包在 try/catch 里（取码失败回落 0，绝不抛新错）；`traceFragment()` `:688-699` 的判定是 `/ pipe=(\S+) stage=(\S+) err=(.*)$/` + `m[1] !== this.pipeName` 即放弃（C8）；`HostLauncher` `:46-54` 两个新成员、`createHostLauncher` `:173-178` 直接转调 `shell.isAlive` / `shell.exitCodeOf`（C5）；宿主侧 `fail()` `:104-110` 先 `writeTrace` 再发帧再退出，调用点是 `token=2`（`:122`）/ `spawn=1`（`:138`）/ **`pipe=3`**（`:185`）（C6）；`writeTrace` `:35-51` 的格式、换行压空格、>64KiB 覆盖写、写失败吞掉全部与契约逐字一致（C7）；`main()` `:195-205` 外层 try/catch → `stage='fatal'` + `exit(4)`。`winPipe` / `pipeKernel` / `stopGraceful` / 读循环 / 工厂签名 / `main.ts` 都未动（B4 = F3）。
> **偏离 1（认可）**：给了 `ql-pty-host.ts` 的 `main()` 一个 `export`（`:195` 的注释写明「只为一个可注入的测试接缝」）。契约只写「`main()` 外面包 try/catch」，但 `fatal`（退出码 4）这条路径原来**不可达**（`net.connect` 硬编码、`runCmd` 不暴露），不加这个接缝就只能删掉 E6 用例——而 E6 正是 R-18 的核心断言之一。导出不影响 `require.main === module` 的自跑判据（`:209-211` 未改），已登记 **K58**。
> **minor（deferred）**：既有那条「连上之后、READY 之前宿主就死了」的路径（`finish()` `:646-657` → `failHandshake('handshake=exit')`）**仍不带退出码、也不并留痕**——它由既有用例钉着，且本任务要修的是「等待连接」那一段（真机卡死证明宿主根本没连上）。要收口它需要单独一次改动（`finish(code)` 已有 code，改动很小），留到整分支终审一并决定。
>
> 索引：[00-index.md](00-index.md) 的 G1、G2、G5、G6、K43、K48、K51、K53、**K56**、**K57**、**K58**

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 9 已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 9 的验收提交；porcelain 干净 | ☑ |
| A2 | 全量基线（主代理实测，子代理不重跑） | `npm test` | `Test Files 51 passed (51)` / `Tests 888 passed (888)`，exit 0；本任务后用例数只增不减 | ☑（主代理 2026-10-15 15:2x 实测：51 files / 888 tests 全绿） |
| A3 | 本表引用的锚点行号属实 | 读上表点名的每一处 | 与本表引用一致 | ☑ |
| A4 | 前置接口在（签名逐字可用） | 读 `shell-execute.ts:20-21`：`isAlive(handle): boolean` / `exitCodeOf(handle): number`；`winPipe.available`（`ql-elevated.ts:317-320`）返回 `>= 0` / `-1` | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-elevated.ts` | 改：`handshake()` 的连接等待换成 50ms 异步轮询；`HostLauncher` `:45-49` 加 `isAlive` / `exitCodeOf`（`createHostLauncher` 转调 `WinShellApi`）；`handshake=exit(code=N)` 并留痕最后一行 | 不改 `winPipe` / `pipeKernel` 的任何取值（SDDL、535 判定、缓冲区、`CONNECT_POLL_MS = 50` 保留）；不改 `stopGraceful` / 读循环 / 工厂签名 `startElevatedHost(pipe, launcher, opts)` | ☑ |
| B2 | `src-main/ql-pty-host.ts` | 改：`fail()` 按 R-18 分类退出码（pipe → 3）；`main()` 外层 `try/catch` → `stage='fatal'` → `process.exit(4)`；四类失败各追加一行留痕 | 不改帧表 / 不改 `HELLO`→`READY` 流程 / 不 import electron / 不含汉字字面量（G6） | ☑ |
| B3 | `src-main/ql-elevated.test.ts`、`src-main/ql-pty-host.test.ts` | 改：新增 7 条用例（1 条新增在 C7 的合并点上），既有 19 + 6 条一字不改 | 不改既有断言的期望值；假 `HostLauncher` 夹具补两个新成员（默认 `isAlive=true`） | ☑ |
| B4 | `src-main/main.ts` | **不改**（留痕合并点在 `ElevatedPtyProcess` 内部，索引 K57）；`ql-host-protocol.ts` / `quick-launch.ts` / 词典 / `build.bat` / `electron-builder.yml` 全部不改 | 越界即不勾 | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 连接等待（非阻塞） | 轮询 `this.pipe.available(this.pipeHandle)`：`>= 0` = 客户端已连上；`-1` = 还没连上（`ERROR_PIPE_NOT_CONNECTED = 230`）→ 继续等。**等待期间不得调用 `this.pipe.connect(...)`**（那会阻塞主线程） | ☑ |
| C2 | 连上后补一次 accept | 检出已连后**补一次** `this.pipe.connect(this.pipeHandle)`（此时客户端已在，立即返回 535，`winPipe.connect` 的既有判定已接受 535） | ☑ |
| C3 | 有界 | 到 `HOST_HANDSHAKE_TIMEOUT_MS = 15000` 仍未连上 → 抛既有 `handshakeError('handshake=connect')` | ☑ |
| C4 | 宿主早退可见 | 每轮判 `this.launcher.isAlive(this.hostHandle)`；`false` → 立刻抛 `handshakeError('handshake=exit(code=' + this.launcher.exitCodeOf(this.hostHandle) + ')')`，不等满 15s | ☑ |
| C5 | `HostLauncher` 新成员 | `isAlive(handle: unknown): boolean`；`exitCodeOf(handle: unknown): number` —— `createHostLauncher` 里直接 `return shell.isAlive(handle)` / `return shell.exitCodeOf(handle)`（进程句柄本归 launcher 管） | ☑ |
| C6 | 宿主退出码 | `3` = `ERR{stage:'pipe'}` + `process.exit(3)`；`4` = 顶层 catch 的 `stage='fatal'` + `process.exit(4)`；`2`（token）/ `1`（spawn）逐字不变 | ☑ |
| C7 | 留痕行 | 追加一行到 `path.join(os.tmpdir(), 'lms-ql-host.log')`：`<ISO 时间> pid=<pid> pipe=<管道名> stage=<stage> err=<原始 message>`；message 里的换行压成空格；写入前若文件 > 64KiB 先清空。四类失败（token / spawn / pipe / fatal）都写 | ☑ |
| C8 | 留痕合并 | 抛 `handshake=exit` 前读该文件**最后一行**，仅当其中 `pipe=<本次管道名>` 才采信，把 `stage=` / `err=` 拼进**同一个** `{err}`（形如 `handshake=exit(code=3; stage=pipe err=connect EPERM)`）；文件不存在 / 无匹配行 → 只报退出码，绝不因此抛新错误 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 10 步骤 1 的 7 条） | `npx vitest run src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 新用例红（红因正确：等待里还在调阻塞 connect / 没有 exit 分支 / 退出码还是 1 / 没有留痕文件） | ☑ |
| D2 | 实现 B1 + B2 | 同上 | 全绿；既有 19 + 6 条不破 | ☑ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净、无输出 | ☑ |
| D4 | i18n 三门 | `npx vitest run src-main/i18n` | 4 files / 18 tests 全绿（本任务零新键） | ☑ |
| D5 | 全量 | `npm test` | 全绿；文件数仍 51，用例数 888 → 895（+7） | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 等待连接期间**不调用**阻塞的 `connect` | 规格 §6.5 / R-17 / K56 | `handshake_polls_without_calling_blocking_connect` | ☑ |
| E2 | 客户端一连上就被检出，且补一次 accept 并接受 535 | 规格 §6.5（probe：35ms / 535） | `handshake_detects_the_client_through_peek` | ☑ |
| E3 | 没人连时**到点**抛 `handshake=connect`（不再永久卡住） | 规格 §6.7 / §7.2-10 | `handshake_times_out_when_nobody_connects` | ☑ |
| E4 | 宿主已退出 → 立刻 `handshake=exit(code=N)`，不等满 15s | 规格 §6.6-11 / §6.10 | `handshake_fails_fast_when_the_host_died` | ☑ |
| E5 | 宿主 `pipe` 失败 = 退出码 3，且留痕文件多一行 | 规格 §6.6-10..12 / K57 | `host_pipe_failure_exits_3_and_writes_the_trace_file` | ☑ |
| E6 | 宿主未预期异常 = `stage='fatal'` + 退出码 4，且留痕 | 规格 §6.6-12 / K57 | `host_fatal_error_exits_4_and_writes_the_trace_file` | ☑ |
| E7 | 留痕只认同管道名的那一行；不匹配 / 无文件 → 只报退出码 | 规格 §6.10 / K57 | `host_trace_line_is_merged_into_the_exit_fragment` | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只用 `PROC:`（G1）；零新词典键（G2） | 索引 G1 / G2 | ☑ |
| F2 | 不改帧表 / 协议（任务 2 的 `ql-host-protocol.ts` 一行不动） | 规格 §6.5 帧表 / 索引 G3 | ☑ |
| F3 | `main.ts` 不改（合并点在 `ElevatedPtyProcess` 内） | 规格 §6.10 / 索引 K57 | ☑ |
| F4 | 宿主不 import electron、不含汉字字面量（`no-hardcoded.test.ts:26-28`） | 规格 §6.6-9 / G6 | ☑ |
| F5 | 不新增依赖、不改 `package.json`（留痕用 `node:os` / `node:path` / `node:fs`） | 索引 G7 | ☑ |
| F6 | `winPipe` / `pipeKernel` 的取值（SDDL、`PIPE_ACCESS_DUPLEX`、`nMaxInstances = 1`、535 判定）一行不改 | 规格 §6.5 / K46 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 全绿（19 + 6 + 7 = 32） | ☑ |
| G2 | 相邻回归（提权路径的调用方） | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 全绿（34 + 27） | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | 全绿；文件数不变、用例只增不减 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-elevated.ts`、`src-main/ql-pty-host.ts`、`src-main/ql-elevated.test.ts`、`src-main/ql-pty-host.test.ts` | ☑ |
| H2 | commit message 逐字 | `fix: 提权终端连接不再阻塞主线程（有界等待 + 宿主早退可见 + 失败留痕）` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B4 之外没有文件被改（`git diff --name-only` 恰好四个）
- [x] C1-C8 逐字一致
- [x] D1→D5 先红后绿
- [x] E1-E7 有对应测试且绿
- [x] G1-G5 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-0 | 主代理取证（2026-10-15 18:1x-18:3x，诊断环境） | ① 打包后的 `node.exe` 能读/能 `require` asar 里的宿主脚本（`exists=true readLen=7846 requireOk=true`），真宿主脚本以 bogus 管道名启动 → `exit=1` 且无 stderr（`Start-Process -Wait` 实测）→ **宿主脚本本身在打包态是好的**；② 管道 DACL 实测就是 `D:(A;;GA;;;WD)`（`GetSecurityInfo` rc=0 + `ConvertSDToString` len=15）；③ 卡死机制 = `ql-elevated.ts:455` 的 `while (!connect())` 在阻塞句柄上永久阻塞（\`date >= deadline\` 分支不可达）；④ 替身方案实测（主代理 probe `.temp/ql-diag/connect-alt.cjs`）：未连时 `available()=-1 / lastError=230`，客户端连上后 35ms 内 `available()=4`，`ReadFile` 读到 `PING`、`WriteFile` 回 `PONG`，事后 `ConnectNamedPipe` 返回 **535** —— C1/C2 的取值即来自这次实测 |
| J-1 | `npx vitest run src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | **红（D1，实现前把两个源文件临时 checkout 回 HEAD 后实测；实现补丁先存 `.temp/ql-task10-impl.patch`，跑完 `git apply` 还原并复测绿）**：`Test Files 2 failed (2)` / `Tests 7 failed \| 25 passed (32)`，Duration 450ms，无 60s 挂死。7 条红因逐条：① `handshake_polls_without_calling_blocking_connect` → `expected [ { fakePipe: 'p1' } ] to deeply equal []`（旧实现在等待期间就调了阻塞 `connect`）；② `handshake_detects_the_client_through_peek` → 同上；③ `handshake_times_out_when_nobody_connects` → 收到 `handshake=broken`，期望 `handshake=connect`（旧实现先连上再被读轮询判断管）；④ `handshake_fails_fast_when_the_host_died` → `expected 1792059989304 to be 1792059989284`（旧实现首轮不判 `isAlive`，settledAt 落在推进后）；⑤ `host_trace_line_is_merged_into_the_exit_fragment` → 收到 `handshake=broken`，期望 `handshake=exit(code=3; stage=pipe err=connect EPERM)`（旧实现没有 exit 分支、也没有留痕合并）；⑥ `host_pipe_failure_exits_3_and_writes_the_trace_file` → `expected [ 1 ] to deeply equal [ 3 ]`；⑦ `host_fatal_error_exits_4_and_writes_the_trace_file` → `main is not a function`。**绿（D2，实现后）**：`Test Files 2 passed (2)` / `Tests 32 passed (32)`（原 19 + 6，新 7），Duration 443ms。 |
| J-2 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | `Test Files 2 passed (2)` / `Tests 61 passed (61)`（quick-launch 34 + ipc-ql 27），含「admin:true 的 shell 条目走提权宿主」与「两条提权条目并发」两条端到端形状门。 |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0、无任何输出（`TSC_EXIT=0`）。 |
| J-4 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 / dict 11 / no-hardcoded 2 / key-coverage 2）；本任务零新词典键，`ql-pty-host.ts` 新代码纯 ASCII、不含汉字字面量。 |
| J-5 | `npm test` | `Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0 —— 文件数不变、用例数 888 → 895（+7，只增不减）。 |
