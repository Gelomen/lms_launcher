# 任务 4 报告 · 主进程侧的命名管道与起宿主（`ql-elevated.ts` 第一段）

> 派单：主代理（2026-10-14 22:4x，起点 HEAD `aa8c4a8`）· 分支 `feat/quick-launch-admin`
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-04-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-04-pipe-and-launch-host.md` + 规格 §6.4 / §6.5 / §6.7 / §6.10 + 取证 `.temp/ql-admin-probe/probe9.mjs`、`child9.cjs`
> 本表 A-I 段的勾**未落**（按 G8：验收归主代理）；J 段按派单要求填真实命令与真实输出（J-1…J-9）。

## 1 状态

**DONE_WITH_CONCERNS** —— 功能与门都过了，两条需要主代理裁决的疑虑在 §6。未 `git add`、未 commit（G8）；改动只落在 B 段两个文件（G9）。

| 门 | 命令 | 结果 |
|---|---|---|
| 定向 G1 | `npx vitest run src-main/ql-elevated.test.ts` | `Test Files 1 passed (1)` / `Tests 8 passed (8)`、exit 0 |
| 相邻回归 G2 | `npx vitest run src-main/shell-execute.test.ts` | `Tests 10 passed (10)`、exit 0；`git diff --stat` 该两文件 = 空输出（未改） |
| 类型门 G3（R-01 / K27） | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、exit 0 |
| i18n G4 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0 |
| 全量 G5 | `npm test` | `Test Files 50 passed (50)` / `Tests 855 passed (855)`、`Duration 10.40s`、exit 0 |
| 本机冒烟 D3 | `node .temp/ql-admin-probe/probe9.mjs` | **本会话进程树里跑不通**（子进程 EPERM，见 §6 疑虑 1）；同一条父侧路径的两个变体全绿：`probe9b.mjs`（换客户端）与 `probe18.cjs`（**用本任务的真实现**跑真管道，见 J-7） |

计数只增不减：起点 49 份 / 847 条 → 现在 **50 份 / 855 条**（+1 份 / +8 条，全在 `src-main/ql-elevated.test.ts`）。

## 2 改动文件与真实行号（改后实测行号）

### `src-main/ql-elevated.ts`（新建，362 行）

| 位置 | 内容 |
|---|---|
| `:15-31` | §6.5 的取值常量：`PIPE_SDDL = 'D:(A;;GA;;;WD)'`、`SDDL_REVISION_1 = 1`、`PIPE_ACCESS_DUPLEX = 0x00000003`、`PIPE_MODE_BYTE = 0`、`PIPE_MAX_INSTANCES = 1`、`PIPE_BUFFER_BYTES = 65536`、`PIPE_DEFAULT_TIMEOUT_MS = 0`、`ERROR_PIPE_CONNECTED = 535`、`SW_HIDE = 0`、`ERROR_CANCELLED = 1223`、`PIPE_NAME_PREFIX`、`INVALID_HANDLE_VALUE = 0xFFFFFFFFFFFFFFFFn`、`HOST_EXE_NAME = 'node.exe'`、`HOST_SCRIPT_NAME = 'ql-pty-host.js'` |
| `:33-40` | `export interface WinPipeApi` —— 逐字 = C1（六个方法、参数名、返回类型、行尾注释都按 plan 签名块） |
| `:43-47` | `export interface HostLauncher` —— 逐字 = C2 |
| `:54-73` | `export interface PipeKernel` —— **新增的内部接缝**（见 §5 偏离 1）：把 Win32 的原始形状收在一层，好让 C3 的取值能在不碰 koffi、不建真管道的单测里被逐字钉住 |
| `:75-79` | `export interface HostPaths` —— 宿主路径的可替换来源（单测在临时目录真跑硬链接解析） |
| `:81-93` | `export interface HostStart` —— `startHost` 的结果（`ok` / `stage` / `win32Error` / `pipeName` / `token` / 两个句柄） |
| `:95-98` | `export function newPipeName(): string` = `\\.\pipe\lms-ql-` + `randomBytes(4).toString('hex')`（8 位十六进制，§6.5） |
| `:105-112` | `export function hostStartError(win32Error: number, userTarget: string): Error` —— 逐字 = C6（裁决 R-07 / 索引 K35）：`1223` → `PROC: t('err.proc.uacCancelled', { exe: userTarget })`；其它 → `PROC: t('err.proc.spawnFail', { exe: userTarget, err: 'win32=' + win32Error })`。零新词典键 |
| `:113-122` | `errnoOf()`：把 `NodeJS.ErrnoException.code` 取成 §6.10 第三行的 `{err}` 片段 |
| `:125-152` | `export function resolveHostLink(srcExe, dir)` —— C5：`fs.linkSync`；已存在则只有 `size` 与源文件相同才复用；不同 → `hostlink=size-mismatch`，**不覆盖、不删除**别人的文件；`linkSync` 失败 → `hostlink=<errno>` |
| `:155-175` | `export function createHostLauncher(shell, paths?)` —— C4：`shell.shellExecute(exe, 0, { verb: 'runas', parameters: '"<脚本>" "<管道名>" "<token>"' })`，**不借道 `launchShellExe`**（索引 K34）；`hostScriptPath()` = `path.join(__dirname, 'ql-pty-host.js')`；`launch()` 失败时把 Shell 交回的进程句柄关掉（E4 的一半） |
| `:177` | `export const hostLauncher: HostLauncher = createHostLauncher(winShell)` —— 生产侧接缝，与 `winShell` 同一手法 |
| `:179-233` | `interface PipeBindings` + 惰性 `bind()`：`CreateNamedPipeW` / `ConvertStringSecurityDescriptorToSecurityDescriptorW` / `ConnectNamedPipe` / `PeekNamedPipe` / `ReadFile` / `WriteFile`（形参 `uint8 *lpBuffer`，F2）/ `CloseHandle` / `LocalFree` / `GetLastError`；结构体先 `koffi.struct('QL_PIPE_SECURITY_ATTRIBUTES', …)` 命名再在签名里用指针（F1），名字与 `shell-execute.ts` 的 `SHELLEXECUTEINFOW` 不同，两个模块可在同进程各自绑定 |
| `:227-233` | `invalidHandle()` —— **实测出来的坑**：koffi 把 `void *` 交回 BigInt，失败是 `18446744073709551615n`（J-9），只判 `null` 会把失败句柄当有效句柄 |
| `:235-300` | `export const pipeKernel: PipeKernel` —— 真 koffi 层；`createNamedPipe` 里 `nLength = koffi.sizeof(SA)`（x64 = 24）、`bInheritHandle = 0`（§6.5） |
| `:302-337` | `export const winPipe: WinPipeApi` —— §6.5 的取值固定在这里；`connect()` 把 535 判成功；`available()` 失败交 `-1`；`createServer()` 在 SDDL 转换失败时**不建管道**，并在 `CreateNamedPipeW` 之后 `LocalFree` 掉 SD |
| `:339-362` | `export function startHost(pipe, launcher)` —— §6.7 的前半段：`newPipeName()` + token → `createServer` → `hostExePath()`/`hostScriptPath()` → `launch()`；三条失败路径都不留管道句柄（E4 / RF4），`win32Error` 原样交出去、不带文案（R-07） |

**不含**（B1 边界）：`ElevatedPtyProcess`（任务 6）、`launch()` / `startHost()` 里的任何 i18n 文案（文案只在 `hostStartError` 一处）、帧协议（任务 2 的 `ql-host-protocol.ts` 原样可用，本文件不重复实现）。

### `src-main/ql-elevated.test.ts`（新建，247 行，8 条）

| 位置 | 用例 | 守 |
|---|---|---|
| `:87-118` | `server_is_created_with_the_sddl_descriptor`（plan 逐字） | E1 / C3：假 `pipeKernel` 收到的实参逐字 = `'D:(A;;GA;;;WD)'` 与 `[PIPE_NAME, 3, 0, 1, 65536, 65536, 0, SD]`；SDDL 转换失败 → 不建管道 |
| `:120-134` | `launch_passes_runas_and_three_quoted_arguments`（plan 逐字） | E2 / C4：`shellExecute` 收到 `(HOST_EXE, 0, { verb: 'runas', parameters: '"脚本" "管道名" "token"' })`，脚本路径含空格；另钉 `hostScriptPath()` = `path.join(__dirname, 'ql-pty-host.js')`（C2） |
| `:137-173` | `host_exe_resolution_reuses_an_existing_link_only_when_size_matches`（plan 逐字） | E3 / C5：`fs.mkdtempSync` + 真 `linkSync`/`statSync` 四段 —— 新建（同 inode）、复用（size 相同、不重建）、`hostlink=size-mismatch`（别人的文件不动）、`hostlink=ENOENT` |
| `:175-200` | `launch_failures_close_both_handles`（plan 逐字） | E4 / RF4：`startHost` 在 `launch` 失败时关掉管道句柄、`launch` 关掉进程句柄（`closed` 数组逐字 `[PIPE_HANDLE]` / `[HOST_HANDLE]`）；路径解析失败时也只关管道句柄并把异常原样向上交，且不去起进程 |
| `:202-211` | `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target`（plan 逐字） | E5 / C6：`/^PROC: /` + `t('err.proc.uacCancelled', { exe: 'cmd' })` + `not.toContain('node.exe')`；另一断言 `t('err.proc.spawnFail', { exe, err: 'win32=2' })` |
| `:213-219` | `pipe_name_matches_the_documented_shape`（**新增**） | C1 / §6.5：`/^\\\\\.\\pipe\\lms-ql-[0-9a-f]{8}$/` 且两次调用不同名（§9-R8 每实例一条） |
| `:221-232` | `connect_treats_error_pipe_connected_as_success`（**新增**） | C1 的「535 也算成功」（J-9 实测到 535 的真实形状） |
| `:234-246` | `real_koffi_converts_the_sddl_descriptor_without_a_pipe`（**新增**） | F1 / F2 的绑定可用性：真 `ConvertStringSecurityDescriptorToSecurityDescriptorW` 成功 + `LocalFree` 成功；非法 SDDL → `null`；`createNamedPipe('', …)` → `null`（失败句柄是 BigInt，见 `invalidHandle`）。空名字不产生任何管道对象，仍在 check B2 的边界内 |

假接缝：`fakePipe()`（`:36-50`，`close` 记录句柄）、`fakeShell()`（`:53-71`，`shellExecute` 记录**完整实参数组**）、`withKernel()`（`:74-85`，临时替换 `pipeKernel` 的属性并还原）。真跑的只有：硬链接解析（临时目录）、`pipeKernel.securityDescriptor` / `freeDescriptor` / `createNamedPipe('')` 三条不产生管道/进程的 FFI。**没有**真起提权进程、**没有**真建管道（check B2）。

## 3 TDD 每步：命令与真实输出

### D1 先写失败测试 → 红（23:00:53）

`npx vitest run src-main/ql-elevated.test.ts`

```
 ❯ src-main/ql-elevated.test.ts (0 test)
 FAIL  src-main/ql-elevated.test.ts [ src-main/ql-elevated.test.ts ]
Error: Failed to load url ./ql-elevated (resolved id: ./ql-elevated) in D:/Dev/Projects/lms_launcher/src-main/ql-elevated.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

红的原因正确：实现文件还不存在（不是断言写错）。

### D2 实现 koffi 绑定 + 真实现 → 绿（23:04:48，8 条）

```
 ✓ src-main/ql-elevated.test.ts (8 tests) 67ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

中途一次真实修正（不是猜的）：`createNamedPipe` 起初只判 `h === null`，J-9 的探针显示失败时 koffi 交回 `18446744073709551615n`（BigInt 的 `INVALID_HANDLE_VALUE`），于是加 `invalidHandle()`（`:227`）并补了 `createNamedPipe('', …) → null` 的断言（`:244-246`）。改后重跑仍 8 条全绿（23:11:31）。

### D3 本机冒烟（真管道，不提权）

`node .temp/ql-admin-probe/probe9.mjs` —— **在本会话的进程树里跑不通**（两次到 120s 被中止）：

```
pipe \\.\pipe\lms-p9-bavqgc handle 716n lastErr 0
child pid 7336
（之后无输出：子进程连管道 EPERM，父进程卡在阻塞式 ConnectNamedPipe）
```

诊断（J-9，`probe15/16/17`）：管道与 SDDL 都没问题 —— 同进程客户端 `[self] CONNECTED`、系统 node 子进程 `CONNECTED try=0`、`ConnectNamedPipe ok false lastErr 535`；而**硬链接 electron-as-node 子进程**对「带 SDDL」和「默认 DACL」两条管道都是 `ERR EPERM`。即：与本任务的代码和 §6.5 的取值无关，是本会话进程树对 Electron 27 libuv 打开命名管道的限制（规格 P10 是真机跑通过的）。

两条补证（都跑通）：

1. `node .temp/ql-admin-probe/probe9b.mjs`（与 probe9 逐字相同，只把子进程换成 `process.execPath`）：
```
connected after 33 ms lastErr 0
WriteFile type=0x1 ok true written 101 lastErr 0
frames after HELLO: [{"type":"0x81","payload":"host-pid=17664"},{"type":"0x82","payload":"hello-from-host"}]
WriteFile type=0x2 ok true written 7 lastErr 0
WriteFile type=0x4 ok true written 22 lastErr 0
all frames: [{"type":"0x81"...},{"type":"0x82"...},{"type":"0x82","payload":"echo:ls"},{"type":"0x83","payload":"{\"code\":0}"}]
child exit {"c":7,"s":null}
```
2. `node .temp/ql-admin-probe/probe18.cjs`（**用本任务的真实现**：`npx esbuild src-main/ql-elevated.ts --bundle --platform=node --format=cjs --external:koffi --outfile=.temp/ql-admin-probe/ql-elevated.cjs` 打包后跑真管道 + 真客户端）：
```
newPipeName -> \\.\pipe\lms-ql-5a4c26a5 shape ok true
winPipe.createServer handle 180n
winPipe.connect true after 33 ms
write HELLO ok true / write WRITE ok true / write STOP ok true
all frames: [0x81 host-pid, 0x82 hello-from-host, 0x82 echo:ls, 0x83 {"code":0}]
child exit {"c":7,"s":null}
available after close -> -1
hostStartError(1223, cmd) -> PROC: cmd 已取消管理员权限请求
hostStartError(2, cmd) -> PROC: cmd 启动失败: win32=2
```
（后两行是 `t()` 从词典取出的文案，源文件里没有汉字字面量 —— G6 由 `npx vitest run src-main/i18n` 守，见 J-5。）

另外 `node .temp/ql-admin-probe/probe19.cjs` 在**真 `electron.exe`（176,813,568 B）**上验了 C5：新建硬链接 0ms、同 inode、`nlink` 不增（复用）、`hostlink=size-mismatch` 时别人的文件不动，跑完清理（J-8）。

### D4 类型门 + 全量

```
# G3 类型门（23:11:2x）
 npx tsc --noEmit -p tsconfig.main.json  →  无诊断，exit 0

# G4 i18n 三门（23:11:48）
 ✓ src-main/i18n/index.test.ts (3 tests)      ✓ src-main/i18n/no-hardcoded.test.ts (2 tests)
 ✓ src-main/i18n/dict.test.ts (11 tests)      ✓ src-main/i18n/key-coverage.test.ts (2 tests)
 Test Files  4 passed (4) / Tests 18 passed (18)

# G2 相邻回归（23:12:12）
 ✓ src-main/shell-execute.test.ts (10 tests) 2453ms
 Test Files  1 passed (1) / Tests 10 passed (10)

# G5 全量（23:11:58）
 Test Files  50 passed (50)
      Tests  855 passed (855)
   Duration  10.40s
```

工作区状态（`git status --porcelain`，23:12:2x）：`?? src-main/ql-elevated.ts`、`?? src-main/ql-elevated.test.ts`，另有一条**派单前就有**的 ` M .superpowers/sdd/2026-10-14-quick-launch-admin/progress.md`（不是本任务改的）。`git diff --stat -- src-main/shell-execute.ts src-main/shell-execute.test.ts` 空输出。未 `git add`、未 commit（G8）。

## 4 E 段（必须钉住的断言）落点

| # | 断言 | 守测试 | 结果 |
|---|---|---|---|
| E1 | 服务端带 SDDL（假接缝收到逐字串） | `server_is_created_with_the_sddl_descriptor` | 绿；另证：真 `ConvertSDDL` 成功（`sizeUsed 48`）与真管道被客户端连上（J-7/J-9） |
| E2 | `runas` + 三个带引号参数 | `launch_passes_runas_and_three_quoted_arguments` | 绿（`nShow=0`、`verb='runas'`、`parameters` 逐字） |
| E3 | 已存在的 `node.exe` 只在 size 相符时才用 | `host_exe_resolution_reuses_an_existing_link_only_when_size_matches` | 绿（临时目录真跑）+ J-8 真 `electron.exe` |
| E4 | 启动失败关闭管道句柄与进程句柄 | `launch_failures_close_both_handles` | 绿（两个 `closed` 数组逐字） |
| E5 | `win32=1223` → `err.proc.uacCancelled`，`{exe}` 是用户目标 | `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target` | 绿 + J-7 的真实文案输出 |
| E6 | 读侧只用 `available()` 判断后才 `read()` | `read_polling_uses_available_not_blocking_read` | **本任务守不了**：该用例名在 plan 任务 6 步骤 1（`ElevatedPtyProcess` 的读循环，B1 边界外）。本任务只把契约备好：`available()` 只读可读字节数、`read(h, n)` 只读已判可读的 n 字节（`:302-337` 的注释写明），J-7 的冒烟按这个顺序真跑过一遍 |

## 5 偏离与理由

1. **多一个内部接缝 `PipeKernel`（`:54-73`）与 `createHostLauncher` / `hostLauncher` / `winPipe` / `resolveHostLink` / `startHost` / `invalidHandle` 等导出**。plan 的签名块只有 `WinPipeApi` + `HostLauncher` + `newPipeName`。理由：(a) check E1 要求「假接缝收到逐字 SDDL 串」、C3 要求逐字钉住 `dwOpenMode=3 / nMaxInstances=1 / 64KiB×2 / nDefaultTimeOut=0` —— 若只有一层 `WinPipeApi`，这些取值落在真实现内部，单测无从观察（`WinPipeApi` 的形参里没有它们）；(b) check E4 的守测试名在**本任务**，而「两个句柄都关」需要一个把两个接缝接起来的函数，`HostLauncher.launch` 自己管不到管道句柄；(c) `winPipe` / `hostLauncher` 必须导出，任务 6/7 才接得上（与 `winShell` 同理）。`startHost` 只做 §6.7 的前半段（建管道 + 起宿主），等连接 / HELLO / READY 与握手超时留给任务 6。
2. **测试 8 条 > plan 的 5 条**。plan 的 5 条逐字保留、名字未改；新增 3 条分别守 C1 的管道名形状与 535、守 F1/F2 的真绑定可用性与失败句柄形状。理由：C1/C3/F1/F2 都在本表的 C/F 段，而 plan 的 5 条不覆盖它们；且真 koffi 层若完全没有一条自动化门，本任务的「真实现」就只能靠人工冒烟背书。用例数只增不减（G5 计数已核对）。
3. **`resolveHostLink` 抛的 message 是 `hostlink=<errno>`，不带 `PROC:` 前缀**。§6.10 第三行的 `{err}` 逐字就是 `'hostlink=' + reason`，而 B1 边界要求第一段不含文案；所以这里只交机器可读片段，由任务 6 拼成 `PROC: t('err.proc.spawnFail', { exe, err: <该 message> })`。G1 的「只出 `PROC:`」在日志边界上成立。
4. **`startHost` 在 `stage='pipe'` 时 `win32Error` 固定 0**。C1 的 `createServer` 只交句柄或 `null`，没有错误码通道；规格 §6.10 也没有「建管道失败」这一行。见 §6 疑虑 2。
5. **`available()` 失败交 `-1`、`read()` 失败交空 Buffer**。C1 把 `available` 定成 `number`、`read` 定成 `Buffer`，没有错误通道；断管（`ERROR_BROKEN_PIPE=109`）与「没有数据」必须可分，否则任务 6 的读循环退不出。契约写在 `:302-310` 的注释里。见 §6 疑虑 4。
6. **`createServer` 在 SDDL 转换失败时不建管道**（而不是退化成「没有 SD 的管道」）。P10/P12 证过：不给 SD，提权客户端连不上 —— 静默退化比失败更难查。
7. **D3 的 `probe9.mjs` 在本会话跑不通**，改用 `probe9b.mjs`（换客户端）+ `probe18.cjs`（用真实现跑真管道）补证，原始输出如实贴在 J-2/J-9。没有改 `probe9.mjs` 本身（取证参考保持原样）。
8. **新增 `LocalFree`（`freeDescriptor`）**：`ConvertStringSecurityDescriptorToSecurityDescriptorW` 交回的 SD 在 `CreateNamedPipeW` 之后释放，不留每实例泄漏。plan 的绑定清单没列它，属于「不留泄漏」的直接要求。
9. **B 段之外只动了一处，且是格式修复**：check 表 C 段的 `C6` 行里有一个字面的 `\n`（主代理登记 R-07 时留下的），把 `C6` 与 `C5` 挤在同一行 → 该表列数破损（`node` 数 6 与 11 混在一组）。已把它换成真换行，两行各 4 列；`node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` 仍 exit 0（`task-04-pipe-and-launch-host.md ☑=1 裸☐=33 I段 -[ ]=7 H2=未提交` —— A-I 的勾按派单留给主代理）。除这一处外未碰 spec / plan / 其它 check 表 / 索引。

## 6 疑虑（请主代理裁决）

1. **本会话进程树里，硬链接 electron-as-node 子进程打开命名管道一律 `EPERM`**（带 SDDL 与默认 DACL 都一样；同进程与系统 node 子进程都连得上）。规格 P10 是真机跑通的，所以这不是代码缺陷，但**任务 7/8 若要在 DSH 沙箱里跑真管道冒烟会撞同一堵墙** —— 建议要么在真机（非沙箱）跑那条门，要么在索引 K 组登记一条口径：沙箱内的管道冒烟用 `process.execPath` 作客户端。
2. **§6.10 缺「建管道失败」这一行**：`CreateNamedPipeW` / `ConvertStringSecurityDescriptor...` 失败时，C1 的接缝交不回错误码，`startHost` 只能给 `stage='pipe'` + `win32Error=0`。要不要给 §6.10 补一行（例如 `err.proc.spawnFail` + `err='pipe=<code>'`）并把错误码通道加进 `WinPipeApi`？现在改比任务 6 之后再改便宜。
3. **check E6 的守测试名 `read_polling_uses_available_not_blocking_read` 同时出现在 plan 任务 6 步骤 1** —— 两处冲突。本任务无法守（读循环在 `ElevatedPtyProcess` 里，B1 边界外）。建议把 E6 的「由哪条测试守」改成任务 6，或在本表写成 `☐（推到任务 6；B1 边界）`。
4. **`available()` 的 `-1` 哨兵**是我替 C1 的 `number` 返回类型定的契约，任务 6 的读循环要按它写。若更希望别的形状（抛错、返回 `null`、或给 `WinPipeApi` 加一个 `isOpen(h)`），请在派任务 6 之前定。
5. **size 相同即认定「就是我们那条硬链接」**：用户若放了一个 size 恰好相同的 `node.exe`，会被误判复用。规格 §6.4-1 只给了 size 这一条判据，我没有再加更严的判据（比如比对哈希，代价是 176MB 读一遍）。
6. **`.temp/ql-admin-probe/` 下新增了探针与产物**：`probe9b.mjs`、`probe13.mjs`、`probe14.mjs`、`probe15.mjs`、`probe16.mjs`、`child16.cjs`、`probe17.mjs`、`child17.cjs`、`probe18.cjs`、`probe19.cjs`、`ql-elevated.cjs` 及各自 `.out`/`.err`。`.temp/` 在 `.gitignore` 里（`.*/` 除 `.superpowers/**`），不进 H1 的暂存范围。`node_modules/electron/dist/node.exe` 已由 `probe19.cjs` 清理掉。

## 7 交接给任务 6 的三句话

1. 起宿主用 `startHost(winPipe, hostLauncher)`：它已经建好管道、起好进程、失败时关好两个句柄，返回 `pipeName` / `token` / `pipeHandle` / `hostHandle`；`ok=false` 时用 `hostStartError(r.win32Error, opts.logTarget)` 生成 `PROC:` 文案（R-07，别再写第二份映射）。
2. `hostExePath()` 抛的 `hostlink=…` 是 §6.10 第三行的 `{err}` 片段，原样塞进 `err.proc.spawnFail` 的 `{err}`，`{exe}` 仍是用户那一行的目标。
3. 读循环按 `available() >= 0` 才 `read(h, available)`；`-1` = 断管/Peek 失败，走 §6.7 的退出路径（`ERROR_BROKEN_PIPE=109` 就体现在这里）。
