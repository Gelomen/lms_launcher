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
| C5 | `class QuickLaunchManager { constructor(deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean); async start(configId, entry): Promise<{ tabId: string \| null }>; write(configId, data); resize(configId, cols, rows); async stop(configId); async stopAll(timeoutSecs); states(): Record<string, { running: boolean; stopping: boolean }> }` | ☐ |

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
| D1 |  |  |  |
| D3 |  |  |  |
| D5 |  |  |  |
