# 任务 10 · 真机缺陷修复（连接不阻塞 + 宿主早退可见 + 失败留痕）— 子代理执行报告

> 执行范围：plan 任务 10 步骤 0-5 的代码与测试；spec §6.5 / §6.6-10..12 / §6.7 / §6.10 / §7.2-10 / §9-R9；check 表 task-10 的 C1-C8 / E1-E7。
> 边界（遵派单）：不 `git add`、不 commit；只改 B 段四个文件；不落 check 表 A-I 段的勾（只填 J-1..J-5）；不派子代理；未请求 `sandbox_permissions`。
> 缺陷来源：2026-10-15 18:0x 用户真机回报（[命令行] + 管理员：UAC 点「是」后不出页签、**应用卡死无响应**）。

## 0 状态

**DONE_WITH_CONCERNS** —— C1-C8 逐字实现，E1-E7 全部有守测试且绿，G1-G5 全绿；唯一超出逐字契约的改动是 `src-main/ql-pty-host.ts` 给 `main()` 加了 `export`（做 `stage='fatal'` 的测试接缝，见 §5），请主代理验收时确认是否接受。

| 项 | 结果 |
|---|---|
| B1 `src-main/ql-elevated.ts` | 已改：非阻塞 `PeekNamedPipe` 轮询 + `isAlive/exitCodeOf` + 留痕合并 |
| B2 `src-main/ql-pty-host.ts` | 已改：`pipe` → 退出码 3、顶层 `fatal` → 4、四类失败各追加一行留痕 |
| B3 测试 | 新增 7 条（elevated 4 + host 3）；既有 19 + 6 条断言一字未改；假 `HostLauncher` 补 `isAlive/exitCodeOf`（默认 `true/0`） |
| G5 收尾门 | `npx tsc --noEmit -p tsconfig.main.json` 干净；定向 32/32；相邻 61/61；i18n 4 files/18 tests；全量 51 files / 895 tests |
| 工作区 | `git status --porcelain` = 四个文件均为 `M`；未 add、未 commit |

起点核对：`git log --oneline -1` = `fa2c6ff docs: 任务 10 —— 提权终端连接不阻塞（R-17/K56）+ 宿主失败可见与留痕（R-18/K57）`；`git status --porcelain` 起点为空（干净）；分支 `feat/quick-launch-admin`。

## 1 改动文件与真实行号

### B1 `src-main/ql-elevated.ts`

- `:10` 新增 `import * as os from 'node:os';`（留痕合并读 `os.tmpdir()`，G7：不新增依赖）。
- `:51` / `:53`：`HostLauncher` 新增 `isAlive(handle: unknown): boolean` / `exitCodeOf(handle: unknown): number`（C5 逐字）。
- `:173-178`：`createHostLauncher` 直接 `return shell.isAlive(handle)` / `return shell.exitCodeOf(handle)`（转调注入的 `WinShellApi`）。
- `:394`：新增 `const HOST_TRACE_FILE = 'lms-ql-host.log';`（C7/C8 的路径尾名）。
- `:418`：类字段 `private readonly launcher: HostLauncher;`；`:422`：`private readonly pipeName: string;`（C8 只认本次管道名）。
- `:441` / `:463`：构造函数保存 `this.launcher` / `this.pipeName = started.pipeName`。
- `:471-489`：`handshake()` 的连接等待改为 `for (;;)` + `this.pipe.available(this.pipeHandle) >= 0` 判已连（`:478-484`，检出后**补一次** `this.pipe.connect(...)` 不取返回值）；`:486` 每轮判 `!this.launcher.isAlive(this.hostHandle)` → 立刻抛 `handshake=exit`；`:487` 到 `HOST_HANDSHAKE_TIMEOUT_MS` 抛 `handshake=connect`；`:488` `await sleep(CONNECT_POLL_MS)`。**等待期间不再调用阻塞 connect 去等**。
- `:673-681`：`hostExitReason()` → `'handshake=exit(code=' + code + this.traceFragment() + ')'`（取码失败回落 0，绝不抛新错）。
- `:688-699`：`traceFragment()` → 真读 `path.join(os.tmpdir(), 'lms-ql-host.log')` 的**最后一行**，用 `/ pipe=(\S+) stage=(\S+) err=(.*)$/` 解析，仅当 `pipe=` 等于本次 `pipeName` 才返回 `'; stage=' + stage + ' err=' + err`；其余（无文件 / 读失败 / 无匹配）返回空串（try/catch 全包）。

**未动**：`winPipe` / `pipeKernel` 的全部取值（SDDL / `PIPE_ACCESS_DUPLEX = 0x03` / `PIPE_MAX_INSTANCES = 1` / 缓冲 / `CONNECT_POLL_MS = 50` / 535 判定）、`stopGraceful`、`pollRead`、`adoptHostHandle`、工厂签名 `startElevatedHost(pipe, launcher, opts)`。

### B2 `src-main/ql-pty-host.ts`

- `:10-13` 新增 `import * as fs / net / os / path`（G7：只用 node 内置）。
- `:26-27`：`HOST_TRACE_FILE = 'lms-ql-host.log'`、`HOST_TRACE_MAX_BYTES = 64 * 1024`。
- `:35-51`：`writeTrace(pipeName, stage, message)` —— `path.join(os.tmpdir(), HOST_TRACE_FILE)`；`> 64KiB` 时 `fs.writeFileSync` 覆盖、否则 `fs.appendFileSync`；行格式 `<ISO 时间> pid=<pid> pipe=<管道名> stage=<stage> err=<原始 message>` 加换行，`message.replace(/\r?\n/g, ' ')` 压换行；整段 try/catch 吞掉写失败。
- `:104-110`：`fail()` 先 `writeTrace(pipeName, stage, message)`，再发 `ERR`，再 `process.exit(code)`（四类都经过它：token 2 / spawn 1 / pipe 3）。
- `:181-186`：`socket.on('error')` 的 `fail('pipe', messageOf(err), 3)`（原来 1）。
- `:189-206`：`main()` 外层 try/catch → 未预期异常 `writeTrace(argv[0] ?? '', 'fatal', messageOf(err))` + `process.exit(4)`；`main` 加了 `export`（§5 偏离 1）。帧表 / `HELLO→READY` 流程 / `STOP` 语义未动；不 import electron；新增代码纯 ASCII。

### B3 测试

- `src-main/ql-elevated.test.ts`：`:66` 假 `HostLauncher` 补 `isAlive/exitCodeOf`；`:380` `writeTraceLine`、`:388` `withTraceDir`（TEMP/TMP/TMPDIR 指到独占目录，跑完还原并删）；新用例 `:637 handshake_polls_without_calling_blocking_connect`、`:665 handshake_detects_the_client_through_peek`、`:695 handshake_times_out_when_nobody_connects`、`:724 handshake_fails_fast_when_the_host_died`、`:761 host_trace_line_is_merged_into_the_exit_fragment`。
- `src-main/ql-pty-host.test.ts`：`:48` 新增 `vi.mock('node:net', ...)`（把 `connect` 换成抛，制造 `fatal`）；`:184` `lastTraceLine()`；`:189-216` `beforeEach/afterEach` 里把 TEMP/TMP/TMPDIR 指到 `mkdtempSync` 独占目录并清理；新用例 `:337 host_pipe_failure_exits_3_and_writes_the_trace_file`、`:351 host_fatal_error_exits_4_and_writes_the_trace_file`。

### B4 不改

`src-main/main.ts`（合并点在 `ElevatedPtyProcess` 内）、`ql-host-protocol.ts`、`quick-launch.ts`、词典、`build.bat`、`electron-builder.yml` 全部未动。`git diff --name-only` 恰好四个文件。既有 19 + 6 条断言一字未改。

## 2 TDD 每步命令与真实输出

### D1 先红

命令：`npx vitest run src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts`（实现前；为取干净的红，先把两个源文件临时 `git checkout HEAD --`，实现补丁存 `.temp/ql-task10-impl.patch`，跑完 `git apply` 还原并复测绿）。

真实输出：`Test Files 2 failed (2)` / `Tests 7 failed | 25 passed (32)`，`Duration 450ms`（无 60s 挂死）。7 条红因：

| # | 用例 | 红因（真实输出） |
|---|---|---|
| 1 | `handshake_polls_without_calling_blocking_connect` | `expected [ { fakePipe: 'p1' } ] to deeply equal []` —— 旧实现在等待期间就调了阻塞 `connect` |
| 2 | `handshake_detects_the_client_through_peek` | 同上（旧实现在检出前就 `connect`） |
| 3 | `handshake_times_out_when_nobody_connects` | `expected 'PROC: cmd 终端启动失败: handshake=broken' to contain '... handshake=connect'` —— 旧实现先连上、再被读轮询判断管 |
| 4 | `handshake_fails_fast_when_the_host_died` | `expected 1792059989304 to be 1792059989284` —— 旧实现首轮不判 `isAlive`，settledAt 落在推进之后 |
| 5 | `host_trace_line_is_merged_into_the_exit_fragment` | `expected 'PROC: ... handshake=broken' to contain '... handshake=exit(code=3; st...'` —— 旧实现没有 exit 分支、也没有留痕合并 |
| 6 | `host_pipe_failure_exits_3_and_writes_the_trace_file` | `expected [ 1 ] to deeply equal [ 3 ]` |
| 7 | `host_fatal_error_exits_4_and_writes_the_trace_file` | `main is not a function`（旧文件没有导出 `main`，也没有顶层 catch） |

（首次红跑时 `handshake_fails_fast_when_the_host_died` 曾以 `Test timed out in 60000ms` 收场 —— 旧实现确实没有任何早退分支；随后把该用例改成「先推 0ms 冲微任务、再推 15.1s 让红以契约失败收场」，红变成 1ms 内的断言失败，绿仍是首轮落地。）

### D2 跑绿

`Test Files 2 passed (2)` / `Tests 32 passed (32)`（19 + 6 + 7），`Duration 437ms`，exit 0。

### D3 类型门

`npx tsc --noEmit -p tsconfig.main.json` → 无输出，exit 0（打印 `TSC_EXIT=0`）。

### D4 i18n 三门

`npx vitest run src-main/i18n` → `Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 / dict 11 / no-hardcoded 2 / key-coverage 2）。

### G2 相邻回归

`npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` → `Test Files 2 passed (2)` / `Tests 61 passed (61)`（34 + 27），含「admin:true 的 shell 条目走提权宿主」与「两条提权条目并发」两条端到端形状门。

### G5 全量

`npm test` → `Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0。文件数不变、用例数 888 → 895（+7，只增不减）。撤掉临时仪器化后复跑仍 895。

## 3 留痕文件三种情形 + 两类宿主留痕的取证

留痕是真写文件：宿主侧 `writeTrace` 用 `fs.appendFileSync` 真追加；主进程侧 `traceFragment` 用 `fs.readFileSync` 真读；测试用 `os.tmpdir()`（把 TEMP/TMP/TMPDIR 指到 `mkdtempSync` 的独占目录，跑完还原并删除）。以下为仪器化单次跑（临时加 `console.log` 打印后即撤除，复跑仍 32/32）捕获的真实内容。

宿主两类失败（`ql-pty-host.test.ts`，`PIPE = \\.\pipe\lms-ql-1a2b3c4d`）：

- pipe 失败（`socket.emit('error', new Error('connect EPERM'))`，退出码 3）：文件内容一行 = `2026-10-15T10:27:35.726Z pid=12012 pipe=\\.\\pipe\\lms-ql-1a2b3c4d stage=pipe err=connect EPERM`，结尾换行。
- fatal（mock 的 `net.connect` 抛 `socket boom`，退出码 4）：文件内容一行 = `2026-10-15T10:27:35.732Z pid=12012 pipe=\\.\\pipe\\lms-ql-1a2b3c4d stage=fatal err=socket boom`，结尾换行。

合并点三种情形（`ql-elevated.test.ts > host_trace_line_is_merged_into_the_exit_fragment`，`exitCodeOf = 3`）：

| 情形 | 留痕文件最后一行 | 抛出的 `{err}`（真实） |
|---|---|---|
| ① `pipe=` 匹配 | `2026-10-15T10:00:00.000Z pid=4321 pipe=\\.\\pipe\\lms-ql-79e06f5b stage=pipe err=connect EPERM` | `PROC: cmd 终端启动失败: handshake=exit(code=3; stage=pipe err=connect EPERM)` |
| ② `pipe=` 不匹配 | `... pipe=\\.\\pipe\\lms-ql-deadbeef stage=pipe err=connect EPERM` | `PROC: cmd 终端启动失败: handshake=exit(code=3)`（无 `stage=`） |
| ③ 文件不存在 | （无） | `PROC: cmd 终端启动失败: handshake=exit(code=3)`（无 `stage=`，也未抛新错） |

即 §6.10 / K57 的形状 `handshake=exit(code=3; stage=pipe err=connect EPERM)` 逐字命中；②③ 只报退出码。

## 4 全量最终计数

- `npm test`：`Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0（基线 888 + 新增 7）。
- 定向：32/32 = `ql-elevated.test.ts` 24（第一段 8 + 第二段 16，其中新 5）+ `ql-pty-host.test.ts` 8（原 6 + 新 2）。
- 相邻 61/61；类型门干净；i18n 4 files / 18 tests。

## 5 偏离与理由

1. **`ql-pty-host.ts` 的 `main()` 加了 `export`**。契约 B2 只写「`main()` 外面包 try/catch」，没说导出；但 plan 步骤 1 要求用例 `host_fatal_error_exits_4_and_writes_the_trace_file` 能走到顶层 catch，而 `main` 原来不可达（`runHost` 只暴露装配，`net.connect` 是 main 内硬编码）。加 `export` 是唯一不引入新参数、不改生产装配的最小测试接缝；`require.main === module` 的自跑守卫和导出互不影响。请主代理确认接受；若不接受，替代方案是把 `deps` 注入 `main`（改动更大）或删掉该条用例（会丢 E6/C6 的守测试）。
2. **测试用 TEMP/TMP/TMPDIR 隔离留痕文件**。契约要求「真写文件（用 `os.tmpdir()`，跑完清理）」；被测代码仍按 `path.join(os.tmpdir(), 'lms-ql-host.log')` 取路径，测试只是把 `os.tmpdir()` 在用例内指到 `mkdtempSync` 的独占目录（`os.tmpdir()` 每次调用都读环境变量，已实测），从而不与并行跑的其它测试文件抢同一个 `%TEMP%\lms-ql-host.log`，跑完还原并删目录。host 侧新增的 `beforeEach` 里加了 mkdtemp + 环境变量指向、`afterEach` 里加了还原 + 删除；这是测试夹具改动，不是行为断言改动。
3. 真实行号与 check 表「现状锚点」有少量偏移（`handshake()` 从 `:452` 到 `:471`、`main()` 从 `:154` 到 `:195` 等），是新增 import / 常量 / 字段引起的整体顺移，非语义偏离。

## 6 疑虑

1. **并发留痕只认最后一行**（spec C8 的设计本意）：若两条提权条目几乎同时失败、且另一条的宿主在本次读取前刚追加了一行，`traceFragment` 会因 `pipe=` 不匹配而只报退出码、丢掉本次 `stage/err`。这是 K57 明写的口径（只读最后一行 + 必须匹配管道名），不是实现缺陷；真机门 §7.2-10 若在并发场景下发现信息缺失，需另立案改「按 pipe 扫全文件」。
2. **fatal 只写留痕、不发 ERR 帧**：`main()` 的顶层 catch 里没有 socket 引用，spec §6.6-12 也只要求「记 stage='fatal' → exit(4)」；主进程侧靠退出码 4 + 留痕拿到 `stage=fatal`。若主代理认为还应在 catch 里尝试发 ERR，需要另给接缝（当前实现按 spec 逐字）。
3. 真机端到端仍未跑（本环境 `dist-release\win-unpacked\node.exe` 以 Low 完整性级别运行、连不上 Medium 命名管道，且派单明说不要真管道 e2e）；本任务只保证假接缝下的契约，§7.2-10 的真机回落需用户在同一构建里验收。
