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
import type { WinShellApi } from './shell-execute';
import {
  createHostLauncher,
  hostStartError,
  newPipeName,
  pipeKernel,
  resolveHostLink,
  startHost,
  winPipe,
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
