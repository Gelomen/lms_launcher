// src-main/shell-execute.test.ts
// 2026-10-13-quick-launch-elevated-exe §7.1：生命周期用**假 WinShellApi** 驱动（不真起进程）。
// 真 Win32 只在最后一条冒烟门里出现，且只用当前进程的伪句柄（规格 E20）：无 UI、无副作用。
// 不要用「真 Shell 打一个不存在的路径」当冒烟门 —— 那会弹 Shell 的系统错误框并把 worker 卡死（规格 E19）。
// 译文断言一律走 t()（索引 K16(2) 口径：测试不写死中文文案）。
import { describe, expect, it, vi } from 'vitest';
import { t } from './i18n';
import { launchShellExe, winShell, type WinShellApi } from './shell-execute';

const EXE = 'E:\\QiYou\\QiYou.exe';
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
});
