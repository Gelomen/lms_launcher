// src-main/ql-elevated.test.ts
// 任务 4（2026-10-14-quick-launch-admin §6.4 / §6.5 / §6.7 / §6.10）：提权宿主的管道服务端与起宿主接缝。
// 用例名逐字取 plan 任务 4 步骤 1（check D1 的 5 条 = E1/E2/E3/E4/E5 的守测试）；
// 另三条（pipe_name_* / connect_* / real_koffi_*）守 C1 的管道名形状与 535、以及 F1/F2 的绑定可用性。
// 判据一律走假接缝（假 WinPipeApi + 假 HostLauncher + 假 WinShellApi）：
//   - 不真起提权进程：真 runas 会弹 UAC 并把主进程同步阻塞 5.7-5.9s（规格 §3-P11 / E19），自动化门会变成人工门；
//   - 不真建管道（check B2 的边界）：真管道只在 check D3 的冒烟（.temp/ql-admin-probe/probe9.mjs）里出现。
// 唯一真跑的是硬链接解析：fs.linkSync / fs.statSync 在临时目录真跑一次（plan 任务 4 步骤 1 第 3 条）。
// 译文断言走 t()，不写死中文文案（同 shell-execute.test.ts:5 的口径）。
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { t } from './i18n';
import type { TerminalId } from './quick-launch-config';
import { ShellExecProcess, winShell, type WinShellApi } from './shell-execute';
import { HOST_FRAME, createFrameParser, encodeFrame } from './ql-host-protocol';
import {
  ElevatedPtyProcess,
  createHostLauncher,
  hostStartError,
  newPipeName,
  pipeKernel,
  resolveHostLink,
  startElevatedHost,
  startHost,
  winPipe,
  type HostLauncher,
  type WinPipeApi,
} from './ql-elevated';

const PIPE_HANDLE = { fakePipe: 'p1' };
const HOST_HANDLE = { fakeHost: 'h1' };
const SD_STUB = { fakeSecurityDescriptor: 'sd' };
// 脚本路径含空格是常态（app.asar 的父目录常带空格）：E2 的「三个参数都加引号」只有在这种路径上才有牙
const HOST_EXE = 'C:\\Program Files\\lms launcher\\win-unpacked\\node.exe';
const HOST_SCRIPT = 'C:\\Program Files\\lms launcher\\win-unpacked\\resources\\app.asar\\dist-main\\ql-pty-host.js';
const PIPE_NAME = '\\\\.\\pipe\\lms-ql-1a2b3c4d';
const TOKEN = 'tok-1';

/** 假 WinPipeApi（任务 6 的 ElevatedPtyProcess 用同一形状）：close 记录句柄，供 RF4 的泄漏门用 */
function fakePipe(over: Partial<WinPipeApi> = {}): { api: WinPipeApi; closed: unknown[] } {
  const closed: unknown[] = [];
  const api: WinPipeApi = {
    createServer: vi.fn(() => PIPE_HANDLE),
    connect: vi.fn(() => true),
    available: vi.fn(() => 0),
    read: vi.fn(() => Buffer.alloc(0)),
    write: vi.fn(() => true),
    close: vi.fn((h: unknown) => { closed.push(h); }),
    ...over,
  };
  return { api, closed };
}

/** 假 WinShellApi：shellExecute 记录**完整实参数组**（不预判第三参的形状，先红时它是 undefined），close 记录句柄 */
function fakeShell(over: Partial<WinShellApi> = {}): { api: WinShellApi; seen: unknown[][]; closed: unknown[] } {
  const seen: unknown[][] = [];
  const closed: unknown[] = [];
  const api: WinShellApi = {
    shellExecute: vi.fn((...args: unknown[]) => {
      seen.push(args);
      return { ok: true, handle: HOST_HANDLE, win32Error: 0 };
    }),
    pidOf: vi.fn(() => 4242),
    isAlive: vi.fn(() => true),
    exitCodeOf: vi.fn(() => 0),
    terminate: vi.fn(() => true),
    close: vi.fn((h: unknown) => { closed.push(h); return true; }),
    killTree: vi.fn(() => true),
    ...over,
  };
  return { api, seen, closed };
}

/** 临时替换 koffi 层的指定属性，跑完还原（真实现是普通对象、属性可写 —— 同 shell-execute.ts:80-83 的手法） */
function withKernel<T>(patch: Partial<typeof pipeKernel>, run: () => T): T {
  const keys = Object.keys(patch) as (keyof typeof pipeKernel)[];
  const saved: Partial<typeof pipeKernel> = {};
  for (const k of keys) saved[k] = pipeKernel[k];
  Object.assign(pipeKernel, patch);
  try {
    return run();
  } finally {
    for (const k of keys) pipeKernel[k] = saved[k] as never;
  }
}

describe('ql-elevated 第一段：命名管道服务端与起宿主（规格 §6.4 / §6.5 / §6.7 / §6.10）', () => {

  // ---------- E1 + C3（check C3 的每个取值都在这一条里）----------
  it('server_is_created_with_the_sddl_descriptor', () => {
    const sddlSeen: string[] = [];
    const createSeen: unknown[][] = [];
    withKernel(
      {
        securityDescriptor: vi.fn((sddl: string) => { sddlSeen.push(sddl); return SD_STUB; }),
        createNamedPipe: vi.fn((...args: unknown[]) => { createSeen.push(args); return PIPE_HANDLE; }),
        freeDescriptor: vi.fn(() => true),
      },
      () => {
        const h = winPipe.createServer(PIPE_NAME);
        expect(h).toBe(PIPE_HANDLE);
        // 规格 §6.5 逐字：必须显式 SDDL —— 不给 SD，提权客户端连不上（取证 P10 / P12）
        expect(sddlSeen).toEqual(['D:(A;;GA;;;WD)']);
        // 规格 §6.5 逐字：dwOpenMode = PIPE_ACCESS_DUPLEX(3)、dwPipeMode = 0、nMaxInstances = 1、64KiB x 2、nDefaultTimeOut = 0
        expect(createSeen).toEqual([[PIPE_NAME, 3, 0, 1, 65536, 65536, 0, SD_STUB]]);
      },
    );
    // SDDL 转换失败 → 不建管道：宁可失败，也不退化成「没有 SD 的管道」（P10 证过的静默错误）
    withKernel(
      {
        securityDescriptor: vi.fn(() => null),
        createNamedPipe: vi.fn((...args: unknown[]) => { createSeen.push(args); return PIPE_HANDLE; }),
        freeDescriptor: vi.fn(() => true),
      },
      () => {
        expect(winPipe.createServer(PIPE_NAME)).toBeNull();
        expect(createSeen).toHaveLength(1);
      },
    );
  });

  // ---------- E2 + C4（规格 §6.4-3 / 索引 K34：直接调 shellExecute，不借道 launchShellExe）----------
  it('launch_passes_runas_and_three_quoted_arguments', () => {
    const { api, seen } = fakeShell();
    const launcher = createHostLauncher(api);
    const r = launcher.launch(HOST_EXE, HOST_SCRIPT, PIPE_NAME, TOKEN);
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe(HOST_EXE);
    expect(seen[0][1]).toBe(0); // nShow = SW_HIDE（§6.4-3）
    const opts = seen[0][2] as { verb?: string | null; parameters?: string | null } | undefined;
    expect(opts?.verb).toBe('runas');
    // 三个参数都带引号（§6.4-3：脚本路径可能含空格）
    expect(opts?.parameters).toBe('\"' + HOST_SCRIPT + '\" \"' + PIPE_NAME + '\" \"' + TOKEN + '\"');
    // C2 的 hostScriptPath：与主进程同目录的 ql-pty-host.js（dev = dist-main/，打包 = app.asar/dist-main/）
    expect(launcher.hostScriptPath()).toBe(path.join(__dirname, 'ql-pty-host.js'));
  });

  // ---------- E3 + C5（规格 §6.4-1 / §9-R5：fs.linkSync / fs.statSync 在临时目录真跑一次）----------
  it('host_exe_resolution_reuses_an_existing_link_only_when_size_matches', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-hostlink-'));
    try {
      const src = path.join(dir, 'electron.exe');
      fs.writeFileSync(src, Buffer.alloc(4096, 1));
      const link = path.join(dir, 'node.exe');
      // 1) 目录里没有 node.exe → 真跑一次 fs.linkSync：硬链接 = 同 inode、0 额外空间，不是副本
      expect(resolveHostLink(src, dir)).toBe(link);
      expect(fs.statSync(link).size).toBe(4096);
      expect(fs.statSync(link).ino).toBe(fs.statSync(src).ino);
      // 2) 已存在且 size 相同（就是我们自己建的那条）→ 复用：不重复建、不报错（§8-K13「运行时缺再补」的反面：不缺就不动）
      expect(resolveHostLink(src, dir)).toBe(link);
      expect(fs.statSync(link).ino).toBe(fs.statSync(src).ino);
      // 3) 已存在但 size 不同 = 用户自己放的 node.exe → 明确报错，且不覆盖、不删除别人的文件（§6.4-1 / §9-R5）
      fs.unlinkSync(link);
      fs.writeFileSync(link, Buffer.alloc(7, 2));
      let msg = '';
      try {
        resolveHostLink(src, dir);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toBe('hostlink=size-mismatch');
      expect(fs.statSync(link).size).toBe(7);
      // 4) linkSync 失败（非 NTFS / 目录只读 / 目录不存在）→ hostlink=<errno>，即 §6.10 第三行的 {err}
      let msg2 = '';
      try {
        resolveHostLink(src, path.join(dir, 'no-such-dir'));
      } catch (e) {
        msg2 = (e as Error).message;
      }
      expect(msg2).toBe('hostlink=ENOENT');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---------- E4 + RF4（规格 §6.7「抛出前关掉管道句柄与进程句柄」）----------
  it('launch_failures_close_both_handles', () => {
    // 场景 1：ShellExecuteEx 失败但仍交回一个进程句柄 → 两个句柄都得关；win32Error 原样交出去（R-07：不带文案）
    const { api: pipe, closed: pipeClosed } = fakePipe();
    const { api: shell, closed: shellClosed } = fakeShell({
      shellExecute: vi.fn(() => ({ ok: false, handle: HOST_HANDLE, win32Error: 5 })),
    });
    const r = startHost(pipe, createHostLauncher(shell));
    expect(r.ok).toBe(false);
    expect(r.win32Error).toBe(5);
    expect(pipeClosed).toEqual([PIPE_HANDLE]);
    expect(shellClosed).toEqual([HOST_HANDLE]);
    // 场景 2：宿主路径解析失败（硬链接建不出来）→ 管道句柄也要关，异常原样向上交
    const { api: pipe2, closed: pipeClosed2 } = fakePipe();
    const { api: shell2, seen: seen2 } = fakeShell();
    const missing = createHostLauncher(shell2, { execPath: 'X:\\missing\\electron.exe', hostDir: 'X:\\missing' });
    let msg = '';
    try {
      startHost(pipe2, missing);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('hostlink=ENOENT');
    expect(pipeClosed2).toEqual([PIPE_HANDLE]);
    expect(seen2).toHaveLength(0); // 路径没解析出来就不该去起进程
  });

  // ---------- E5 + C6（主代理裁决 R-07 / 索引 K35：守的是映射器，不是 launch()）----------
  it('win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target', () => {
    const userTarget = 'cmd'; // 用户那一行的目标（shellExe(shell).exe，§8-K3），不是宿主 exe
    const msg = hostStartError(1223, userTarget).message;
    expect(msg).toMatch(/^PROC: /); // G1：本模块只出 PROC:
    expect(msg).toContain(t('err.proc.uacCancelled', { exe: userTarget }));
    expect(msg).not.toContain('node.exe'); // §6.10：绝不传宿主 exe
    // 其它码走 err.proc.spawnFail + win32=<code>（§6.10 第二行，零新键）
    expect(hostStartError(2, userTarget).message).toContain(t('err.proc.spawnFail', { exe: userTarget, err: 'win32=2' }));
  });

  // ---------- C1 / §6.5：管道名的形状与「每实例一条」（§9-R8 两条并发各一条）----------
  it('pipe_name_matches_the_documented_shape', () => {
    const a = newPipeName();
    const b = newPipeName();
    expect(a).toMatch(/^\\\\\.\\pipe\\lms-ql-[0-9a-f]{8}$/);
    expect(b).not.toBe(a);
  });

  // ---------- C1：ConnectNamedPipe 的 535 也算成功（取证 P10：客户端先连上是常态）----------
  it('connect_treats_error_pipe_connected_as_success', () => {
    withKernel({ connectNamedPipe: () => ({ ok: false, win32Error: 535 }) }, () => {
      expect(winPipe.connect(PIPE_HANDLE)).toBe(true);
    });
    withKernel({ connectNamedPipe: () => ({ ok: true, win32Error: 0 }) }, () => {
      expect(winPipe.connect(PIPE_HANDLE)).toBe(true);
    });
    withKernel({ connectNamedPipe: () => ({ ok: false, win32Error: 2 }) }, () => {
      expect(winPipe.connect(PIPE_HANDLE)).toBe(false);
    });
  });

  // ---------- F1 / F2：真 koffi 绑定可用（不建管道、不起进程 —— check B2 的边界内）----------
  it('real_koffi_converts_the_sddl_descriptor_without_a_pipe', () => {
    const sd = pipeKernel.securityDescriptor('D:(A;;GA;;;WD)');
    expect(sd).not.toBeNull();
    expect(pipeKernel.freeDescriptor(sd)).toBe(true);
    // 非法 SDDL → null（winPipe.createServer 据此不建管道，见第一条用例）
    expect(pipeKernel.securityDescriptor('D:(BOGUS')).toBeNull();
    // 建管道失败 → null，不是 INVALID_HANDLE_VALUE。koffi 把 void * 交回 BigInt：
    // 失败 = 18446744073709551615n（探针 .temp/ql-admin-probe/probe16.mjs 实测 lastErr 2），只判 null 会漏
    // （空名字 → CreateNamedPipeW 直接失败，不产生任何管道对象，仍在 check B2 的边界内）
    expect(pipeKernel.createNamedPipe('', 3, 0, 1, 65536, 65536, 0, null)).toBeNull();
    expect(winPipe.createServer('')).toBeNull();
  });
});

// ============================================================================
// 任务 6（第二段）：ElevatedPtyProcess + startElevatedHost —— 规格 §6.7 / §6.5（读侧）/ §6.10 最后一行。
// 用例名逐字取 plan 任务 6 步骤 1 的 8 条（check D1 = E1-E8 的守测试）；末尾两条守 check C7
// （主代理裁决 R-11：ERR 帧 → err.ql.ptySpawn + host=<stage>）与 C2 的六个方法（write / resize 的帧形状）。
// 假接缝（check B2：不真起进程、不真建管道）：假 WinPipeApi + 假 HostLauncher + 临时替换真 winShell 的属性
//   （宿主句柄的生命周期复用 ShellExecProcess，它拿的是模块级单例 → 同 withKernel 的逐属性替换手法）。
// 假定时器就是「把 HOST_HANDSHAKE_TIMEOUT_MS 压到几毫秒」的做法（同 shell-execute.test.ts:63、
//   quick-launch.test.ts:240、ql-pty-host.test.ts:264）：15s 的超时在 advanceTimersByTimeAsync 下瞬时推进。
// 帧的判据一律用**真** createFrameParser / encodeFrame（任务 2 的实现），不自己拼协议字节。
// 返工两处（主代理裁决 R-13 / 索引 K50，2026-10-15）：check C8「委托传剩余预算」由
//   stopGraceful_delegates_after_the_EXIT_frame 断言委托实参守（vi.spyOn 只记实参、透传真实现）；
//   索引 K39 的「available() 交正值但 read() 交回空 Buffer」由
//   read_failure_after_available_falls_back_to_the_exit_path 守（报告 §6-3 的处置）。
// ============================================================================

const LOG_TARGET = 'cmd';                 // §6.10：{exe} = 用户那一行的目标，绝不是宿主 exe
const HOST_PID = 4242;
const HELLO_OPTS = { shell: 'cmd' as TerminalId, cols: 120, rows: 40, cwd: 'D:\\lms', logTarget: LOG_TARGET };
// 索引 K44①：READY 的 shellPid 实测是 0（ConPTY 的 innerPid 异步赋值）→ 实现不得用它做任何判断
const READY_PAYLOAD = JSON.stringify({ hostPid: HOST_PID, shellPid: 0 });

interface FakeHostPipe {
  api: WinPipeApi;
  written: Buffer[];
  closed: unknown[];
  events: string[];
  push: (bytes: Buffer) => void;
  breakPipe: () => void;
}

/**
 * 任务 6 的假管道（check B2）：
 *  - push(bytes) = 宿主写来的字节，读侧的 available()/read() 从这里取；breakPipe() 之后 available 交 -1
 *    （索引 K39：-1 = 断管 / PeekNamedPipe 失败，与「没有数据」的 0 可分）；
 *  - written = 主进程写出的帧字节，用**真**解析器解码后断言（同 ql-pty-host.test.ts:47-81 的手法）；
 *  - closed = 被关掉的管道句柄（E7 / RF4 的泄漏门）；
 *  - events = 'a<n>' / 'r<n>' / 'w<type>' 的时间线：E8 用它断言「只在刚判过可读 n 字节之后才 read(n)」。
 */
function hostPipe(): FakeHostPipe {
  let toRead = Buffer.alloc(0);
  let broken = false;
  const written: Buffer[] = [];
  const closed: unknown[] = [];
  const events: string[] = [];
  const api: WinPipeApi = {
    createServer: vi.fn(() => PIPE_HANDLE),
    connect: vi.fn(() => true),
    available: vi.fn(() => {
      const n = broken ? -1 : toRead.length;
      events.push('a' + n);
      return n;
    }),
    read: vi.fn((_h: unknown, n: number) => {
      events.push('r' + n);
      const chunk = toRead.subarray(0, n);
      toRead = toRead.subarray(chunk.length);
      return chunk;
    }),
    write: vi.fn((_h: unknown, buf: Buffer) => {
      written.push(Buffer.from(buf));
      events.push('w' + buf[0]);
      return true;
    }),
    close: vi.fn((h: unknown) => { closed.push(h); }),
  };
  return {
    api, written, closed, events,
    push: (bytes: Buffer) => { toRead = Buffer.concat([toRead, bytes]); },
    breakPipe: () => { broken = true; },
  };
}

/** 假 HostLauncher：launched 存每次起宿主的完整实参（§6.4-4 的「argv 只带管道名与 token」判据） */
function hostLauncherStub(over: Partial<HostLauncher> = {}): { launcher: HostLauncher; launched: unknown[][] } {
  const launched: unknown[][] = [];
  const launcher: HostLauncher = {
    hostExePath: vi.fn(() => HOST_EXE),
    hostScriptPath: vi.fn(() => HOST_SCRIPT),
    launch: vi.fn((exe: string, script: string, pipeName: string, token: string) => {
      launched.push([exe, script, pipeName, token]);
      return { ok: true, handle: HOST_HANDLE, win32Error: 0 };
    }),
    ...over,
  };
  return { launcher, launched };
}

/** 真 winShell 的假属性（默认「宿主进程一直活着」）：close 记录句柄，供 E7 / RF4 的泄漏门用 */
function shellStub(over: Partial<WinShellApi> = {}): { patch: Partial<WinShellApi>; closed: unknown[] } {
  const closed: unknown[] = [];
  const patch: Partial<WinShellApi> = {
    pidOf: vi.fn(() => HOST_PID),
    isAlive: vi.fn(() => true),
    exitCodeOf: vi.fn(() => 0),
    terminate: vi.fn(() => true),
    close: vi.fn((h: unknown) => { closed.push(h); return true; }),
    killTree: vi.fn(() => true),
    ...over,
  };
  return { patch, closed };
}

/** 临时替换真 winShell 的指定属性（ShellExecProcess 用的是模块级单例），跑完还原 */
async function withShell<T>(patch: Partial<WinShellApi>, run: () => Promise<T>): Promise<T> {
  const keys = Object.keys(patch) as (keyof WinShellApi)[];
  const saved: Partial<WinShellApi> = {};
  for (const k of keys) saved[k] = winShell[k];
  Object.assign(winShell, patch);
  try {
    return await run();
  } finally {
    for (const k of keys) winShell[k] = saved[k] as never;
  }
}

function decodeFrames(buffers: Buffer[]): Array<{ type: number; payload: string }> {
  const frames: Array<{ type: number; payload: string }> = [];
  const feed = createFrameParser((type: number, payload: string) => { frames.push({ type, payload }); });
  for (const b of buffers) feed(b);
  return frames;
}

function frameOf(buffers: Buffer[], type: number): { type: number; payload: string } | undefined {
  return decodeFrames(buffers).find((f) => f.type === type);
}

/** 走完 §6.7 的握手（调用方必须已开假定时器并包在 withShell 里）：HELLO 已写出、READY 已收到 */
async function handshaked(h: FakeHostPipe, launcher: HostLauncher, opts = HELLO_OPTS): Promise<ElevatedPtyProcess> {
  const starting = startElevatedHost(h.api, launcher, opts); // 构造即启动：建管道 + 起宿主 + connect + 写 HELLO
  h.push(encodeFrame(HOST_FRAME.READY, READY_PAYLOAD));
  await vi.advanceTimersByTimeAsync(20);                     // POLL_READ_MS：一次读轮询把 READY 取走
  return await starting;
}

describe('ql-elevated 第二段：ElevatedPtyProcess（规格 §6.7 / §6.5 读侧 / §6.10 最后一行）', () => {

  // ---------- E1 + C4（§6.4-4：终端 id / 尺寸 / cwd 只在 HELLO 帧里，argv 里没有）----------
  it('hello_carries_token_shell_cols_rows_cwd', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher, launched } = hostLauncherStub();
      await withShell(shellStub().patch, async () => {
        const proc = await handshaked(h, launcher);
        expect(proc.isRunning()).toBe(true);
        // argv = 宿主 exe + 宿主脚本 + 管道名 + token，四项之外什么都没有（§6.4-3 / §6.4-4）
        expect(launched).toHaveLength(1);
        expect(launched[0]).toHaveLength(4);
        const [exe, script, pipeName, token] = launched[0] as [string, string, string, string];
        expect(exe).toBe(HOST_EXE);
        expect(script).toBe(HOST_SCRIPT);
        expect(pipeName).toMatch(/^\\\\.\\pipe\\lms-ql-[0-9a-f]{8}$/);
        expect(token).toMatch(/^[0-9a-f]{24}$/);
        // §6.5 帧表：HELLO 的载荷 = { token, shell, cols, rows, cwd }，token 与 argv 里那条一致
        const hello = frameOf(h.written, HOST_FRAME.HELLO);
        expect(hello).toBeTruthy();
        expect(JSON.parse(hello!.payload)).toEqual({ token, shell: 'cmd', cols: 120, rows: 40, cwd: 'D:\\lms' });
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E2 + K32（DATA 的 payload 是字符串，原样交给 onData）----------
  it('data_frames_are_forwarded_to_onData', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      await withShell(shellStub().patch, async () => {
        const proc = await handshaked(h, launcher);
        // READY 与首屏输出可能在同一次读里到达：onData 注册晚于帧到达时不得丢（quick-launch.ts:249-253 的注册顺序）
        h.push(encodeFrame(HOST_FRAME.DATA, 'first-screen'));
        await vi.advanceTimersByTimeAsync(20);
        const got: string[] = [];
        proc.onData((d) => got.push(d));
        expect(got).toEqual(['first-screen']);
        // 含非 ASCII 与代理对：任何「自己拼字节再转码」的写法都会在这里失真
        h.push(encodeFrame(HOST_FRAME.DATA, 'a\u00e9\u{1F600}'));
        h.push(encodeFrame(HOST_FRAME.DATA, 'b\r\n'));
        await vi.advanceTimersByTimeAsync(20);
        expect(got).toEqual(['first-screen', 'a\u00e9\u{1F600}', 'b\r\n']);
        // 半帧不产出：读侧不得自己切字节（粘帧 / 半帧由任务 2 的解析器守）
        const whole = encodeFrame(HOST_FRAME.DATA, 'tail');
        h.push(whole.subarray(0, whole.length - 2));
        await vi.advanceTimersByTimeAsync(20);
        expect(got).toEqual(['first-screen', 'a\u00e9\u{1F600}', 'b\r\n']);
        h.push(whole.subarray(whole.length - 2));
        await vi.advanceTimersByTimeAsync(20);
        expect(got).toEqual(['first-screen', 'a\u00e9\u{1F600}', 'b\r\n', 'tail']);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E3 + RF5（退出码优先取 EXIT 帧，不取句柄的）----------
  it('exit_code_prefers_the_EXIT_frame', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      // 句柄侧的退出码是 9：EXIT 帧的 7 必须赢（规格 §6.7）
      await withShell(shellStub({ isAlive: vi.fn(() => false), exitCodeOf: vi.fn(() => 9) }).patch, async () => {
        const proc = await handshaked(h, launcher);
        const codes: number[] = [];
        proc.onExit((c) => codes.push(c));
        h.push(encodeFrame(HOST_FRAME.EXIT, JSON.stringify({ code: 7 })));
        await vi.advanceTimersByTimeAsync(20);
        expect(codes).toEqual([7]);
        expect(proc.isRunning()).toBe(false);
        // 句柄轮询之后交回的 9 不得再报第二次（只一次，同 shell-execute.test.ts:60 的口径）
        await vi.advanceTimersByTimeAsync(500);
        expect(codes).toEqual([7]);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E4 + RF5 + K39（无 EXIT 帧：断管 → 回落 GetExitCodeProcess，取证 P12）----------
  it('host_crash_falls_back_to_the_handle_exit_code', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      const { patch, closed } = shellStub({ isAlive: vi.fn(() => false), exitCodeOf: vi.fn(() => 7) });
      await withShell(patch, async () => {
        const proc = await handshaked(h, launcher);
        const codes: number[] = [];
        proc.onExit((c) => codes.push(c));
        h.breakPipe(); // available() = -1 = 断管（ERROR_BROKEN_PIPE 109）→ §6.7 的退出路径
        await vi.advanceTimersByTimeAsync(200); // 读轮询停掉 + ShellExecProcess 的 100ms 轮询判退出
        expect(codes).toEqual([7]);
        expect(proc.isRunning()).toBe(false);
        expect(closed).toEqual([HOST_HANDLE]); // 进程句柄由 ShellExecProcess 关（C5③：不另写一套轮询）
        expect(h.closed).toEqual([PIPE_HANDLE]); // 管道句柄也关，不留泄漏
        expect(vi.getTimerCount()).toBe(0); // 两条轮询都清了
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E5（quick-launch.ts:108-115 同口径：注册晚于退出立即补发）----------
  it('registering_onExit_after_exit_replays_immediately', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      await withShell(shellStub().patch, async () => {
        const proc = await handshaked(h, launcher);
        h.push(encodeFrame(HOST_FRAME.EXIT, JSON.stringify({ code: 3 })));
        await vi.advanceTimersByTimeAsync(20);
        expect(proc.isRunning()).toBe(false);
        const codes: number[] = [];
        proc.onExit((c) => codes.push(c)); // 已退出：立即补发，否则页签按钮卡在 [停止]
        expect(codes).toEqual([3]);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E6 + RF6 + K44②③（STOP 带数字 timeoutSecs；等不到 EXIT 就必须真的委托）----------
  // ---------- C8 + 裁决 R-13 / 索引 K50（委托时传**剩余预算**，不是同一个 timeoutSecs）----------
  it('stopGraceful_delegates_after_the_EXIT_frame', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      let terminated = false;
      const { patch } = shellStub({
        // 提权宿主：taskkill 打不到（前置规格 E9）→ TerminateProcess 兜底；宿主自己不退出（K44③）
        killTree: vi.fn(() => { h.events.push('killTree'); return false; }),
        terminate: vi.fn(() => { terminated = true; h.events.push('terminate'); return true; }),
        isAlive: vi.fn(() => !terminated),
        close: vi.fn((hh: unknown) => { h.events.push('close'); void hh; return true; }),
      });
      // C8 的取证点：委托那一跳收到的秒数。vi.spyOn 默认**透传**原实现（只记实参，不改行为），
      // 所以下面的 killTree → terminate → close 顺序仍是真 ShellExecProcess.stopGraceful 跑出来的。
      const delegated = vi.spyOn(ShellExecProcess.prototype, 'stopGraceful');
      try {
        await withShell(patch, async () => {
          const proc = await handshaked(h, launcher);
          // 3s = main.ts:382 / :648 的 ql.stopAll(3) 实际传的值（索引 K50 的算例就用这个数）
          const stopping = proc.stopGraceful(3);
          // ① STOP 帧立刻发出，且带数字 timeoutSecs（K44②：宿主对缺失/非数取「不给宽限期」）
          const stop = frameOf(h.written, HOST_FRAME.STOP);
          expect(stop).toBeTruthy();
          expect(JSON.parse(stop!.payload)).toEqual({ timeoutSecs: 3 });
          // ② 宽限期（3s）内没有 EXIT 帧 → 必须走到委托 ShellExecProcess.stopGraceful（规格 §6.7）。
          //    推进 10s：够旧实现（传同值 → 3 + 3 + 1 = 7s）跑完，好让下面那条断言以「实参 = 原值」失败，
          //    而不是让整条用例卡在 await 上超时（红必须是契约，不是挂死）。
          await vi.advanceTimersByTimeAsync(10000);
          await stopping;
          const order = h.events.filter((e) => ['w4', 'killTree', 'terminate', 'close'].includes(e));
          expect(order).toEqual(['w4', 'killTree', 'terminate', 'close']); // 先 STOP，再委托（RF6 的顺序）
          expect(proc.isRunning()).toBe(false);
          // ③ C8 / K50：委托收到的是**剩余预算**，不是原值。宽限期整段等完（3s，无 EXIT）→ 剩余 0；
          //    单实例总上限因此是 timeoutSecs + FORCE_EXIT_WAIT_MS(1s) = 4s，与非提权路径同形，
          //    而不是传同值时的 2×timeoutSecs + 1s = 7s（stopAll 逐个 await → N 个实例 N×7s）。
          expect(delegated).toHaveBeenCalledTimes(1);
          const passed = delegated.mock.calls[0][0];
          expect(passed).toBeLessThan(3);            // 不是把原值交出去（旧实现：3 → 红）
          expect(passed).toBeLessThanOrEqual(1);     // 剩余预算：已等约 3s → ≤ 1（本例整段等完 → 0）
          expect(passed).toBeGreaterThanOrEqual(0);  // 不为负（Math.max(0, …)）
          // ④ 幂等：再停一次不得再发第二帧 STOP，也不得第二次委托
          await proc.stopGraceful(3);
          expect(decodeFrames(h.written).filter((f) => f.type === HOST_FRAME.STOP)).toHaveLength(1);
          expect(delegated).toHaveBeenCalledTimes(1);
        });
      } finally {
        delegated.mockRestore();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E7 + RF4（握手超时：两个句柄都关，且按 §6.10 最后一行抛出）----------
  it('handshake_timeout_closes_pipe_and_host', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe(); // available() 恒为 0：READY 永远不来
      const { launcher } = hostLauncherStub();
      const { patch, closed } = shellStub();
      let msg = '';
      await withShell(patch, async () => {
        // 拒绝处理器在创建时就挂上：否则假定时器推进到超时那一刻会先报 unhandled rejection
        const starting = startElevatedHost(h.api, launcher, HELLO_OPTS).then(
          () => { msg = 'resolved'; },
          (e: unknown) => { msg = (e as Error).message; },
        );
        await vi.advanceTimersByTimeAsync(15100); // HOST_HANDSHAKE_TIMEOUT_MS = 15000（假定时器 → 瞬时）
        await starting;
      });
      expect(msg).toMatch(/^PROC: /);
      expect(msg).toContain(t('err.ql.ptySpawn', { exe: LOG_TARGET, err: 'handshake=timeout' }));
      expect(msg).not.toContain('node.exe'); // §6.10：{exe} 绝不是宿主 exe
      expect(h.closed).toEqual([PIPE_HANDLE]);
      expect(closed).toEqual([HOST_HANDLE]);
      expect(vi.getTimerCount()).toBe(0); // 读轮询与握手定时器都没留下
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- E8 + §9-R7（读侧只在 available()>0 时 read(n)，不阻塞读）----------
  it('read_polling_uses_available_not_blocking_read', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      await withShell(shellStub().patch, async () => {
        await handshaked(h, launcher);
        const before = h.events.length;
        await vi.advanceTimersByTimeAsync(200); // 10 轮空轮询
        const idle = h.events.slice(before);
        expect(idle.length).toBeGreaterThan(0);
        expect(idle.every((e) => e === 'a0')).toBe(true); // 没有数据时只 Peek，不 Read
        const data = encodeFrame(HOST_FRAME.DATA, 'x');
        h.push(data);
        await vi.advanceTimersByTimeAsync(20);
        // 每条 read(n) 都必须紧跟在「刚判过可读 n 字节」之后：不存在 read(0) / 阻塞读
        const seq = h.events;
        for (let i = 0; i < seq.length; i++) {
          if (!seq[i].startsWith('r')) continue;
          const n = Number(seq[i].slice(1));
          expect(n).toBeGreaterThan(0);
          expect(seq[i - 1]).toBe('a' + n);
        }
        expect(seq).toContain('a' + data.length);
        expect(seq).toContain('r' + data.length);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- C5③ + 索引 K39（报告 §6-3 的处置）：available() 交正值、read() 交回空 Buffer ----------
  // 第一段的契约（:301 / :321-325）：ReadFile 失败时 read() 交回空 Buffer。这条假接缝用例补的正是
  // 「PeekNamedPipe 说可读、ReadFile 却失败」这个 Win32 边角：本轮不得产出任何数据、不得把空字节
  // 当断管（不自己造退出路径）、也不得凭空造帧；下一轮 available() 交 -1 才走 §6.7 的退出路径。
  it('read_failure_after_available_falls_back_to_the_exit_path', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      let alive = true; // 断管之前宿主还活着：退出必须由句柄轮询落地，不能是空字节「自己造的退出」
      const { patch, closed } = shellStub({
        isAlive: vi.fn(() => alive),
        exitCodeOf: vi.fn(() => 7), // 无 EXIT 帧：回落 GetExitCodeProcess（取证 P12）
      });
      const got: string[] = [];
      const codes: number[] = [];
      const readArgs: Array<[unknown, number]> = [];
      await withShell(patch, async () => {
        const proc = await handshaked(h, launcher);
        proc.onData((d) => got.push(d));
        proc.onExit((c) => codes.push(c));
        // 宿主写来一帧 DATA，但那次 ReadFile 失败：available() 照常交正值，read() 交回空 Buffer
        const frame = encodeFrame(HOST_FRAME.DATA, 'lost-frame');
        h.push(frame);
        h.api.read = vi.fn((_hh: unknown, n: number) => { readArgs.push([_hh, n]); return Buffer.alloc(0); });
        await vi.advanceTimersByTimeAsync(20); // 一轮读轮询：Peek 交正值 → Read 失败 → feed(空字节)
        // 本轮不产出任何数据（空字节喂给解析器是 no-op，不丢帧也不造帧）
        expect(got).toEqual([]);
        // 只按刚判过的字节数读一次（不阻塞读、不自己重试成 read(0)）
        expect(readArgs).toEqual([[PIPE_HANDLE, frame.length]]);
        // 空 Buffer 不等于断管：读轮询仍在跑、实例仍在运行（退出路径只由 -1 / EXIT / 句柄触发）
        expect(proc.isRunning()).toBe(true);
        expect(codes).toEqual([]);
        // 下一轮 available() 交 -1（ERROR_BROKEN_PIPE 109）→ 索引 K39：走 §6.7 的退出路径
        h.breakPipe();
        alive = false; // 宿主随管道一起没了：退出由 ShellExecProcess 的 100ms 句柄轮询落地（C5③）
        await vi.advanceTimersByTimeAsync(200);
        expect(got).toEqual([]);            // 退出路径也不补造那帧没读到的数据
        expect(codes).toEqual([7]);         // 无 EXIT 帧 → 句柄退出码
        expect(proc.isRunning()).toBe(false);
        expect(closed).toEqual([HOST_HANDLE]); // 进程句柄由 ShellExecProcess 关
        expect(h.closed).toEqual([PIPE_HANDLE]); // 管道句柄也关，不留泄漏
        expect(vi.getTimerCount()).toBe(0);     // 读轮询与句柄轮询都清了
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- C7 + 裁决 R-11（握手期的 ERR 帧 → err.ql.ptySpawn + host=<stage>，零新键）----------
  it('err_frame_in_the_handshake_maps_to_err_ql_ptyspawn_with_host_stage', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      const { patch, closed } = shellStub();
      let msg = '';
      await withShell(patch, async () => {
        // 同上：拒绝处理器先挂上，再推进假定时器
        const starting = startElevatedHost(h.api, launcher, HELLO_OPTS).then(
          () => { msg = 'resolved'; },
          (e: unknown) => { msg = (e as Error).message; },
        );
        // 宿主的 ERR{stage}（§6.6-2 token / §6.6-4 spawn / §6.6-9 pipe，索引 K43）
        h.push(encodeFrame(HOST_FRAME.ERR, JSON.stringify({ stage: 'spawn', message: 'spawn boom' })));
        await vi.advanceTimersByTimeAsync(20);
        await starting;
      });
      expect(msg).toMatch(/^PROC: /);
      expect(msg).toContain(t('err.ql.ptySpawn', { exe: LOG_TARGET, err: 'host=spawn' }));
      expect(msg).not.toContain('node.exe');
      expect(msg).not.toContain('spawn boom'); // 宿主的原始 message 不进文案（文案只在词典里）
      expect(h.closed).toEqual([PIPE_HANDLE]);
      expect(closed).toEqual([HOST_HANDLE]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- C2（六个方法里的 write / resize：§6.5 帧表的 WRITE / RESIZE 载荷）----------
  it('write_and_resize_frames_reach_the_host', async () => {
    vi.useFakeTimers();
    try {
      const h = hostPipe();
      const { launcher } = hostLauncherStub();
      await withShell(shellStub().patch, async () => {
        const proc = await handshaked(h, launcher);
        proc.write('dir\r');
        proc.resize(132, 44);
        const frames = decodeFrames(h.written);
        expect(frames.map((f) => f.type)).toEqual([HOST_FRAME.HELLO, HOST_FRAME.WRITE, HOST_FRAME.RESIZE]);
        expect(frames[1].payload).toBe('dir\r'); // 键盘输入原文（§6.5 帧表）
        expect(JSON.parse(frames[2].payload)).toEqual({ cols: 132, rows: 44 });
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

