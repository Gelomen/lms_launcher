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
