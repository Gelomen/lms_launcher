// src-main/ql-pty-host.test.ts
// 任务 5（2026-10-14-quick-launch-admin §6.6）：宿主入口 runHost 的装配 —— check E1–E6 的守测试。
// 用例名逐字 = plan 任务 5 步骤 1（check D1 的 6 条）。假 socket = EventEmitter + 收集写出的帧（plan 步骤 1 的口径），
// 写出的字节交给**真** createFrameParser 还原成帧：帧序 / 粘帧 / 半帧的判据不靠测试侧手工拼接。
// 假 pty = 只实现 quick-launch.ts:60-67 那个 PtyHandle 的最小面，喂给**真** PtyProcess ——
//   §6.6-7 要求宿主复用它的 stopGraceful（kill → 等 timeoutSecs → taskkill /T /F），所以停止时序必须在真实现里观察。
// 真 pty / 真管道不在这里（check B2）：本会话的 ConPTY 必 EPERM（规格 §2-5 / 索引 K22），真管道只出现在 check D3 的冒烟里。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pty from '@lydell/node-pty';
import { shellExe, spawnShell } from './quick-launch';
import { HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol';
import { main, runHost, type HostSocket } from './ql-pty-host';

// 停止升级链在 quick-launch.ts:122-142（宿主复用它）：与 quick-launch.test.ts:13-19 同一手法观察 taskkill。
// quick-launch.ts 里 node:child_process 只用于 taskkill，整文件 mock 不影响其它路径。
const taskkillCalls = vi.hoisted(() => [] as Array<{ cmd: string; args: string[] }>);
vi.mock('node:child_process', () => ({
  execFileSync: (cmd: string, args: string[]) => {
    taskkillCalls.push({ cmd, args });
    return '';
  },
}));

// E2 的「与非提权路径逐字一致」需要对照物：把 node-pty 的 spawn 记下来，
// 同一份假 spawn 同时接住真 spawnShell（quick-launch.ts:153-163）与宿主注入的 spawn，两份选项逐字比对。
const ptySpawnSeen = vi.hoisted(() => [] as unknown[][]);
vi.mock('@lydell/node-pty', () => ({
  spawn: (...args: unknown[]) => {
    ptySpawnSeen.push(args);
    return {
      pid: 0,
      write: (): void => {},
      resize: (): void => {},
      kill: (): void => {},
      onData: () => ({ dispose(): void {} }),
      onExit: () => ({ dispose(): void {} }),
    };
  },
}));

// 任务 10 · E6 / C6 / K57：宿主顶层 catch 的守测试要能制造一个「装配期未预期异常」——
// 真实现下 runHost 的 deps.connect 就是 net.connect，把 connect 换成会抛的实现即可。
// 本文件之外没有别的模块 import node:net（ql-pty-host.ts 是唯一一处）。
vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return { ...actual, connect: () => { throw new Error('socket boom'); } };
});

const PIPE = '\\\\.\\pipe\\lms-ql-1a2b3c4d';
const TOKEN = 'tok-1';
const PID = 4321;

/** 假 socket（plan 步骤 1 的口径）：write 出去的字节流即时解码成帧，frames 就是断言对象 */
class FakeSocket extends EventEmitter implements HostSocket {
  frames: Array<{ type: number; payload: string }> = [];
  private readonly parser = createFrameParser((type: number, payload: string) => {
    this.frames.push({ type, payload });
  });

  write(chunk: Buffer | string): boolean {
    this.parser(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  /** 主进程 → 宿主的一帧：按字节喂进去，与真管道上的形状一致 */
  send(type: HostFrameType, payload: string): void {
    this.emit('data', encodeFrame(type, payload));
  }

  /** 半帧：真解析器必须把它留在缓冲里等后半（任务 2 的语义在宿主里被复用） */
  feedBytes(chunk: Buffer): void {
    this.emit('data', chunk);
  }

  closeSocket(): void {
    this.emit('close');
  }

  payloadOf(type: number): string {
    const found = this.frames.find((f) => f.type === type);
    return found ? found.payload : '';
  }
}

/**
 * 假 PTY 句柄：quick-launch.ts:60-67 的 PtyHandle 最小面，喂给**真** PtyProcess。
 * 默认 kill() 之后不发 exit 事件 —— 真机上强杀后 exit 事件可能不落地（quick-launch.test.ts:103 同口径），
 * 这样「超时 → taskkill」的升级链才观察得到。
 */
class FakeHandle {
  writes: string[] = [];
  resizeArgs: Array<[number, number]> = [];
  killCount = 0;
  private dataCbs: Array<(d: string) => void> = [];
  private exitCbs: Array<(e: { exitCode: number }) => void> = [];

  constructor(readonly pid: number) {}

  write(d: string): void {
    this.writes.push(d);
  }

  resize(cols: number, rows: number): void {
    this.resizeArgs.push([cols, rows]);
  }

  kill(): void {
    this.killCount++;
  }

  onData(cb: (d: string) => void): { dispose(): void } {
    this.dataCbs.push(cb);
    return { dispose(): void {} };
  }

  onExit(cb: (e: { exitCode: number }) => void): { dispose(): void } {
    this.exitCbs.push(cb);
    return { dispose(): void {} };
  }

  emitData(d: string): void {
    this.dataCbs.forEach((cb) => cb(d));
  }

  emitExit(code: number): void {
    this.exitCbs.forEach((cb) => cb({ exitCode: code }));
  }
}

/**
 * 起一个宿主：argv 按 C1 的形状喂（[node, script, pipeName, token] —— runHost 从 process.argv 读管道名与 token），
 * socket 与 pty 都是假的。runHost 只在入口同步读 argv，读完即还原 process.argv。
 */
function startHost(handle: FakeHandle = new FakeHandle(PID)): {
  socket: FakeSocket;
  handle: FakeHandle;
  spawnArgs: unknown[][];
  connectArgs: unknown[];
} {
  const socket = new FakeSocket();
  const spawnArgs: unknown[][] = [];
  const connectArgs: unknown[] = [];
  const savedArgv = process.argv;
  process.argv = [savedArgv[0], 'D:\\Program Files\\lms launcher\\dist-main\\ql-pty-host.js', PIPE, TOKEN];
  try {
    runHost({
      connect: (name: unknown) => {
        connectArgs.push(name);
        return socket;
      },
      spawn: ((...args: unknown[]) => {
        spawnArgs.push(args);
        return handle;
      }) as unknown as typeof pty.spawn,
    });
  } finally {
    process.argv = savedArgv;
  }
  return { socket, handle, spawnArgs, connectArgs };
}

/** 首帧 HELLO（§6.5 帧表：{ token, shell, cols, rows, cwd }）；over 用来造 token 不符等分支 */
function sendHello(socket: FakeSocket, over: Record<string, unknown> = {}): void {
  socket.send(HOST_FRAME.HELLO, JSON.stringify({ token: TOKEN, shell: 'cmd', cols: 100, rows: 30, cwd: 'C:\\work', ...over }));
}

let exitCodes: number[] = [];

// 任务 10 · C7 / K57：留痕文件真写在 os.tmpdir() 下。把 TEMP/TMP/TMPDIR 指到每个用例独占的目录：
// 既不污染真 TEMP，也不与并行跑的其它测试文件抢同一个 %TEMP%\lms-ql-host.log（否则「最后一行」会串台）。
const TRACE_FILE_NAME = 'lms-ql-host.log';
const ENV_KEYS = ['TEMP', 'TMP', 'TMPDIR'] as const;
let traceDir = '';
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function tracePath(): string {
  return path.join(os.tmpdir(), TRACE_FILE_NAME);
}

function lastTraceLine(): string {
  const lines = fs.readFileSync(tracePath(), 'utf8').split('\n').filter((l) => l !== '');
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

beforeEach(() => {
  exitCodes = [];
  taskkillCalls.length = 0;
  ptySpawnSeen.length = 0;
  traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-pty-host-trace-'));
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    process.env[k] = traceDir;
  }
  // 真宿主在这里结束进程；单测里只记录退出码，不让 vitest 的 worker 退出（C4 的判据就是这个实参）
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(typeof code === 'number' ? code : -1);
    return undefined as never;
  }) as unknown as (code?: number) => never);
});

afterEach(() => {
  vi.mocked(process.exit).mockRestore();
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(traceDir, { recursive: true, force: true });
  traceDir = '';
});

describe('ql-pty-host：提权 PTY 宿主的装配（规格 §6.6 的 1-9 步）', () => {

  // ---------- E1（§6.6-2）+ C1（argv 契约）----------
  it('hello_with_a_wrong_token_exits_2_and_sends_err', () => {
    const { socket, spawnArgs, connectArgs } = startHost();
    // C1：管道名来自 argv（其余参数一律在 HELLO 里传，§6.4-4 / 索引 K2）
    expect(connectArgs).toEqual([PIPE]);

    sendHello(socket, { token: 'not-the-host-token' });

    // E1：只发机器可读的 ERR{stage:'token'}，不带任何文案（G1 / §6.6-9 —— 文案在主进程侧按词典生成）
    expect(socket.frames.map((f) => f.type)).toEqual([HOST_FRAME.ERR]);
    const err = JSON.parse(socket.payloadOf(HOST_FRAME.ERR)) as { stage: string; message: string };
    expect(err.stage).toBe('token');
    expect(typeof err.message).toBe('string');
    // 退出码 2（§6.6-2），且**没有**起终端
    expect(exitCodes).toEqual([2]);
    expect(spawnArgs).toEqual([]);
  });

  // ---------- E2（§6.6-3 / C3）+ F3（终端映射只有一份）----------
  it('spawn_options_match_the_non_elevated_path', () => {
    // 对照物：真 spawnShell 在同一进程里把它的选项交给同一个假 spawn
    spawnShell('cmd', 100, 30, 'C:\\work');
    expect(ptySpawnSeen).toHaveLength(1);
    const refOpts = ptySpawnSeen[0][2] as Record<string, unknown>;
    ptySpawnSeen.length = 0;

    const { socket, spawnArgs } = startHost();
    sendHello(socket, { shell: 'pwsh', cols: 120, rows: 40, cwd: 'D:\\lms' });
    expect(spawnArgs).toHaveLength(1);
    const [exe, args, opts] = spawnArgs[0] as [string, string[], Record<string, unknown>];

    // F3 / §6.6-3：exe 与 args 来自 quick-launch.ts:146-150 的 shellExe，宿主里没有第二张映射表
    expect([exe, args]).toEqual([shellExe('pwsh').exe, shellExe('pwsh').args]);
    expect(exe).toBe('pwsh.exe');
    expect(args).toEqual(['-NoLogo']);

    // C3：name/cols/rows/cwd/env 五个取值，cols/rows/cwd 来自 HELLO（§6.4-4）
    expect(opts).toEqual({ name: 'xterm-256color', cols: 120, rows: 40, cwd: 'D:\\lms', env: process.env });
    // 「与非提权路径逐字一致」的机器证明：键集与非提权路径产出的选项完全相同，且没有 encoding
    expect(Object.keys(opts).sort()).toEqual(Object.keys(refOpts).sort());
    expect(refOpts.name).toBe('xterm-256color');
    expect(Object.keys(opts)).not.toContain('encoding');
  });

  // ---------- E3（§6.6-4/5、C4）+ RF6 ----------
  it('ready_then_data_then_exit_frame_order', () => {
    const { socket, handle } = startHost();
    sendHello(socket);
    // K32：onData 交出的是 JS 字符串，原样进 DATA 的 payload（不自己拼 Buffer 字节再 toString）。
    // 带非 ASCII 与代理对：任何「自己拼字节」的写法都会在这里失真。
    const OUT = 'a\u00e9\u{1F600}b';
    handle.emitData(OUT);
    handle.emitExit(7);

    // 帧序 READY → DATA → EXIT（§6.6-4/5，RF6 的宿主半边）
    expect(socket.frames.map((f) => f.type)).toEqual([HOST_FRAME.READY, HOST_FRAME.DATA, HOST_FRAME.EXIT]);
    const ready = JSON.parse(socket.payloadOf(HOST_FRAME.READY)) as { hostPid: number; shellPid: number };
    expect(ready.hostPid).toBe(process.pid);
    expect(ready.shellPid).toBe(PID);
    expect(socket.payloadOf(HOST_FRAME.DATA)).toBe(OUT);
    expect(JSON.parse(socket.payloadOf(HOST_FRAME.EXIT))).toEqual({ code: 7 });
    // C4：EXIT 帧的 code 与 process.exit 的实参同源（§6.6-5）
    expect(exitCodes).toEqual([7]);
  });

  // ---------- E4（§6.6-6）----------
  it('write_and_resize_frames_reach_the_pty_handle', () => {
    const { socket, handle } = startHost();
    sendHello(socket);

    socket.send(HOST_FRAME.WRITE, 'dir\r');
    socket.send(HOST_FRAME.RESIZE, JSON.stringify({ cols: 132, rows: 44 }));
    expect(handle.writes).toEqual(['dir\r']);
    expect(handle.resizeArgs).toEqual([[132, 44]]);

    // 半帧：一帧拆两段送，到达句柄的仍是完整原文（宿主用的是任务 2 的真解析器）
    const half = encodeFrame(HOST_FRAME.WRITE, 'ls\r');
    socket.feedBytes(half.subarray(0, 4));
    socket.feedBytes(half.subarray(4));
    expect(handle.writes).toEqual(['dir\r', 'ls\r']);
  });

  // ---------- E5（§6.6-7、RF6）：超时来自帧，不是写死的 3 ----------
  it('stop_frame_runs_stopGraceful_with_the_given_timeout', async () => {
    vi.useFakeTimers();
    const { socket, handle } = startHost();
    sendHello(socket);

    socket.send(HOST_FRAME.STOP, JSON.stringify({ timeoutSecs: 5 }));
    expect(handle.killCount).toBe(1); // §6.6-7 的第一步：终止（复用 PtyProcess.stopGraceful）

    await vi.advanceTimersByTimeAsync(4000);
    expect(taskkillCalls).toEqual([]); // 未到帧里给的 5s：不得强杀
    await vi.advanceTimersByTimeAsync(1200); // 越过 5s → taskkill /T /F -PID（quick-launch.ts:132-137）
    expect(taskkillCalls).toEqual([{ cmd: 'taskkill', args: ['/T', '/F', '-PID', String(PID)] }]);

    handle.emitExit(0); // 强杀后 exit 事件落地 → 同一条 EXIT 路径
    expect(JSON.parse(socket.payloadOf(HOST_FRAME.EXIT))).toEqual({ code: 0 });
    expect(exitCodes).toEqual([0]);
  });

  // ---------- E6（§6.6-8）：管道断开 = 视同 STOP{timeoutSecs:3} ----------
  it('socket_close_runs_the_stop_path', async () => {
    vi.useFakeTimers();
    const { socket, handle } = startHost();
    sendHello(socket);

    socket.closeSocket(); // 主进程退出 / 崩溃
    expect(handle.killCount).toBe(1); // 不留孤儿 ConPTY：走的是与 STOP 同一条停止路径

    await vi.advanceTimersByTimeAsync(2900);
    expect(taskkillCalls).toEqual([]); // §6.6-8 给的是 3s
    await vi.advanceTimersByTimeAsync(200);
    expect(taskkillCalls).toEqual([{ cmd: 'taskkill', args: ['/T', '/F', '-PID', String(PID)] }]);
  });

  // ---------- 任务 10 · E5 / C6 / C7 / K57：管道连不上 = 退出码 3（原来与加载期崩溃同为 1）+ 留痕一行 ----------
  it('host_pipe_failure_exits_3_and_writes_the_trace_file', () => {
    const { socket } = startHost();
    socket.emit('error', new Error('connect EPERM')); // §6.6-10：管道连不上 / error 事件

    // 退出码 3（R-18 / K57）：主进程据此判「宿主没连上」，不再与加载期崩溃混淆
    expect(exitCodes).toEqual([3]);
    // 留痕行逐字：<ISO 时间> pid=<pid> pipe=<管道名> stage=<stage> err=<原始 message>
    const line = lastTraceLine();
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z pid=\d+ pipe=/);
    expect(line.endsWith(' pipe=' + PIPE + ' stage=pipe err=connect EPERM')).toBe(true);
    expect(line).not.toContain('\r'); // 换行已压成空格（一行一条）
  });

  // ---------- 任务 10 · E6 / C6 / C7 / K57：宿主顶层未预期异常 = stage='fatal' + 退出码 4 + 留痕 ----------
  it('host_fatal_error_exits_4_and_writes_the_trace_file', () => {
    const savedArgv = process.argv;
    process.argv = [savedArgv[0], 'D:\\Program Files\\lms launcher\\dist-main\\ql-pty-host.js', PIPE, TOKEN];
    try {
      main(); // node:net.connect 被 mock 成抛异常 → runHost 装配期抛 → main 的顶层 catch
    } finally {
      process.argv = savedArgv;
    }
    // 退出码 4（R-18 / K57）：宿主自身的未预期异常，加载期与运行期都归到这一类
    expect(exitCodes).toEqual([4]);
    const line = lastTraceLine();
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z pid=\d+ pipe=/);
    expect(line.endsWith(' pipe=' + PIPE + ' stage=fatal err=socket boom')).toBe(true);
  });
});
