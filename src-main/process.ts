import { spawn, execFileSync, type ChildProcess } from 'node:child_process';

export type ProcStateName = "ready" | "running" | "stopping";

// 进程状态机：ready → running → stopping → ready（Rust ProcState 的 TS 版）
export class ProcessState {
  state: ProcStateName = 'ready';
  private child: ChildProcess | null = null;
  // close/error 回调置 true——stopGraceful 轮询判据（TS narrowing 不把回调内的 state 复位算入，
  // 若判 this.state === 'ready' 会 TS2367 + 运行期永假）；launch 开头重置
  private exited = false;
  private exitCode: number | null = null;
  // 退出回调：(code, error?) ——error 为 PROC 分类错误（仅启动失败路径非空，正常退出为 undefined）
  private onExitCb: ((code: number, error?: string) => void) | null = null;
  runningConfigId: string | null = null; // 任务 5 接线：running 时持有启动配置 id

  isRunning(): boolean {
    return this.state === 'running';
  }

  // 启动子进程（隐藏窗口、双管道）；非 ready → STATE 拒绝（防二次启动）
  async launch(exe: string, args: string[], configId: string | null): Promise<void> {
    if (this.state !== 'ready') throw new Error('STATE: 已有进程在运行');
    this.exitCode = null;
    this.exited = false;
    this.runningConfigId = configId;
    const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    child.on("error", (err) => {
      if (this.child !== child) return;
      // 事件回调内不得 throw（未捕获异常会让 Electron 主进程崩溃）：
      // 记录 + 状态复位到 ready + PROC 分类错误经 onExit 链路上报
      console.error(`PROC: ${exe} 启动失败: ${err.message}`);
      this.child = null;
      this.exited = true;
      this.state = 'ready';
      this.runningConfigId = null;
      if (this.onExitCb) this.onExitCb(-1, `PROC: ${exe} 启动失败: ${err.message}`);
    });
    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.exited = true;
      this.exitCode = code ?? -1;
      this.state = 'ready';
      this.runningConfigId = null;
      if (this.onExitCb) this.onExitCb(code ?? -1);
    });
    this.child = child;
    this.state = 'running';
  }

  // 取 stdout/stderr 流（必须 running）——供任务 5 日志读取端订阅
  takePipes(): { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream } {
    if (!this.child || !this.isRunning()) throw new Error('STATE: 无子进程');
    const out = this.child.stdout;
    const err = this.child.stderr;
    if (!out || !err) throw new Error('STATE: stdout/stderr 管道未打开');
    return { stdout: out, stderr: err };
  }

  // 停止：SIGTERM → timeout_secs → taskkill /T /F（杀进程树）
  async stopGraceful(timeoutSecs: number): Promise<void> {
    const child = this.child;
    if (!child) { this.state = 'ready'; return; }
    if (this.state === 'stopping') return; // 双 stop 幂等守卫：已在停止流程中则不再重入
    this.state = 'stopping';
    const pid = child.pid;
    child.kill("SIGTERM");
    const deadline = Date.now() + timeoutSecs * 1000;
    for (;;) {
      if (this.exited) return; // close/error 已落地（幂等退出，early-return 不走 taskkill）
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // 强杀（taskkill /T /F）：deadline 到仍未退出则杀进程树。
    // 强杀后 close 事件仍会落地并写 exitCode —— drainExit() 的语义依据，此处不重复上报
    if (process.platform === "win32" && pid) {
      try { execFileSync("taskkill", ["/T", "/F", "-PID", String(pid)]); } catch { /* 已退出 */ }
    }
    this.child = null;
    this.state = 'ready';
    this.runningConfigId = null;
  }

  // 注册退出回调（任务 5 发 process-exit 事件）；error 参数可选，向后兼容 (code) 签名
  onExit(cb: (code: number, error?: string) => void): void { this.onExitCb = cb; }

  // 已退出则返回退出码；未退出 → null
  drainExit(): number | null { return this.exitCode; }
}
