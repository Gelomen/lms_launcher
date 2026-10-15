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
import type { TerminalId } from './quick-launch-config';
import { HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol';
import { ShellExecProcess, winShell, type WinShellApi } from './shell-execute';

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

// ============================================================================
// 第二段（任务 6，§6.7 / §6.5 读侧 / §6.10 最后一行）：ElevatedPtyProcess ——
// 把第一段的「建管道 + 起宿主」接缝（startHost）与任务 2 的帧拼成 ShellProcess 形状（quick-launch.ts:175-182 逐字）。
// 边界（check B1 / F3 / C5③）：不改 ShellProcess 接口本身；宿主进程句柄的生命周期复用 ShellExecProcess
//   （shell-execute.ts:129-190）的 100ms 轮询判退出，不另写一套。
// 文案（check C5② / 索引 K35 / 裁决 R-07）：既有三键的映射只在 hostStartError 里，本段不得再写第二份。
//   本段新增的只有 §6.10 最后一行的 err.ql.ptySpawn：按主代理裁决 R-11，{err} 取 'host=' + 宿主发的 stage
//   （token / spawn / pipe，索引 K43）；握手自身的失败取 'handshake=' + 形状（connect / timeout / broken / exit），
//   与 win32= / hostlink= / pipe=create 同一风格，零新词典键（G2）。{exe} 始终是 opts.logTarget（用户那一行的目标）。
// 工厂 startElevatedHost 是可 await 的（索引 K45 / 裁决 R-12）：构造函数不能 async，所以「等 READY」与
//   「抛出前关掉管道句柄与进程句柄」都放在工厂里；类的六个方法仍与 ShellProcess 逐字一致。
// ============================================================================

const POLL_READ_MS = 20;                  // §6.5：读侧轮询。不用阻塞 ReadFile：那会把主线程卡住（§9-R7）
const HOST_HANDSHAKE_TIMEOUT_MS = 15000;  // §6.7：等 READY 的上限
const CONNECT_POLL_MS = 50;               // §6.5：ConnectNamedPipe 用 50ms 轮询（P10 实测 61ms 连上）

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 帧载荷按「对象或空对象」收：坏 JSON 不炸主进程（§6.5 的解析器只保证字节边界，不保证 JSON 合法） */
function parseObject(payload: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(payload);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 提权宿主的 ShellProcess 形状（规格 §6.7）。构造即启动：建管道 + runas 起宿主（走第一段的 startHost）。
 * 握手（等连接 → 发 HELLO → 等 READY）在 handshake() 里，由 startElevatedHost 工厂 await（索引 K45）。
 */
export class ElevatedPtyProcess {
  private readonly pipe: WinPipeApi;
  private readonly opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string };
  private readonly token: string;
  private readonly feed: (chunk: Buffer) => void;
  private pipeHandle: unknown = null;
  private hostHandle: unknown = null;
  /** READY 之后才建：握手失败时没有轮询在跑，工厂才能安全地自己关进程句柄（不会留一个轮询已关句柄的定时器） */
  private host: ShellExecProcess | null = null;
  private readTimer: NodeJS.Timeout | null = null;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private settleHandshake: ((err: Error | null) => void) | null = null;
  private running = true;
  private stopping = false;
  private exitCode: number | null = null;
  /** EXIT 帧里的 code：优先于句柄的 GetExitCodeProcess（审查重点 RF5 / 规格 §6.7） */
  private exitFrameCode: number | null = null;
  private exitCbs: Array<(code: number) => void> = [];
  private dataCb: ((d: string) => void) | null = null;
  /** READY 与首屏输出可能在同一次读里到达：onData 注册晚于帧到达时不丢首屏（quick-launch.ts:249-253 的注册顺序） */
  private pendingData: string[] = [];

  constructor(pipe: WinPipeApi, launcher: HostLauncher, opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string }) {
    this.pipe = pipe;
    this.opts = opts;
    let started: HostStart;
    try {
      started = startHost(pipe, launcher); // 索引 K40 / C5①：起宿主只走这一条（建管道 + runas + 失败时关两个句柄）
    } catch (e) {
      // hostExePath() 抛的 'hostlink=…' 原样塞进 {err}（§6.10 第三行 / 裁决 R-07）；管道句柄 startHost 已关
      throw new Error('PROC: ' + t('err.proc.spawnFail', { exe: opts.logTarget, err: messageOf(e) }));
    }
    if (!started.ok) {
      // C5②：文案只在 hostStartError 里（索引 K35 / 裁决 R-07），这里不得再写第二份映射
      if (started.stage === 'pipe') {
        // 索引 K37 / 裁决 R-08：这条路径的 win32Error 固定 0，只报阶段（§6.10 第四行）
        throw new Error('PROC: ' + t('err.proc.spawnFail', { exe: opts.logTarget, err: 'pipe=create' }));
      }
      throw hostStartError(started.win32Error, opts.logTarget);
    }
    this.pipeHandle = started.pipeHandle;
    this.hostHandle = started.hostHandle;
    this.token = started.token;
    this.feed = createFrameParser((type: number, payload: string): void => this.onFrame(type, payload));
  }

  /**
   * 内部（索引 K45 / 裁决 R-12）：等连接 → 发 HELLO → 等 READY（§6.7 握手的前三段）。
   * 构造函数不能 async，所以这段等待由 startElevatedHost 工厂 await；失败在这里抛出，两个句柄由工厂关。
   */
  async handshake(): Promise<void> {
    const deadline = Date.now() + HOST_HANDSHAKE_TIMEOUT_MS;
    // §6.5：ConnectNamedPipe 50ms 轮询直到成功或超时（ERROR_PIPE_CONNECTED 535 由 winPipe.connect 判成成功，P10）
    while (!this.pipe.connect(this.pipeHandle)) {
      if (Date.now() >= deadline) throw this.handshakeError('handshake=connect');
      await sleep(CONNECT_POLL_MS);
    }
    // §6.4-4 / §6.5 帧表：终端 id、尺寸、cwd 只在 HELLO 里传（argv 只带管道名与 token）
    this.sendFrame(HOST_FRAME.HELLO, JSON.stringify({
      token: this.token, shell: this.opts.shell, cols: this.opts.cols, rows: this.opts.rows, cwd: this.opts.cwd,
    }));
    const ready = new Promise<void>((resolve, reject) => {
      this.settleHandshake = (err: Error | null): void => {
        this.settleHandshake = null;
        if (err) reject(err);
        else resolve();
      };
    });
    // 读侧：PeekNamedPipe 判可读字节数 → ReadFile 只读那些字节（§6.5 / §9-R7：不阻塞主线程）
    this.readTimer = setInterval(() => this.pollRead(), POLL_READ_MS);
    this.handshakeTimer = setTimeout(() => this.failHandshake('handshake=timeout'), Math.max(0, deadline - Date.now()));
    await ready;
  }

  /**
   * 内部（§6.7「抛出前关掉管道句柄与进程句柄」/ 审查重点 RF4）：握手失败后由工厂调用，此后实例不得再用。
   * 此时没有 ShellExecProcess 在轮询（READY 之后才建），所以进程句柄由这里关，不会二次 CloseHandle。
   * 关管道句柄会让宿主按 §6.6-8 自己走停止路径 → 既不留句柄泄漏，也不留孤儿宿主。
   */
  abortHandshake(): void {
    this.clearReadTimer();
    this.clearHandshakeTimer();
    this.closePipe();
    if (this.hostHandle !== null) {
      winShell.close(this.hostHandle);
      this.hostHandle = null;
    }
  }

  // ---- ShellProcess 的六个方法（quick-launch.ts:175-182 逐字）----

  write(data: string): void {
    this.sendFrame(HOST_FRAME.WRITE, data);
  }

  resize(cols: number, rows: number): void {
    this.sendFrame(HOST_FRAME.RESIZE, JSON.stringify({ cols, rows }));
  }

  onData(cb: (d: string) => void): void {
    this.dataCb = cb;
    if (this.pendingData.length) {
      const buffered = this.pendingData.join('');
      this.pendingData = [];
      cb(buffered);
    }
  }

  onExit(cb: (code: number) => void): void {
    // 已退出则立即补发：注册晚于退出时不补发就永远等不到（quick-launch.ts:108-115 同口径）
    if (!this.running) {
      cb(this.exitCode ?? -1);
      return;
    }
    this.exitCbs.push(cb);
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * 停止（规格 §6.7）：发 STOP → 等 EXIT / 宿主退出（上限 timeoutSecs）→ 仍活则委托 ShellExecProcess.stopGraceful，
   * **委托时传剩余预算**（裁决 R-13 / 索引 K50）。幂等（quick-launch.ts:123 同口径）。
   */
  async stopGraceful(timeoutSecs: number): Promise<void> {
    if (!this.running || this.stopping) return;
    this.stopping = true;
    const startedAt = Date.now();
    // 索引 K44②：STOP 必须带数字 timeoutSecs —— 宿主对缺失/非数取「不给宽限期」，立即升级 taskkill
    this.sendFrame(HOST_FRAME.STOP, JSON.stringify({ timeoutSecs }));
    const deadline = startedAt + Math.max(0, timeoutSecs) * 1000;
    while (this.running && Date.now() < deadline) await sleep(POLL_READ_MS);
    // 索引 K44③ / 审查重点 RF6：宽限期内没等到 EXIT 就必须真的走到委托（taskkill 打宿主 → 失败则 TerminateProcess
    // → 再等 1000ms 让退出落地）。宿主 taskkill 之后 exit 事件可能不落地（quick-launch.test.ts:103），
    // 不委托就会留一个不退出、进程树却已死的宿主。
    if (this.running && this.host) {
      // 裁决 R-13 / 索引 K50（规格 §6.7 已改写）：交出去的是**剩余预算**，不是同一个 timeoutSecs。
      // ShellExecProcess.stopGraceful（shell-execute.ts:178-190）自己还要等一个完整的 timeoutSecs 才
      // TerminateProcess，再等 FORCE_EXIT_WAIT_MS = 1000ms；传同值 → 单实例上限 2×timeoutSecs + 1s，
      // 而 stopAll 是逐个 await（quick-launch.ts:322-333）、main.ts:382 / :648 传 3 → N 个提权终端最坏 N×7s。
      // 传剩余预算后总上限与非提权路径同形（timeoutSecs + 1s）。守它的用例：
      // ql-elevated.test.ts 的 stopGraceful_delegates_after_the_EXIT_frame（check C8 / E6）。
      const remainingSecs = Math.max(0, timeoutSecs - (Date.now() - startedAt) / 1000);
      await this.host.stopGraceful(remainingSecs);
    }
    this.stopping = false;
  }

  // ---- 内部 ----

  private onFrame(type: number, payload: string): void {
    switch (type) {
      case HOST_FRAME.READY: {
        // 索引 K44①：READY 的 shellPid 实测是 0（ConPTY 的 innerPid 要等 agent 连上才赋值，quick-launch.ts:71-73）
        // → 不用它做任何停止或判断，也不为它多写一条日志（§8-K10 / check F2）。
        this.clearHandshakeTimer();
        this.adoptHostHandle();
        const settle = this.settleHandshake;
        this.settleHandshake = null;
        if (settle) settle(null);
        break;
      }
      case HOST_FRAME.DATA: {
        // 索引 K32：payload 是字符串，原样交出去（不转码、不重新拼字节）
        if (this.dataCb) this.dataCb(payload);
        else this.pendingData.push(payload);
        break;
      }
      case HOST_FRAME.EXIT: {
        const code = Number(parseObject(payload).code);
        this.exitFrameCode = Number.isFinite(code) ? code : -1;
        this.finish(this.exitFrameCode);
        break;
      }
      case HOST_FRAME.ERR: {
        // check C7 / 裁决 R-11：握手期的 ERR{stage} → err.ql.ptySpawn + 'host=' + stage（§6.10 最后一行）。
        // 握手已完成后没有等待方可通知：宿主的 ERR 都在退出前发（§6.6-2/4/9），这里不复制第二套退出路径。
        this.failHandshake('host=' + String(parseObject(payload).stage ?? 'unknown'));
        break;
      }
      default:
        break; // 主进程 → 宿主方向的帧不会出现在这条管道上；未知 type 已由任务 2 的解析器丢弃
    }
  }

  /** READY 之后才把进程句柄交给 ShellExecProcess：100ms 轮询判退出（§6.7 / C5③，不另写一套） */
  private adoptHostHandle(): void {
    if (this.host !== null || this.hostHandle === null) return;
    this.host = new ShellExecProcess(winShell, this.hostHandle, winShell.pidOf(this.hostHandle));
    // 退出码优先取 EXIT 帧；宿主没发 EXIT 就死了（崩溃 / 被强杀）→ 回落 GetExitCodeProcess（审查重点 RF5 / 取证 P12）
    this.host.onExit((code: number): void => this.finish(this.exitFrameCode ?? code));
  }

  private pollRead(): void {
    if (!this.running || this.pipeHandle === null) return;
    const available = this.pipe.available(this.pipeHandle);
    // 索引 K39：-1 = PeekNamedPipe 失败 / 断管（ERROR_BROKEN_PIPE 109，§6.5）→ §6.7 的退出路径；
    // 0 = 没有数据：不 read（check E8 / §9-R7 的门）
    if (available < 0) {
      this.onPipeGone();
      return;
    }
    if (available > 0) this.feed(this.pipe.read(this.pipeHandle, available));
  }

  /** 断管：停止轮询。退出由 ShellExecProcess 的句柄轮询落地（C5③：不另写一套）；握手期则让工厂按 §6.10 抛出 */
  private onPipeGone(): void {
    this.clearReadTimer();
    this.failHandshake('handshake=broken');
  }

  /** 退出落地：只一次。停轮询 + 关管道句柄（进程句柄由 ShellExecProcess 关，§6.4 / §9-R6） */
  private finish(code: number): void {
    if (!this.running) return;
    this.running = false;
    this.exitCode = code;
    this.clearReadTimer();
    this.clearHandshakeTimer();
    this.failHandshake('handshake=exit'); // 没发 READY 就来的 EXIT：工厂按 §6.10 最后一行抛出
    this.closePipe();
    const cbs = this.exitCbs.slice();
    this.exitCbs = [];
    for (const cb of cbs) cb(code);
  }

  private sendFrame(type: HostFrameType, payload: string): void {
    if (this.pipeHandle === null || !this.running) return; // 句柄已关 / 已退出：不再往关闭的句柄写
    try {
      this.pipe.write(this.pipeHandle, encodeFrame(type, payload));
    } catch {
      // 管道已断：没有可通知的一方。退出由读侧的断管路径或句柄轮询落地（§6.7）
    }
  }

  private handshakeError(reason: string): Error {
    // §6.10 最后一行：宿主起来了但握手失败（ERR 帧 / 管道断 / 超时）→ err.ql.ptySpawn；
    // {exe} 仍是用户那一行的目标（check C7 / 裁决 R-11），不是宿主 exe
    return new Error('PROC: ' + t('err.ql.ptySpawn', { exe: this.opts.logTarget, err: reason }));
  }

  private failHandshake(reason: string): void {
    const settle = this.settleHandshake;
    this.settleHandshake = null;
    if (settle) settle(this.handshakeError(reason));
  }

  private clearReadTimer(): void {
    if (this.readTimer) clearInterval(this.readTimer);
    this.readTimer = null;
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  private closePipe(): void {
    if (this.pipeHandle === null) return;
    this.pipe.close(this.pipeHandle);
    this.pipeHandle = null;
  }
}

/**
 * 起一个提权 PTY 宿主，返回 ShellProcess 形状（规格 §6.7 / §6.8）。
 * 可 await 的工厂（索引 K45 / 裁决 R-12）：plan 任务 7 步骤 4 逐字
 * 「spawnElevatedShell: (shell, cols, rows, cwd) => startElevatedHost(...)」，规格 §6.8 把它定成
 * Promise<ShellProcess>。构造函数不能 async，所以「等 READY」与「失败按 §6.10 抛出、抛出前关掉管道句柄与
 * 进程句柄」都在这里；构造期（建管道 / 起宿主）的失败由 startHost 自己关句柄，见第一段 :341 起。
 * 形参不越出 { shell, cols, rows, cwd, logTarget }。
 */
export async function startElevatedHost(
  pipe: WinPipeApi,
  launcher: HostLauncher,
  opts: { shell: TerminalId; cols: number; rows: number; cwd: string; logTarget: string },
): Promise<ElevatedPtyProcess> {
  const proc = new ElevatedPtyProcess(pipe, launcher, opts);
  try {
    await proc.handshake();
  } catch (err) {
    proc.abortHandshake();
    throw err;
  }
  return proc;
}

