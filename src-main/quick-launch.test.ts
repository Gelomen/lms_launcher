// src-main/quick-launch.test.ts
// 任务 5：PtyProcess + QuickLaunchManager 的行为断言（check 表 E1–E11，钉住审查重点 R1 = E4/E5）
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.3 / §7.5 / §12.4
// 真机用例只有 E3（真 cmd.exe）；其余全部注入假进程，用来断言「等首批输出再写命令」的**顺序**。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'node:os';
import { PtyProcess, QuickLaunchManager, shellExe, type QlDeps } from './quick-launch';
import type { QuickLaunchEntry } from './quick-launch-config';
import { t } from './i18n'; // 任务 7 C5（2026-10-14-quick-launch-admin）：错误文案的断言按译文写（照 ipc-ql.test.ts:15 的做法）

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
  /** A2·Minor-6b：置位后 stopGraceful 正常返回但**不**触发 exit 事件 —— 模拟强杀后 exit 事件不落地 */
  silentStop = false;
  /** A2·I-3：stopGraceful 一进来就调用它 —— 模拟「stopAll 的 await 期间又有 [启动] 进表」 */
  onStopStart: (() => void) | null = null;
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
    this.onStopStart?.(); // A2·I-3：新实例在 await 期间进表，不在本轮快照里
    if (this.stopThrows) throw new Error('stop boom');
    if (this.stopHeld) {
      this.stopHeldStarted = true;
      await new Promise<void>((resolve) => { this.releaseStop = resolve; });
    }
    // 真进程不会同步就死：让出一个微任务，使「停止中」状态在 stop() 返回前可观察（E6）
    await Promise.resolve();
    this.running = false;
    if (this.silentStop) return; // A2·Minor-6b：不发 exit 事件 → 走 stopInternal 的 -1 收尾路径
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

/**
 * 假 PTY 句柄：quick-launch.ts:60-67 那个 PtyHandle 的最小面，喂给**真** PtyProcess。
 * 修复轮 C2 的两条分支都在 PtyProcess 内部（:123 的 stopping 守卫、:125-129 对 handle.kill() 的 try/catch），
 * FakeShell 自带的 stopGraceful 走不到那里 —— 所以那两条用例必须用真 PtyProcess 包假句柄。
 * killThrows：置位后 kill() 抛，就是真机上「进程已不在」时 node-pty 的行为（:127 注释所指）。
 * 默认不发 exit 事件：与 FakeShell.silentStop 同一口径（强杀后 exit 事件可能不落地）。
 */
class FakePtyHandle {
  constructor(readonly pid: number, readonly killThrows = false) {}
  /** 可观察后果之一：底层被终止的次数（幂等守卫的判据） */
  killCount = 0;
  private exitCbs: Array<(e: { exitCode: number }) => void> = [];
  write(_d: string): void {}
  resize(_cols: number, _rows: number): void {}
  kill(): void {
    this.killCount++;
    if (this.killThrows) throw new Error('kill boom');
  }
  onData(_cb: (d: string) => void): void {}
  onExit(cb: (e: { exitCode: number }) => void): void { this.exitCbs.push(cb); }
  /** 测试侧让 exit 事件落地：真机上由 ConPTY 异步送达，可能晚于 stop() 返回 */
  emitExit(code: number): void { this.exitCbs.forEach((cb) => cb({ exitCode: code })); }
}

/** 可注入假 shell 的测试子类：C5 的构造签名逐字不动，接缝放在 protected 方法上 */
class TestManager extends QuickLaunchManager {
  shells: FakeShell[] = [];
  shellFails = false;
  /** 修复轮 C2：置位后本 manager 造的是**真** PtyProcess（包住这个假句柄），用来喂 PtyProcess 内部的两条防御分支。
   *  默认 null —— 既有用例的假 Shell 路径一字不变。 */
  ptyHandle: FakePtyHandle | null = null;
  /** A2·I-3：每造一个假进程就回调一次，用来给它的 stopGraceful 装 onStopStart */
  onShellCreated: ((s: FakeShell) => void) | null = null;
  /** 注入假进程时共享的事件时间线（E4/E5 的顺序判据） */
  timeline: string[] | null = null;
  protected override createShellProcess(): FakeShell | PtyProcess {
    if (this.ptyHandle) return new PtyProcess(this.ptyHandle); // 修复轮 C2：真 PtyProcess 才走得到 :123 / :125-129
    if (this.shellFails) throw new Error('spawn boom');
    const f = new FakeShell(this.timeline);
    this.shells.push(f);
    this.onShellCreated?.(f); // A2·I-3
    return f;
  }
}

function makeDeps() {
  const data: Array<{ tabId: string; data: string }> = [];
  const exits: Array<{ configId: string; code: number }> = [];
  const sysLines: Array<{ configId: string; line: string }> = [];
  const exeHandles: FakeExe[] = [];
  const exeRequests: string[] = [];
  // 任务 7（2026-10-14-quick-launch-admin §6.8）：提权宿主的**假**接缝。
  // 单测不真起提权进程、也不真建管道（真工厂 startElevatedHost 由 src-main/ql-elevated.test.ts 守，索引 K45）：
  // 这里只交一个假的 ShellProcess 形状（quick-launch.ts:175-182），于是「提权 / 非提权在 start() 之后同形」
  // 全部落在可观察后果上。QlDeps 的新成员是**必填**（F1：不静默降级）—— 缺这一条，夹具连 QlDeps 都赋不了值。
  const elevatedHandles: FakeShell[] = [];
  const elevatedRequests: Array<{ shell: string; cols: number; rows: number; cwd: string }> = [];
  /** 置位后提权启动抛这个错（E3 / C5 的两条文案路径） */
  const elevatedCtl: { fail: unknown } = { fail: null };
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
    spawnElevatedShell: async (shell, cols, rows, cwd) => {
      if (elevatedCtl.fail !== null) throw elevatedCtl.fail;
      // 不往 timeline 里记：那条时间线的判据是「deps.onData 先于 pty.write」（E4 / RF1），
      // 提权接缝被走到由 elevatedRequests / elevatedHandles 自己钉。
      elevatedRequests.push({ shell, cols, rows, cwd });
      const f = new FakeShell(timeline);
      elevatedHandles.push(f);
      return f;
    },
  };
  return { deps, data, exits, sysLines, exeHandles, exeRequests, elevatedHandles, elevatedRequests, elevatedCtl, timeline };
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

  // 真机门（2026-10-17 用户改口径：弹窗里 [+] 追加多条命令行）：多行 cmd 在真 cmd.exe 里必须按行依次执行。
  // 判据选的是「第二行只有真的被当成第二条命令才会出现的东西」—— dir /b C:\Windows 的输出里有 System32；
  // 若行分隔没归一（裸 \n 被 ConPTY 吞掉），送进去的是 "echo ALPHA-MARKERdir /b C:\Windows"，
  // 执行的只有一条 echo，输出是 "ALPHA-MARKERdir /b C:\Windows"，永远不会有 System32。
  // （不用 "echo A\necho B" 做判据：拼起来的那条 echo 输出里同时含 A 和 B 两个子串，测不出区别。）
  it('多行 cmd 在真 cmd.exe 里按行依次执行', async () => {
    const ctx = makeDeps();
    const m = new QuickLaunchManager(ctx.deps, () => true);
    const res = await m.start('c1', { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo ALPHA-MARKER\ndir /b C:\\Windows' });
    expect(res).toEqual({ tabId: 'ql:c1' });
    await waitFor(() => allData(ctx.data).includes('ALPHA-MARKER') && allData(ctx.data).includes('System32'),
      25000, '第一行的 echo 输出与第二行 dir 的输出（缺后者 = 两行被拼成了一条命令）');
    await m.stop('c1');
    expect(m.states()).toEqual({});
  }, 60000);
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

  // 2026-10-17（弹窗里 [+] 追加多条命令行，用户改口径）：cmd 里的行分隔必须规整成 \r 再写。
  // 判据落在可观察后果上：假进程收到的那一次 write，三条命令之间全是 \r（真回车），一个裸 \n 都不剩。
  // 为什么必须是 \r：ConPTY 把裸 \n 吞掉 —— 真机实测 .temp/ql-cmd-rows-newline/probe.md：
  //   写 "ver\necho SECOND-RAN\r" → 输入回显成 "verecho SECOND-RAN"，执行的是 verecho → 命令不存在；
  //   写 "echo A\recho B\r"      → 先 A 后 B，两条依次执行。
  // 三种行分隔（\n / \r\n / \r）都要归一：回读 yaml 的 block scalar 给的是 \n，用户手改文件可能是 \r\n。
  it('多行命令按行提交：写入的只有 \r，不留裸 \n', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    m.timeline = ctx.timeline;
    await m.start('c1', { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo A\necho B\r\necho C\recho D' });
    const shell = m.shells[0];
    shell.emit('C:\\> ');
    expect(shell.writes, '行分隔没归一成 \r').toEqual(['echo A\recho B\recho C\recho D\r']);
    expect(shell.writes[0].includes('\n'), '写入里还剩裸 \n —— ConPTY 会把它吞掉，两行会拼成一条命令').toBe(false);
    // 只写一次：归一不是「一行一次 write」，仍是一次性写入（E4 / E5 的时序口径不变）
    expect(ctx.timeline).toEqual(['deps.onData', 'pty.write']);
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

  // ── A2·I-3（索引 K19：退出接线此前没有任何测试保护）──
  // stopAll 的 await 期间窗口仍活着、[启动] 仍可点 → 新实例进表。
  // 旧实现「取一次快照逐个停」+ 末尾无条件 instances.clear()：新实例没被停就被抹掉 → app.exit(0) 之后是孤儿 ConPTY。
  it('stopAll 的 await 期间又起的实例也会被停，不被 clear() 静默丢弃', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    m.shells[0].stopHeld = true; // 退出窗口：第一个实例还卡在 stopGraceful 里
    const stopping = m.stopAll(3);
    await vi.waitFor(() => expect(m.shells[0].stopHeldStarted).toBe(true));
    // 用户在退出窗口内又点了一次 [启动] —— 它不在 stopAll 取的那一次快照里
    await m.start('c2', SHELL_ENTRY);
    m.shells[0].releaseStopNow();
    await stopping;
    // 两轮都被停到：新实例的 stopGraceful 被调用，且拿到透传的超时（K11(1)）
    expect(m.shells[1].stopArgs).toEqual([3]);
    // 没有任何实例被静默丢弃：两个都上报退出，最终表为空
    expect(ctx.exits.map((e) => e.configId).sort()).toEqual(['c1', 'c2']);
    expect(m.states()).toEqual({});
  });

  // A2·I-3 的另一半：循环必须**有上限**，而且到上限时也不得把没停的实例静默抹掉。
  // 病态情况：每停掉一个就有新的 [启动] 进表（假进程的 stopGraceful 自己起一个）——
  // 旧实现在第一轮之后 clear()，第二个实例一次都没被停就消失；新实现跑满上限后把它留在表里。
  it('stopAll 的轮次有上限，到上限也不把没停过的实例静默丢弃', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const entry: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd' }; // 不带 cmd：不建 5s 兜底计时器
    let n = 0;
    m.onShellCreated = (s) => { s.onStopStart = () => { void m.start('c' + (++n), entry); }; };
    await m.start('c0', entry);
    await m.stopAll(3); // 不得无限循环：STOP_ALL_MAX_ROUNDS 到顶就收手
    // 有上限：实例总数远小于「每轮都新起一个」的无界情况（上限 64 轮）
    expect(m.shells.length).toBeGreaterThan(1);
    expect(m.shells.length).toBeLessThanOrEqual(200);
    // 除最后一个（它是收手时留下的）之外，每个实例都被停过一次
    for (const s of m.shells.slice(0, -1)) expect(s.stopArgs).toEqual([3]);
    expect(m.shells[m.shells.length - 1].stopArgs).toEqual([]);
    // 留下的那个仍在 states() 里：clear() 会把它静默抹掉 → 孤儿 ConPTY 又回来了
    expect(Object.keys(m.states())).toEqual(['c' + n]);
    expect(ctx.exits.length).toBe(m.shells.length - 1);
  });

  // ── A2·M7：states() 必须问进程死活 ──
  // 真机上 exit 事件是异步的：进程已退出而 onExit 尚未到达时，只由 !stopping 推出的 running:true 是假状态。
  it('进程已退出但 onExit 未到达时，states() 不得报 running:true', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    await m.start('c2', EXE_ENTRY);
    // 只把进程侧标记为已退出，不触发 exit 回调 —— 就是那段竞态窗口
    m.shells[0].running = false;
    ctx.exeHandles[0].running = false;
    expect(m.states()).toEqual({
      c1: { running: false, stopping: false },
      c2: { running: false, stopping: false },
    });
    // exit 事件到达后照常摘除
    m.shells[0].exit(0);
    ctx.exeHandles[0].exit(0);
    expect(m.states()).toEqual({});
  });

  // ── A2·Minor-6b：stopInternal 的 -1 收尾 + 双 stop 的早退路径（钉既有实现，不改语义）──
  it('exit 事件不落地时 stop 按 -1 收尾并摘实例；再次 stop 不重复上报', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', SHELL_ENTRY);
    m.shells[0].silentStop = true; // 强杀之后 exit 事件永远不来
    await m.stop('c1');
    expect(ctx.exits).toEqual([{ configId: 'c1', code: -1 }]);
    expect(m.states()).toEqual({}); // 立即摘实例 → 按钮回落 [启动]
    await m.stop('c1'); // 双 stop：走「实例已摘 → 直接返回」的早退路径
    expect(ctx.exits.length).toBe(1);
    expect(m.shells[0].stopArgs).toEqual([3]); // 第二次没有再走一遍 stopGraceful
  });

  // ── 修复轮 C2·C：PtyProcess.stopGraceful 对 handle.kill() 的 try/catch（quick-launch.ts:125-129）──
  // 真机上进程已不在时 node-pty 的 kill() 会抛。没有那个 try/catch，stopGraceful 当场 reject：
  // §7.5 的「超时 → taskkill /T /F」整条升级链一步都不走，页签按钮回落只剩 stopInternal 的兜底 catch 侥幸兜住。
  // 用真 PtyProcess 穿过 createShellProcess 接缝，断言的全是可观察后果：stop() 不 reject、强杀升级照常发生、
  // exit 事件不落地仍按 -1 收尾摘实例、迟到的 exit 事件不重复上报。
  it('handle.kill() 抛异常时 stop() 不 reject，仍升级到 taskkill 并按 -1 收尾摘实例', async () => {
    vi.useFakeTimers();
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const handle = new FakePtyHandle(4321, true); // kill() 抛
    m.ptyHandle = handle;
    const entry: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd' }; // 不带 cmd：不建 5s 兜底计时器
    await m.start('c1', entry);
    expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
    const stopping = m.stop('c1');
    await vi.advanceTimersByTimeAsync(4000); // 越过 3s 超时 + 强杀后等 exit 落地的 1s
    await expect(stopping).resolves.toBeUndefined(); // 可观察后果 1：stop() 不 reject
    expect(m.shells.length).toBe(0); // 走的是真 PtyProcess，不是假 Shell
    // 可观察后果 2：try/catch 生效 → 时序照常走到强杀（把 :125-129 去掉，这里就是空数组）
    expect(taskkillCalls).toEqual([{ cmd: 'taskkill', args: ['/T', '/F', '-PID', '4321'] }]);
    // 可观察后果 3：exit 事件不落地 → 按未知退出码收尾、实例摘除、states() 不再报它
    expect(ctx.exits).toEqual([{ configId: 'c1', code: -1 }]);
    expect(m.states()).toEqual({});
    // 迟到的 exit 事件：实例已摘，不得再上报一次（否则页签按钮闪回 [停止]）
    handle.emitExit(1);
    expect(ctx.exits.length).toBe(1);
    expect(m.states()).toEqual({});
  });

  // ── 修复轮 C2·D：幂等守卫的 `|| this.stopping` 半边（quick-launch.ts:123）──
  // 与上面「exit 事件不落地时 stop 按 -1 收尾并摘实例；再次 stop 不重复上报」那条不重复：
  // 那条钉**顺序**二次 stop（实例已摘 → stopInternal 早退）；
  // 这条钉**并发**二次进入 —— 第一个 stopGraceful 还停在等待循环里、实例仍在表中，只有 :123 的 stopping 半边挡得住。
  // 少了它：同一次 [停止] 会对同一个 ConPTY 终止两次，并再走一遍 taskkill /T /F。
  it('并发两次 stop：只 kill 一次、只升级一次 taskkill、只上报一次退出', async () => {
    vi.useFakeTimers();
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const handle = new FakePtyHandle(4321);
    m.ptyHandle = handle;
    const entry: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd' };
    await m.start('c1', entry);
    // 并发：第一个 stop 还停在 stopGraceful 的等待循环里，第二个就进来了
    const stopping = Promise.all([m.stop('c1'), m.stop('c1')]);
    await vi.advanceTimersByTimeAsync(4000);
    await stopping;
    expect(handle.killCount).toBe(1); // 去掉 :123 的 || this.stopping 就是 2
    expect(taskkillCalls.length).toBe(1); // 同一次停止只升级一次强杀
    expect(ctx.exits).toEqual([{ configId: 'c1', code: -1 }]); // 只 finalize 一次
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

// ── 任务 7（2026-10-14-quick-launch-admin §6.8 / §6.10）：admin 分流到提权宿主 ──
// 观察点 = QlDeps.spawnElevatedShell（**假**宿主接缝；真工厂 startElevatedHost 由 src-main/ql-elevated.test.ts 守，索引 K45）。
// 判据全部落在可观察后果上：走哪条接缝、自动命令的先后、失败是否残留、停止是否与非提权同一条路。
describe('提权分支（admin:true → 提权宿主；规格 §6.8 / 表 E1-E6 / C5）', () => {
  // 不带 cmd：不建 5s 兜底计时器（只有 E4 那条需要自动命令）
  const ADMIN_ENTRY: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd', admin: true };
  const ADMIN_ENTRY_CMD: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo HI', admin: true };

  // E1（表 E1 / 规格 §6.8）：admin === true → 提权宿主；本地 pty 一次都不被起
  it('admin_true_starts_through_the_elevated_host', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    expect(await m.start('c1', ADMIN_ENTRY)).toEqual({ tabId: 'ql:c1' });
    // createElevatedShellProcess 的唯一出口就是 deps.spawnElevatedShell —— 它被走到，且拿到本次的参数
    expect(ctx.elevatedRequests).toEqual([{ shell: 'cmd', cols: 80, rows: 24, cwd: homedir() }]);
    // 本地路径一次都没走：createShellProcess 没造过任何进程 = pty.spawn 没被调用
    expect(m.shells).toEqual([]);
    expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
  });

  // E2（表 E2 / 规格 §4-4 / RF2）：admin 为假走本地 PTY —— 含缺省与「truthy 但不是 true」（表 C3：分流条件是 === true）
  it('admin_falsy_uses_the_plain_local_pty', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const falsy: Array<[string, unknown]> = [['off', false], ['absent', undefined], ['truthy-not-true', 'yes']];
    for (const [id, admin] of falsy) {
      expect(await m.start('c-' + id, { ...ADMIN_ENTRY, admin } as QuickLaunchEntry)).toEqual({ tabId: 'ql:c-' + id });
    }
    expect(m.shells.length).toBe(3);
    expect(ctx.elevatedRequests).toEqual([]);
  });

  // E3（表 E3 / quick-launch.ts:242-245 的「失败不残留」在提权路径同样成立）
  it('admin_true_failure_leaves_no_instance', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    ctx.elevatedCtl.fail = new Error('host boom');
    await expect(m.start('c1', ADMIN_ENTRY)).rejects.toThrow(/^PROC:/);
    expect(m.states()).toEqual({}); // 还没进表就抛出 → 没有残留实例
    expect(ctx.exits).toEqual([]); // 也没有上报退出（否则页签按钮会闪一下）
    // 不残留的可观察后果：同一条路可以再启动一次
    ctx.elevatedCtl.fail = null;
    expect(await m.start('c1', ADMIN_ENTRY)).toEqual({ tabId: 'ql:c1' });
    // 失败的那次没留下任何进程实例：表里只有第二次启动的那一个
    expect(ctx.elevatedHandles.length).toBe(1);
    expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
  });

  // C5（表 C5 / 裁决 R-14 / 索引 K52）：提权路径的失败**不得二次包装**
  it('admin_true_final_message_has_exactly_one_proc_prefix', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    // 工厂交出的 Error.message 已经是最终文案（hostStartError / handshakeError 自带 PROC: 与词典渲染）
    const final = 'PROC: ' + t('err.proc.uacCancelled', { exe: 'cmd.exe' });
    ctx.elevatedCtl.fail = new Error(final);
    let msg = '';
    try { await m.start('c1', ADMIN_ENTRY); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toBe(final); // 原样上抛
    expect((msg.match(/PROC:/g) ?? []).length).toBe(1); // 只有一个前缀、只渲染一次
    expect(msg).not.toContain('err=PROC:'); // 不得出现嵌套
    expect(msg).not.toContain(t('err.ql.ptySpawn', { exe: 'cmd.exe', err: final })); // 没被包成 ptySpawn
    // 对照：不带 PROC: 的失败仍按既有形状包一层（表 C4：err.ql.ptySpawn + shellExe(shell).exe）
    ctx.elevatedCtl.fail = new Error('host boom');
    let wrapped = '';
    try { await m.start('c2', ADMIN_ENTRY); } catch (e) { wrapped = e instanceof Error ? e.message : String(e); }
    expect(wrapped).toBe('PROC: ' + t('err.ql.ptySpawn', { exe: 'cmd.exe', err: 'host boom' }));
  });

  // E4（表 E4 / RF1 / quick-launch.ts:249-253）：先把输出转给渲染端，再放自动命令
  it('admin_true_auto_command_released_after_first_output', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', ADMIN_ENTRY_CMD);
    const host = ctx.elevatedHandles[0];
    expect(host.writes).toEqual([]); // 首批输出之前一个字都不写
    expect(ctx.timeline).toEqual([]);
    host.emit('C:\\> ');
    // 顺序与非提权路径逐字相同（对照上面「deps.onData 第一次被调用之后才发生 pty.write」那条）
    expect(ctx.timeline).toEqual(['deps.onData', 'pty.write']);
    expect(host.writes).toEqual(['echo HI\r']);
    host.emit('more'); // 后续输出照常转发，自动命令只写一次
    expect(ctx.timeline).toEqual(['deps.onData', 'pty.write', 'deps.onData']);
    expect(host.writes).toEqual(['echo HI\r']);
  });

  // E5（表 E5 / 规格 §6.7 / RF6）：[停止] 与 stopAll 与非提权**完全相同**的调用路径
  it('admin_true_stop_goes_through_the_same_path', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    await m.start('c1', ADMIN_ENTRY); // 提权
    await m.start('c2', { ...ADMIN_ENTRY, admin: false } as QuickLaunchEntry); // 对照：本地 PTY
    await m.stop('c1');
    // 同一个入口、同一个默认超时（STOP_TIMEOUT_SECS = 3）：提权实例与非提权拿到同一个数值
    expect(ctx.elevatedHandles[0].stopArgs).toEqual([3]);
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
    await m.stop('c1'); // 幂等：与非提权同样的早退路径
    expect(ctx.exits.length).toBe(1);
    expect(ctx.elevatedHandles[0].stopArgs).toEqual([3]);
    // stopAll 也是同一条路：逐个 await + 透传 timeoutSecs（对照「stopAll 停掉全部并清空 states，并透传 timeoutSecs」）
    await m.stopAll(7);
    expect(m.shells[0].stopArgs).toEqual([7]);
    expect(ctx.elevatedHandles[0].stopArgs).toEqual([3]); // 已停过的不再第二次
    expect(m.states()).toEqual({});
  });

  // E6（表 E6 / 规格 §9-R8）：两条提权条目并发 → 各一条私有管道与各自宿主，互不影响
  it('two_elevated_entries_run_independently', async () => {
    const ctx = makeDeps();
    const m = new TestManager(ctx.deps, () => true);
    const [a, b] = await Promise.all([m.start('c1', ADMIN_ENTRY), m.start('c2', ADMIN_ENTRY)]);
    expect(a).toEqual({ tabId: 'ql:c1' });
    expect(b).toEqual({ tabId: 'ql:c2' });
    // 两次独立的工厂调用 → 两个不同的实例（管道与宿主在真实现里也是每实例一套：ql-elevated.ts 的 nMaxInstances=1）
    expect(ctx.elevatedRequests.length).toBe(2);
    expect(ctx.elevatedHandles.length).toBe(2);
    expect(ctx.elevatedHandles[0]).not.toBe(ctx.elevatedHandles[1]);
    expect(m.states()).toEqual({
      c1: { running: true, stopping: false },
      c2: { running: true, stopping: false },
    });
    // 停一条不影响另一条
    await m.stop('c1');
    expect(ctx.elevatedHandles[0].stopArgs).toEqual([3]);
    expect(ctx.elevatedHandles[1].stopArgs).toEqual([]);
    expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
    expect(m.states()).toEqual({ c2: { running: true, stopping: false } });
    // 输出只进各自的页签
    ctx.elevatedHandles[1].emit('B-only');
    expect(ctx.data).toEqual([{ tabId: 'ql:c2', data: 'B-only' }]);
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

  // ── A2·Minor-6a：PtyProcess.onExit 的订阅晚于进程退出时必须补发（钉既有实现，不改语义）──
  // 不补发就永远停在 running：任务 6/13 的页签按钮卡在 [停止]，任务 13 的复原依据也拿不到退出码。
  it('onExit 订阅晚于进程退出时立即补发退出码，且不重复触发已注册的订阅者', async () => {
    const exitCbs: Array<(e: { exitCode: number }) => void> = [];
    const handle = {
      pid: 4711,
      write: () => {}, resize: () => {}, kill: () => {},
      onData: () => ({ dispose() {} }),
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCbs.push(cb); return { dispose() {} }; },
    };
    const p = new PtyProcess(handle);
    const early: number[] = [];
    p.onExit((code) => early.push(code)); // 正常订阅：退出之前就注册
    exitCbs.forEach((cb) => cb({ exitCode: 3 })); // 进程先退出
    expect(p.isRunning()).toBe(false);
    expect(early).toEqual([3]);
    // 订阅晚于退出：必须立即补发，两个迟到的订阅者都要拿到
    const late: number[] = [];
    p.onExit((code) => late.push(code));
    p.onExit((code) => late.push(code));
    expect(late).toEqual([3, 3]);
    // 补发是一次性的：不得把已注册的订阅者再叫一遍
    expect(early).toEqual([3]);
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
