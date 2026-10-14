# 任务 4 · 主进程侧的命名管道与起宿主（`ql-elevated.ts` 第一段） — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 4 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.4 / §6.5（管道部分） · 关联审查重点 **RF4 / RF7**（索引 R 组）
> 前置：任务 2（帧协议）；任务 3（`shellExecute` 已能收 `verb`/`parameters`）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/shell-execute.ts:12-22`（`WinShellApi` 的「真实现 + 假实现可替换」手法，本表照抄）、`:47-71`（koffi 惰性绑定）、`:85-93`（`SHELLEXECUTEINFOW` 取值）；取证：`.temp/ql-admin-probe/probe9.mjs`（SDDL + duplex + PeekNamedPipe + WriteFile 全通过）、`probe7.mjs`（提权 + 硬链接 node.exe + 连管道）
> **主代理验收（2026-10-14 23:2x，独立复跑 G 段全部命令）**：G1 → `Test Files 1 passed (1)` / `Tests 8 passed (8)`；G2 → `Tests 10 passed (10)` 且 `git diff --stat -- src-main/shell-execute.ts src-main/shell-execute.test.ts` 空输出（未改）；G3 tsc → 无输出 `TSC_EXIT=0`；G4 i18n → `4 passed (4)` / `18 passed (18)`；G5 全量 → `Test Files 50 passed (50)` / `Tests 855 passed (855)`（847 + 本任务 8，测试文件 49 → 50，与索引 :7 一致）。结构核对：`WinPipeApi` / `HostLauncher` / `hostStartError` 三处签名逐字 = C1/C2/C6；`D:(A;;GA;;;WD)` / `0x00000003` / `nMaxInstances=1` / `65536` / `535` / `1223` / `runas` / `lms-ql-` / `uint8 *` 逐条命中；plan 的 5 条用例名逐字在位（另 3 条守 C1/C3/F1/F2）；字符串字面量零汉字（CJK 只在注释里）。
>
> 索引：[00-index.md](00-index.md) 的 G1、G2、G6、G7、K13、**K36**（本会话进程树里 electron-as-node 子进程开命名管道一律 EPERM → 沙箱内冒烟换客户端）、**K37**（建管道失败的文案）、**K38**（E6 归任务 6）、**K39**（`available()` 的 `-1` 契约）、**K40**（额外导出已认可）、**K34**（起宿主直接调 `winShell.shellExecute(file, 0, {verb,parameters})`，不得给 `launchShellExe` 加形参）、**K35**（`hostStartError` 归本任务，任务 6 复用）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 3 的提交；porcelain 干净 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `shell-execute.ts:12-22` / `:47-71` / `:85-93`；跑 `node .temp/ql-admin-probe/probe9.mjs` 复核管道结论 | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-host-protocol.ts` 与 `shell-execute.ts:14` 的新签名 | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-elevated.ts` | 新建第一段：`WinPipeApi` + `HostLauncher` + `newPipeName` + koffi 真实现 + 硬链接解析 | 不含 `ElevatedPtyProcess`（在任务 6）；不含 i18n 文案（错误只带 stage/message） | ☑ |
| B2 | `src-main/ql-elevated.test.ts` | 新建（假 `WinPipeApi` + 假 `HostLauncher`） | 不真起进程、不真建管道（真管道只在 J 段的冒烟里） | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `WinPipeApi` | `createServer(pipeName)` / `connect(h)` / `available(h)` / `read(h, n)` / `write(h, buf)` / `close(h)` —— plan 任务 4 签名块 | ☑ |
| C2 | `HostLauncher` | `hostExePath()` / `hostScriptPath()` / `launch(exe, script, pipeName, token)` | ☑ |
| C3 | SDDL 与管道参数 | `D:(A;;GA;;;WD)`、`dwOpenMode=3`、`nMaxInstances=1`、`64KiB×2`、`nDefaultTimeOut=0` —— 规格 §6.5 | ☑ |
| C4 | 起宿主的参数 | `shellExecute(hostExe, 0, { verb: 'runas', parameters: '"<脚本>" "<管道名>" "<token>"' })` —— 规格 §6.4-3 | ☑ |
| C7 | 实现额外导出的内部接缝与工厂（**主代理验收时认可**，2026-10-14 23:2x，索引 K40） | `PipeKernel`（把 Win32 原始形状收一层，好让 C3 的取值在不碰 koffi 的单测里被逐字钉住）、`HostPaths`、`HostStart`、`resolveHostLink`、`createHostLauncher` / `hostLauncher`、`pipeKernel`、`winPipe`、`startHost`、`invalidHandle`。理由：C3/E1 的取值在只有一层 `WinPipeApi` 时单测无从观察；E4 的「两个句柄都关」需要一个把两个接缝接起来的函数；`winPipe` / `hostLauncher` 必须导出任务 6/7 才接得上（与 `winShell` 同理）。C1/C2/C6 的签名逐字未动 | ☑ |\n| C6 | `hostStartError`（**主代理裁决 R-07**，2026-10-14 22:4x：E5 要能在本任务被证；`launch()` 自身不带文案，B1 边界不变） | `export function hostStartError(win32Error: number, userTarget: string): Error` —— `1223` → `PROC: t('err.proc.uacCancelled', { exe: userTarget })`；其它 → `PROC: t('err.proc.spawnFail', { exe: userTarget, err: 'win32=' + win32Error })`（规格 §6.10 前两行，零新键）。任务 6 用 `opts.logTarget` 作 `userTarget` | ☑ |
| C5 | 硬链接解析规则 | `fs.linkSync(process.execPath, <dir>/node.exe)`；已存在则只有 `size` 与 `process.execPath` 相同才用；失败 → `hostlink=<errno>` —— 规格 §6.4-1 / §9-R5 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 4 步骤 1 的 5 条） | `npx vitest run src-main/ql-elevated.test.ts` | 模块不存在 → 红 | ☑ |
| D2 | 实现 koffi 绑定 + 真实现 | 同上 | 全绿 | ☑ |
| D3 | 本机冒烟（真管道，不提权） | `node .temp/ql-admin-probe/probe9.mjs` | 输出与本次取证一致：`connected after … ms`、`WriteFile … ok true`、`all frames: […0x83…]`、`child exit {"c":7}` | ☑ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 服务端带 SDDL（假接缝收到逐字 SDDL 串） | 规格 §6.5 / 取证 P10 | `server_is_created_with_the_sddl_descriptor` | ☑ |
| E2 | 起宿主用 `runas` 且三个参数都带引号 | 规格 §6.4-3 / 取证 P8 | `launch_passes_runas_and_three_quoted_arguments` | ☑ |
| E3 | 已存在的 `node.exe` 只在 size 相符时才用 | 规格 §9-R5 | `host_exe_resolution_reuses_an_existing_link_only_when_size_matches` | ☑ |
| E4 | 启动失败关闭管道句柄与进程句柄 | 规格 §6.7 / RF4 | `launch_failures_close_both_handles` | ☑ |
| E5 | `win32=1223` → `err.proc.uacCancelled`，`{exe}` 是用户目标不是宿主名 | 规格 §6.10 / §8-K3 | `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target` —— 守的是 **C6 的映射器**（裁决 R-07），不是 `launch()`；`launch()` 只把 `win32Error` 原样交出去 | ☑ |
| E6 | 读侧只用 `available()` 判断后才 `read()`（不阻塞主线程） | 规格 §6.5 / §9-R7 | `read_polling_uses_available_not_blocking_read` | ☐（**推到任务 6 的 E8**，裁决 K38：读循环在 `ElevatedPtyProcess` 里，B1 边界之外。本任务只交契约：`available()` 失败/断管交 `-1`、`read(h,n)` 只读已判可读的 n 字节（`ql-elevated.ts:302-310` 注释写明），J-7 的冒烟按此顺序真跑过一遍 → 口径登记 K39） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | koffi 结构体必须先命名再在签名里用指针（`Unknown or invalid type name` 教训） | 前置规格 E13 / `shell-execute.ts:49-51`` | ☑ |
| F2 | `WriteFile` 形参声明 `uint8 *` 传 Buffer | 取证 P10（`lastErr=998` 的成因） | ☑ |
| F3 | 新文件不含汉字字面量 | 索引 G6 | ☑ |
| F4 | 不新增依赖（koffi 已在） | 索引 G7 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-elevated.test.ts` | 全绿 | ☑ |
| G2 | 相邻回归 | `npx vitest run src-main/shell-execute.test.ts` | 全绿且未改该文件 | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | 全绿 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts` | ☑ |
| H2 | commit message 逐字 | `feat: 提权宿主的命名管道服务端与 runas 启动接缝` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B2 之外没有文件被改
- [x] C1-C7 逐字一致
- [x] D1→D4 先红后绿 + D3 冒烟输出贴 J 段
- [x] E1-E6 有对应测试且绿
- [x] G1-G5 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-elevated.test.ts` | 先红（23:00:53，实现文件还没写）：`Error: Failed to load url ./ql-elevated (resolved id: ./ql-elevated) in .../src-main/ql-elevated.test.ts. Does the file exist?` → `Test Files 1 failed (1)` / `Tests no tests`、exit 1。实现后（23:11:31）：`✓ src-main/ql-elevated.test.ts (8 tests) 63ms` → `Test Files 1 passed (1)` / `Tests 8 passed (8)`、exit 0。8 条 = plan 的 5 条（逐字）+ 3 条守 C1 的管道名形状与 535、守 F1/F2 的真绑定可用性 |
| J-2 | `node .temp/ql-admin-probe/probe9.mjs` | **本会话的进程树里跑不通**（两次跑到 120s 被中止）：只出 `pipe \\.\pipe\lms-p9-bavqgc handle 716n lastErr 0` 与 `child pid 7336`，之后无输出——子进程（硬链接 electron-as-node）连管道一律 `EPERM`（见 J-9），父进程卡在阻塞式 `ConnectNamedPipe`。同一条父侧路径换客户端就跑通：`node .temp/ql-admin-probe/probe9b.mjs`（与 probe9 逐字相同，只把子进程换成 `process.execPath`）→ `connected after 33 ms lastErr 0`、`WriteFile type=0x1 ok true written 101 lastErr 0`、`all frames: [{"type":"0x81"...},{"type":"0x82"...},{"type":"0x82","payload":"echo:ls"},{"type":"0x83","payload":"{\"code\":0}"}]`、`child exit {"c":7,"s":null}`、exit 0 |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出、exit 0（干净） |
| J-4 | `npm test` | `Test Files 50 passed (50)` / `Tests 855 passed (855)`、`Duration 10.40s`、exit 0（A2 基线 49 份 / 847 条 → +1 份 / +8 条，只增不减） |
| J-5 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0 —— 新文件无汉字字面量（G6）、`t()` 的占位符与词典一致、零新键（G2） |
| J-6 | `npx vitest run src-main/shell-execute.test.ts`；`git diff --stat -- src-main/shell-execute.ts src-main/shell-execute.test.ts` | `Test Files 1 passed (1)` / `Tests 10 passed (10)`、exit 0；`git diff --stat` 空输出 = 该文件未改（索引 K34 的边界） |
| J-7 | `npx esbuild src-main/ql-elevated.ts --bundle --platform=node --format=cjs --external:koffi --outfile=.temp/ql-admin-probe/ql-elevated.cjs` 然后 `node .temp/ql-admin-probe/probe18.cjs` | **真实现**跑真管道 + 真客户端（D3 的主证据）：`newPipeName -> \\.\pipe\lms-ql-5a4c26a5 shape ok true`、`winPipe.createServer handle 180n`、`winPipe.connect true after 33 ms`、`write HELLO ok true` / `write WRITE ok true` / `write STOP ok true`、`all frames: [0x81 host-pid, 0x82 hello-from-host, 0x82 echo:ls, 0x83 {"code":0}]`、`child exit {"c":7,"s":null}`、`available after close -> -1`（断管哨兵）、`hostStartError(1223, cmd) -> PROC: cmd 已取消管理员权限请求`、`hostStartError(2, cmd) -> PROC: cmd 启动失败: win32=2`、exit 0 |
| J-8 | `node .temp/ql-admin-probe/probe19.cjs`（真 `electron.exe`，176,813,568 B） | `1) 新建硬链接 -> ...\node_modules\electron\dist\node.exe same path as expected: true 耗时 0 ms`、`同 inode: true ino 2251799813806062 nlink 3 size 相同: true`；`2) 再解析一次（已存在且 size 相同）` 复用、`再解析后 nlink = 3 （没有重复建链接）`；`3) 用户自己的 node.exe -> hostlink=size-mismatch`，`文件仍在: true 内容未动: user owned`（不覆盖不删除，§9-R5）；清理后 `dist/node.exe 存在: false` |
| J-9 | `node .temp/ql-admin-probe/probe15.mjs` / `probe16.mjs` / `probe17.mjs`（诊断，非验收门） | 管道与 SDDL 都没问题：`ConvertSDDL ok true sizeUsed 48 lastErr 0`、`[self] CONNECTED`、`[sysnode] child log: CONNECTED try=0`、`ConnectNamedPipe ok false lastErr 535`（= 客户端已连上，C1 的 535 由此实测）。失败句柄形状：`handle 18446744073709551615n lastErr 2` —— koffi 把 `void *` 交回 **BigInt**，只判 `null` 会把失败当成功，据此实现 `invalidHandle()`（`ql-elevated.ts:227`）。硬链接 electron-as-node 子进程对「带 SDDL」和「默认 DACL」两条管道都是 `ERR EPERM` → 与 SDDL 无关，是本会话进程树对 Electron 27 libuv 打开命名管道的限制（对照：系统 node 子进程连得上） |
