// src-main/shell-execute.ts
// 2026-10-13-quick-launch-elevated-exe §6.2-§6.7：快捷启动的「可执行程序」走 ShellExecuteExW。
// 为什么不是 spawn（规格 §2）：child_process.spawn → CreateProcessW，它不做 UAC 提权，
// manifest 为 requireAdministrator 的 exe 直接被拒（ERROR_ELEVATION_REQUIRED → libuv EACCES），
// 而且不会弹 UAC。提权是 Shell（ShellExecuteExW）的能力，所以必须走 Shell。
// Win32 调用全部收在 WinShellApi 后面：真实现用 koffi 惰性绑定，单测注入假实现（§7.1）。
import { spawnSync } from 'node:child_process';
import koffi from 'koffi';
import { t } from './i18n';

/** Win32 接缝：真实现走 koffi；单测注入假实现（规格 §6.2 / §7.1） */
export interface WinShellApi {
  /** ShellExecuteExW。ok=false 时 win32Error = GetLastError() */
  shellExecute(file: string, nShow: number): { ok: boolean; handle: unknown; win32Error: number };
  pidOf(handle: unknown): number;            // GetProcessId
  isAlive(handle: unknown): boolean;         // WaitForSingleObject(h, 0) === WAIT_TIMEOUT(258)（规格 §8-K3 / E11）
  exitCodeOf(handle: unknown): number;       // GetExitCodeProcess
  terminate(handle: unknown, code: number): boolean;
  close(handle: unknown): void;
  /** taskkill /T /F。非提权进程可用；提权进程返回 false（规格 E9） */
  killTree(pid: number): boolean;
}

// 取值逐字见规格 §6.3（E6/E8/E10/E13 实测）
const SEE_MASK_NOCLOSEPROCESS = 0x00000040; // 不这一位就没有 hProcess（E6）
const SEE_MASK_FLAG_NO_UI = 0x00000004;     // 关掉一部分 Shell UI（§8-K4）。**实测不覆盖「文件 / 路径不存在」那类**：fMask 取 0x44 / 0x144 / 0x104 都弹系统错误框，SetErrorMode(0x3) 也压不住（规格 E19）。本次接受这个弹窗，不加 existsSync 预检（规格 §9-R8，用户 2026-10-13 21:47 决定）
const SW_SHOWNORMAL = 1;                    // §8-Q11
const WAIT_TIMEOUT = 258;                   // 判存活只看它；不用 STILL_ACTIVE=259 比对（§8-K3）
const ERROR_CANCELLED = 1223;               // 用户在 UAC 点「否 / 取消」（§6.5）
const POLL_MS = 100;                        // 与 process.ts:82、quick-launch.ts:29 同口径
const FORCE_EXIT_WAIT_MS = 1000;            // 与 quick-launch.ts:32 同口径

interface Bindings {
  SE: unknown;
  ShellExecuteExW: (psei: unknown) => boolean;
  GetProcessId: (h: unknown) => number;
  WaitForSingleObject: (h: unknown, ms: number) => number;
  GetExitCodeProcess: (h: unknown, pCode: unknown) => boolean;
  TerminateProcess: (h: unknown, code: number) => boolean;
  CloseHandle: (h: unknown) => boolean;
  GetLastError: () => number;
}

let cached: Bindings | null = null;

// 惰性绑定：测试替换 winShell 的属性时不必碰 koffi（规格 §6.2 / plan 步骤 3）
function bind(): Bindings {
  if (cached) return cached;
  // 声明写法照搬实测可用的探针（.temp/uac-probe/ffi-probe4.mjs）：
  // 结构体必须先 koffi.struct(...) 命名，函数签名里用它的指针类型；把 'struct' 当类型名会报
  // Unknown or invalid type name 'struct'（规格 E13）
  const SE = koffi.struct('SHELLEXECUTEINFOW', {
    cbSize: 'uint32', fMask: 'uint32', hwnd: 'void *', lpVerb: 'str16', lpFile: 'str16',
    lpParameters: 'str16', lpDirectory: 'str16', nShow: 'int', hInstApp: 'void *',
    lpIDList: 'void *', lpClass: 'str16', hkeyClass: 'void *', dwHotKey: 'uint32',
    hIcon: 'void *', hProcess: 'void *',
  });
  const shell32 = koffi.load('shell32.dll');
  const k32 = koffi.load('kernel32.dll');
  cached = {
    SE,
    ShellExecuteExW: shell32.func('bool ShellExecuteExW(SHELLEXECUTEINFOW *psei)'),
    GetProcessId: k32.func('uint32 GetProcessId(void *hProcess)'),
    WaitForSingleObject: k32.func('uint32 WaitForSingleObject(void *hHandle, uint32 dwMilliseconds)'),
    GetExitCodeProcess: k32.func('bool GetExitCodeProcess(void *hProcess, void *lpExitCode)'),
    TerminateProcess: k32.func('bool TerminateProcess(void *hProcess, uint32 uExitCode)'),
    CloseHandle: k32.func('bool CloseHandle(void *hObject)'),
    GetLastError: k32.func('uint32 GetLastError()'),
  };
  return cached;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 真实现。导出为普通对象（不是 class、不是冻结对象）：ESM 的导出绑定不可写，属性可写 →
 * 单测可以逐属性替换（规格 §6.2）。
 */
export const winShell: WinShellApi = {
  shellExecute(file, nShow) {
    const b = bind();
    const psei = koffi.alloc(b.SE as never, 1);
    koffi.encode(psei, b.SE as never, {
      cbSize: koffi.sizeof(b.SE as never), // x64 = 112（规格 E13，实测）
      fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
      hwnd: null,
      lpVerb: null,        // 默认动词 open：requireAdministrator 仍按 manifest 提权（E6），asInvoker 不多弹（E8）
      lpFile: file,
      lpParameters: null,  // 本期无参数字段（规格 §5）
      lpDirectory: null,   // 与现状一致：继承本进程工作目录（main.ts:1059 原本也不传 cwd）
      nShow,
      hInstApp: null, lpIDList: null, lpClass: null, hkeyClass: null, dwHotKey: 0, hIcon: null,
      hProcess: null,
    });
    // 注意：目标不存在时 Shell 会弹自己的系统错误框并阻塞本线程（规格 E19 / §9-R8，本次接受），
    // 我们的 PROC: 日志要等用户点「确定」才出现。不要「顺手」加 existsSync 预检去绕开它。
    const ok = b.ShellExecuteExW(psei);
    // GetLastError 必须紧跟其后取，中间不插别的 Win32 调用（plan 步骤 3）
    const win32Error = ok ? 0 : b.GetLastError();
    const h = ok ? koffi.decode(psei, b.SE as never).hProcess : null;
    return { ok: Boolean(ok), handle: h ?? null, win32Error };
  },
  pidOf(handle) { return bind().GetProcessId(handle); },
  isAlive(handle) { return bind().WaitForSingleObject(handle, 0) === WAIT_TIMEOUT; },
  exitCodeOf(handle) {
    const b = bind();
    const buf = koffi.alloc('uint32', 1);
    if (!b.GetExitCodeProcess(handle, buf)) return 0;
    return koffi.decode(buf, 'uint32') as number;
  },
  terminate(handle, code) { return Boolean(bind().TerminateProcess(handle, code)); },
  close(handle) { return Boolean(bind().CloseHandle(handle)); },
  killTree(pid) {
    // 中文 Windows 下 taskkill 的输出是 UTF-16LE（utf16le 先例见 quick-launch-terminals.ts:96，索引 K12）
    const r = spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, encoding: 'utf16le' });
    return r.status === 0;
  },
};

/**
 * 生命周期包装。形状 = QlDeps.spawnExe 的返回类型（quick-launch.ts:171）+ pid。
 * 构造即启动：调用返回时进程已起（与 ProcessState.launch 同口径），失败由 launchShellExe 抛出。
 */
export class ShellExecProcess {
  readonly pid: number;
  private readonly api: WinShellApi;
  private readonly handle: unknown;
  private onExitCb: ((code: number) => void) | null = null;
  private exited = false;
  private exitCode: number | null = null;
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(api: WinShellApi, handle: unknown, pid: number) {
    this.api = api;
    this.handle = handle;
    this.pid = pid;
    // 100ms 轮询判退出（规格 §6.4）。没有 Shell 的异步退出事件可用，只能轮询句柄
    this.timer = setInterval(() => this.pollOnce(), POLL_MS);
  }

  private pollOnce(): void {
    if (this.exited) return;
    if (!this.api.isAlive(this.handle)) this.finish();
  }

  /** 退出落地：只一次；清定时器 + 关句柄（规格 §6.4 / §9-R6） */
  private finish(): void {
    if (this.exited) return;
    this.exited = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.exitCode = this.api.exitCodeOf(this.handle);
    this.api.close(this.handle);
    if (this.onExitCb) this.onExitCb(this.exitCode);
  }

  onExit(cb: (code: number) => void): void {
    this.onExitCb = cb;
    // 注册时已退出 → 立即补发（与 quick-launch.ts:109-115 的 PtyProcess.onExit 同口径，否则状态卡住）
    if (this.exited && this.exitCode !== null) cb(this.exitCode);
  }

  isRunning(): boolean { return !this.exited; }

  drainExit(): number | null { return this.exitCode; }

  /**
   * 停止（规格 §6.7 五步）：taskkill /T /F → 每 100ms 轮询到 timeoutSecs → 仍活则 TerminateProcess(句柄,1)
   * → 再等 1000ms 让退出落地 → 幂等（先例 process.ts:74）。
   * 提权进程第 1 步必然失败（E9）、第 3 步成功；非提权进程第 1 步就杀掉整棵树。
   */
  async stopGraceful(timeoutSecs: number): Promise<void> {
    if (this.exited || this.stopping) return;
    this.stopping = true;
    this.api.killTree(this.pid);
    const deadline = Date.now() + Math.max(0, timeoutSecs) * 1000;
    while (!this.exited && Date.now() < deadline) await sleep(POLL_MS);
    // 「仍存活」必须主动问句柄（规格 §6.7 第 3 步）：timeoutSecs=0 时上面的轮询一次都没跑，
    // 只看 this.exited 会对已经消失的进程多调一次 terminate（索引 K18 / 单测第 6 条）
    if (!this.exited && this.api.isAlive(this.handle)) this.api.terminate(this.handle, 1);
    const until = Date.now() + FORCE_EXIT_WAIT_MS;
    while (!this.exited && Date.now() < until) await sleep(POLL_MS);
  }
}

/**
 * 生产入口：构造即启动。失败按 §6.5 分类抛 PROC:（前缀只用 PROC:，索引 G7）。
 * 调用方（main.ts 的适配器）负责先写日志通道再抛出。
 */
export function launchShellExe(api: WinShellApi, exe: string): ShellExecProcess {
  const r = api.shellExecute(exe, SW_SHOWNORMAL);
  if (!r.ok) {
    if (r.win32Error === ERROR_CANCELLED) {
      // 这条路径上 quick-launch.ts:285 的 log.launcher.start.cmd 不会写 → 文案必须带 exe（§8-K2）
      throw new Error('PROC: ' + t('err.proc.uacCancelled', { exe }));
    }
    throw new Error('PROC: ' + t('err.proc.spawnFail', { exe, err: 'win32=' + r.win32Error }));
  }
  return new ShellExecProcess(api, r.handle, api.pidOf(r.handle));
}
