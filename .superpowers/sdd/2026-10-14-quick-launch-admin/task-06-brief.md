任务 6 简报（从 plan 逐字抽取，勿改）

### 任务 6：主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts` 第二段）

**改什么**：把任务 4 的接缝 + 任务 2 的帧拼成 `ShellProcess` 形状（`quick-launch.ts:175-182` 逐字）。

`@
export class ElevatedPtyProcess {
  constructor(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string });
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  stopGraceful(timeoutSecs: number): Promise<void>;
}
`@

- [ ] **步骤 1：先写失败测试**：
  - `hello_carries_token_shell_cols_rows_cwd`（§6.4-4：argv 里没有这些）
  - `data_frames_are_forwarded_to_onData`
  - `exit_code_prefers_the_EXIT_frame`（RF5）
  - `host_crash_falls_back_to_the_handle_exit_code`（RF5）
  - `registering_onExit_after_exit_replays_immediately`（`quick-launch.ts:108-115` 同口径）
  - `stopGraceful_delegates_after_the_EXIT_frame`（RF6：断言委托顺序 = 先发 STOP，再走 `ShellExecProcess.stopGraceful`）
  - `handshake_timeout_closes_pipe_and_host`（RF4，假接缝把超时压到几毫秒）
  - `read_polling_uses_available_not_blocking_read`（断言假接缝的 `read` 只在 `available()>0` 时被调用，R7 的门）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-elevated.test.ts`。
- [ ] **步骤 3：实现**（`POLL_READ_MS = 20`、`HOST_HANDSHAKE_TIMEOUT_MS = 15000`；宿主句柄生命周期复用 `ShellExecProcess`，不重写轮询）。
- [ ] **步骤 4：跑绿 + G5**。
- [ ] **步骤 5：Commit（主代理）**：`feat: ElevatedPtyProcess —— 提权宿主的 ShellProcess 形状`

---
