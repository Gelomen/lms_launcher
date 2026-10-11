# 任务 5 · 依赖安装 + `PtyProcess` + `QuickLaunchManager` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 5 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §7.1 / §7.3 / §7.4 / §7.5 / §12.4 · 钉住审查重点 **R1**（shell 未就绪就写命令）
> 前置：无硬性代码依赖，但这是后面所有终端任务的地基。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 包管理器 = **npm**（已定，不是待决项） | `git ls-files -- package-lock.json pnpm-lock.yaml`；比较 `node_modules\.package-lock.json` 与 `node_modules\.modules.yaml` 的时间 | 两份 lockfile 都被 git 跟踪，但**当前生效的是 npm**：`node_modules\.package-lock.json` 与 `package-lock.json` 是最近一次安装（pnpm 的 `.modules.yaml` 停在更早一次），且 `build.bat:38` 跑的是 `call npm install`。→ 本特性一律用 `npm i`，只提交 `package-lock.json`；`pnpm-lock.yaml` 见 H3 | ☐ |
| A3 | 无 C++ 编译器确认 | `where.exe cl.exe` / `where.exe vswhere` | 均不存在 → 只能装预编译包（G2） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `package.json` + `package-lock.json` | 修改 | 只加计划点名的 5 个包，版本钉死（G1）；不动 `pnpm-lock.yaml`（见 H3） | ☐ |
| B2 | `src-main/quick-launch.ts` | 新建 | `PtyProcess` + `spawnShell` + `shellExe` + `QuickLaunchManager` | ☐ |
| B3 | `src-main/quick-launch.test.ts` | 新建 | 含真机 PTY 集成用例 | ☐ |
| B4 | `src-main/process.ts` / `process.test.ts` | **不得改** | G4 | ☐ |

## C. 接口契约（逐字一致，任务 6/7/13 据此调用）

| # | 契约 | ✓ |
|---|---|---|
| C1 | `class PtyProcess { readonly pid: number; write(data: string): void; resize(cols: number, rows: number): void; onData(cb: (d: string) => void): void; onExit(cb: (code: number) => void): void; isRunning(): boolean; async stopGraceful(timeoutSecs: number): Promise<void> }` | ☐ |
| C2 | `export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess` | ☐ |
| C3 | `export function shellExe(shell: TerminalId): { exe: string; args: string[] }` | ☐ |
| C4 | `interface QlDeps { onData(tabId, data); onExit(configId, code); onSysLine(configId, line); homedir(): string; spawnExe(exe): { onExit; stopGraceful(s); isRunning() } }` | ☐ |
| C5 | `class QuickLaunchManager { constructor(deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean); async start(configId, entry): Promise<{ tabId: string \| null }>; write(configId, data); resize(configId, cols, rows); async stop(configId); async stopAll(timeoutSecs); states(): Record<string, { running: boolean; stopping: boolean }> }`。**两条补充口径（索引 K11）**：(a) `stopAll(timeoutSecs)` 必须把 `timeoutSecs` **透传**给每个停止动作，不得被 `stop()` 里的 `STOP_TIMEOUT_SECS` 常量覆盖（任务 5 审查 Important #1）；(b) 允许一个 `protected createShellProcess` 测试接缝（E4/E5 要注入假进程，C4/C5 没有注入位），**公开签名一字不改**，任务 6/7 不得把它当公开 API 调用 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：装依赖 | `npm i @lydell/node-pty@^1.2.0-beta.15`；`npm i -D @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-search@0.15.0 @xterm/addon-web-links@0.11.0` | **无任何编译输出**；`node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty.node` 存在 | ☐ |
| D2 | 步骤 2：先写失败测试 | — | E 组断言全部有对应用例 | ☐ |
| D3 | 步骤 3：验证失败 | `npx vitest run src-main/quick-launch.test.ts` | FAIL（模块不存在） | ☐ |
| D4 | 步骤 4：实现 | — | `PtyProcess` 包装 `@lydell/node-pty` 的 spawn/kill/resize/write/onData/onExit，**不传 encoding**；exe 走 `deps.spawnExe`（生产传 `ProcessState` 适配器） | ☐ |
| D5 | 步骤 5：验证通过 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | 全 PASS（后者证明 llama-server 链路未受影响） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 期望 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | `shellExe('cmd')` → `{ exe: 'cmd.exe', args: [] }`；`shellExe('pwsh')` → `{ exe: 'pwsh.exe', args: ['-NoLogo'] }` | **没有 `-Command` 包装** | 规格 §7.3 | ☐ |
| E2 | `shellExe('powershell')` 带 `-NoLogo`；`shellExe('wsl')` → `wsl.exe` 无参 |  | 规格 §7.3 | ☐ |
| E3 | 真机集成：启动 cmd 配置后 `onData` 至少一次，拼接后含 `'HI'` | 真跑 `cmd.exe` | 规格 §12.4 | ☐ |
| E4 | **R1**：`deps.onData` 第一次被调用**之后**才发生 `pty.write`（等首批输出） | 用假 PtyProcess 断言顺序 | 计划 审查重点 1 | ☐ |
| E5 | **R1**：5s 内无输出 → 超时兜底写入 | 假 PtyProcess + 假计时器 | 规格 §7.3 | ☐ |
| E6 | 重复启动同一配置 → 抛 `/^STATE:/` |  | 规格 §7.3 | ☐ |
| E7 | 终端不可用 → 抛 `/^VALIDATION:/` 且 `states()` **不残留**该 id |  | 规格 §7.5 / §12.4 | ☐ |
| E8 | `stop()` 后发出 `onExit` 且 `states()` 变空 |  | 规格 §7.5 | ☐ |
| E9 | `stopAll` 停掉全部并清空 `states` |  | 规格 §7.5 | ☐ |
| E10 | shell 类型 `start` 返回 `{ tabId: 'ql:<configId>' }`；exe 类型返回 `{ tabId: null }` 且经 `onSysLine` 反馈 |  | 规格 §7.5 / §8 | ☐ |
| E11 | `stopGraceful` 口径：终止 → 3s → `taskkill /T /F`（杀进程树） |  | 规格 §7.5 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | `pty.spawn` 选项只有 `name/cols/rows/cwd/env`，**无 `encoding`** | Windows 实现 warn，编码链路不可预期（G3） | ☐ |
| F2 | `cwd` = `deps.homedir()`（用户主目录） | 与用户决策不符 | ☐ |
| F3 | exe 类型不用 PTY：`spawn(exe, [], { windowsHide: true, stdio: 'ignore' })` | 闪窗 / 管道堆积 | ☐ |
| F4 | 一配置一实例：`Map<string, { pty; tabId } }` | 重复启动产生孤儿进程 | ☐ |
| F5 | `@xterm/*` 必须在 `devDependencies`（vite 打进 renderer bundle，不进 asar） | 包体变大 / 打包语义错 | ☐ |
| F6 | `@lydell/node-pty` 必须在 `dependencies` | 打包后主进程 require 不到 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | `git diff --name-only` | 不含 `src-main/process.ts` / `process.test.ts`（G4） | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add package.json package-lock.json src-main/quick-launch.ts src-main/quick-launch.test.ts` | ☐ |
| H3 | `pnpm-lock.yaml` 处置（**不在本任务里顺手做**） | 它已被 npm 落下（漂移），但**不影响打包**——`build.bat:38` 只跑 `npm install`。要保持一致就另跑 `pnpm install --lockfile-only`，单独一次 `chore(deps): 同步 pnpm-lock.yaml`；或另开一次改动删掉两份 lockfile 中的一份。两种都不混进本特性的提交 | ☐ |
| H2 | 提交信息逐字 | `feat(main): ConPTY 终端进程管理（QuickLaunchManager + PtyProcess）` | ☐ |

## I. 完成判据

- [ ] D1 安装无编译且 `conpty.node` 存在
- [ ] E1-E11 全部有测试；E4/E5 明确覆盖 R1
- [ ] D3 先红、D5 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain`；`git log --oneline -3` | 前者无输出；HEAD = `d42a8b0 docs: 任务 4 check 表提交门与验收记录` | 起点工作区干净 |
| A2 | `git ls-files -- package-lock.json pnpm-lock.yaml`；`Get-ChildItem package-lock.json, pnpm-lock.yaml, node_modules\.package-lock.json, node_modules\.modules.yaml \| Select FullName,LastWriteTime`；`(Get-Content build.bat)[36..39]` | 两份 lockfile 都被跟踪；时间戳：`package-lock.json` 11/10 01:51:42、`node_modules\.package-lock.json` 11/10 01:51:42、`pnpm-lock.yaml` 9/10 21:34:51、`node_modules\.modules.yaml` 10/10 19:41:50；`build.bat:37-38` = `echo [build] Installing dependencies...` / `call npm install` | 生效的是 **npm**（K3）→ 本任务只用 `npm i`、只提交 `package-lock.json`；`pnpm-lock.yaml` 未动（H3） |
| A3 | `where.exe cl.exe`；`where.exe vswhere` | 两条都是 `INFO: Could not find files for the given pattern(s).`，`$LASTEXITCODE=1` | 本机无 C++ 编译器 / 无 VS → 只能装预编译包；D1 实测无编译 |
| D1 | `npm i @lydell/node-pty@^1.2.0-beta.15` | `added 2 packages, and audited 527 packages in 7s`；**无 node-gyp / 编译输出**（只有既有的 `npm warn install-scripts esbuild@…` 提示）；`node_modules/@lydell/node-pty/package.json` 的 version = `1.2.0-beta.15` | 免编译，符合 §7.1 |
| D1 续 | `npm i -D @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-search@0.15.0 @xterm/addon-web-links@0.11.0` | `added 4 packages, and audited 531 packages in 4s`；无编译输出 | 纯 JS |
| D1 取证 | `Get-ChildItem node_modules\@lydell -Recurse -Include conpty.node,conpty.dll,OpenConsole.exe,conpty_console_list.node` | `prebuilds\win32-x64\conpty.node` 291328 B；`conpty_console_list.node` 134656 B；`conpty\conpty.dll` 110152 B；`conpty\OpenConsole.exe` **1062472 B**（原记 62472 B 为笔误，主代理实测 `Get-ChildItem` 复核）；`@lydell/node-pty-win32-x64` version = `1.2.0-beta.15` | §7.2 的四个产物都在（任务 14 `asarUnpack` 的前提） |
| D1 偏差 | `git diff -- package.json`；`npm config get save-prefix`；`npm install` | 本机 `save-prefix=^` → npm 把四个 `@xterm/*` 写成 `^5.5.0` 等；已改回精确钉版 `5.5.0`/`0.10.0`/`0.15.0`/`0.11.0`（§7.1 表格 xterm 不带 `^`、§9.5「本期钉 5.5.0」、B1「版本钉死」），`@lydell/node-pty` 保留 `^1.2.0-beta.15`（计划步骤 1 逐字）；`npm install` → `up to date` 同步 lock | 依赖范围与规格一致；`git diff -- package-lock.json` = +134 行纯增量、无删除行 |
| D2 | 新建 `src-main/quick-launch.test.ts`（377 行 / 17 用例） | E1–E11 全部有对应用例（映射见报告 §5：E1 :140、E2 :145、E3 :153、E4 :169、E5 :189、E6 :221、E7 :234、E8 :259、E9 :283、E10 :296、E11 :329） | 先落失败测试 |
| D3 | `npx vitest run src-main/quick-launch.test.ts` | `FAIL src-main/quick-launch.test.ts [ … ]` / `Error: Failed to load url ./quick-launch (resolved id: ./quick-launch) in D:/Dev/Projects/lms_launcher/src-main/quick-launch.test.ts. Does the file exist?` / `Test Files 1 failed (1)` / `Tests no tests`（exit 1） | 模块不存在 → 红，符合预期 |
| D4 | 新建 `src-main/quick-launch.ts`（373 行：`PtyProcess` :78-146、`shellExe` :150-155、`spawnShell` :157-167、`QlDeps` :170-176、`QuickLaunchManager` :215-373） | — | 按 §7.3 / §7.5 实现；C1-C5 逐字（自查见报告 §4） |
| D5 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | `✓ src-main/quick-launch.test.ts (17 tests) 263ms` / `✓ src-main/process.test.ts (5 tests) 6305ms` / `Test Files 2 passed (2)` / `Tests 22 passed (22)`（exit 0） | 全绿；llama-server 链路未受影响 |
| G1 | 同 D5 | 同上：`Tests 22 passed (22)`（exit 0） | 定向 + 相邻回归通过 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出；`TSC_EXIT=0` | 类型门无错 |
| G3 | `git diff --name-only`；`git ls-files --others --exclude-standard`；`git diff --stat -- src-main/process.ts src-main/process.test.ts` | 前者 = `package-lock.json`、`package.json`；后者 = `src-main/quick-launch.test.ts`、`src-main/quick-launch.ts`；`git diff --stat` 对 process 两个文件无输出 | 范围 = B1+B2+B3；`process.ts` / `process.test.ts` 一行未改（B4/G4）；未 `git add`、未 commit |
| F1/F2 取证 | `grep "pty.spawn\|encoding\|homedir" src-main/quick-launch.ts` | `:159 pty.spawn(exe, args, {` 的选项对象只有 `name/cols/rows/cwd/env`（:160-165）；全文件无 `encoding` 字面量；`:245 this.deps.homedir()` | F1 / F2 成立 |
| 真机 PTY 可行性（临时脚本在 `%TEMP%\ql-scratch*.js`，不在仓库内） | `node ql-scratch.js`：`pty.spawn(cmd.exe)` → `echo HI`；再测 `h.kill()` 后的进程树 | `pid@0 0` → `pid@1s 3436`；`GOT HI`；`h.kill()` 后 `Get-CimInstance Win32_Process -Filter "ParentProcessId=<pid>"` = `[]` | Node 24 下 ConPTY 可用；**pid 在 spawn 返回瞬间是 0** → `PtyProcess.pid` 用 getter 转发句柄（:96-98），`stopGraceful` 读实时 pid；真机 kill 已连带清掉子进程 → §12 硬门 5 仍须任务 14 真机验收 |
| 反向自检 A（R1 顺序） | 把 `:252-253` 的「先转发输出、再写自动命令」颠倒 → 跑定向 → 还原 | `1 failed \| 16 passed`：E4 `expected [pty.write, deps.onData] to deeply equal [deps.onData, pty.write]` | 顺序被钉住。（首轮自检时 A **不红**：当时时间线不记 `pty.write` → 已补强 E4/E5 后重做） |
| 反向自检 B（5s 兜底） | `:33 AUTO_CMD_TIMEOUT_MS` 5000 → 1000 → 跑定向 → 还原 | `1 failed \| 16 passed`：E5「5s 内无输出则超时兜底写入」 | 兜底时长被钉住 |
| 反向自检 C（taskkill） | 去掉 `:138 execFileSync("taskkill", …)` → 跑定向 → 还原 | `1 failed \| 16 passed`：E11「先 kill，超时后才 taskkill /T /F -PID」 | 强杀分支被钉住 |
| 反向自检 D（一配置一实例） | 去掉 `:233` 的重复启动守卫 → 跑定向 → 还原 | `1 failed \| 16 passed`：E6「重复启动同一配置抛 STATE:」 | F4 被钉住 |
| 四次变异后还原校验 | `Get-FileHash src-main/quick-launch.ts`；`(Get-Content …).Count` | 每次还原后哈希恒为 `47838E7DC905C9D67B4013AAD9E68E0D9DAE5CF6F1FCB4CE78A4999DCE1B5DE5`（373 行） | 实现文件未被变异残留污染 |
| 额外 · i18n 硬门 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（含 `key-coverage` / `no-hardcoded`） | 新文件未引入缺键或汉字字面量（K8：`err.ql.*` 走常量映射，不写字面量） |
| 额外 · 全量回归 | `npx vitest run` | `Test Files 43 passed (43)` / `Tests 714 passed (714)`（exit 0，8.52s） | 全仓库无回归 |
