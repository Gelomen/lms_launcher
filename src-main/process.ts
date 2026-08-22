import { spawn, execFileSync, type ChildProcess } from 'node:child_process';

export type ProcStateName = "ready" | "running" | "stopping";

// 进程状态机：ready → running → stopping → ready（Rust ProcState 的 TS 版）
export class ProcessState {
  state: ProcStateName = 'ready';
  private child: ChildProcess | null = null;
  private exitCode: number | null = null;
  private onExitCb: ((code: number) => void) | null = null;
  runningConfigId: string | null = null; // 任务 5 接线：running 时持有启动配置 id

  isRunning(): boolean {
    return this.state === 'running';
  }

  // 启动子进程（隐藏窗口、双管道）；非 ready → STATE 拒绝（防二次启动）
  async launch(exe: string, args: string[], configId: string | null): Promise<void> {
    if (this.state !== 'ready') throw new Error('STATE: 已有进程在运行');
    this.exitCode = null;
    this.runningConfigId = configId;
    const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    child.on("error", (err) => {
      if (this.child !== child) return;
      this.child = null;
      this.state = 'ready';
      this.runningConfigId = null;
      // 启动失败（ENOENT 等）走 PROC 分类：
      throw new Error(`PROC: ${exe} 启动失败: ${err.message}`);
    });
    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
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
    this.state = 'stopping';
    const pid = child.pid;
    child.kill("SIGTERM");
    const deadline = Date.now() + timeoutSecs * 1000;
    for (;;) {
      if (this.state === 'ready') return; // close 事件已触发
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (process.platform === "win32" && pid) {
      try { execFileSync("taskkill", ["/T", "/F", "-PID", String(pid)]); } catch { /* 已退出 */ }
    }
    this.child = null;
    this.state = 'ready';
    this.runningConfigId = null;
  }

  // 注册退出回调（任务 5 发 process-exit 事件）
  onExit(cb: (code: number) => void): void { this.onExitCb = cb; }

  // 已退出则返回退出码；未退出 → null
  drainExit(): number | null { return this.exitCode; }
}
