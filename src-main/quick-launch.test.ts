// src-main/quick-launch.test.ts
// 任务 5：PtyProcess + QuickLaunchManager 的行为断言（check 表 E1–E11，钉住审查重点 R1 = E4/E5）
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.3 / §7.5 / §12.4
// 真机用例只有 E3（真 cmd.exe）；其余全部注入假进程，用来断言「等首批输出再写命令」的**顺序**。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'node:os';
import { PtyProcess, QuickLaunchManager, shellExe, type QlDeps } from './quick-launch';
import type { QuickLaunchEntry } from './quick-launch-config';

// E11：观察 stopGraceful 是否按「终止 → 超时 → taskkill /T /F」的顺序调用外部命令。
// quick-launch.ts 里 node:child_process 只用于 taskkill；node-pty 自身不 require 它
// （实测 node_modules/@lydell/node-pty*/ 下无 child_process 引用），所以整文件 mock 不影响 E3。
const taskkillCalls = vi.hoisted(() => [] as Array<{ cmd: string; args: string[] }>);
vi.mock('node:child_process', () => ({
  execFileSync: (cmd: string, args: string[]) => {
    taskkillCalls.push({ cmd, args });
    return '';
  },
}));

// ---------- 假进程 ----------

/** 假 shell 进程：满足 QuickLaunchManager 内部用到的最小面（write/resize/onData/onExit/isRunning/stopGraceful） */
class FakeShell {
  /** timeline：与 makeDeps 共享的事件时间线，用来断言 deps.onData 与 pty.write 的先后（E4/E5） */
  constructor(private readonly timeline: string[] | null = null) {}
  writes: string[] = [];
  resizeArgs: Array<[number, number]> = [];
  stopArgs: number[] = [];
  running = true;
  exited = false;
  /** 任务 7 E4：置位后本实例的 stopGraceful 抛错，用来验证「单点失败不中断其余实例」 */
  stopThrows = false;
  /** 任务 7 F4：置位后 stopGraceful 挂起，直到测试 releaseStop() —— 用来钉「逐个 await」而不是 Promise.all */
  stopHeld = false;
  stopHeldStarted = false;
  private releaseStop: (() => void) | null = null;
  private dataCbs: Array<(d: string) => void> = [];
  private exitCbs: Array<(code: number) => void> = [];
  write(d: string): void {
    if (this.timeline) this.timeline.push("pty.write");
    this.writes.push(d);
  }
  resize(cols: number, rows: number): void { this.resizeArgs.push([cols, rows]); }
  onData(cb: (d: string) => void): void { this.dataCbs.push(cb); }
  onExit(cb: (code: number) => void): void { this.exitCbs.push(cb); }
  isRunning(): boolean { return this.running; }
  async stopGraceful(timeoutSecs: number): Promise<void> {
    this.stopArgs.push(timeoutSecs);
    if (this.stopThrows) throw new Error('stop boom');
    if (this.stopHeld) {
      this.stopHeldStarted = true;
      await new Promise<void>((resolve) => { this.releaseStop = resolve; });
    }
    // 真进程不会同步就死：让出一个微任务，使「停止中」状态在 stop() 返回前可观察（E6）
    await Promise.resolve();
    this.running = false;
    this.exitCbs.forEach((cb) => cb(0)); // 真进程被杀后一定会有 exit 事件，假实现照做
  }
  /** 测试侧触发 shell 输出 */
  emit(d: string): void { this.dataCbs.forEach((cb) => cb(d)); }
  /** 测试侧放行被挂起的 stopGraceful（任务 7 F4） */
  releaseStopNow(): void { const r = this.releaseStop; this.releaseStop = null; r?.(); }
  /** 测试侧模拟进程自己退出（用户在终端里敲 exit） */
  exit(code: number): void {
    this.running = false;
    this.exited = true;
    this.exitCbs.forEach((cb) => cb(code));
  }
}

/** 假可执行程序进程（deps.spawnExe 的返回值形状，规格 §7.3：不用 PTY） */
class FakeExe {
  constructor(readonly exe: string) {}
  stopArgs: number[] = [];
  running = true;
  private exitCbs: Array<(code: number) => void> = [];
  onExit(cb: (code: number) => void): void { this.exitCbs.push(cb); }
  isRunning(): boolean { return this.running; }
  async stopGraceful(timeoutSecs: number): Promise<void> {
    this.stopArgs.push(timeoutSecs);
    await Promise.resolve();
    this.running = false;
    this.exitCbs.forEach((cb) => cb(0));
  }
  exit(code: number): void {
    this.running = false;
    this.exitCbs.forEach((cb) => cb(code));
  }
}

/** 可注入假 shell 的测试子类：C5 的构造签名逐字不动，接缝放在 protected 方法上 */
class TestManager extends QuickLaunchManager {
  shells: FakeShell[] = [];
  shellFails = false;
  /** 注入假进程时共享的事件时间线（E4/E5 的顺序判据） */
  timeline: string[] | null = null;
  protected override createShellProcess(): FakeShell {
    if (this.shellFails) throw new Error('spawn boom');
    const f = new FakeShell(this.timeline);
    this.shells.push(f);
    return f;
  }
}

function makeDeps() {
  const data: Array<{ tabId: string; data: string }> = [];
  const exits: Array<{ configId: string; code: number }> = [];
  const sysLines: Array<{ configId: string; line: string }> = [];
  const exeHandles: FakeExe[] = [];
  const exeRequests: string[] = [];
  // 事件时间线：E4 用它断言「deps.onData 先于 pty.write」（审查重点 R1）
  const timeline: string[] = [];
  const deps: QlDeps = {
    onData: (tabId, d) => { timeline.push('deps.onData'); data.push({ tabId, data: d }); },
    onExit: (configId, code) => { exits.push({ configId, code }); },
    onSysLine: (configId, line) => { sysLines.push({ configId, line }); },
    homedir: () => homedir(),
    spawnExe: (exe) => {
      timeline.push('spawnExe');
      exeRequests.push(exe);
      const h = new FakeExe(exe);
      exeHandles.push(h);
      return h;
    },
  };
  return { deps, data, exits, sysLines, exeHandles, exeRequests, timeline };
}

const SHELL_ENTRY: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo HI' };
const EXE_ENTRY: QuickLaunchEntry = { name: 'n', type: 'exe', exe: 'notepad.exe' };

function allData(data: Array<{ tabId: string; data: string }>): string {
  return data.map((d) => d.data).join('');
}

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('TIMEOUT waiting for ' + what);
}

afterEach(() => {
  vi.useRealTimers();
  taskkillCalls.length = 0;
});

describe('shellExe（规格 §7.3：没有 v1 的 -Command 包装）', () => {
  // E1
  it('cmd 无参、pwsh 带 -NoLogo', () => {
    expect(shellExe('cmd')).toEqual({ exe: 'cmd.exe', args: [] });
    expect(shellExe('pwsh')).toEqual({ exe: 'pwsh.exe', args: ['-NoLogo'] });
  });
  // E2
  it('powershell 带 -NoLogo、wsl 无参', () => {
    expect(shellExe('powershell')).toEqual({ exe: 'powershell.exe', args: ['-NoLogo'] });
    expect(shellExe('wsl')).toEqual({ exe: 'wsl.exe', args: [] });
  });
});

describe('真机集成（规格 §12.4：真跑 cmd.exe）', () => {
  // E3
  it('启动 cmd 配置后 onData 至少一次，拼接后含 HI', async () => {
    const ctx = makeDeps();
    const m = new QuickLaunchManager(ctx.deps, () => true);
    const res = await m.start('c1', SHELL_ENTRY);
    expect(res).toEqual({ tabId: 'ql:c1' });
    expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
    await waitFor(() => allData(ctx.data).includes('HI'), 20000, 'cmd.exe 回显 HI');
    expect(ctx.data.length).toBeGreaterThan(0);
    expect(ctx.data.every((d) => d.tabId === 'ql:c1')).toBe(true);
    await m.stop('c1');
    expect(m.states()).toEqual({});
  }, 40000);
});

describe('自动执行命令（审查重点 R1 / 规格 §7.3）', () => {
  // E4
  it('deps.onData 第一次被调用之后才发生 pty.write', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    m.timeline = ctx.timeline;
    await m.start('c1', SHELL_ENTRY);
    const shell = m.shells[0];
    // 首批输出之前：一个字都不写
    expect(shell.writes).toEqual([]);
    expect(ctx.timeline).toEqual([]);
    shell.emit('C:\\> ');
    // 顺序严格：先转发给 deps.onData，再写自动命令（审查重点 R1 的判据）
    expect(ctx.timeline).toEqual(['deps.onData', 'pty.write']);
    expect(shell.writes).toEqual(['echo HI\r']);
    // 后续输出照常转发，但自动命令只写一次
    shell.emit('more');
    expect(ctx.timeline).toEqual(['deps.onData', 'pty.write', 'deps.onData']);
    expect(shell.writes).toEqual(['echo HI\r']);
  });

  // E5
  it('5s 内无输出则超时兜底写入', async () => {
    vi.useFakeTimers();
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    m.timeline = ctx.timeline;
    await m.start('c1', SHELL_ENTRY);
    const shell = m.shells[0];
    await vi.advanceTimersByTimeAsync(4999);
    expect(shell.writes).toEqual([]);
    expect(ctx.timeline).toEqual([]); // 5s 内没有任何输出，也没有写入
    await vi.advanceTimersByTimeAsync(2);
    expect(shell.writes).toEqual(['echo HI\r']);
    expect(ctx.timeline).toEqual(['pty.write']); // 兜底写入不依赖任何输出
    // 兜底写入之后，首批输出照常转发，且不会再写一次
    shell.emit('late prompt');
    expect(ctx.data.length).toBe(1);
    expect(shell.writes).toEqual(['echo HI\r']);
  });

  it('cmd 为空则不写任何自动命令', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', { name: 'n', type: 'shell', shell: 'cmd' });
    const shell = m.shells[0];
    shell.emit('prompt');
    await vi.waitFor(() => ctx.data.length > 0);
    expect(shell.writes).toEqual([]);
  });
});

describe('状态机（规格 §7.3 / §7.5 / §12.4）', () => {
  // E6
  it('重复启动同一配置抛 STATE:', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^STATE:/);
    expect(m.shells.length).toBe(1); // 第二次没有产生第二个实例
    // 停止中同样拒绝
    const stopping = m.stop('c1');
    await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^STATE:/);
    await stopping;
  });

  // E7
  it('终端不可用抛 VALIDATION: 且 states() 不残留', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, (id) => id !== 'cmd');
    await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^VALIDATION:/);
    expect(m.states()).toEqual({});
    expect(m.shells.length).toBe(0);
  });

  it('exe 为空抛 VALIDATION:', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await expect(m.start('c1', { name: 'n', type: 'exe', exe: '  ' })).rejects.toThrow(/^VALIDATION:/);
    await expect(m.start('c2', { name: 'n' } as QuickLaunchEntry)).rejects.toThrow(/^VALIDATION:/);
    expect(m.states()).toEqual({});
  });

  it('shell spawn 失败不残留状态（§12.4）', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    m.shellFails = true;
    await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^PROC:/);
    expect(m.states()).toEqual({});
  });

  // E8
  it('stop() 后发出 onExit 且 states() 变空', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await m.stop('c1');
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
    expect(m.states()).toEqual({});
    // 修复轮 2（报告 §10.5-1 的缺口）：stop() 不带参数 → 必须走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS）。
    // E9 已改用 7 钉「透传」，本条钉「默认值」；把 :35 的常量改成 9 时本条必须红。
    expect(m.shells[0].stopArgs).toEqual([3]);
    // 幂等：再 stop 不报错、不重复发 onExit
    await m.stop('c1');
    expect(ctx.exits.length).toBe(1);
  });

  it('进程自己退出 → 发 onExit、状态清空、可再次启动（§7.5 回落 [启动]）', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    m.shells[0].exit(1);
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 1 }]);
    expect(m.states()).toEqual({});
    await m.start('c1', SHELL_ENTRY);
    expect(m.shells.length).toBe(2);
  });

  // E9（口径 C5(a) / 索引 K11(1)：stopAll 的 timeoutSecs 必须**透传**，不得被 stop() 的 STOP_TIMEOUT_SECS 覆盖）
  // 传 7 而不是 3：3 == STOP_TIMEOUT_SECS，断 [3] 在结构上无法区分「透传」与「硬编码」。
  it('stopAll 停掉全部并清空 states，并透传 timeoutSecs', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await m.start('c2', { name: 'n', type: 'exe', exe: 'a.exe' });
    expect(Object.keys(m.states()).sort()).toEqual(['c1', 'c2']);
    await m.stopAll(7);
    expect(m.states()).toEqual({});
    expect(m.shells[0].stopArgs).toEqual([7]);
    expect(ctx.exeHandles[0].stopArgs).toEqual([7]);
  });

  // ── 任务 7（check 表 E1 / E4 / F4）：exit_app 与 run_update 退出前调 stopAll(3) 的前提 ──
  // E1（C1 / 计划 步骤 1）：退出路径上没有任何「有没有终端在跑」的前置判断，
  // 所以「空表 / 未运行的 configId」必须是正常路径：不抛错、不排计时器、立即返回。
  it('stopAll 对空表与未运行的配置都不抛错（幂等）', async () => {
    vi.useFakeTimers();
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    // 空表：立即返回，且没有留下任何计时器（否则退出前要多等一段）
    await m.stopAll(3);
    expect(vi.getTimerCount()).toBe(0);
    // 未运行/不存在的 configId：同样不抛错（ql_stop 的幂等口径，§8）
    await m.stop('nope');
    expect(vi.getTimerCount()).toBe(0);
    // 停完再停一次：第二次就是空表；不重复发 onExit
    await m.start('c1', SHELL_ENTRY);
    await m.stopAll(3);
    await m.stopAll(3);
    expect(m.states()).toEqual({});
    expect(vi.getTimerCount()).toBe(0); // 自动命令的 5s 兜底计时器必须被清掉
    expect(ctx.exits.length).toBe(1);
  });

  // E4（R3）：一个实例停不掉不得中断其余实例 —— 退出路径串行停 N 个终端，
  // 单个 stopGraceful 抛错必须被吞掉、继续停下一个，并且失败的那个也要收尾（不卡在 stopping）。
  it('stopAll：单个实例 stopGraceful 抛错不影响其余实例', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await m.start('c2', SHELL_ENTRY);
    m.shells[0].stopThrows = true; // 第一个终端停不掉
    await m.stopAll(3);
    // 第二个仍被停，且收到透传的超时（K11(1)）
    expect(m.shells[1].stopArgs).toEqual([3]);
    // 失败的那个也要收尾：states() 清空、两个都上报退出
    expect(m.states()).toEqual({});
    expect(ctx.exits.map((e) => e.configId).sort()).toEqual(['c1', 'c2']);
  });

  // F4（计划 步骤 3 逐字「逐个 await」）：不得改成 Promise.all —— 前一个没返回前不得开始停下一个。
  it('stopAll 逐个 await：前一个未返回前不得开始停下一个', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await m.start('c2', SHELL_ENTRY);
    m.shells[0].stopHeld = true; // 第一个终端卡在 stopGraceful 里
    const stopping = m.stopAll(3);
    await vi.waitFor(() => expect(m.shells[0].stopHeldStarted).toBe(true));
    // 第一个还没返回 → 第二个一次都没被调用
    expect(m.shells[1].stopArgs).toEqual([]);
    m.shells[0].releaseStopNow();
    await stopping;
    expect(m.shells[1].stopArgs).toEqual([3]);
    expect(m.states()).toEqual({});
  });

  // E10
  it('shell 返回 tabId ql:<id>；exe 返回 null 且经 onSysLine 反馈', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const shellRes = await m.start('c1', SHELL_ENTRY);
    expect(shellRes).toEqual({ tabId: 'ql:c1' });
    const exeRes = await m.start('c2', EXE_ENTRY);
    expect(exeRes).toEqual({ tabId: null });
    expect(ctx.exeRequests).toEqual(['notepad.exe']);
    expect(m.states()['c2']).toEqual({ running: true, stopping: false });
    // exe 无页签：不产生任何 onData
    expect(ctx.data).toEqual([]);
    ctx.exeHandles[0].exit(0);
    expect(ctx.exits).toEqual([{ configId: 'c2', code: 0 }]);
    expect(ctx.sysLines.length).toBeGreaterThan(0);
    expect(ctx.sysLines.every((l) => l.configId === 'c2')).toBe(true);
    expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
  });

  it('write / resize 转发到进程；未运行的配置抛 STATE:', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    m.write('c1', 'dir\r');
    m.resize('c1', 120, 30);
    expect(m.shells[0].writes).toEqual(['dir\r']);
    expect(m.shells[0].resizeArgs).toEqual([[120, 30]]);
    expect(() => m.write('nope', 'x')).toThrow(/^STATE:/);
    expect(() => m.resize('nope', 1, 1)).toThrow(/^STATE:/);
  });
});

describe('PtyProcess.stopGraceful（规格 §7.5：终止 → 超时 → taskkill /T /F）', () => {
  // E11
  it('先 kill，超时后才 taskkill /T /F -PID', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const dataCbs: Array<(d: string) => void> = [];
    const exitCbs: Array<(e: { exitCode: number }) => void> = [];
    const handle = {
      pid: 4321,
      write: (d: string) => { calls.push('write:' + d); },
      resize: (c: number, r: number) => { calls.push('resize:' + c + 'x' + r); },
      kill: () => { calls.push('kill'); },
      onData: (cb: (d: string) => void) => { dataCbs.push(cb); return { dispose() {} }; },
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCbs.push(cb); return { dispose() {} }; },
    };
    const p = new PtyProcess(handle);
    expect(p.pid).toBe(4321);
    expect(p.isRunning()).toBe(true);
    const stopped = p.stopGraceful(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['kill']); // 第一步只有终止
    expect(taskkillCalls).toEqual([]); // 未到超时，不得强杀
    await vi.advanceTimersByTimeAsync(2500); // 越过 3s → 强杀
    await vi.advanceTimersByTimeAsync(2000); // 强杀后再等 exit 事件落地的窗口
    await stopped;
    expect(calls).toEqual(['kill']);
    expect(taskkillCalls).toEqual([{ cmd: 'taskkill', args: ['/T', '/F', '-PID', '4321'] }]);
    // 强杀后 exit 事件落地 → isRunning 变 false，onExit 回调收到退出码
    exitCbs.forEach((cb) => cb({ exitCode: 1 }));
    expect(p.isRunning()).toBe(false);
  });

  it('已退出的进程 stopGraceful 不再 taskkill', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const exitCbs: Array<(e: { exitCode: number }) => void> = [];
    const handle = {
      pid: 99,
      write: () => {}, resize: () => {},
      kill: () => { calls.push('kill'); },
      onData: () => ({ dispose() {} }),
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCbs.push(cb); return { dispose() {} }; },
    };
    const p = new PtyProcess(handle);
    exitCbs.forEach((cb) => cb({ exitCode: 0 }));
    expect(p.isRunning()).toBe(false);
    await p.stopGraceful(3);
    expect(calls).toEqual([]);
    expect(taskkillCalls).toEqual([]);
  });
});
