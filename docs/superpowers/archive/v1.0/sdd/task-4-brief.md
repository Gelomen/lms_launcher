### 任务 4：process.ts（TDD，4 测试）

**文件：**
- 创建：`src-main/process.ts`、`src-main/process.test.ts`

本任务是 Rust `process.rs` 的 TS 移植——4 个测试语义原样移植（Rust 侧最终 4/4 PASS；其中「被杀进程的退出码」按实际行为断言：拿到退出码即过，不钉死具体值——Windows `TerminateProcess` 返回非负码，不保证 0）。

Node 与 Rust 的差异点（执行者注意）：
- Rust `take_pipes`（一次性取管道所有权）→ Node 直接持有 `child.stdout/stderr` 流，`launch` 后即可 `on("data")` 订阅；保留 `takePipes()` API 供 IPC 层调用（语义：返回流句柄）。
- Rust `drain_exit`（轮询退出码）→ Node 事件驱动：`child.on("close")` 落 `exitCode` 字段；`drainExit()` 变纯 getter。另加 `onExit(cb)` 回调，供任务 5 发 `process-exit` 事件。
- 隐藏窗口：`spawn` 默认不产生控制台窗口（Node 主进程无 CONIN$ 宿主），等价 Rust `CREATE_NO_WINDOW`。

- [ ] **步骤 1：写失败的测试（src-main/process.test.ts）**

~~~ ts
import { describe, it, expect } from 'vitest';
import { ProcessState } from './process';

const PS = "powershell";
const SLEEP_ARGS: string[] = ["-Command", "Start-Sleep -Seconds 60"];

describe('process.ts', () => {

  it('launch_stop_lifecycle', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, SLEEP_ARGS, null);
    expect(ps.isRunning()).toBe(true);
    await ps.stopGraceful(3);
    const code = ps.drainExit();
    expect(code).not.toBeNull(); // Windows TerminateProcess → 非负退出码
    expect(ps.state).toBe('ready');
  });

  it('double_launch_rejected', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, SLEEP_ARGS, null);
    await expect(ps.launch(PS, [], 'c1')).rejects.toThrow(/STATE/);
    await ps.stopGraceful(3);
    ps.drainExit();
  });

  it('stop_without_process_is_noop', async () => {
    const ps = new ProcessState();
    await ps.stopGraceful(0);
    expect(ps.state).toBe('ready');
  });

  it('drain_exit_reports_quick_child', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, ['-Command', 'Write-Output hi'], 'c1');
    // 子进程秒退；等 close 事件落地
    await new Promise((r) => setTimeout(r, 3000));
    const code = ps.drainExit();
    expect(code).not.toBeNull();
    expect(ps.state).toBe('ready');
  });
});
~~~

- [ ] **步骤 2：运行验证失败**

~~~ powershell
npx vitest run src-main/process.test.ts
~~~

预期：FAIL —— Cannot find module ./process。

- [ ] **步骤 3：实现 process.ts**

~~~ ts
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
~~~

- [ ] **步骤 4：运行验证通过**

~~~ powershell
npx vitest run src-main/process.test.ts
~~~

预期：4 PASS（Windows 上 powershell spawn 各约 1–3s，总计 < 30s）。

- [ ] **步骤 5：全量回归**

~~~ powershell
npx vitest run
~~~

预期：19 PASS（config 9 + build 6 + process 4）。

- [ ] **步骤 6：Commit**

~~~ bash
git add src-main/process.ts src-main/process.test.ts
git commit -m "feat: 进程管理 TS 移植——launch/takePipes/stopGraceful/drainExit（4 测试）"
~~~

---
