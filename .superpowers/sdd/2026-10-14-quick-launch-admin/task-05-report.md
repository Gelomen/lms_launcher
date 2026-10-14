# 任务 5 报告 · 宿主入口 `src-main/ql-pty-host.ts`

> 派单：主代理（2026-10-14 23:3x，起点 HEAD `7469da0`，即任务 4 验收文档提交 `971f5e4` 之后的索引修字提交 —— 按索引 K30 的口径就是「上一任务已提交」这条链）· 分支 `feat/quick-launch-admin`
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-05-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-05-pty-host-entry.md` + 规格 §6.5 帧表 / §6.6 的 1-9 步 + 复用的既有代码 `src-main/quick-launch.ts:122-142` / `:146-150` / `:153-163`
> 本表 A-I 段的勾**未落**（按 G8：验收归主代理）；J 段（J-1…J-8）已按派单要求填真实命令与真实输出。
> 未 `git add`、未 commit（G8）；改动只落在 B 段两个文件（G9，`git status --porcelain` 见 §4-6）。

## 1 状态

**DONE_WITH_CONCERNS** —— 六条用例与五道门全绿、范围只有两个新文件；三条需要主代理处理的疑虑在 §6（其中疑虑 1 是**环境事实与索引 K22 相反**，属好消息但要登记）。

| 门 | 命令 | 结果 |
|---|---|---|
| D1 先红 | `npx vitest run src-main/ql-pty-host.test.ts` | `Test Files 1 failed (1)` / `Tests no tests`、exit 1；原因正确：`Failed to load url ./ql-pty-host … Does the file exist?`（实现文件还不存在） |
| D2 后绿（= G1 定向） | 同上 | `Test Files 1 passed (1)` / `Tests 6 passed (6)`、exit 0 |
| G2 相邻回归 | `npx vitest run src-main/quick-launch.test.ts` | `Tests 27 passed (27)`、exit 0；`git diff --stat -- src-main/quick-launch.ts src-main/quick-launch.test.ts` = 空输出（一字未改） |
| G3 类型门（R-01 / K27） | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断、`TSC_EXIT=0`（实现后与最终状态各跑一次，都干净） |
| G4 i18n 三门 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`、exit 0 |
| G5 全量 | `npm test` | `Test Files 51 passed (51)` / `Tests 861 passed (861)`、`Duration 8.86s`、exit 0 |
| D3 本机冒烟 | `node .temp/ql-admin-probe/probe20.cjs [electron-link]` | **两个变体都跑通**：系统 node 作宿主 = 真 ConPTY 全往返（READY→DATA→WRITE→RESIZE→STOP→EXIT）；硬链接 electron-as-node 作宿主 = 连管道 `EPERM`（索引 K36 的预期），宿主按设计发 `ERR{stage:'pipe'}` 后 `exit 1`、无崩溃栈。详见 §4 |

计数只增不减：起点 50 份 / 855 条 → 现在 **51 份 / 861 条**（+1 份 / +6 条，全在 `src-main/ql-pty-host.test.ts`）。与索引头部「本 feature 新增 4 份测试文件 → 任务 5 之后应为 51 份」一致。

## 2 改动文件与真实行号（改后实测行号）

### `src-main/ql-pty-host.ts`（新建，165 行）

| 位置 | 内容 |
|---|---|
| `:1-9` | 边界注释：不 import `electron`（F1 / K12）、终端映射只复用 `shellExe`（F3）、停止语义只复用 `PtyProcess.stopGraceful`（§6.6-7）、不新增依赖（F4）、不含汉字字面量（G6）、错误只发 `ERR{stage,message}`（G1 / §6.6-9）、payload 一律 string（K32） |
| `:10-14` | 全部 import：`node:net`、`@lydell/node-pty`、`{ PtyProcess, shellExe } from './quick-launch'`、`import type { TerminalId } from './quick-launch-config'`（类型，运行时不产生依赖）、`{ HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol'`。**没有** `electron`、**没有** `./main`（F1，取证见 §4-4） |
| `:16-18` | `PIPE_GONE_TIMEOUT_SECS = 3` —— §6.6-8 的 `STOP{timeoutSecs:3}`；与 `quick-launch.ts:28` 的 `STOP_TIMEOUT_SECS` 同值，那个常量未导出，为它改 `quick-launch.ts` 属 B 段之外（G9），故在此写死并标出处 |
| `:21-26` | `export interface HostSocket` —— 宿主用到的最小管道面：`write(chunk: Buffer \| string)` + `on('data'/'close'/'error')` 三个带类型的重载；`net.Socket` 与测试里的 `EventEmitter` 假 socket 都满足（plan 步骤 1 的口径） |
| `:29-31` | `messageOf()` —— ERR 的 message 只放原始错误文本（G1） |
| `:34-41` | `parseObject()` —— 帧载荷按「对象或空对象」收：坏 JSON 不炸宿主（§6.5 的解析器只保证字节边界，不保证 JSON 合法） |
| `:44-47` | `finiteOr()` —— `STOP{timeoutSecs}` 没给可用秒数 = 不给宽限期，不猜默认值 |
| `:53-56` | `export function runHost(deps: { connect(name: unknown): HostSocket; spawn: typeof pty.spawn }): void` —— **逐字 = plan 任务 5 签名块 / brief `:9`**；`argv = process.argv.slice(2)` 取 `pipeName` / `token`（C1：`[node, script, pipeName, token]`，其余参数一律在 HELLO 里传，§6.4-4 / K2） |
| `:58-60` | 三个状态位：`proc`（真 `PtyProcess`）、`stopping`（停止路径幂等）、`finished`（已发 EXIT/ERR 后不再发第二帧、不再第二次退出） |
| `:62` | §6.6-1 `deps.connect(pipeName)` |
| `:64-76` | `send()`（`encodeFrame` + 写管道；管道已断时吞掉写异常 —— 主进程侧按 §6.7 回落 `GetExitCodeProcess`，P12）与 `fail(stage, message, code)`（发 `ERR{stage,message}` 后 `process.exit(code)`） |
| `:78-82` | `stop(timeoutSecs)` —— §6.6-7 / §6.6-8 的**共同**停止路径：`await proc.stopGraceful(timeoutSecs)`，即复用 `quick-launch.ts:122-142`（`kill()` → 等 `timeoutSecs` → `taskkill /T /F -PID`）；`finished` / `stopping` 双守卫保证幂等 |
| `:84-114` | `onHello()`：token 不符 → `ERR{stage:'token'}` + `exit 2`（§6.6-2 / E1）；`shellExe(hello.shell)`（§6.6-3，不复制映射表）→ `deps.spawn(exe, args, { name:'xterm-256color', cols, rows, cwd, env: process.env })`（**逐字 = `quick-launch.ts:155-161`，不含 `encoding`**，C3 / E2）；起不来 → `ERR{stage:'spawn', message}` + `exit 1`（§6.6-4）；成功 → `READY{hostPid, shellPid}` → `onData` → `DATA`（K32：字符串原样进 payload）→ `onExit` → `EXIT{code}` + `process.exit(code)`（§6.6-5，C4 同源） |
| `:116-138` | `createFrameParser` 的派发（粘帧 / 半帧由任务 2 的解析器处理）：`HELLO` → `onHello`；`WRITE` → `proc.write`；`RESIZE` → `proc.resize(cols, rows)`（两个值都必须是有限数才调）；`STOP` → `stop(帧里的 timeoutSecs)`；其余（宿主 → 主进程方向的帧、未知 type）丢弃 |
| `:140-150` | 管道事件：`data` → 解析器；`close` → `stop(3)`（§6.6-8，不留孤儿 ConPTY，RF6）；`error` → 只在**终端还没起来**时按 §6.6-9 报 `ERR{stage:'pipe'}` + `exit 1`，否则交给 `close` 走停止路径（否则留孤儿）；没有这个监听，未处理的 `error` 会让宿主直接崩掉 |
| `:154-159` | `main()` —— 生产侧装配：`connect: (name) => net.connect(String(name))`（§6.6-1，P10 证明可用）+ `spawn: pty.spawn` |
| `:161-165` | `if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) main();` —— plan 的「`require.main === module` 才自动跑」；`typeof` 短路是对非 CJS 加载器的防御（实测见 §4-3：测试加载器里 `require`/`module` 都在，但 `require.main === module` 求值为 `false`，不会误跑） |

**不含**（B1 边界）：`ElevatedPtyProcess`（任务 6）、任何 i18n 文案或 `t()` 调用（G1：文案在主进程侧按词典生成）、第二张终端映射表（F3）、`electron`（F1）。

### `src-main/ql-pty-host.test.ts`（新建，295 行，6 条）

| 位置 | 内容 |
|---|---|
| `:17-24` | `vi.mock('node:child_process')` + `taskkillCalls` —— 与 `quick-launch.test.ts:13-19` 同一手法观察 `stopGraceful` 的升级链（宿主复用的是真 `PtyProcess`，所以必须在真实现里观察） |
| `:27-45` | `vi.mock('@lydell/node-pty')` + `ptySpawnSeen` —— E2 的**对照物**：同一个假 spawn 同时接住真 `spawnShell`（`quick-launch.ts:153-163`）与宿主注入的 spawn，两份选项逐字比对 |
| `:47-81` | `FakeSocket extends EventEmitter implements HostSocket`（plan 步骤 1 的「假 socket = EventEmitter + 收集写出的帧」）：写出的字节即时交给**真** `createFrameParser` 解码成帧 —— 帧序 / 半帧的判据不靠测试侧手工拼接 |
| `:83-124` | `FakeHandle` —— `quick-launch.ts:60-67` 的 `PtyHandle` 最小面，喂给**真** `PtyProcess`；默认 `kill()` 后不发 exit 事件（真机强杀后可能不落地，`quick-launch.test.ts:103` 同口径），这样「超时 → taskkill」才观察得到 |
| `:127-158` | `startHost()` / `sendHello()` —— 按 C1 的形状喂 `process.argv`（`[node, script, pipeName, token]`），跑完立即还原；HELLO 载荷 = §6.5 帧表的 `{ token, shell, cols, rows, cwd }` |
| `:160-176` | `process.exit` 的 spy：只记录退出码（C4 / E1 / E3 的判据就是这个实参），不让 vitest 的 worker 退出 |
| `:181-196` | `hello_with_a_wrong_token_exits_2_and_sends_err`（plan 逐字）守 E1 / §6.6-2 / C1：`connect` 收到的是 argv 里的管道名；只发 `ERR{stage:'token'}`（无文案）；`exitCodes == [2]`；`spawnArgs == []` |
| `:199-222` | `spawn_options_match_the_non_elevated_path`（plan 逐字）守 E2 / C3 / F3：`exe`/`args` 逐字 = `shellExe('pwsh')`（`pwsh.exe` + `-NoLogo`）；选项逐字 `{ name:'xterm-256color', cols:120, rows:40, cwd:'D:\\lms', env: process.env }`；**键集与真 `spawnShell` 产出的选项完全相同**且不含 `encoding` |
| `:225-243` | `ready_then_data_then_exit_frame_order`（plan 逐字）守 E3 / C4 / RF6：帧序 `[READY, DATA, EXIT]`；`READY{hostPid=process.pid, shellPid=4321}`；DATA 的 payload 逐字 = `'a\u00e9\u{1F600}b'`（含非 ASCII 与代理对 —— 任何「自己拼字节」的写法都会在这里失真，K32）；`EXIT{code:7}` 与 `exitCodes==[7]` 同源 |
| `:246-260` | `write_and_resize_frames_reach_the_pty_handle`（plan 逐字）守 E4 / §6.6-6：`WRITE` → `handle.write('dir\r')`、`RESIZE` → `handle.resize(132,44)`；再把一帧拆两段送（半帧），到达句柄的仍是完整原文 |
| `:263-279` | `stop_frame_runs_stopGraceful_with_the_given_timeout`（plan 逐字）守 E5 / §6.6-7 / RF6：`STOP{timeoutSecs:5}` → 先 `kill()` 一次；4s 时**不得** taskkill；越过 5s 才 `taskkill /T /F -PID 4321`（超时来自帧，不是写死的 3）；exit 落地后走同一条 `EXIT{code:0}` + `exit(0)` |
| `:282-294` | `socket_close_runs_the_stop_path`（plan 逐字）守 E6 / §6.6-8：`close` → 立即 `kill()`；2.9s 时不 taskkill、越过 3s 才强杀（§6.6-8 给的正是 3） |

假接缝只有 socket 与 pty 两处（check B2）：没有真管道、没有真 pty 进程。真跑的部分：`PtyProcess`（真实现，停止时序）、`createFrameParser` / `encodeFrame`（任务 2 的真实现）、`shellExe` / `spawnShell`（真实现，用于对照）。

## 3 TDD 每步：命令与真实输出

### D1 先写失败测试 → 红（`Start at 23:47:18`）

命令：`npx vitest run src-main/ql-pty-host.test.ts`

```
 ❯ src-main/ql-pty-host.test.ts (0 test)
 FAIL  src-main/ql-pty-host.test.ts [ src-main/ql-pty-host.test.ts ]
Error: Failed to load url ./ql-pty-host (resolved id: ./ql-pty-host) in D:/Dev/Projects/lms_launcher/src-main/ql-pty-host.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

红的原因正确：实现文件不存在，不是断言写错。

### D2 实现 §6.6 的 1-9 步 → 绿（`Start at 23:48:39`）

```
 ✓ src-main/ql-pty-host.test.ts (6 tests) 62ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

一次到位，没有中途改断言：六条用例与类型门（`TSC_EXIT=0`）同时干净。

### D4 类型门 + 全量

见 §1 的 G3 / G5 两行：`npx tsc --noEmit -p tsconfig.main.json` 无诊断；`npm test` → `51 passed (51)` / `861 passed (861)`。

## 4 冒烟与取证（真实输出）

### 4-1 D3 变体 A：系统 node 作宿主 —— **真 ConPTY 全往返**（命令：`node .temp/ql-admin-probe/probe20.cjs`）

```
pipe \\.\pipe\lms-ql-cb371cc7
childExe D:\Dev\Runtimes\Node\node.exe script D:\Dev\Projects\lms_launcher\dist-main\ql-pty-host.js
child pid 13868
winPipe.connect true after 40 ms
write HELLO ok true
frames after HELLO: [{"type":"READY","payload":"{\"hostPid\":13868,\"shellPid\":0}"}]
write WRITE(echo probe20) ok true
write RESIZE 100x30 ok true
write STOP ok true
saw EXIT frame: true
all frames: [
  {"type":"READY","payload":"{\"hostPid\":13868,\"shellPid\":0}"},
  {"type":"DATA","payload":"\u001b[?9001h\u001b[?1004h"},
  {"type":"DATA","payload":"\u001b[?25l\u001b[2J\u001b[m\u001b[HMicrosoft Windows [版本 10.0.26300.9711]…"},
  {"type":"DATA","payload":"…Temp>echo PROBE20-MARKER\r\nPROBE20-MARKER\r\nC:\Users\…>…166"},
  {"type":"DATA","payload":"\u001b[?25l\u001b[8;30;100t\u001b[HMicrosoft Windows […357"},
  {"type":"DATA","payload":"\u001b[?9001l\u001b[?1004l"},
  {"type":"EXIT","payload":"{\"code\":-1073741510}"}]
child exit {"c":3221225786,"s":null}
available after child exit -> -1
```

读法（这一条把 §6.6 的 1-8 步在真管道 + 真 ConPTY 上跑通了）：

- `net.connect` 40ms 连上（§6.6-1，与 P10 的 61ms 同量级）；
- HELLO → `READY`（§6.6-4）；
- 真 `cmd.exe` 的横幅经 `DATA` 帧流回（§6.6-5，payload 是字符串，K32）；
- `WRITE('echo PROBE20-MARKER\r')` → 回显出现在下一帧 `DATA` 里（§6.6-6 的写路径到了真 pty）；
- `RESIZE{cols:100,rows:30}` → 下一帧里出现 ConPTY 的 `\u001b[8;30;100t`（§6.6-6 的尺寸路径到了真 pty）；
- `STOP{timeoutSecs:3}` → `EXIT{code:-1073741510}`（`0xC000013A` = `STATUS_CONTROL_C_EXIT`，即 `kill()` 的结果），宿主随即 `process.exit(code)`：子进程退出码 `3221225786` = 同一个值的无符号表示 —— **C4「EXIT 帧的 code 与 `process.exit` 同源」在真机上成立**；
- 子进程退出后读侧 `available -> -1`（`ERROR_BROKEN_PIPE 109`，§6.5 / 索引 K39 的退出路径）。

**与索引 K22 相反**：K22 说本实现环境 `node-pty` 的 `spawn` 必失败（`EPERM … conpty-*-in`）。本次以**系统 node**（`D:\Dev\Runtimes\Node\node.exe`）作宿主、在 `danger-full-access` 策略下，ConPTY 起来了。见 §6 疑虑 1。

### 4-2 D3 变体 B：硬链接 electron-as-node 作宿主（check D3 字面那条）

命令：`node .temp/ql-admin-probe/probe20.cjs electron-link`（`resolveHostLink` 现建 `node_modules/electron/dist/node.exe`）

```
resolveHostLink -> D:\Dev\Projects\lms_launcher\node_modules\electron\dist\node.exe
pipe \\.\pipe\lms-ql-41583b39
childExe D:\Dev\Projects\lms_launcher\node_modules\electron\dist\node.exe script D:\Dev\Projects\lms_launcher\dist-main\ql-pty-host.js
child pid 10536
child exited BEFORE the pipe was connected: {"c":1,"s":null}
winPipe.connect skipped (ConnectNamedPipe would block forever with no client)
```

宿主**没有崩溃、没有栈**（`[child stderr]` 一行也没有），退出码 1 —— 就是 `:147-150` 的 `ERR{stage:'pipe'}` + `process.exit(1)` 路径（帧写不出去被吞掉，管道本来就没通）。原因由 4-3 的诊断钉死。

### 4-3 诊断（命令：`node .temp/ql-admin-probe/probe21.cjs [electron-link]`，子进程 `child20.cjs` 只做 `net.connect`）

```
===== electron-link =====
pipe \\.\pipe\lms-ql-587e980a exe …\node_modules\electron\dist\node.exe server handle 684n
[child] CONNECT-ERR code=EPERM message=connect EPERM \\.\pipe\lms-ql-587e980a
child exit {"c":1,"s":null}
===== sysnode =====
pipe \\.\pipe\lms-ql-ffb0f713 exe D:\Dev\Runtimes\Node\node.exe server handle 720n
[child] CONNECTED
child exit {"c":0,"s":null}
```

即：同一个管道服务端，硬链接 electron-as-node 一律 `connect EPERM`（索引 K36 成立），系统 node 一律连上。变体 B 的退出码 1 因此是「连不上管道」这条路径，不是 `spawn` 失败。

另：`require.main === module` 在测试加载器里的取值也用一次性探针核过（`src-main/zz-probe-guard-side.ts` + `zz-probe-guard.test.ts`，跑完即删）：`PROBE guard-fired-under-vitest = false`。

### 4-4 F1（不 import electron）取证

`grep "electron|from './main'" src-main/ql-pty-host.ts` → 只有 `:3` 的边界注释一处命中；import 行只有 `node:net` / `@lydell/node-pty` / `./quick-launch` / `import type … ./quick-launch-config` / `./ql-host-protocol`（见 §2 的 `:10-14`）。

### 4-5 F2（新文件不含汉字字面量）的**覆盖**取证

光跑绿不够（绿可能因为新文件不在扫描集里），所以做一次反证：在 `ql-pty-host.ts` 末尾临时加 `const __probeHan = '汉字';` →

```
❯ src-main/i18n/no-hardcoded.test.ts (2 tests | 1 failed)
+     "file": "src-main/ql-pty-host.ts",
 Test Files  1 failed (1)
```

删掉后 `npx vitest run src-main/i18n` → `Test Files 4 passed (4)` / `Tests 18 passed (18)`，且文件字节级还原（`file restored identical: true`）。新文件确实在 `no-hardcoded.test.ts:26-28` 的扫描集里。

### 4-6 G9 范围取证

```
$ git status --porcelain
?? src-main/ql-pty-host.test.ts
?? src-main/ql-pty-host.ts
$ git diff --stat -- src-main/quick-launch.ts src-main/quick-launch.test.ts
（空输出）
```

`dist-main/` 在 `.gitignore:2`（`dist-*/`）内，所以 R-01 的编译产物不脏工作区。

## 5 偏离与理由

1. **`runHost` 的 `connect(name: unknown)`**：按 brief `:9` / plan `:160` **逐字**取 `unknown`；check 表 C2 写的是 `connect(name: string)`。两处不一致时以 plan 原文为准（派单明确「brief 含要逐字使用的签名」），且 `unknown` 是必要的：`process.argv` 交出的就是 `string \| undefined`，`string` 接不住。→ 请主代理验收时确认 C2 那一行（我不改表）。
2. **`require.main === module` 外加 `typeof require/module` 短路**（`:163`）：plan 只写 `require.main === module`。实测（§4-3 末的探针）测试加载器里 `require`/`module` **都存在**且 `require.main === module` 求值为 `false`，所以守卫本身不会误跑；`typeof` 短路只是对没有 CJS 全局的加载器的防御。行为与 plan 一致（单测里不自动跑、真机 `node.exe` 直接执行时跑），字面多一层守卫。
3. **新增 `ERR{stage:'pipe'}` + `exit 1` 这条路径**（`:147-150`）：规格 §6.6 只定义 `token`(2) / `spawn`(1) / `EXIT{code}` 三种退出，没定义「管道连不上」。不加 `error` 监听，未处理的 `error` 会让宿主带栈崩掉（无帧、退出码不可控）；派单对 stage 的举例里正好有 `pipe`，方向一致。**退出码 1 是我选的**（与 `spawn` 同为「宿主没干成事」），规格没写 → 登记。
4. **import 不带 `.js` 后缀**：plan 的「改什么」段写 `./ql-host-protocol.js`，我按仓库既有约定写 `./ql-host-protocol`（`tsconfig.main.json` 是 `module: CommonJS` + `moduleResolution: node`；`quick-launch.ts:7-10`、`ql-elevated.ts:7-12` 全部无扩展名）。编译产物仍是 `dist-main/ql-pty-host.js`，§6.4-2 的宿主脚本路径不受影响。
5. **`PIPE_GONE_TIMEOUT_SECS = 3` 写在宿主里**：`quick-launch.ts:28` 的 `STOP_TIMEOUT_SECS` 未导出，为了复用它得改 `quick-launch.ts`（G9 禁止；G2 相邻回归门也要求那个文件一字不改）。已在 `:16-17` 标出处与同值关系。
6. **冒烟副作用（都在 gitignore 内）**：`.temp/ql-admin-probe/` 新增 `probe20.cjs` / `probe21.cjs` / `child20.cjs`，并重建了 `ql-elevated.cjs`（esbuild 打包，探针用它取真管道服务端）；`resolveHostLink` 现建了 `node_modules/electron/dist/node.exe` 硬链接（0 额外空间，§6.4-1 运行时本来就会建，索引 K20 要求同目录）。都不进 git。
7. 未做（按边界）：`ElevatedPtyProcess`（任务 6）、`QuickLaunchManager` 的 admin 分支接线（任务 7）、打包真机门（§7.2 / 任务 9）。

## 6 疑虑（要主代理处理 / 裁决）

1. **索引 K22 与本次实测相反（重要）**：K22 写「本实现环境跑不了 ConPTY：`node-pty` 的 `spawn` 必失败」。本次以**系统 node** 作宿主（不是硬链接 electron-as-node）时，`dist-main/ql-pty-host.js` 在真命名管道上把 READY / DATA / WRITE / RESIZE / STOP / EXIT 全跑通了（§4-1）。K36（硬链接 electron-as-node 连管道一律 `EPERM`）仍然成立（§4-3）。含义：本会话能自动化验证的比 plan 预期的多；但**提权路径**（`runas` + High IL + asar 内的原生模块解析）仍然只有 §7.2 真机门能判 —— 我没有跑提权。是否登记进 K 组、以及任务 9 的真机门清单要不要加一条「非提权宿主在 dev 布局下的自动化冒烟」，请主代理定。
2. **`READY` 的 `shellPid` 实测是 0**（§4-1 的 `{"hostPid":13868,"shellPid":0}`）：ConPTY 的 `innerPid` 要等 agent 连上才赋值（`quick-launch.ts:71-73` 记过同一现象，那里用 getter 规避）。规格 §6.5 只说 READY 带 `{hostPid, shellPid}`、没定义时序，我按 §6.6-4「成功 → 发 READY」在成功那一刻读 `pid` → 0。任务 6 若要用 `shellPid`（日志、停止），要么不依赖它，要么让宿主晚一点再发 —— 这是规格空洞，我没擅自改语义。
3. **停止路径的收尾依赖主进程**：若 `taskkill` 之后 exit 事件不落地（`quick-launch.test.ts:103` 记过这种真机行为），宿主会停在 `stopping=true` 不退出，由 §6.7 的 `ShellExecProcess.stopGraceful`（`taskkill` 打宿主 → `TerminateProcess`）收尾。这与规格一致，但任务 6 的 `stopGraceful` 必须真的走到委托那一步，否则会留一个不退出、进程树却已死的宿主。
4. 小：`STOP` 帧里 `timeoutSecs` 缺失 / 非数时按「不给宽限期」（立即升级 `taskkill`）处理（`:44-47`），不猜默认值。任务 6 发帧时请始终带数字。

## 7 计数与门对照（给主代理复跑用）

| 项 | 起点（任务 4 收尾） | 现在 |
|---|---|---|
| `*.test.ts` 份数 | 50 | **51**（新增 `src-main/ql-pty-host.test.ts`） |
| `npm test` | `50 passed (50)` / `855 passed (855)` | **`51 passed (51)` / `861 passed (861)`**（+6，全在新文件） |
| `npx vitest run src-main/ql-pty-host.test.ts` | 不存在 | `6 passed (6)` |
| `npx vitest run src-main/quick-launch.test.ts` | 27 | 27（该文件未改） |
| `npx vitest run src-main/i18n` | 4 / 18 | 4 / 18 |
| `npx tsc --noEmit -p tsconfig.main.json` | 干净 | 干净 |
| `git status --porcelain` | 干净 | 只有两个新文件（未 add、未 commit） |
