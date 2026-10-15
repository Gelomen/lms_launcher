// src-main/shell-execute.ts
// 2026-10-13-quick-launch-elevated-exe §6.2-§6.7：快捷启动的「可执行程序」走 ShellExecuteExW。
// 为什么不是 spawn（规格 §2）：child_process.spawn → CreateProcessW，它不做 UAC 提权，
// manifest 为 requireAdministrator 的 exe 直接被拒（ERROR_ELEVATION_REQUIRED → libuv EACCES），
// 而且不会弹 UAC。提权是 Shell（ShellExecuteExW）的能力，所以必须走 Shell。
// Win32 调用全部收在 WinShellApi 后面：真实现用 koffi 惰性绑定，单测注入假实现（§7.1）。
import { spawnSync } from 'node:child_process';
import koffi from 'koffi';
import { t } from './i18n';
// 2026-10-15-quick-launch-exe-path-precheck §6.1：启动前预检只用内置 fs / path（索引 G7，不新增依赖、不碰 koffi）
import { closeSync, lstatSync, openSync } from 'node:fs';
import { delimiter, extname, isAbsolute, resolve as resolvePath } from 'node:path';

/** Win32 接缝：真实现走 koffi；单测注入假实现（规格 §6.2 / §7.1） */
export interface WinShellApi {
  /**
   * ShellExecuteExW。ok=false 时 win32Error = GetLastError()
   * 第三参（2026-10-14-quick-launch-admin §6.4-3 / §6.9）：`verb: 'runas'` = 以管理员权限启动。
   * `null` 必须在类型内（索引 K29）：调用方按布尔传 `admin ? 'runas' : null`；缺省或 null → 取值与今天逐字节相同（索引 G3）。
   */
  shellExecute(file: string, nShow: number, opts?: { verb?: string | null; parameters?: string | null }): { ok: boolean; handle: unknown; win32Error: number };
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
const SEE_MASK_FLAG_NO_UI = 0x00000004;     // 关掉一部分 Shell UI（§8-K4）。**实测不覆盖「文件 / 路径不存在」那类**：fMask 取 0x44 / 0x144 / 0x104 都弹系统错误框，SetErrorMode(0x3) 也压不住（规格 E19）。该位**仍保留**（对其他 Shell UI 有效，例如无文件关联的「打开方式」），但它压不住这一类错误框（§3-E19/P1）—— 2026-10-15 §6.1 已加 isLaunchableExe 预检：不可用的目标不再走到 Shell，原前置规格 §9-R8「接受这个弹窗」已被取代
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
  shellExecute(file, nShow, opts) {
    const b = bind();
    const psei = koffi.alloc(b.SE as never, 1);
    koffi.encode(psei, b.SE as never, {
      cbSize: koffi.sizeof(b.SE as never), // x64 = 112（规格 E13，实测）
      fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
      hwnd: null,
      lpVerb: opts?.verb ?? null,   // 默认动词 open：requireAdministrator 仍按 manifest 提权（E6），asInvoker 不多弹（E8）
                               // 'runas' = 本期的「管理员」开关（2026-10-14 §6.9）；缺省 / null 时取值与今天一字不差（索引 G3）
      lpFile: file,
      lpParameters: opts?.parameters ?? null, // 本期 exe 条目没有参数字段（规格 §5）；只有提权宿主那条路会传（§6.4-3）
      lpDirectory: null,   // 与现状一致：继承本进程工作目录（main.ts:1059 原本也不传 cwd）
      nShow,
      hInstApp: null, lpIDList: null, lpClass: null, hkeyClass: null, dwHotKey: 0, hIcon: null,
      hProcess: null,
    });
    // 走到这里，目标已通过 launchShellExe 的 isLaunchableExe 预检（2026-10-15 §6.1 / §6.2）：
    // 「不存在 / 不是普通 .exe / 不可访问」在调 Shell 之前就被挡下，所以这里不再弹 Shell 的系统错误框、
    // 不再阻塞本线程（前置规格 §9-R8「接受弹窗」已被取代；§3-E19/P1 的弹窗只在旧路径上成立）。
    // 仍不要在这里加第二道预检：预检只有一处（§6.2），提权宿主那条不经这里（§5-1）。
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
 * 候选的可见形状（§6.1 判定① 的两支；解析③ 的「存在」口径也用它）。**不导出。**
 * 必须用 lstatSync：WindowsApps 的 app execution alias 只有 lstat 看得见 —— statSync / openSync /
 * realpathSync 全抛 EACCES（§3-P14 / 索引 K11）。用 statSync 就是把 Shell 今天起得了的
 * mspaint.exe / python.exe / code.exe 判成「不存在」（§3-P13 / RF6，2026-10-15 第一版就是这么错的）。
 * null = 不存在 / 是目录（§3-P6）/ 其它不可启动的形状。
 */
function targetShape(p: string): 'file' | 'reparse' | null {
  try {
    const st = lstatSync(p);
    if (st.isFile()) return 'file';
    // 重解析点：符号链接 / junction / WindowsApps 的 app execution alias（§6.1 判定① 第二支 / §8-Q13）
    if (st.isSymbolicLink()) return 'reparse';
    return null;
  } catch { return null; }
}

/**
 * 解析候选路径（§6.1 解析 ①–④）。**不导出**：调用方只问「能不能启动」，不拿解析结果去替换实参（索引 K1）。
 */
function resolveLaunchTarget(exe: string): string | null {
  if (isAbsolute(exe)) return exe;              // ① 含盘符或 UNC → 原样
  if (/[\\/]/.test(exe)) return resolvePath(exe); // ② 相对路径 → 按主进程 cwd；与 lpDirectory=null（:95）时 Shell 的解析口径一致
  // ③ 裸名：按 PATH 的目录**顺序**查找 —— Shell 今天也这么解析（ipc-ql.test.ts:331 的 notepad.exe 靠它，§3-P10 / RF2），
  //    只按 existsSync(原样) 判定会误杀这一类。无扩展名时同一目录内先试原名再试补 .exe（索引 K2）。
  const dirs = (process.env.PATH ?? '').split(delimiter).filter((d) => d.length > 0);
  const names = extname(exe) === '' ? [exe, exe + '.exe'] : [exe];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = resolvePath(dir, name);
      // 「存在」= lstatSync 看得见（普通文件**或**重解析点）：别名在 PATH 里，普通文件口径找不到它（§6.1 解析③ / P13/P14）
      if (targetShape(candidate) !== null) return candidate;
    }
  }
  return null;                                  // ④ 无候选 → 预检失败
}

/**
 * 启动前预检（2026-10-15-quick-launch-exe-path-precheck §6.1）：目标必须能解析到一个
 * 「存在、是普通文件**或重解析点**、扩展名 .exe，且（普通文件）可读」的路径。
 * 返回 false 时调用方不得调 Shell（§6.4）。
 * 为什么必须有它：Shell 对不可用的目标会弹自己的系统错误框并把主线程卡死（实测 6.1–38.9s，§3-P1/P4），
 * 而且失败类全回 GetLastError=1223 —— 与真 UAC 点「否」撞码，分类没有料（§3-P2/P3/P4/P5）。
 * 只用内置 fs / path，不碰 koffi（索引 G7）。
 */
export function isLaunchableExe(exe: string): boolean {
  const candidate = resolveLaunchTarget(exe);
  if (candidate === null) return false;
  const shape = targetShape(candidate);
  if (shape === null) return false;                                    // 判定①：目录（§3-P6）在这里挡下
  if (extname(candidate).toLowerCase() !== '.exe') return false;       // 判定②：大小写不敏感，.EXE 放行（索引 K2）
  // 判定① 第二支（§8-Q13 / 索引 K11）：重解析点只做②，**跳过③** —— 别名对 openSync 必然 EACCES（§3-P14），
  // 在这里做可访问性判定 = 把「Shell 起得了的别名」判成不可启动（§3-P13 / RF6）。断链别名照旧由 Shell 失败兜（§9-R8）。
  if (shape === 'reparse') return true;
  // 判定③：可访问性只能用 openSync —— libuv 的 access() 在 Windows 上只看 FILE_ATTRIBUTE_READONLY、
  // 不读 ACL，对「icacls /deny <用户>:RX」是假阴性（§3-P12 / 索引 K4）；openSync 报 EPERM 才是真信号（§3-P5）。
  let fd: number;
  try {
    fd = openSync(candidate, 'r');
  } catch {
    return false;
  }
  closeSync(fd);
  return true;
}

/**
 * 生产入口：构造即启动。失败按 §6.5 分类抛 PROC:（前缀只用 PROC:，索引 G7）。
 * 调用方（main.ts 的适配器）负责先写日志通道再抛出。
 * 第三参 verb（2026-10-14-quick-launch-admin §6.9）：'runas' = 管理员权限；null / 缺省 = 今天的默认动词 open。
 */
export function launchShellExe(api: WinShellApi, exe: string, verb?: string | null): ShellExecProcess {
  // 预检门（2026-10-15-quick-launch-exe-path-precheck §6.2）：不可用的目标**不调 Shell** ——
  // 调了会弹 Shell 的系统错误框并把主线程卡死 6.1–38.9s（§3-P1/P4），且失败类全回 1223、与真 UAC 点「否」撞码（§3-P2）。
  // 抛错在 api.shellExecute 之前 = 「不弹系统框、不阻塞」的牙（§7.1-4 / RF1）。放行后交给 Shell 的实参仍是 exe 原样（索引 K1）。
  if (!isLaunchableExe(exe)) {
    throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe }));
  }
  // verb 缺省时不构造 opts 对象：接缝收到的实参与今天逐字节相同（索引 G3 / RF2「不勾选 = 行为不变」；
  // 实测：多一个实参——哪怕是 undefined——都会让既有用例 1 的 toHaveBeenCalledWith(EXE, 1) 红）。
  // 显式 null 走第三参：调用方按布尔传 admin ? 'runas' : null（索引 K29），到真实现仍是 lpVerb = null。
  const r = verb === undefined
    ? api.shellExecute(exe, SW_SHOWNORMAL)
    : api.shellExecute(exe, SW_SHOWNORMAL, { verb });
  if (!r.ok) {
    if (r.win32Error === ERROR_CANCELLED) {
      // 这条路径上 quick-launch.ts:285 的 log.launcher.start.cmd 不会写 → 文案必须带 exe（§8-K2）
      throw new Error('PROC: ' + t('err.proc.uacCancelled', { exe }));
    }
    throw new Error('PROC: ' + t('err.proc.spawnFail', { exe, err: 'win32=' + r.win32Error }));
  }
  return new ShellExecProcess(api, r.handle, api.pidOf(r.handle));
}
