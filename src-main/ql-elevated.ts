// src-main/ql-elevated.ts
// 任务 4（2026-10-14-quick-launch-admin §6.4 / §6.5 / §6.7）：提权 PTY 宿主的「命名管道服务端 + 起宿主」接缝。
// 第二段 ElevatedPtyProcess 在任务 6（check B1 的边界），本文件不含它。
// 手法照抄 src-main/shell-execute.ts：真实现 = koffi 惰性绑定 + 导出普通对象（属性可写）→ 单测逐属性替换假实现（规格 §6.2 / §7.1）。
// 本模块不含 i18n 文案：launch() / startHost() 只把 win32Error 原样交出去；§6.10 前两行的文案集中在
// hostStartError() 这一个映射器里（主代理裁决 R-07 / 索引 K35），任务 6 用 opts.logTarget 作 userTarget 调它。
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import koffi from 'koffi';
import { t } from './i18n';
import { winShell, type WinShellApi } from './shell-execute';

// ---- 取值逐字见规格 §6.5（取证 P10 / P12：不给 SD，提权客户端连不上）----
const PIPE_SDDL = 'D:(A;;GA;;;WD)';        // 必须显式 SD：默认 DACL 下提权客户端连不上（P10/P12）
const SDDL_REVISION_1 = 1;                // ConvertStringSecurityDescriptorToSecurityDescriptorW 的 Revision
const PIPE_ACCESS_DUPLEX = 0x00000003;    // dwOpenMode
const PIPE_MODE_BYTE = 0;                 // dwPipeMode = 0（§6.5 逐字，不设 PIPE_TYPE_MESSAGE 等位）
const PIPE_MAX_INSTANCES = 1;             // 每实例一条私有管道（§9-R8：并发条目各一条）
const PIPE_BUFFER_BYTES = 65536;          // 64KiB × 2
const PIPE_DEFAULT_TIMEOUT_MS = 0;
const ERROR_PIPE_CONNECTED = 535;         // 客户端先连上：ConnectNamedPipe 返回 false 但算成功（P10 实测 61ms）
const INVALID_HANDLE_VALUE = 0xFFFFFFFFFFFFFFFFn; // CreateNamedPipeW 失败（koffi 交回 BigInt）
const SW_HIDE = 0;                        // §6.4-3：宿主不带窗口
const ERROR_CANCELLED = 1223;             // 用户在 UAC 点「否 / 取消」（§6.10 第一行）
const PIPE_NAME_PREFIX = '\\\\.\\pipe\\lms-ql-';
const PIPE_NAME_RANDOM_BYTES = 4;         // 4 字节 → 8 位十六进制（§6.5「<8 位随机>」）
const TOKEN_RANDOM_BYTES = 12;            // 一次性 token（§6.4-4：argv 只带管道名与 token，其余走 HELLO 帧）
const HOST_EXE_NAME = 'node.exe';         // §6.4-1：与 electron.exe 同目录的硬链接（索引 K20：换目录 = 0xC0000135）
const HOST_SCRIPT_NAME = 'ql-pty-host.js'; // §6.4-2：dev = dist-main/，打包 = app.asar/dist-main/（索引 K21 / P9）

/** Win32 管道接缝：真实现走 koffi；单测注入假实现（规格 §7.1「假 Win32 管道接缝」） */
export interface WinPipeApi {
  createServer(pipeName: string): unknown;              // CreateNamedPipeW + SDDL（§6.5）
  connect(h: unknown): boolean;                        // ConnectNamedPipe，535 也算成功
  available(h: unknown): number;                       // PeekNamedPipe
  read(h: unknown, n: number): Buffer;                 // ReadFile
  write(h: unknown, buf: Buffer): boolean;             // WriteFile
  close(h: unknown): void;
}

/** 起提权宿主的接缝（规格 §6.4：硬链接 node.exe + runas + 三个带引号的参数） */
export interface HostLauncher {
  hostExePath(): string;                               // 硬链接 node.exe 的解析（§6.4-1）
  hostScriptPath(): string;                            // path.join(__dirname, 'ql-pty-host.js')
  launch(exe: string, script: string, pipeName: string, token: string): { ok: boolean; handle: unknown; win32Error: number };
}

/**
 * 真实现下面的 koffi 层：把「Win32 的原始形状」收在一层，好让 §6.5 的取值（SDDL 串、dwOpenMode、
 * nMaxInstances、缓冲、超时）能在不碰 koffi、不建真管道的单测里被逐字钉住（check E1 / C3）。
 * 导出为普通对象、属性可写 → 单测逐属性替换（同 shell-execute.ts:79-83 的手法）。
 */
export interface PipeKernel {
  /** ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1)。失败 → null */
  securityDescriptor(sddl: string): unknown;
  /** CreateNamedPipeW。失败（INVALID_HANDLE_VALUE）→ null */
  createNamedPipe(pipeName: string, openMode: number, pipeMode: number, maxInstances: number,
    outBufferSize: number, inBufferSize: number, defaultTimeout: number, sd: unknown): unknown;
  /** ConnectNamedPipe 的原始结果：535 由上层判（C1） */
  connectNamedPipe(h: unknown): { ok: boolean; win32Error: number };
  /** PeekNamedPipe：available = 可读字节数 */
  peekAvailable(h: unknown): { ok: boolean; available: number; win32Error: number };
  /** ReadFile：data = 实际读到的字节 */
  readFile(h: unknown, n: number): { ok: boolean; data: Buffer; win32Error: number };
  /** WriteFile（缓冲区形参声明 uint8 * 传 Buffer，索引 K18 / F2） */
  writeFile(h: unknown, buf: Buffer): { ok: boolean; win32Error: number };
  closeHandle(h: unknown): boolean;
  /** LocalFree：释放 ConvertStringSecurityDescriptor... 交回的 SD（每条管道一次，不留泄漏） */
  freeDescriptor(sd: unknown): boolean;
  lastError(): number;
}

/** 宿主路径的可替换来源（单测在临时目录真跑硬链接解析；生产侧不传，按 process.execPath） */
export interface HostPaths {
  execPath?: string;
  hostDir?: string;
}

/** 起宿主第一步的结果（§6.7 的前半段：建管道 → runas 起宿主）。失败时两个句柄都已关闭（RF4） */
export interface HostStart {
  ok: boolean;
  /** 失败在哪一步：'pipe' = 管道服务端没建起来；'launch' = ShellExecuteEx 失败。成功时 null */
  stage: 'pipe' | 'launch' | null;
  /** stage='launch' 时是 ShellExecuteEx 的 GetLastError，原样交出去（R-07：文案只在 hostStartError 里） */
  win32Error: number;
  pipeName: string;
  token: string;
  /** 失败时这两个已关闭，调用方不得再用（§6.7「抛出前关掉管道句柄与进程句柄」） */
  pipeHandle: unknown;
  hostHandle: unknown;
}

/** 每实例一条私有管道：\\.\pipe\lms-ql-<8 位随机>（规格 §6.5） */
export function newPipeName(): string {
  return PIPE_NAME_PREFIX + randomBytes(PIPE_NAME_RANDOM_BYTES).toString('hex');
}

/**
 * §6.10 前两行的文案映射器（主代理裁决 R-07 / 索引 K35）：1223 = 用户点「否 / 取消」→ err.proc.uacCancelled，
 * 其它 → err.proc.spawnFail + win32=<code>。userTarget = **用户那一行的目标**（命令行类型取
 * shellExe(shell).exe，可执行程序类型取 exe 路径），绝不传宿主 exe（§6.10 / §7.2-4）。
 * 零新词典键（G2）。任务 6 的 ElevatedPtyProcess 用 opts.logTarget 调它，不得再写一份映射。
 */
export function hostStartError(win32Error: number, userTarget: string): Error {
  if (win32Error === ERROR_CANCELLED) {
    return new Error('PROC: ' + t('err.proc.uacCancelled', { exe: userTarget }));
  }
  return new Error('PROC: ' + t('err.proc.spawnFail', { exe: userTarget, err: 'win32=' + win32Error }));
}

/** errno / 判定名：§6.10 第三行的 {err} = 'hostlink=' + 这个串 */
function errnoOf(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' && code ? code : String(err);
}

/**
 * 宿主可执行文件 = 与 process.execPath 同目录的 node.exe，由 fs.linkSync 建的硬链接（0 额外空间，§6.4-1）。
 * - 已存在同名文件：只有 size 与 srcExe 相同才认（同一条硬链接的必然表现）；不同 = 用户自己放的 node.exe
 *   → 明确报错，不覆盖、不删除别人的文件（§6.4-1 / §9-R5）。
 * - linkSync 失败（非 NTFS / 目录只读 / 目录不存在）→ 抛 'hostlink=<errno>'，由调用方按 §6.10 第三行报出。
 * 抛出的 message 就是 §6.10 的 {err}（'hostlink=...'），本模块不带文案（B1 边界）。
 */
export function resolveHostLink(srcExe: string, dir: string): string {
  const link = path.join(dir, HOST_EXE_NAME);
  let existing: fs.Stats | null = null;
  try {
    existing = fs.statSync(link);
  } catch (e) {
    if (errnoOf(e) !== 'ENOENT') throw new Error('hostlink=' + errnoOf(e));
  }
  if (existing) {
    let srcSize: number;
    try {
      srcSize = fs.statSync(srcExe).size;
    } catch (e) {
      throw new Error('hostlink=' + errnoOf(e));
    }
    if (existing.size !== srcSize) throw new Error('hostlink=size-mismatch');
    return link;
  }
  try {
    fs.linkSync(srcExe, link);
  } catch (e) {
    throw new Error('hostlink=' + errnoOf(e));
  }
  return link;
}

/**
 * 真 HostLauncher（§6.4）。起宿主**直接**调 winShell.shellExecute(file, 0, {verb,parameters})，
 * 不借道 launchShellExe —— 它的边界是 exe 类型，且既有用例按 toHaveBeenCalledWith(EXE, 1) 钉 arity（索引 K34）。
 */
export function createHostLauncher(shell: WinShellApi, paths?: HostPaths): HostLauncher {
  const execPath = () => paths?.execPath ?? process.execPath;
  const hostDir = () => paths?.hostDir ?? path.dirname(process.execPath);
  return {
    hostExePath() {
      return resolveHostLink(execPath(), hostDir());
    },
    hostScriptPath() {
      return path.join(__dirname, HOST_SCRIPT_NAME);
    },
    launch(exe, script, pipeName, token) {
      // 三个参数都加引号：脚本路径可能含空格（§6.4-3）。其余取值由 shell-execute 的真实现保证不变
      const parameters = '"' + script + '" "' + pipeName + '" "' + token + '"';
      const r = shell.shellExecute(exe, SW_HIDE, { verb: 'runas', parameters });
      // 失败也要把 Shell 交回的进程句柄关掉（§6.7「不留泄漏」/ RF4）：真实现失败时通常是 null，这里防御性处理
      if (!r.ok && r.handle !== null && r.handle !== undefined) shell.close(r.handle);
      return r;
    },
  };
}

/** 生产侧的起宿主接缝（与 winShell 同一手法：普通对象，接线时按 WinShellApi 注入） */
export const hostLauncher: HostLauncher = createHostLauncher(winShell);

interface PipeBindings {
  SA: unknown;
  CreateNamedPipeW: (name: string, openMode: number, pipeMode: number, maxInstances: number,
    outBuf: number, inBuf: number, timeout: number, sa: unknown) => unknown;
  ConvertSDDL: (sddl: string, revision: number, ppSD: unknown, pcb: unknown) => boolean;
  ConnectNamedPipe: (h: unknown, overlapped: unknown) => boolean;
  PeekNamedPipe: (h: unknown, buf: unknown, size: number, pRead: unknown, pTotalAvailable: unknown, pMessagesLeft: unknown) => boolean;
  ReadFile: (h: unknown, buf: unknown, size: number, pRead: unknown, overlapped: unknown) => boolean;
  WriteFile: (h: unknown, buf: Buffer, size: number, pWritten: unknown, overlapped: unknown) => boolean;
  CloseHandle: (h: unknown) => boolean;
  LocalFree: (p: unknown) => unknown;
  GetLastError: () => number;
}

let cached: PipeBindings | null = null;

// 惰性绑定：测试替换 pipeKernel 的属性时不必碰 koffi（同 shell-execute.ts:50-75）
function bind(): PipeBindings {
  if (cached) return cached;
  // F1（前置规格 E13 的教训，shell-execute.ts:53-55 同一条）：结构体必须先 koffi.struct(...) 命名，
  // 函数签名里用它的指针类型；把 'struct' 当类型名会报 Unknown or invalid type name。名字与 shell-execute 的不同，
  // 两个模块可以在同一进程里各自绑定。
  const SA = koffi.struct('QL_PIPE_SECURITY_ATTRIBUTES', {
    nLength: 'uint32', lpSecurityDescriptor: 'void *', bInheritHandle: 'int32',
  });
  const k32 = koffi.load('kernel32.dll');
  const adv32 = koffi.load('advapi32.dll');
  cached = {
    SA,
    CreateNamedPipeW: k32.func('void *CreateNamedPipeW(str16, uint32, uint32, uint32, uint32, uint32, uint32, QL_PIPE_SECURITY_ATTRIBUTES *pSA)'),
    ConvertSDDL: adv32.func('bool ConvertStringSecurityDescriptorToSecurityDescriptorW(str16, uint32, void **ppSD, void **pStringLengthUsed)'),
    ConnectNamedPipe: k32.func('bool ConnectNamedPipe(void *hPipe, void *lpOverlapped)'),
    PeekNamedPipe: k32.func('bool PeekNamedPipe(void *hPipe, void *lpBuffer, uint32 nBufferSize, void *lpBytesRead, uint32 *lpTotalAvailable, void *lpMessagesLeft)'),
    ReadFile: k32.func('bool ReadFile(void *hFile, void *lpBuffer, uint32 nBytesToRead, uint32 *lpBytesRead, void *lpOverlapped)'),
    // F2（索引 K18 / 规格 §6.5 的 lastErr=998 教训）：缓冲区形参声明成 uint8 * 并直接传 Buffer
    WriteFile: k32.func('bool WriteFile(void *hFile, uint8 *lpBuffer, uint32 nBytesToWrite, uint32 *lpBytesWritten, void *lpOverlapped)'),
    CloseHandle: k32.func('bool CloseHandle(void *hObject)'),
    LocalFree: k32.func('void *LocalFree(void *hMem)'),
    GetLastError: k32.func('uint32 GetLastError()'),
  };
  return cached;
}

/**
 * INVALID_HANDLE_VALUE 的判定。koffi 把 void * 交回 BigInt：失败时是 0xFFFFFFFFFFFFFFFFn，
 * 成功时是小整数 BigInt（探针 .temp/ql-admin-probe/probe16.mjs 实测：失败 handle 18446744073709551615n lastErr 2，
 * 成功 handle 516n lastErr 0）。只判 null 会把失败句柄当有效句柄交出去。
 */
function invalidHandle(h: unknown): boolean {
  if (h === null || h === undefined) return true;
  if (typeof h === "bigint") return h === INVALID_HANDLE_VALUE;
  if (typeof h === "number") return h === -1 || h === 0xFFFFFFFF;
  return false;
}

/** 真 koffi 层（取值与探针 .temp/ql-admin-probe/probe9.mjs:12-19 一致，那条路 P10 实测跑通过） */
export const pipeKernel: PipeKernel = {
  securityDescriptor(sddl) {
    const b = bind();
    const ppSD = koffi.alloc('void *', 1);
    const pcb = koffi.alloc('uint32', 1);
    if (!b.ConvertSDDL(sddl, SDDL_REVISION_1, ppSD, pcb)) return null;
    return koffi.decode(ppSD, 'void *');
  },
  createNamedPipe(pipeName, openMode, pipeMode, maxInstances, outBufferSize, inBufferSize, defaultTimeout, sd) {
    const b = bind();
    const pSA = koffi.alloc(b.SA as never, 1);
    // bInheritHandle = 0（§6.5）；nLength = sizeof(SECURITY_ATTRIBUTES)，x64 = 24（前置规格 E13）
    koffi.encode(pSA, b.SA as never, {
      nLength: koffi.sizeof(b.SA as never), lpSecurityDescriptor: sd ?? null, bInheritHandle: 0,
    });
    const h = b.CreateNamedPipeW(pipeName, openMode, pipeMode, maxInstances, outBufferSize, inBufferSize, defaultTimeout, pSA);
    return invalidHandle(h) ? null : h;
  },
  connectNamedPipe(h) {
    const b = bind();
    const ok = b.ConnectNamedPipe(h, null);
    return { ok: Boolean(ok), win32Error: ok ? 0 : b.GetLastError() };
  },
  peekAvailable(h) {
    const b = bind();
    const avail = koffi.alloc('uint32', 1);
    const ok = b.PeekNamedPipe(h, null, 0, null, avail, null);
    if (!ok) return { ok: false, available: 0, win32Error: b.GetLastError() };
    return { ok: true, available: koffi.decode(avail, 'uint32') as number, win32Error: 0 };
  },
  readFile(h, n) {
    const b = bind();
    const buf = koffi.alloc('uint8', n);
    const pRead = koffi.alloc('uint32', 1);
    const ok = b.ReadFile(h, buf, n, pRead, null);
    const got = koffi.decode(pRead, 'uint32') as number;
    const data = Buffer.from(koffi.decode(buf, 'uint8', got));
    if (!ok) return { ok: false, data, win32Error: b.GetLastError() };
    return { ok: true, data, win32Error: 0 };
  },
  writeFile(h, buf) {
    const b = bind();
    const pWritten = koffi.alloc('uint32', 1);
    const ok = b.WriteFile(h, buf, buf.length, pWritten, null);
    return { ok: Boolean(ok), win32Error: ok ? 0 : b.GetLastError() };
  },
  closeHandle(h) {
    if (h === null || h === undefined) return false;
    return Boolean(bind().CloseHandle(h));
  },
  freeDescriptor(sd) {
    if (sd === null || sd === undefined) return false;
    return bind().LocalFree(sd) === null;
  },
  lastError() {
    return bind().GetLastError();
  },
};

/**
 * 真 WinPipeApi：把 §6.5 的取值固定在这里，Win32 的原始形状在 pipeKernel 那一层。
 * 语义（任务 6 的读循环按这个契约写）：
 *  - connect()：535（ERROR_PIPE_CONNECTED）也算成功（P10）；
 *  - available()：-1 = PeekNamedPipe 失败（含 ERROR_BROKEN_PIPE 109 = 断管，§6.5 的退出路径）；>=0 = 可读字节数；
 *  - read()：只读已判可读的 n 字节（不阻塞主线程，§6.5 / §9-R7）；失败交空 Buffer；
 *  - write()：直接写（R4：缓冲满会阻塞主线程，本期接受）。
 */
export const winPipe: WinPipeApi = {
  createServer(pipeName) {
    const sd = pipeKernel.securityDescriptor(PIPE_SDDL);
    if (sd === null || sd === undefined) return null; // 没有 SD 的管道在提权客户端面前连不上（P10），不如不建
    const h = pipeKernel.createNamedPipe(pipeName, PIPE_ACCESS_DUPLEX, PIPE_MODE_BYTE, PIPE_MAX_INSTANCES,
      PIPE_BUFFER_BYTES, PIPE_BUFFER_BYTES, PIPE_DEFAULT_TIMEOUT_MS, sd);
    pipeKernel.freeDescriptor(sd); // SD 只在 CreateNamedPipeW 里用一次，之后释放（不留泄漏）
    return h;
  },
  connect(h) {
    const r = pipeKernel.connectNamedPipe(h);
    return r.ok || r.win32Error === ERROR_PIPE_CONNECTED;
  },
  available(h) {
    const r = pipeKernel.peekAvailable(h);
    return r.ok ? r.available : -1;
  },
  read(h, n) {
    if (n <= 0) return Buffer.alloc(0);
    const r = pipeKernel.readFile(h, n);
    return r.data;
  },
  write(h, buf) {
    return pipeKernel.writeFile(h, buf).ok;
  },
  close(h) {
    pipeKernel.closeHandle(h);
  },
};

/**
 * 起宿主的第一步（§6.7 的前半段）：新管道名 → 建管道服务端 → runas 起宿主。
 * 失败路径不留句柄（§6.7 / RF4）：管道句柄在这里关，进程句柄由 HostLauncher.launch 关。
 * 等连接 / HELLO / READY 在任务 6 的 ElevatedPtyProcess 里做（HOST_HANDSHAKE_TIMEOUT_MS）。
 * 注意：CreateNamedPipeW 的 Win32 码不经 C1 的接缝（createServer 只交句柄或 null），
 * 所以 stage='pipe' 时 win32Error 固定 0 —— 规格 §6.10 没有这一行的分类，见任务 4 报告疑虑 3。
 */
export function startHost(pipe: WinPipeApi, launcher: HostLauncher): HostStart {
  const pipeName = newPipeName();
  const token = randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
  const pipeHandle = pipe.createServer(pipeName);
  if (pipeHandle === null || pipeHandle === undefined) {
    return { ok: false, stage: 'pipe', win32Error: 0, pipeName, token, pipeHandle: null, hostHandle: null };
  }
  let exe: string;
  let script: string;
  try {
    exe = launcher.hostExePath();
    script = launcher.hostScriptPath();
  } catch (e) {
    pipe.close(pipeHandle); // 路径解析失败也不留管道句柄（§6.10 第三行的 hostlink= 原样向上交）
    throw e;
  }
  const r = launcher.launch(exe, script, pipeName, token);
  if (!r.ok) {
    pipe.close(pipeHandle);
    return { ok: false, stage: 'launch', win32Error: r.win32Error, pipeName, token, pipeHandle: null, hostHandle: null };
  }
  return { ok: true, stage: null, win32Error: 0, pipeName, token, pipeHandle, hostHandle: r.handle };
}
