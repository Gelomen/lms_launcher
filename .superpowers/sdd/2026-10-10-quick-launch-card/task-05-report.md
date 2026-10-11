# 任务 5 实现报告 · 依赖安装 + `PtyProcess` + `QuickLaunchManager`

- 状态：**DONE_WITH_CONCERNS**（功能与门禁全绿；3 处需要主代理裁定的口径见 §9）
- 起点：HEAD = `d42a8b0`，工作区干净
- 交付：`package.json` + `package-lock.json`（+5 直接依赖）、新建 `src-main/quick-launch.ts`（**现 383 行**；首轮 373 行 → 修复轮 1 后 383 行，修复轮 2 未再动）、新建 `src-main/quick-launch.test.ts`（**现 382 行**，17 用例；首轮 377 行 → 修复轮 1 后 379 行 → 修复轮 2 后 382 行）
- 未做：`git add` / `commit`（按 K5 交主代理）；未派子代理
- 文件哈希（供验收比对，**当前值**；行数口径 = 换行数 + 1，即含末尾换行的行数，与 §10/§11 一致）：
  - `src-main/quick-launch.ts` = `3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74`（383 行）
  - `src-main/quick-launch.test.ts` = `0B461D3B040B9C663A588444841A94AD385E74D10B31F4CD1EBFE2BD06FB62F2`（382 行）
  - 首轮的 `47838E7D…1B5DE5`（373 行）/ `7542119E…D2C147`（377 行）只是历史中间值，已被 §10 / §11 的修复取代；§7 里出现的旧哈希同此。

## 1. 结论（先给判据）

| 门 | 结果 |
|---|---|
| D1 装依赖无编译 + `conpty.node` 存在 | 见 §3 |
| D2 先落失败测试 → D3 红 | 见 §6 |
| D4 实现 → D5 绿 | `Tests 22 passed (22)`（quick-launch 17 + process 5） |
| G1 定向 + 相邻回归 | 同上 |
| G2 `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`TSC_EXIT=0` |
| G3 改动范围 | `git diff --name-only` = `package.json`/`package-lock.json`；未跟踪 = 两个新建源文件；`git diff --stat -- src-main/process.ts src-main/process.test.ts` 无输出 |
| 额外：i18n 硬门（新文件在扫描范围内） | `npx vitest run src-main/i18n` → `Tests 18 passed (18)`（含 key-coverage / no-hardcoded） |
| 额外：全量回归 | `npx vitest run` → `Test Files 43 passed (43)` / `Tests 714 passed (714)`（exit 0） |

## 2. 改动清单与边界（check B 段）

| 文件 | 动作 | 说明 |
|---|---|---|
| `package.json` | 修改（+5 行） | `dependencies` 加 `@lydell/node-pty: ^1.2.0-beta.15`（F6）；`devDependencies` 加四个 `@xterm/*`（F5），**精确钉版**（见 §3 的偏离说明） |
| `package-lock.json` | 修改（+134 行，纯增量、无删除行） | 5 个直接依赖 + node-pty 自带的 6 个平台 optionalDependencies；未动 `pnpm-lock.yaml`（K3） |
| `src-main/quick-launch.ts` | 新建 | 现行号（修复轮 1 后）：`PtyProcess`(:78-146) / `shellExe`(:150-155) / `spawnShell`(:157-167) / `QlDeps`(:170-176) / `QuickLaunchManager`(:215-382)；首轮为 `:215-373` |
| `src-main/quick-launch.test.ts` | 新建 | 17 用例，E1–E11 全覆盖（映射见 §5） |
| `src-main/process.ts` / `process.test.ts` | **一行未改** | `git diff --stat` 对二者为空（B4/G4） |

## 3. D1 依赖安装（真实输出）

```
> npm i @lydell/node-pty@^1.2.0-beta.15
added 2 packages, and audited 527 packages in 7s
...（无 node-gyp / 编译输出；只有既有的 npm warn install-scripts esbuild@... 提示，与本次无关）
```
```
> npm i -D @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-search@0.15.0 @xterm/addon-web-links@0.11.0
added 4 packages, and audited 531 packages in 4s
```

- **无任何 node-gyp / prebuild / 编译输出**。A3 实测：`where.exe cl.exe` 与 `where.exe vswhere` 均 `exit=1`（本机无 C++ 编译器）→ 只能走预编译包，与规格 §7.1「免编译」一致。
- 预编译产物（规格 §7.2 的四个文件，任务 14 `asarUnpack` 的前提）：
```
node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64\conpty.node              291328 B
node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64\conpty_console_list.node 134656 B
node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64\conpty\conpty.dll        110152 B
node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64\conpty\OpenConsole.exe    62472 B
```
- 安装版本：`@lydell/node-pty` = `1.2.0-beta.15`、`@lydell/node-pty-win32-x64` = `1.2.0-beta.15`

**偏离与处置（已按规格纠正）**：npm 因本机全局 `npm config get save-prefix` = `^`，把四个 `@xterm/*` 写成了 `^5.5.0` / `^0.10.0` / `^0.15.0` / `^0.11.0`。规格 §7.1 的表格里 node-pty 带 `^`、xterm 不带；§9.5 写「本期钉 5.5.0 + addons 0.10.0/0.15.0/0.11.0」；check B1 写「版本钉死」。→ 已把四个 xterm 改回**精确版本**，`@lydell/node-pty` 保留 `^1.2.0-beta.15`（计划步骤 1 的命令与 §7.1 逐字），再 `npm install`（`up to date`）同步 lock。最终 `git diff -- package.json`：

```
+    "@lydell/node-pty": "^1.2.0-beta.15",
+    "@xterm/addon-fit": "0.10.0",
+    "@xterm/addon-search": "0.15.0",
+    "@xterm/addon-web-links": "0.11.0",
+    "@xterm/xterm": "5.5.0",
```

## 4. 接口契约自查（C1–C5 逐字）

| # | 契约 | 实现位置 | 一致性 |
|---|---|---|---|
| C1 | `class PtyProcess { readonly pid: number; write; resize; onData; onExit; isRunning; async stopGraceful }` | :78-146 | 七个成员逐字。两处实现细节：`pid` 是 `get pid()`（:96，只读 number，满足 `readonly pid: number`，原因见 §8-2）；构造函数参数是本文件自定义的最小结构面 `PtyHandle`（:64-71），`pty.IPty` 结构上可赋值 |
| C2 | `export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess` | :157 | 逐字 |
| C3 | `export function shellExe(shell: TerminalId): { exe: string; args: string[] }` | :150 | 逐字（返回副本，防调用方改数组污染映射表） |
| C4 | `interface QlDeps { onData; onExit; onSysLine; homedir; spawnExe }` | :170-176 | 五个成员与 `spawnExe` 的返回形状逐字 |
| C5 | `class QuickLaunchManager { constructor(deps, terminalAvailable); async start; write; resize; async stop; async stopAll; states }` | :215-382（首轮 :215-373） | 构造签名逐字；`start` 返回 `Promise<{ tabId: string \| null }>`；`states()` 返回 `Record<string, { running; stopping }>`。为可测性另加一个 `protected createShellProcess`（:227，见 §8-1） |

F 段硬约束取证：

- **F1**：:159-166 的 `pty.spawn(exe, args, { name, cols, rows, cwd, env })` —— 选项对象只有这五项；全文件无 `encoding` 字面量（grep `encoding` 只命中注释里的说明行）
- **F2**：:245 `this.createShellProcess(shell, DEFAULT_COLS, DEFAULT_ROWS, this.deps.homedir())` —— cwd 来自 `deps.homedir()`
- **F3**：exe 类型不经 PTY，走 `deps.spawnExe`（:276）；`{ windowsHide: true, stdio: "ignore" }` 属生产侧适配器（简报已把它列为任务 6 的待办，`process.ts` 不得改）
- **F4**：:216 `private readonly instances = new Map<string, Instance>()`，`Instance` 含 `proc` 与 `tabId`（:201-213）；重复启动在 `start()` 第一行挡掉（:233）
- **F5/F6**：见 §3 的 package.json diff（xterm 四个在 devDependencies、node-pty 在 dependencies）

## 5. E1–E11 ↔ 用例对应表

| # | 断言 | 用例（`src-main/quick-launch.test.ts` 行号） | 关键断言 |
|---|---|---|---|
| E1 | cmd 无参 / pwsh `-NoLogo` | :140 | `toEqual({ exe: "cmd.exe", args: [] })` / `{ exe: "pwsh.exe", args: ["-NoLogo"] }` |
| E2 | powershell `-NoLogo` / wsl 无参 | :145 | 同上形状 |
| E3 | 真机 cmd.exe | :153（**真** `QuickLaunchManager` + 真 `spawnShell`） | `start` 返回 `{ tabId: "ql:c1" }`；`states()` = `{ c1: { running: true, stopping: false } }`；轮询 ≤20s 直到拼接输出含 `HI`（自动命令真的被 shell 执行）；每条 `onData` 的 `tabId` 都是 `ql:c1`；`stop` 后状态清空 |
| E4 | **R1**：首批输出之后才 `write` | :169 | 共享时间线：`emit()` 前 `writes === []` 且 `timeline === []`；`emit()` 后 `timeline === ["deps.onData","pty.write"]`（顺序严格）；再 `emit` 只多一条 `deps.onData`，写入仍只有一次 |
| E5 | **R1**：5s 无输出兜底写入 | :189（`vi.useFakeTimers`） | 推进 4999ms → `writes === []` 且 `timeline === []`；再推进 2ms → `writes === ["echo HI\r"]`、`timeline === ["pty.write"]`（不依赖任何输出）；随后 `emit` 不再重复写 |
| E6 | 重复启动抛 `STATE:` | :221 | 运行中再 `start` → `rejects.toThrow(/^STATE:/)` 且 `shells.length === 1`；**停止中**（`stop()` 未 await）再 `start` 同样 `STATE:` |
| E7 | 终端不可用 → `VALIDATION:` 且不残留 | :234 | `terminalAvailable: (id) => id !== "cmd"` → `/^VALIDATION:/`；`states() === {}`；`shells.length === 0` |
| E8 | `stop()` 后发 `onExit` 且状态清空 | :259 | `exits === [{ configId: "c1", code: 0 }]`；`states() === {}`；**`m.shells[0].stopArgs === [3]`（§7.5 的默认 3s 口径，修复轮 2 补，见 §11）**；再 `stop` 幂等（不重复发） |
| E9 | `stopAll` 停全部并清空 + 透传超时 | :287（首轮 :283，修复轮 1 改断言、修复轮 2 位移 +3） | shell + exe 两条配置 → `stopAll(7)` → `states() === {}`，且两侧 `stopGraceful` 都收到 `7`（透传，口径 C5(a)/K11(1)，见 §10） |
| E10 | shell → `ql:<id>`；exe → `null` + `onSysLine` | :300（首轮 :296） | `{ tabId: "ql:c1" }` / `{ tabId: null }`；`spawnExe` 收到 `notepad.exe`；exe 不产生任何 `onData`；exe 退出后 `onExit` 与 `onSysLine`（`configId === "c2"`）都发出 |
| E11 | `stopGraceful` = 终止 → 超时 → `taskkill /T /F` | :333（首轮 :329；假 `PtyHandle` + `vi.mock("node:child_process")` 记录 `execFileSync`） | 1s 时只有 `kill`、`taskkillCalls === []`；越过 3s 后 `taskkillCalls === [{ cmd: "taskkill", args: ["/T","/F","-PID","4321"] }]`；:363 另一条：已退出的进程 `stopGraceful` 不再 `kill`、不 `taskkill` |

补充用例（超出 E 表，钉 §7.5 / §12.4 的其余条款；现行号，修复轮 2 起 :274 / :318 因 E8 补断言位移 +3）：:208 cmd 为空不写自动命令；:242 exe 空 / type 非法 → `VALIDATION:`；:250 **shell spawn 失败不残留状态**（§12.4，抛 `PROC:`）；:274 进程自己退出 → 发 `onExit`、状态清空、可再次启动（§7.5 按钮回落）；:318 `write`/`resize` 转发到进程、未运行配置抛 `STATE:`。

## 6. TDD 与回归门（真实输出）

**D3 先红**（`npx vitest run src-main/quick-launch.test.ts`，exit 1）：

```
FAIL  src-main/quick-launch.test.ts [ src-main/quick-launch.test.ts ]
Error: Failed to load url ./quick-launch (resolved id: ./quick-launch) in
D:/Dev/Projects/lms_launcher/src-main/quick-launch.test.ts. Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```

**D5 / G1 后绿**（`npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts`，exit 0）：

```
 ✓ src-main/quick-launch.test.ts (17 tests) 263ms
 ✓ src-main/process.test.ts (5 tests) 6305ms
   ✓ process.ts > drain_exit_reports_quick_child 3011ms
   ✓ process.ts > launch_applies_cwd_to_child 3022ms
 Test Files  2 passed (2)
      Tests  22 passed (22)
   Duration  6.59s
```

（用例运行期间 stderr 打印 `[i18n] missing key: err.ql.alreadyRunning / terminalGone / ptySpawn / exeRequired / typeInvalid` —— K8 的既有现象：词典在任务 8 落地，用例只断前缀，不影响结果。）

**G2 类型门**：`npx tsc -p tsconfig.main.json --noEmit` → 无任何输出，`TSC_EXIT=0`。

**G3 范围**：

```
$ git diff --name-only
package-lock.json
package.json
$ git ls-files --others --exclude-standard
src-main/quick-launch.test.ts
src-main/quick-launch.ts
$ git diff --stat -- src-main/process.ts src-main/process.test.ts
（空 = 未改）
```

**额外 · i18n 硬门**（新文件在 `key-coverage` / `no-hardcoded` 的扫描范围内，必须跑）：`npx vitest run src-main/i18n` → `Test Files 4 passed (4)` / `Tests 18 passed (18)`。

**额外 · 全量回归**：`npx vitest run` → `Test Files 43 passed (43)` / `Tests 714 passed (714)`（exit 0，8.52s）。

## 7. 反向自检（变异测试，证明用例有牙）

每次改 `quick-launch.ts` 一处 → 跑定向 → 还原 → 校验哈希回到**当时**的 `47838E7D…1B5DE5`（373 行，首轮值；该哈希与行数已被 §10 的修复轮 1 取代，现值见开头）。

| 变异 | 结果 |
|---|---|
| A：:252-253 把「先转发输出、再写自动命令」颠倒 | `1 failed \| 16 passed` —— E4 红（`expected ["pty.write","deps.onData"] to deeply equal ["deps.onData","pty.write"]`） |
| B：:33 `AUTO_CMD_TIMEOUT_MS` 5000 → 1000 | `1 failed \| 16 passed` —— E5 红 |
| C：:138 去掉 `execFileSync("taskkill", …)` | `1 failed \| 16 passed` —— E11 红 |
| D：:233 去掉「一配置一实例」守卫 | `1 failed \| 16 passed` —— E6 红 |

（首轮自检时变异 A **没有**让任何用例红：当时的 E4 只记录 `deps.onData`、不记录 `pty.write`，顺序断言形同虚设。已把 `pty.write` 并入同一条时间线后重做，A 才被抓出。这条教训记在这里。）

## 8. 设计决策（实现里必须做选择、且影响后续任务的点）

1. **E4/E5 的注入接缝 = `protected createShellProcess`（:227）**。C5 的构造签名逐字不动（`constructor(deps, terminalAvailable)`），`QlDeps` 也没有 shell 的注入位；测试用 `class TestManager extends QuickLaunchManager` 覆写这个 protected 方法注入假进程（test.ts:80-92）。生产路径就是 `spawnShell`。与任务 4 的 K10(2) 同口径：加内部接缝、不改导出签名。
2. **`PtyProcess.pid` 用 getter 转发底层句柄（:96-98）**。真机实测：`pty.spawn()` 返回的瞬间 `handle.pid === 0`，约 1s 后才变成真 pid（node-pty `windowsTerminal.js:62/:69` 是异步赋 `innerPid`）。若在构造时快照，`stopGraceful` 的 `taskkill -PID 0` 永远打不中 → 属性仍是只读 number，语义与 C1 一致。
3. **强杀后再等 `FORCE_EXIT_WAIT_MS = 1000ms` 让 exit 事件落地（:39、:141-143）**。否则 `stop()` 返回时 `states()` 里还留着 `stopping: true`，渲染端按钮不回落（§7.5）。另外 `stop()` 在 `stopGraceful` 返回后若实例仍在（exit 事件始终没来），按 `exitCode = -1` 兜底收尾（:320-324；`-1` 与 `process.ts:46` 的「未知退出码」同口径）。
4. **`onSysLine` 与 `write`/`resize` 的文案复用词典既有键**（不新建 `log.ql.*`，也不新增 `err.ql.*`）：exe 启动 → `t("log.launcher.start.cmd", { cmd })`（dict.ts:175 / :455）；exe 退出 → `t("log.app.exit", { code })`（dict.ts:262 / :542）；`write`/`resize` 打到未运行的配置 → `"STATE: " + t("err.proc.noChild")`（dict.ts:256 / :536）。三个键 zh/en 都在，`key-coverage` 的占位符双向比对也过（实测绿）。
5. **本任务用到的 `err.ql.*` key 与占位符**（K8：走常量映射 `QL_ERR`（:18-25），不写字面量）。任务 8 落地词典时必须按这份占位符名建键，否则调用点改回字面量 `t()` 后 `key-coverage` 会红：

| key | 用在哪 | 占位符 |
|---|---|---|
| `err.ql.alreadyRunning`（D8） | `start()` 重复启动 → `STATE:` | 无 |
| `err.ql.terminalGone`（D9） | 启动前终端不可用 → `VALIDATION:` | `{terminal}` |
| `err.ql.ptySpawn`（D10） | PTY spawn 失败 → `PROC:` | `{exe}` `{err}`（与 `err.proc.spawnFail` 同名） |
| `err.ql.typeInvalid`（D3） | `entry.type` 不是 shell/exe → `VALIDATION:` | `{type}`（与任务 3 已落地的一致） |
| `err.ql.exeRequired`（D6） | exe 为空 → `VALIDATION:` | 无（与任务 3 一致） |
| `err.ql.notFound`（D7） | 已在 `QL_ERR` 里备好（本任务的 `start()` 收到空 entry 时走 `typeInvalid`，因为拿不到「配置不存在」这一层信息——那是任务 6 读配置后的判断） | `{id}`（与任务 3 一致） |

6. **`start()` 不带尺寸 → 用 80×24 兜底（:30-31）**。C5 的 `start` 没有 cols/rows 参数，尺寸由任务 6 的 `ql_resize` 立刻校正；不兜底就会把 0×0 写进 PTY（正是审查重点 2 的反面）。
7. **`spawnShell` 把 `shellExe` 的 args 传给 `pty.spawn`（:159）**。规格 §7.3 的代码片段写 `pty.spawn(exe, [], …)`，但同节正文要求 `pwsh.exe -NoLogo` / `powershell.exe -NoLogo`，check E1/E2 也要求 args 里有 `-NoLogo`。取正文与 check（片段里的 `[]` 表达的是「没有 v1 的 `-Command` 包装」）。
8. **`QL_TAB_PREFIX = "ql:"` 在本文件内私有（:41）**。渲染端的同名常量按计划放在 `src/modules/log-tabs.ts`（任务 10 C1）；主进程不 import 渲染端，故各留一份。若要共享需新开共享模块（不在本任务边界内）。

## 9. 疑虑（请主代理裁定）

1. **§8-5 那六个 `err.ql.*` 键与占位符目前只存在于代码注释里**，任务 8 表 D 段没有 `terminalGone` / `ptySpawn` 的占位符说明。若不在任务 8 落地前对齐，任务 8 把调用点改回字面量 `t()` 时 `key-coverage` 的占位符双向比对会红。建议：把 §8-5 这张表并入任务 8 表 D 段的占位符注（与任务 3 那张注同一格式）。
2. **E10 的「经 `onSysLine` 反馈」我实现为 exe 启动 + exe 退出两条日志**，用的是词典既有键（`log.launcher.start.cmd` / `log.app.exit`）。若产品上希望 exe 类型有专属文案（例如「已启动记事本，无页签」），需要任务 8 新增 `log.ql.*` 键——那超出本任务边界（任务 8 F4「不加规格外的键」），我没有自行加。
3. **真机进程树**：E11 用假句柄钉住了「先 kill → 超时 → 带 `/T /F` 的 taskkill」这条时序与参数；但真机上我另外观察到 `h.kill()` 之后 ConPTY 的**子进程也已消失**（临时脚本：`Get-CimInstance Win32_Process -Filter "ParentProcessId=<pid>"` → `[]`；node-pty `windowsPtyAgent.js:194-196` 会连带清理 console 进程）。也就是说真机集成用例无法区分「只 kill」与「taskkill /T /F」，所以 §12 硬门 5（`ping -n 60` → `[停止]` → `tasklist` 无残留）仍必须在任务 14 的真机验收里逐条记录，不能因为本任务绿了就宣称已验收。
4. **`stopAll` 末尾的 `this.instances.clear()`（:336）** 是兜底：正常路径每个实例都由 `finalize` 摘掉并发出 `onExit`；若某实例停在异常态被 clear 掉，就不会补发 `onExit`。任务 7 接线时 `stopAll(3)` 之后紧跟 `app.exit(0)`，影响为零；登记在此以免日后误读。
5. **`@lydell/node-pty` 的 `^1.2.0-beta.15`** 是预发布版本，`^` 允许同基线更高的 beta（如 `1.2.0-beta.16`）。这是计划步骤 1 与规格 §7.1 逐字给的写法，我照抄；若要彻底钉死就改成 `1.2.0-beta.15`（一行改动，但偏离计划命令）。
6. **`start()` 的「配置存在」校验不在本层**：`start(configId, entry)` 收到的是 entry，无法判断「配置在 yaml 里不存在」，只能对 `entry` 为空的调用抛 `VALIDATION: typeInvalid`。§7.5 的「配置存在」这一步实际由任务 6 在 `ql_start` 里读配置后判断（届时用 `err.ql.notFound`）。已在此登记以免被当成漏项。
## 10. 修复轮 1 · 审查 Important #1：`stopAll(timeoutSecs)` 的参数被静默丢弃

- 起点：HEAD = `321707b`（口径已落 docs：任务 5 表 C5(a) + 索引 K11(1)）；工作区仍是任务 5 的四个未提交文件
- 范围：**只有这一处**。改 `src-main/quick-launch.ts` 的 stop/stopAll + `src-main/quick-launch.test.ts` 的 E9。审查列的次要项（`states()` 不调 `proc.isRunning()`、`exited` 语义、`FORCE_EXIT_WAIT_MS`、`stopping` 期间 write/resize、`QL_ERR.notFound` 死条目、exe 分支不包前缀）一律未动，已记入账本交最终整分支审查。C1-C5 公开签名一字未改，`protected createShellProcess` 接缝原样。
- 修复后：`quick-launch.ts` = 383 行 / SHA-256 `3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74`（**该值至今未变**，见 §11）；`quick-launch.test.ts` = 379 行 / `5C6C3E32C9BD9F73B25B5DF0B0AEAE1E787B6AA0F1618527E9DAF0897EC8D720`（已被 §11 的修复轮 2 取代：现 382 行 / `0B461D3B…FB62F2`）

### 10.1 改动前后对照

`src-main/quick-launch.ts`（原 :310-337 → 现 :310-346，净 +10 行；`STOP_TIMEOUT_SECS`(:35) 未动）：

```ts
// 前（:310-337）
  /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等 */
  async stop(configId: string): Promise<void> {
    const inst = this.instances.get(configId);
    if (!inst) return;
    inst.stopping = true;
    try {
      await inst.proc.stopGraceful(STOP_TIMEOUT_SECS);   // ← 硬编码
    } catch { /* 停止失败也要收尾，否则状态卡在 stopping */ }
    if (this.instances.get(configId) === inst && !inst.exited) { inst.exitCode = -1; this.finalize(configId, inst); }
  }

  /** 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余 */
  async stopAll(timeoutSecs: number): Promise<void> {
    for (const configId of Array.from(this.instances.keys())) {
      try { await this.stop(configId); } catch { /* 继续停下一个 */ }   // ← timeoutSecs 被丢弃
    }
    this.instances.clear();
  }
```

```ts
// 后（:310-346）
  /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等。超时走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS） */
  async stop(configId: string): Promise<void> {
    await this.stopInternal(configId);                                   // :312 走默认
  }

  /**
   * 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余。
   * 口径 C5(a) / 索引 K11(1)（任务 5 审查 Important #1）：timeoutSecs 必须**透传**给每个停止动作，
   * 不得被 stop() 里的 STOP_TIMEOUT_SECS 覆盖 —— 任务 7 按 exit_app 的超时调用 stopAll(n)。
   */
  async stopAll(timeoutSecs: number): Promise<void> {
    for (const configId of Array.from(this.instances.keys())) {
      try { await this.stopInternal(configId, timeoutSecs); } catch { /* 继续停下一个 */ }   // :323 透传
    }
    this.instances.clear();
  }

  /** 停止的公共实现：stop() 用默认超时（3s），stopAll() 透传调用方给的秒数 */
  private async stopInternal(configId: string, timeoutSecs: number = STOP_TIMEOUT_SECS): Promise<void> {
    const inst = this.instances.get(configId);
    if (!inst) return;
    inst.stopping = true;
    try {
      await inst.proc.stopGraceful(timeoutSecs);                         // :337
    } catch { /* 停止失败也要收尾，否则状态卡在 stopping */ }
    if (this.instances.get(configId) === inst && !inst.exited) { inst.exitCode = -1; this.finalize(configId, inst); }
  }
```

`src-main/quick-launch.test.ts` E9（原 :282-293 → 现 :282-294）：

```ts
// 前：断的值恰好等于常量 → 结构上无法区分「透传」与「硬编码」
  // E9
  it('stopAll 停掉全部并清空 states', async () => {
    …
    await m.stopAll(3);
    expect(m.shells[0].stopArgs).toEqual([3]);
    expect(ctx.exeHandles[0].stopArgs).toEqual([3]);
  });

// 后：7 ≠ STOP_TIMEOUT_SECS(3)，透传与硬编码可区分
  // E9（口径 C5(a) / 索引 K11(1)：stopAll 的 timeoutSecs 必须**透传**，不得被 stop() 的 STOP_TIMEOUT_SECS 覆盖）
  // 传 7 而不是 3：3 == STOP_TIMEOUT_SECS，断 [3] 在结构上无法区分「透传」与「硬编码」。
  it('stopAll 停掉全部并清空 states，并透传 timeoutSecs', async () => {
    …
    await m.stopAll(7);
    expect(m.shells[0].stopArgs).toEqual([7]);
    expect(ctx.exeHandles[0].stopArgs).toEqual([7]);
  });
```

### 10.2 TDD：先红（只改测试，实现未动）

`npx vitest run src-main/quick-launch.test.ts`（exit 1）：

```
 ❯ src-main/quick-launch.test.ts (17 tests | 1 failed) 294ms
   × 状态机（规格 §7.3 / §7.5 / §12.4） > stopAll 停掉全部并清空 states，并透传 timeoutSecs 5ms
     → expected [ 3 ] to deeply equal [ 7 ]
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

「收到 3、期望 7」正是缺陷本身：调用方给 7，进程只等到 3。

### 10.3 实现后：定向 + 回归 + 类型门

`npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts`（exit 0）：

```
 ✓ src-main/quick-launch.test.ts (17 tests) 263ms
 ✓ src-main/process.test.ts (5 tests) 6305ms
   ✓ process.ts > drain_exit_reports_quick_child 3011ms
   ✓ process.ts > launch_applies_cwd_to_child 3012ms
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

`npx tsc -p tsconfig.main.json --noEmit` → 无任何输出，`EXIT=0`。
`npx vitest run src-main/i18n`（新文件在扫描范围内，复跑）→ `Test Files 4 passed (4)` / `Tests 18 passed (18)`（exit 0）。

### 10.4 反向自检 E：把 `stopAll` 改回 `this.stop(configId)`（丢掉参数）

`:323` 临时改回 `await this.stop(configId);` → `npx vitest run src-main/quick-launch.test.ts`（exit 1）：

```
 ❯ src-main/quick-launch.test.ts (17 tests | 1 failed) 302ms
   × 状态机（规格 §7.3 / §7.5 / §12.4） > stopAll 停掉全部并清空 states，并透传 timeoutSecs 5ms
     → expected [ 3 ] to deeply equal [ 7 ]
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

还原后复跑：`Tests 22 passed (22)`（exit 0）、`tsc` 无输出（`EXIT=0`），且 `src-main/quick-launch.ts` 的 SHA-256 与 §10 开头记录的 `3AD853E6…ECF6D74` 逐字节一致（脚本内比对：`RESTORED hash matches fixed: true`）→ 无变异残留。

### 10.5 本轮遗留（不改代码，登记）

1. **`stop()` 的默认 3s 现在没有任何用例钉住**：E9 改用 7 之后，全测试文件里 `stopArgs` 只出现在 E9；若有人把 `stopInternal` 的默认值改掉（或把 `stop()` 也接上别的超时），不会有用例变红。修法是在 E8 加一行 `expect(m.shells[0].stopArgs).toEqual([3])`——属新增断言、超出「只改这一处」的授权，留给最终整分支审查裁定。**→ 主代理已裁定并派第 2 轮修复，已落地，见 §11。**
2. 其余审查次要项未动，见本节开头。

## 11. 修复轮 2 · 审查 Important #2：`stop()` 的默认 3s 无用例钉住（§10.5-1 落地）

- 起点：HEAD = `321707b`；工作区仍是任务 5 的四个未提交文件；`src-main/quick-launch.ts` **改前**哈希 = `3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74`（383 行）
- 范围：**只在 E8 补一条断言**（`src-main/quick-launch.test.ts:268`）。实现一字未改；其它用例一字未改；C1-C5 签名与 `protected createShellProcess` 接缝原样；`package.json` / `package-lock.json` / `process.ts` / `process.test.ts` 未动；未新增文件；用例数仍 17（未新增用例）。
- 修复后：`quick-launch.test.ts` = 382 行 / SHA-256 `0B461D3B040B9C663A588444841A94AD385E74D10B31F4CD1EBFE2BD06FB62F2`；`quick-launch.ts` 哈希不变（证明见 §11.5）。

### 11.1 为什么这条必须有（主代理的变异探针）

把 `src-main/quick-launch.ts:35` 的 `const STOP_TIMEOUT_SECS = 3;` 改成 `= 9;`，**修复前** `npx vitest run src-main/quick-launch.test.ts` 仍全绿（exit 0）→ 规格 §7.5「`[停止]` = 终止 → 3s → `taskkill /T /F`」这条口径在测试里没有任何锚点。
E9 用 7 钉住「透传」，代价是默认路径失去覆盖。两条必须并存：**E9 钉「调用方给的秒数不被覆盖」，E8 钉「不带参数时走 3s」**——缺任一条，另一个方向的改动都静默通过。

### 11.2 改动（E8，只加一条断言，其余一字未动）

```ts
// 前（test.ts:263-268）
    await m.stop('c1');
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
    expect(m.states()).toEqual({});
    // 幂等：再 stop 不报错、不重复发 onExit
```

```ts
// 后（test.ts:263-271）
    await m.stop('c1');
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
    expect(m.states()).toEqual({});
    // 修复轮 2（报告 §10.5-1 的缺口）：stop() 不带参数 → 必须走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS）。
    // E9 已改用 7 钉「透传」，本条钉「默认值」；把 :35 的常量改成 9 时本条必须红。
    expect(m.shells[0].stopArgs).toEqual([3]);
    // 幂等：再 stop 不报错、不重复发 onExit
```

取 `m.shells[0]`（该用例里 `TestManager` 注入的唯一假进程）；`stop()` 幂等路径不产生第二次 `stopGraceful`，故断言放在幂等段之前，语义 = 「这一次停止用的是 3」。

### 11.3 TDD：先红（临时把实现的常量改成 9，其余不动）

`src-main/quick-launch.ts:35` 临时 `3` → `9` → `npx vitest run src-main/quick-launch.test.ts`（exit 1）：

```
MUTATED LINE: const STOP_TIMEOUT_SECS = 9;
 ❯ src-main/quick-launch.test.ts (17 tests | 1 failed) 293ms
   × 状态机（规格 §7.3 / §7.5 / §12.4） > stop() 后发出 onExit 且 states() 变空 5ms
     → expected [ 9 ] to deeply equal [ 3 ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src-main/quick-launch.test.ts > 状态机（规格 §7.3 / §7.5 / §12.4） > stop() 后发出 onExit 且 states() 变空
AssertionError: expected [ 9 ] to deeply equal [ 3 ]
 ❯ src-main/quick-launch.test.ts:268:34
    268|     expect(m.shells[0].stopArgs).toEqual([3]);
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
   Duration  580ms
VITEST_EXIT=1
```

只有新断言红、其余 16 条不受影响 → 主代理探针指出的盲区已消除。
还原（脚本内 `Set-Content` 回写原文）：`RESTORED hash matches fixed: True` / `HASH=3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74`。

### 11.4 后绿：定向 + 相邻回归 + 类型门

`npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts`（exit 0）：

```
 ✓ src-main/quick-launch.test.ts (17 tests) 269ms
 ✓ src-main/process.test.ts (5 tests) 6319ms
   ✓ process.ts > drain_exit_reports_quick_child 3011ms
   ✓ process.ts > launch_applies_cwd_to_child 3018ms
 Test Files  2 passed (2)
      Tests  22 passed (22)
   Duration  6.61s
VITEST_EXIT=0
```

`npx tsc -p tsconfig.main.json --noEmit` → 无任何输出，`TSC_EXIT=0`。

### 11.5 实现未动的证明 + 范围复核

```
> Get-FileHash src-main/quick-launch.ts -Algorithm SHA256
3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74  src-main/quick-launch.ts
```

与本轮改前记录的哈希逐字符相同（本轮对实现只做「:35 临时变异 → 还原」，脚本比对 `RESTORED hash matches fixed: True`）→ 无变异残留。

`git status --porcelain` = `M package.json` / `M package-lock.json` / `M docs/superpowers/checks/…/task-05-pty-manager.md`（只追加 J 段）/ `?? src-main/quick-launch.ts` / `?? src-main/quick-launch.test.ts`；`git diff --stat -- src-main/process.ts src-main/process.test.ts` 无输出。本轮唯一代码改动 = `quick-launch.test.ts` 的 E8 一条断言。未 `git add`、未 commit。

### 11.6 本轮之后仍开的项（未动）

1. §10 开头列的审查次要项：`states()` 不调 `proc.isRunning()`、`exited` 语义、`FORCE_EXIT_WAIT_MS`、`stopping` 期间的 `write`/`resize`、`QL_ERR.notFound` 死条目、exe 分支不包前缀 —— 交最终整分支审查。
2. §9 的 6 条疑虑不变（尤其 1：六个 `err.ql.*` 键与占位符须在任务 8 落地前对齐，否则 `key-coverage` 会红）。
3. §12 硬门 5（真机进程树无残留）仍留给任务 14 的真机验收，本任务的绿不构成验收。

