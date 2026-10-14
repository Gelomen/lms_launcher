任务 4 简报（从 plan 逐字抽取，勿改）

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
`@

- [ ] **步骤 1：先写失败测试**（`ql-elevated.test.ts`，假 `WinPipeApi` + 假 `HostLauncher`）：
  - `server_is_created_with_the_sddl_descriptor`（假接缝记录入参，断言 SDDL 串逐字 = `D:(A;;GA;;;WD)`）
  - `launch_passes_runas_and_three_quoted_arguments`
  - `host_exe_resolution_reuses_an_existing_link_only_when_size_matches`（`fs.linkSync` / `fs.statSync` 用临时目录真跑一次）
  - `launch_failures_close_both_handles`（RF4）
  - `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target`（§6.10：断言文案里出现的是传进去的 `exe`，不是宿主名）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts`。
- [ ] **步骤 3：实现**：koffi 绑定（`CreateNamedPipeW` / `ConvertStringSecurityDescriptorToSecurityDescriptorW` / `PeekNamedPipe` / `ReadFile` / `WriteFile` / `ConnectNamedPipe`）；`WriteFile` 形参声明 `uint8 *@（§6.5 的 `lastErr=998` 教训）；起宿主复用 `winShell.shellExecute(file, 0, {verb:'runas', parameters})`。
- [ ] **步骤 4：跑绿 + G5 + G6**。
- [ ] **步骤 5：Commit（主代理）**：`feat: 提权宿主的命名管道服务端与 runas 启动接缝`

---
