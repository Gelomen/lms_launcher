# 任务 5 简报 · 依赖安装 + `PtyProcess` + `QuickLaunchManager`

## 这个任务在项目里的位置

「快捷启动卡片」计划 14 个任务中的第 5 个，也是后面所有终端任务的地基：装 `@lydell/node-pty`（ConPTY）与 xterm 前端包，写 `src-main/quick-launch.ts`（`PtyProcess` 包装 + `spawnShell` + `shellExe` + `QuickLaunchManager`）。任务 6 的 IPC、任务 7 的 `exit_app`、任务 13 的状态复原都按本文件的接口调用，**签名必须逐字一致**。

## 你的完成判据（照它逐行执行并勾选）

`docs/superpowers/checks/2026-10-10-quick-launch-card/task-05-pty-manager.md`
（A→I 逐行执行；命令与真实输出填进该表「J. 执行记录」的 D1/D3/D5 等行。H 段与 I 段留空不勾——按 K5，提交由主代理在验收后执行）

## 计划 §任务 5（逐字）

```
### 任务 5：依赖安装 + PtyProcess + QuickLaunchManager

**文件：** 修改 package.json（新增依赖）；创建 src-main/quick-launch.ts；测试 src-main/quick-launch.test.ts

**接口：**

export class PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  async stopGraceful(timeoutSecs: number): Promise<void>;
}
export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess;
export function shellExe(shell: TerminalId): { exe: string; args: string[] };
export interface QlDeps {
  onData(tabId: string, data: string): void;
  onExit(configId: string, code: number): void;
  onSysLine(configId: string, line: string): void;
  homedir(): string;
  spawnExe(exe: string): { onExit(cb: (code: number) => void): void; stopGraceful(s: number): Promise<void>; isRunning(): boolean };
}
export class QuickLaunchManager {
  constructor(deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean);
  async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }>;
  write(configId: string, data: string): void;
  resize(configId: string, cols: number, rows: number): void;
  async stop(configId: string): Promise<void>;
  async stopAll(timeoutSecs: number): Promise<void>;
  states(): Record<string, { running: boolean; stopping: boolean }>;
}

- [ ] 步骤 1：安装依赖（先装，后面测试才跑得起来）
npm i @lydell/node-pty@^1.2.0-beta.15
npm i -D @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-search@0.15.0 @xterm/addon-web-links@0.11.0
预期：无任何 node-gyp / 编译输出（预编译包）；node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/ 下 conpty.node 存在
- [ ] 步骤 2：编写失败的测试（关键：等首批输出再写命令）

// 用假的 PtyProcess 工厂注入，断言 onData 第一次触发之前不会 write
it('等 shell 首批输出后才写入自动命令', async () => { /* 见 check 表 E4 */ });
it('5s 无输出则超时兜底写入', async () => { /* 见 check 表 E5 */ });
it('重复启动同一配置抛 STATE:', async () => { ... });
it('终端不可用抛 VALIDATION: 且不残留状态', async () => { ... });
it('stop 后发出 onExit 且状态清空', async () => { ... });

- [ ] 步骤 3：运行测试验证失败 —— npx vitest run src-main/quick-launch.test.ts → FAIL
- [ ] 步骤 4：实现 PtyProcess 包装 @lydell/node-pty 的 spawn/kill/resize/write/onData/onExit（**不传 encoding**）；QuickLaunchManager 维护 Map<configId, { pty, tabId }>；exe 类型走 deps.spawnExe（生产传 ProcessState 适配器）；stopAll 逐个 stopGraceful
- [ ] 步骤 5：运行测试验证通过 —— npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts → 全 PASS
- [ ] 步骤 6：Commit —— 由主代理在验收后执行，你不要 git add、不要 commit
```

## 规格（有约束力的权威，逐字）

§7.1 依赖（新增，用户已批准）：`@lydell/node-pty` `^1.2.0-beta.15`（**免编译**：N-API 预编译，本机无任何 Visual Studio / vswhere 仍可用）；`@xterm/xterm` 5.5.0 / `@xterm/addon-fit` 0.10.0 / `@xterm/addon-search` 0.15.0 / `@xterm/addon-web-links` 0.11.0（纯 JS）。

§7.3 PTY 启动：
```ts
pty.spawn(exe, [], { name: 'xterm-256color', cols, rows, cwd: os.homedir(), env: process.env });
```
- `exe` 直接是终端本体：`pwsh.exe -NoLogo` / `powershell.exe -NoLogo` / `cmd.exe` / `wsl.exe`。**没有 v1 的 `-Command` 包装**。
- **不传 `encoding`**：Windows 实现里 `encoding` 选项不受支持（`windowsTerminal.js` 会 warn），底层 socket 是 `setEncoding('utf8')`。统一按 UTF-8 字符串处理。
- 可执行程序类型：**不用 PTY**，走 `spawn(exe, [], { windowsHide: true, stdio: 'ignore' })`（无页签、输出丢弃）。
- 一配置一实例：运行中/停止中的配置再点启动 → 抛 `STATE:`。
- 自动执行命令（用户决策）：PTY 起好后，**等第一批输出到达**（说明 shell 已就绪）再把 `cmd + '\r'` 写入；若 5s 内无任何输出，则超时兜底直接写入。

§7.5 生命周期（本任务要实现的行为，IPC 接线在任务 6）：
| 事件 | 行为 |
|---|---|
| 启动前校验 | 配置存在 → 终端仍可用（shell）/ `exe` 非空（exe）；失败抛 `VALIDATION:` |
| 启动成功 | shell → `{ tabId: 'ql:<configId>' }`；exe → `{ tabId: null }` |
| PTY 输出 | `onData(string)` → 事件 `ql-data { tabId, data }` |
| 输入 / 尺寸 | `ql_write(id, data)` → `pty.write`；`ql_resize(id, cols, rows)` → `pty.resize` |
| 进程退出 | `ql-exit { configId, code }`；行按钮回落 `[启动]`；**页签保留** |
| `[停止]` | **直接杀终端进程树**（沿用 llama-server 口径：终止 → 3s → `taskkill /T /F`）；**不关页签** |
| 应用退出 | `exit_app` 在既有 `await ps.stopGraceful(3)` 之后加 `await ql.stopAll(3)`（接线在任务 7） |

§12 单元 4：`QuickLaunchManager`：状态机（启动/重复启动抛 `STATE:`/退出回落）；`stopAll` 清空；shell 类型 spawn 失败不残留状态（真机跑 `cmd.exe` 集成用例）。

## 已定口径与既有代码（已取证）

- **K3：包管理器 = npm**。只提交 `package-lock.json`；**不要**动 `pnpm-lock.yaml`（`build.bat:38` 跑的是 `call npm install`）。
- **G4 / B4：`src-main/process.ts` 与 `process.test.ts` 一行都不改。** 需要 `ProcessState` 的形态只是为了写适配器/假实现：它的公开 API 是 `state`、`isRunning()`（:18）、`launch(exe, args, configId, cwd?)`（:27）、`stopGraceful(timeoutSecs)`（:71）、`onExit(cb: (code, error?) => void)`（:95）、`runningConfigId`（:16）。
- `TerminalId` / `QuickLaunchEntry` 从 `./quick-launch-config` import（任务 3 已导出），不要重复定义。
- 待办给任务 6（**本任务不要处理**）：规格 §7.3 要求 exe 类型 `spawn(..., { windowsHide: true, stdio: 'ignore' })`，而 `ProcessState.launch`（`process.ts:32-36`）没有 `windowsHide` 且 `process.ts` 不得改。你只需保证 `deps.spawnExe` 这个接缝保持可替换（测试用假实现），主代理会在任务 6 决定生产侧怎么接。

## 边界与硬约束（越界即不勾）

- 只碰：`package.json` + `package-lock.json`（只加计划点名的 5 个包，版本钉死）、新建 `src-main/quick-launch.ts`、新建 `src-main/quick-launch.test.ts`
- `@lydell/node-pty` 必须在 `dependencies`（F6）；`@xterm/*` 四个必须在 `devDependencies`（F5）
- `pty.spawn` 选项只有 `name/cols/rows/cwd/env`，**无 `encoding`**（F1）；`cwd` = `deps.homedir()`（F2）
- 一配置一实例：`Map<string, { pty, tabId }>`（F4）；重复启动抛 `STATE:`
- 错误前缀只用 `VALIDATION:` / `STATE:`（+ 必要的 `PROC:`）；主进程错误消息走 `t()`，但按 **K8** 不得写 `err.ql.*` 字面量 key（词典在任务 8 落地）；可复用的既有键见任务 8 表 D 段注
- 真机集成用例（E3）跑真 `cmd.exe`；其余用假 `PtyProcess` 注入断言顺序（E4/E5 是审查重点 R1，必须明确覆盖）
- 严格 TDD：D1 装依赖（贴真实安装输出，证明无编译）→ D2 落测试 → D3 看红 → D4 实现 → D5 看绿（含 `src-main/process.test.ts` 回归）
- 回归门 G2 要真跑：`npx tsc -p tsconfig.main.json --noEmit` 无错；G3 确认没碰 `process.ts` / `process.test.ts`
- **不要 git add、不要 commit、不要派子代理**

## 报告

完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-05-report.md`：D1 安装输出与 `conpty.node` 存在性、E1–E11 ↔ 用例对应表、D3/D5/G1/G2/G3 真实输出、自审、疑虑。
回传只给：状态一行 + 测试小结一行 + 疑虑（若有）。
