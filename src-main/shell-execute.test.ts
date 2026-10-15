// src-main/shell-execute.test.ts
// 2026-10-13-quick-launch-elevated-exe §7.1：生命周期用**假 WinShellApi** 驱动（不真起进程）。
// 真 Win32 只在最后一条冒烟门里出现，且只用当前进程的伪句柄（规格 E20）：无 UI、无副作用。
// 不要用「真 Shell 打一个不存在的路径」当冒烟门 —— 那会弹 Shell 的系统错误框并把 worker 卡死（规格 E19）。
// 译文断言一律走 t()（索引 K16(2) 口径：测试不写死中文文案）。
// 2026-10-14-quick-launch-admin §6.9：末尾两条用例守「管理员」开关到 lpVerb 的透传与「不勾选 = 取值不变」，
// 用例名逐字取 plan 任务 3 步骤 1（check 表 E1 / E2 的守测试）。
import { lstatSync } from 'node:fs';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { t } from './i18n';
import { isLaunchableExe, launchShellExe, winShell, type WinShellApi } from './shell-execute';

// 夹具必须是**本机必然存在的 .exe**（2026-10-15 预检索引 K6）：原写法 E:\\QiYou\\QiYou.exe 机器相关，
// 且预检门（§6.1）会把它挡在假接缝之前 → 既有 10 条用例全红。process.execPath 过预检、假接缝不真起进程。
const EXE = process.execPath;
const HANDLE = { fakeHandle: 'h1' };

/** 假 Win32 接缝：默认「启动成功且一直存活」，各用例用 over 覆盖需要的行为 */
function fakeApi(over: Partial<WinShellApi> = {}): { api: WinShellApi; calls: string[] } {
  const calls: string[] = [];
  const api: WinShellApi = {
    shellExecute: vi.fn(() => { calls.push('shellExecute'); return { ok: true, handle: HANDLE, win32Error: 0 }; }),
    pidOf: vi.fn(() => 4242),
    isAlive: vi.fn(() => true),
    exitCodeOf: vi.fn(() => 0),
    terminate: vi.fn(() => { calls.push('terminate'); return true; }),
    close: vi.fn(() => { calls.push('close'); }),
    killTree: vi.fn(() => { calls.push('killTree'); return true; }),
    ...over,
  };
  return { api, calls };
}

/**
 * 只记录实参的假接缝（2026-10-14-quick-launch-admin §6.9 的两条用例用）：判据是「传给 Shell 的实参」，
 * 所以 seen 存的是每次调用的完整实参数组，不预判第三参的形状（先红时它是 undefined）。
 */
function recordingApi(): { api: WinShellApi; seen: unknown[][] } {
  const seen: unknown[][] = [];
  const { api } = fakeApi({
    shellExecute: vi.fn((...args: unknown[]) => {
      seen.push(args);
      return { ok: true, handle: HANDLE, win32Error: 0 };
    }),
  });
  return { api, seen };
}

describe('shell-execute（ShellExecuteEx 提权启动，规格 §6.2-§6.7 / §7.1）', () => {

  // §7.1-1
  it('1 启动成功：pid 取自 pidOf，且 pidOf 收到 shellExecute 返回的那个句柄', () => {
    const { api } = fakeApi();
    const proc = launchShellExe(api, EXE);
    expect(proc.pid).toBe(4242);
    expect(proc.isRunning()).toBe(true);
    expect(api.shellExecute).toHaveBeenCalledWith(EXE, 1); // nShow = SW_SHOWNORMAL（规格 §6.3 / §8-Q11）
    expect(api.pidOf).toHaveBeenCalledWith(HANDLE);
    proc.stopGraceful(0); // 收尾：清掉轮询定时器，别把句柄留给下一个用例
  });

  // §7.1-2（索引 R5：退出只上报一次 + clearInterval + close）
  it('2 退出：轮询到 isAlive=false 后按 exitCodeOf 上报一次，并 close + 清定时器', async () => {
    // 用假定时器才能证明「clearInterval 真的执行了」（规格 §6.4 / R6）：真定时器下即使漏掉
    // clearInterval，finish() 的 exited 守卫也让 isAlive / onExit 不再被调用，用例照样绿 = 没牙。
    vi.useFakeTimers();
    try {
      let polls = 0;
      const { api } = fakeApi({
        isAlive: vi.fn(() => { polls += 1; return polls < 2; }), // 第一次仍活，第二次已退出
        exitCodeOf: vi.fn(() => 7),
      });
      const proc = launchShellExe(api, EXE);
      const codes: number[] = [];
      proc.onExit((code) => codes.push(code));
      await vi.advanceTimersByTimeAsync(400); // 轮询 100ms（规格 §6.4），400ms 足够多跑几轮
      expect(codes).toEqual([7]);
      expect(api.exitCodeOf).toHaveBeenCalledWith(HANDLE);
      expect(api.close).toHaveBeenCalledWith(HANDLE);
      expect(proc.isRunning()).toBe(false);
      // 再推进 300ms：不得有第二次回调，且**不得残留任何定时器**（clearInterval 已执行）
      await vi.advanceTimersByTimeAsync(300);
      expect(codes).toEqual([7]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // §7.1-3（索引 R1：UAC 点「否」= ERROR_CANCELLED 1223）
  it('3 ShellExecuteEx 失败且 win32Error=1223 → PROC: + err.proc.uacCancelled，且不进入轮询', () => {
    const { api } = fakeApi({
      shellExecute: vi.fn(() => ({ ok: false, handle: null, win32Error: 1223 })),
    });
    expect(() => launchShellExe(api, EXE)).toThrow(/^PROC: /);
    try {
      launchShellExe(api, EXE);
    } catch (e) {
      expect((e as Error).message).toContain(t('err.proc.uacCancelled', { exe: EXE }));
    }
    expect(api.pidOf).not.toHaveBeenCalled();
    expect(api.isAlive).not.toHaveBeenCalled();
    expect(api.close).not.toHaveBeenCalled();
  });

  // §7.1-4
  it('4 其他失败 → PROC: + err.proc.spawnFail，并把 Win32 码放进 {err}', () => {
    const { api } = fakeApi({
      shellExecute: vi.fn(() => ({ ok: false, handle: null, win32Error: 2 })),
    });
    let msg = '';
    try {
      launchShellExe(api, EXE);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/^PROC: /);
    expect(msg).toContain(t('err.proc.spawnFail', { exe: EXE, err: 'win32=2' }));
  });

  // §7.1-5（索引 R2：提权进程 taskkill 打不到 → 句柄兜底，规格 E9/E10）
  it('5 停止：killTree 返回 false（提权进程）→ 用 TerminateProcess(句柄, 1) 兜底', async () => {
    let stopped = false;
    const { api, calls } = fakeApi({
      killTree: vi.fn(() => { calls.push('killTree'); return false; }),
      isAlive: vi.fn(() => !stopped),
      terminate: vi.fn(() => { stopped = true; calls.push('terminate'); return true; }),
    });
    const proc = launchShellExe(api, EXE);
    await proc.stopGraceful(0);
    expect(api.killTree).toHaveBeenCalledWith(4242);
    expect(api.terminate).toHaveBeenCalledWith(HANDLE, 1);
    // 顺序：先 taskkill，失败才句柄兜底；terminate 之后退出落地 → close 关句柄（规格 §6.4，顺序逐字）
    expect(calls).toEqual(['shellExecute', 'killTree', 'terminate', 'close']);
  });

  // §7.1-6（索引 R3：非提权进程走 taskkill，与今天逐字同口径）
  it('6 停止：killTree 成功且进程已消失 → 不调用 TerminateProcess', async () => {
    const { api } = fakeApi({
      killTree: vi.fn(() => true),
      isAlive: vi.fn(() => false),
    });
    const proc = launchShellExe(api, EXE);
    await proc.stopGraceful(0);
    expect(api.killTree).toHaveBeenCalledWith(4242);
    expect(api.terminate).not.toHaveBeenCalled();
  });

  // §7.1-7（先例 process.ts:74 的幂等守卫）：**并发**两次停止才算幂等守卫的用例
  // （串行两次时第一次已把 exited 置真，走的是「已退出直接返回」，stopping 标志根本没被碰到 —— 变异取证实测）
  it('7 stopGraceful 幂等：并发两次调用，killTree 只一次、第二次立即返回', async () => {
    let stopped = false;
    const { api } = fakeApi({
      isAlive: vi.fn(() => !stopped),                 // 前 2s 一直活着：第一次调用停在轮询窗口里
      terminate: vi.fn(() => { stopped = true; return true; }),
    });
    const proc = launchShellExe(api, EXE);
    const p1 = proc.stopGraceful(2);
    const t0 = Date.now();
    await proc.stopGraceful(2);                       // 第二次：必须立即返回（规格 §6.7 第 5 步）
    const elapsed = Date.now() - t0;
    await p1;
    expect(api.killTree).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(100);
  });

  // §7.1-8（已按规格改写）：真接缝冒烟门（不 mock）—— 证明真 koffi 绑定可用、参数按 void * 正确传。
  // 目标用**当前进程的伪句柄**（规格 E20）：不弹窗、不起进程、不写文件。
  it('8 真 winShell：伪句柄 -1 → pidOf 得到本进程 pid、isAlive 为真（真实 FFI，无 UI）', () => {
    expect(winShell.pidOf(-1)).toBe(process.pid); // GetProcessId(GetCurrentProcess()) = 本进程 pid（E20 实测）
    expect(winShell.isAlive(-1)).toBe(true);      // WaitForSingleObject(-1,0)=258 WAIT_TIMEOUT（E11 / E20）
  });

  // ---------- 2026-10-15-quick-launch-exe-path-precheck §7.1-1..4（plan 任务 1 步骤 1，用例名逐字；check 表 E1–E4）----------
  // 预检的牙：目标不可用（不存在 / 不是普通 .exe / 不可访问）时**不得**调 Shell ——
  // Shell 会弹自己的系统错误框并把主线程卡死 6.1–38.9s（规格 §3-P1/P4），我们的日志要等用户点「确定」才出现。

  it('missing_absolute_path_is_not_launchable', () => {
    expect(isLaunchableExe('Z:\\no-such-dir\\no-such.exe')).toBe(false); // 无效驱动器（规格 §3-P4）
    const ghost = resolve(`no-such-zzz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.exe`);
    expect(isLaunchableExe(ghost)).toBe(false); // 本仓目录下不存在的绝对路径（规格 §3-P1 同型）
  });

  it('directory_and_non_exe_file_are_not_launchable', () => {
    // 存在的目录：Shell 今天判「成功」（hInstApp=42、hProcess=null）→ 卡片留下假运行态（规格 §3-P6 / §8-Q4）
    expect(isLaunchableExe(process.cwd())).toBe(false);
    // 存在的非 .exe 文件（规格 §8-Q5）：本仓 package.json，路径与 cwd 无关
    expect(isLaunchableExe(join(__dirname, '..', 'package.json'))).toBe(false);
  });

  it('existing_exe_and_bare_name_through_PATH_are_launchable', () => {
    expect(isLaunchableExe(process.execPath)).toBe(true); // 必然存在的 .exe
    const saved = process.env.PATH;
    try {
      // 裸名走 PATH 顺序查找（规格 §6.1 解析③）：ipc-ql.test.ts 的 notepad.exe 用例就靠这条不被误杀（§3-P10 / RF2）
      process.env.PATH = dirname(process.execPath) + delimiter + (saved ?? '');
      expect(isLaunchableExe(basename(process.execPath))).toBe(true);
    } finally {
      process.env.PATH = saved;
    }
  });

  // §7.1-3b（2026-10-15 规格 §6.1 判定① 第二支 / §8-Q13 / 索引 K11；check 表 E8 / RF6）：
  // WindowsApps 的 app execution alias 是**重解析点**：statSync / openSync / realpathSync 全 EACCES，
  // 只有 lstatSync 看得见（§3-P14），而 Shell 起得了它 —— 裸名与全路径都能起（§3-P13）。
  // 夹具只能用机器上真实存在的别名：fs.symlinkSync 造不出（§3-P15：EPERM，无 SeCreateSymbolicLinkPrivilege、未开开发者模式）。
  // 该别名不在 PATH 时跳过本用例 —— 硬门归真机 §7.2-9（索引 K12 / 规格 §9-R9）。
  const ALIAS_NAME = 'mspaint.exe';
  const aliasFixture = (() => {
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      if (!dir) continue;
      const p = join(dir, ALIAS_NAME);
      try {
        // 只要重解析点这一支：普通 .exe 已由上一条用例守，这里必须是别名才有牙
        if (lstatSync(p).isSymbolicLink()) return { name: ALIAS_NAME, path: p };
      } catch { /* 这个 PATH 目录里没有它 */ }
    }
    return null;
  })();

  it.skipIf(aliasFixture === null)('app_execution_alias_in_PATH_is_launchable', () => {
    const alias = aliasFixture!;
    // 夹具形状必须是重解析点（§3-P14）：普通文件口径的 statSync 看不见它 —— 这正是上一版实现误杀它的原因
    expect(lstatSync(alias.path).isSymbolicLink()).toBe(true);
    expect(isLaunchableExe(alias.name)).toBe(true); // 裸名（§3-P13：Shell 起得了裸名别名）
    expect(isLaunchableExe(alias.path)).toBe(true); // 全路径（§3-P13：全路径同样起得了）
  });

  it('precheck_blocks_before_the_shell_is_called', () => {
    const exe = 'Z:\\no-such-dir\\no-such.exe';
    const { api } = fakeApi();
    let msg = '';
    try {
      launchShellExe(api, exe);
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toMatch(/^PROC: /); // 前缀只用既有的 PROC:（索引 G1）
    expect(msg).toContain(t('err.proc.exeNotFound', { exe }));
    // RF1：Shell 一次都不被调用 = 不弹系统框、不阻塞主线程（这条断言就是「不调 Shell」的牙）
    expect(api.shellExecute).not.toHaveBeenCalled();
    expect(api.pidOf).not.toHaveBeenCalled();
    expect(api.isAlive).not.toHaveBeenCalled();
  });

  // ---------- 2026-10-14-quick-launch-admin §6.9（plan 任务 3 步骤 1，用例名逐字；check 表 E1 / E2）----------
  // 提权与否只由 lpVerb 决定：所以判据是「传给 Shell 接缝的实参」，其余取值（nShow / parameters）不许跟着变。

  it('verb_runas_is_passed_through_to_the_shell', () => {
    const { api, seen } = recordingApi();
    const proc = launchShellExe(api, EXE, 'runas'); // admin === true → 'runas'（规格 §6.9）
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe(EXE);
    expect(seen[0][1]).toBe(1); // nShow 仍是 SW_SHOWNORMAL（规格 §8-Q11 / 索引 G3）
    const opts = seen[0][2] as { verb?: string | null; parameters?: string | null } | undefined;
    expect(opts?.verb).toBe('runas');
    expect(opts?.parameters ?? null).toBeNull(); // 本期没有参数字段（规格 §5），提权也不带参数
    proc.stopGraceful(0); // 收尾：别把轮询定时器留给下一个用例（用例 1 同一手法）
  });

  it('no_opts_keeps_verb_and_parameters_null', () => {
    const { api, seen } = recordingApi();
    const p1 = launchShellExe(api, EXE);        // 既有调用形状：根本不传第三参
    const p2 = launchShellExe(api, EXE, null);  // 未勾选：main.ts 传的是 admin ? 'runas' : null（索引 K29）
    expect(seen).toHaveLength(2);
    for (const call of seen) {
      const opts = call[2] as { verb?: string | null; parameters?: string | null } | undefined;
      expect(opts?.verb ?? null).toBeNull();       // lpVerb 仍是 null：asInvoker 不多弹 UAC（前置规格 §6.1 / E8）
      expect(opts?.parameters ?? null).toBeNull(); // lpParameters 仍是 null
    }
    // 显式 null 也必须把 opts 交出去：第三参没实现时这一句先红（D1 的红门）
    expect(seen[1][2]).toBeDefined();
    p1.stopGraceful(0);
    p2.stopGraceful(0);
  });
});
