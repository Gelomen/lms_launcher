// @vitest-environment happy-dom
// App level tests: renderer state machine for the llama-server lifecycle with a SINGLE toggle button.
//  idle/failed   -> green [启动]
//  running       -> red   [停止]; stopping -> red 「...」disabled, back to green once the service truly stopped
//  start failure -> automatically falls back to green [启动] (authoritative get_state)
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import App from './App.vue';

const invoke = vi.fn();
// §4.6：托盘「退出」→ 确认对话框（ConfirmDialog）。测试捕获最新注册的回调以模拟托盘事件。
const trayHandlers: Array<() => void> = [];
// §frameless：win-max-changed 推送（最大化状态）。测试捕获最新注册的回调以模拟主进程推送。
const winMaxHandlers: Array<(e: { maximized: boolean }) => void> = [];
// 任务 2：onLogLine 改为捕获回调（原为 no-op），测试通过 logHandlers 驱动日志行进入分桶路由。
const logHandlers: Array<(e: { line: string; stream: 'sys' | 'out' | 'err' }) => void> = [];
// 生命周期双发（规格 2026-08-31-sys-log-dual-echo）：onProcessExit 捕获回调，测试驱动进程退出行
const processExitHandlers: Array<(e: { code: number }) => void> = [];
// 自动更新（2026-09-01）：下载进度 / 托盘「检查更新」事件桥；App.vue onMounted 无条件订阅
const updateProgressHandlers: Array<(e: { pct: number }) => void> = [];
const trayUpdateHandlers: Array<() => void> = [];
vi.mock('./ipc', () => ({
  invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
  errMsg: (e: unknown): string => (e as Error).message,
  isMissing: (m: string): boolean => m.includes('MISSING:'),
  isValidation: (m: string): boolean => m.includes('VALIDATION:'),
  onLogLine: (fn: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => { logHandlers.push(fn); return () => {} },
  onProcessExit: (fn: (e: { code: number }) => void) => { processExitHandlers.push(fn); return () => {} },
  onTrayExitRequest: (fn: () => void) => { trayHandlers.push(fn); return () => {} },
  onWinMaxChanged: (fn: (e: { maximized: boolean }) => void) => { winMaxHandlers.push(fn); return () => {}; },
  onUpdateDownloadProgress: (fn: (e: { pct: number }) => void) => { updateProgressHandlers.push(fn); return () => {}; },
  onTrayUpdateRequest: (fn: () => void) => { trayUpdateHandlers.push(fn); return () => {}; },
}));

const RUNNING = { running: true, stopping: false, configId: 'c1' };
const READY = { running: false, stopping: false, configId: null };
// 数据 key：desc → name（2026-09，main 返回 ConfigEntry.name）
function cfg(): Record<string, { name?: string | null; values: Record<string, string> }> {
  return { c1: { name: null, values: {} } };
}

// mount App with a given get_state snapshot; start/stop hung on controllable promises (real lifecycle takes seconds).
// `getState` defaults to the initial snapshot; flip it mid-test to model main-process state changing (e.g. ready after stop).
function mountApp(initial: object = RUNNING): { w: import('@vue/test-utils').VueWrapper<any>; stop: ReturnType<typeof Promise.withResolvers>; start: ReturnType<typeof Promise.withResolvers> } {
  const stop = Promise.withResolvers<void>();
  const start = Promise.withResolvers<void>();
  let currentState = initial;
  invoke.mockImplementation((cmd: string): Promise<unknown> => {
    switch (cmd) {
      case 'get_state': return Promise.resolve(currentState);
      case 'get_configs': return Promise.resolve(cfg());
      case 'start_server': return start.promise;
      case 'stop_server': return stop.promise;
      default: return Promise.resolve(undefined);
    }
  });
  const w = mount(App) as import('@vue/test-utils').VueWrapper<any>;
  return { w, stop, start };
}

// the single toggle button: locate by its state class (btn-launch / btn-danger) — the dropdown's
// "…" button is btn-secondary, so these two classes uniquely identify the toggle.
function btn(w: import('@vue/test-utils').VueWrapper<any>): any {
  const all = w.findAll('.module-launch .btn');
  expect(all.length).toBe(2); // toggle + dropdown …
  return all.find((b) => b.classes().includes('btn-launch') || b.classes().includes('btn-danger'));
}

describe('App stop flow', () => {
  it('clicking [停止] immediately shows stopping and disables the button while stop_server is pending, then restores green [启动]', async () => {
    const { w, stop } = mountApp();
    await flush(); // get_state + get_configs land, running=true -> red [停止]

    const stopBtn = btn(w);
    expect(stopBtn.classes().join(' ')).toContain('btn-danger');
    expect(stopBtn.attributes('disabled')).toBeUndefined();
        // square 图标（运行中、未 stopping 时渲染 <FontAwesomeIcon>）
    expect(stopBtn.find('svg').exists()).toBe(true);

    await stopBtn.trigger('click');
    await flush(); // stop_server still unresolved (window while waiting for process exit)

    const after = btn(w);
    expect(after.attributes('disabled')).toBeDefined();
    expect(after.text()).toBe('...');

    // service truly stopped: invoke resolves and the process is gone (main state -> ready)
    stop.resolve(undefined);
    await flush();
    const final = btn(w);
    expect(final.text()).not.toBe('...');
    // back to green [启动] immediately (no need to wait for the process-exit event)
    expect(final.find('svg').exists()).toBe(true); // rocket 图标
    expect(final.classes().join(' ')).toContain('btn-launch');
  });

  it('stop_server failure resets stopping so the button is clickable again', async () => {
    const { w, stop } = mountApp();
    await flush();

    const stopBtn = btn(w);
    await stopBtn.trigger('click');
    await flush();

    // within the pending window stopping must be visible - otherwise the state is unreachable
    const mid = btn(w);
    expect(mid.attributes('disabled')).toBeDefined();
    expect(mid.text()).toBe('...');

    // stop_server rejects -> catch resets; button must not get stuck on stopping.
    // (main still reports RUNNING: state unchanged, red [停止] clickable)
    stop.reject(new Error('boom'));
    await flush();
    const after = btn(w);
    expect(after.attributes('disabled')).toBeUndefined(); // running=true, stopping=false -> enabled
        // square 图标（stop_server 失败回落，仍是运行中可点）
    expect(after.find('svg').exists()).toBe(true);
  });
});

describe('App start flow', () => {
  it('start_server success turns the single button red [停止] and clickable', async () => {
    const { w, start } = mountApp(READY); // fresh session: nothing running
    await flush(); // get_state -> ready; LaunchBar selects c1

    const launchBtn = btn(w);
    expect(launchBtn.classes().join(' ')).toContain('btn-launch');
    expect(launchBtn.find('svg').exists()).toBe(true); // rocket 图标
    expect(launchBtn.attributes('disabled')).toBeUndefined();

    await launchBtn.trigger('click');
    start.resolve('c1 :: summary'); // main process reports launch ok (summary)
    await flush();

    // renderer must know the server is running: single button now red [停止] and clickable
    const stopBtn = btn(w);
    expect(stopBtn.classes().join(' ')).toContain('btn-danger');
    expect(stopBtn.attributes('disabled')).toBeUndefined();
        // square 图标（运行中、未 stopping 时渲染 <FontAwesomeIcon>）
    expect(stopBtn.find('svg').exists()).toBe(true);
  });

  it('start_server failure automatically restores green [启动] (main state authoritative)', async () => {
    const { w, start } = mountApp(READY);
    await flush();

    const launchBtn = btn(w);
    expect(launchBtn.find('svg').exists()).toBe(true); // rocket 图标
    await launchBtn.trigger('click');
    // while start_server is in flight the green [启动] button must be disabled (no double-click)
    const pending = btn(w);
    expect(pending.attributes('disabled')).toBeDefined();

    start.reject(new Error('boom'));
    await flush();

    // failure -> green [启动] restored and clickable again
    const after = btn(w);
    expect(after.classes().join(' ')).toContain('btn-launch');
    expect(after.find('svg').exists()).toBe(true); // rocket 图标
    expect(after.attributes('disabled')).toBeUndefined(); // can retry
  });
});

// §4.6：托盘「退出」→ ConfirmDialog（主题化二次确认）。点[确认]才 invoke('exit_app')；[取消]不 invoke。
// 2026-08-31：目录卡片校验结果 → LMS Launcher 日志区（launcher 桶，[lms_launcher] 前缀，不带括号）
describe('App dir validation log', () => {
  function launcherTexts(w: any): string[] {
    const pane = w.find('.log-pane[data-tab-id="launcher"]');
    return pane.findAll('p').map((p: any) => p.text()).filter((t: string) => t !== '（暂无日志）');
  }

  it('validated ok emits a launcher log line with the dir path', async () => {
    const { w } = mountApp();
    await flush();
    const dm = w.findComponent({ name: 'DirModule' });
    (dm.vm as any).$emit('validated', { ok: true, dir: 'D:\\AI\\llama-cpp' });
    await flush();
    const lines = launcherTexts(w);
    expect(lines).toContain('[lms_launcher] 目录校验 · llama-server.exe 已找到：D:\\AI\\llama-cpp');
    expect(lines.some((l) => l.includes('（'))).toBe(false); // 不带任何括号文字
    w.unmount();
  });

  it('validated fail emits a launcher log line with the dir path', async () => {
    const { w } = mountApp();
    await flush();
    const dm = w.findComponent({ name: 'DirModule' });
    (dm.vm as any).$emit('validated', { ok: false, dir: 'D:\\no-such-dir' });
    await flush();
    expect(launcherTexts(w)).toContain('[lms_launcher] 目录校验 · 未找到 llama-server.exe：D:\\no-such-dir');
    w.unmount();
  });
});

describe('App tray exit', () => {
  it('tray exit opens confirm dialog; [确认] invokes exit_app', async () => {
    const { w } = mountApp();
    await flush(); // get_state lands (running) — App registers tray handler
    invoke.mockClear();
    trayHandlers.at(-1)(); await flush(); // fire latest tray-exit handler -> dialog visible
    const ok = document.querySelector('.confirm-box .confirm-ok') as HTMLButtonElement;
    expect(ok).not.toBeNull(); // 主题化对话框出现（不再是系统 window.confirm）
    ok.click();
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'exit_app')).toBeDefined();
    w.unmount();
  });

  it('tray exit [取消] does not invoke exit_app', async () => {
    const { w } = mountApp();
    await flush();
    invoke.mockClear();
    trayHandlers.at(-1)(); await flush();
    (document.querySelector('.confirm-box .confirm-cancel') as HTMLButtonElement).click();
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'exit_app')).toBeUndefined();
    w.unmount();
  });
});

describe('window controls (frameless winbar)', () => {
  it('renders winbar with three controls: minimize / maximize / close', async () => {
    const { w } = mountApp();
    await flush();
    const bar = w.find('.winbar');
    expect(bar.exists()).toBe(true);
    const btns = bar.findAll('.winbtn');
    expect(btns.length).toBe(3);
    expect(btns[0].attributes('aria-label')).toBe('最小化');
    expect(btns[1].attributes('aria-label')).toBe('最大化'); // 初始非最大化 → 最大化
    expect(btns[2].attributes('aria-label')).toBe('关闭');
  });

  it('clicking the three controls invokes win_minimize / win_maximize / win_close', async () => {
    const { w } = mountApp();
    await flush();
    const btns = w.find('.winbar').findAll('.winbtn');
    await btns[0].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_minimize');
    await btns[1].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_maximize');
    await btns[2].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
  });

  it('close invokes win_close but NOT exit_app (tray-exit stays the only real quit)', async () => {
    const { w } = mountApp();
    await flush();
    const closeBtn = w.find('.winbar').findAll('.winbtn')[2];
    await closeBtn.trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
    expect(invoke).not.toHaveBeenCalledWith('exit_app');
  });

  it('maximized push switches the toggle label 最大化 → 还原', async () => {
    const { w } = mountApp();
    await flush();
    winMaxHandlers.forEach(fn => fn({ maximized: true })); // 模拟主进程推送
    await flush();
    const maxBtn = w.find('.winbar').findAll('.winbtn')[1];
    expect(maxBtn.attributes('aria-label')).toBe('还原');
  });

  it('winbar is a top-level node OUTSIDE .layout (full-width, close key at window edge)', async () => {
    const { w } = mountApp();
    await flush();
    // 结构契约：header.winbar 不再是 .layout 的子节点（贴边修复——.layout 有横向 padding）
    expect(w.element.querySelector('.winbar')).not.toBeNull();
    expect(w.element.querySelector('.layout .winbar')).toBeNull();
  });

  it('maximize/restore icons use the window-* series (fa-window-maximize / fa-window-restore)', async () => {
    const { w } = mountApp();
    await flush();
    // App.vue 必须把两枚窗口系列图标注册进 FontAwesome（未注册时渲染为 [object Object]，无 svg）
    const maxBtn = w.find('.winbar').findAll('.winbtn')[1];
    expect(maxBtn.find('svg').exists()).toBe(true);
    winMaxHandlers.forEach(fn => fn({ maximized: true }));
    await flush();
    expect(w.find('.winbar').findAll('.winbtn')[1].find('svg').exists()).toBe(true);
  });
});

describe('log routing to tabs', () => {
  it('sys line lands in the launcher tab, out/err land in the llama-server tab', async () => {
    const { w } = mountApp();
    await flush(); // get_state + onLogLine handler registered
    logHandlers.at(-1)!({ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' });
    logHandlers.at(-1)!({ line: '0.02.5 I srv  llama_server: hello', stream: 'err' });
    await flush();
    const launcher = w.find('.log-pane[data-tab-id="launcher"]').text();
    const server = w.find('.log-pane[data-tab-id="llama-server"]').text();
    expect(launcher).toContain('[lms_launcher] 启动配置 · c1');
    expect(launcher).not.toContain('llama_server: hello');
    expect(server).toContain('llama_server: hello');
    expect(server).not.toContain('启动配置');
  });

  it('each tab trims to 500 lines independently (no cross-bucket squeezing)', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    for (let i = 0; i < 501; i++) { h({ line: 'sys' + i, stream: 'sys' }); h({ line: 'out' + i, stream: 'out' }); }
    await flush();
    const launcherLines = w.find('.log-pane[data-tab-id="launcher"]').findAll('p');
    const serverLines = w.find('.log-pane[data-tab-id="llama-server"]').findAll('p');
    expect(launcherLines.length).toBe(500);
    expect(serverLines.length).toBe(500);
    // 各自保留最新 500：第 1 行是 index=1（index=0 被裁掉）
    expect(launcherLines[0].text()).toBe('sys1');
    expect(serverLines[0].text()).toBe('out1');
  });

  it('clear-log button clears only the current tab bucket (per-tab scoping)', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    for (let i = 0; i < 3; i++) { h({ line: 'L' + i, stream: 'sys' }); h({ line: 'S' + i, stream: 'out' }); }
    await flush();
    // 点击 launcher tab 的清空按钮 → 只清 launcher 桶，llama-server 桶不动
    const btn = w.find('.log-pane[data-tab-id="launcher"] button[aria-label="清空日志"]');
    await btn.trigger('click');
    await flush();
    // 空桶渲染占位行「（暂无日志）」而非 0 个 p——日志行计数排除该占位
    const launcherPane = w.find('.log-pane[data-tab-id="launcher"]');
    const logLines = (el: any) => el.findAll('p').filter((p: any) => p.text() !== '（暂无日志）');
    expect(logLines(launcherPane).length).toBe(0);
    expect(logLines(w.find('.log-pane[data-tab-id="llama-server"]')).length).toBe(3);
    // 清空后新日志正常追加（桶引用身份保持）
    h({ line: 'S3', stream: 'out' });
    await flush();
    expect(w.find('.log-pane[data-tab-id="llama-server"]').findAll('p').length).toBe(4);
    w.unmount();
  });
});

describe('lifecycle log dual-echo (echoTabs)', () => {
  function tabTexts(w: any, tabId: string): string[] {
    return w.find(`.log-pane[data-tab-id="${tabId}"]`)
      .findAll('p')
      .map((p: any) => p.text())
      .filter((t: string) => t !== '（暂无日志）');
  }

  it('sys line with echoTabs: [llama-server] lands in both tabs; without it stays launcher-only', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    h({ line: '[lms_launcher] 启动命令 · llama-server.exe -m x', stream: 'sys', echoTabs: ['llama-server'] });
    h({ line: '[lms_launcher] 目录校验 · 已找到', stream: 'sys' }); // 无 echoTabs → 单桶
    await flush();
    expect(tabTexts(w, 'launcher')).toEqual([
      '[lms_launcher] 启动命令 · llama-server.exe -m x',
      '[lms_launcher] 目录校验 · 已找到',
    ]);
    expect(tabTexts(w, 'llama-server')).toEqual(['[lms_launcher] 启动命令 · llama-server.exe -m x']);
    w.unmount();
  });

  it('echoTabs with unknown tab id is silently ignored', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    h({ line: '[lms_launcher] X', stream: 'sys', echoTabs: ['dsh'] }); // dsh 尚未注册
    await flush();
    expect(tabTexts(w, 'launcher')).toEqual(['[lms_launcher] X']);
    expect(tabTexts(w, 'llama-server')).toEqual([]);
    w.unmount();
  });

  it('start-fail line (local catch) lands in both tabs', async () => {
    // 独立于 mountApp：自备 invoke mock（get_state=ready）与可控 start_server，触发 doStart catch 通用失败分支
    const start2 = Promise.withResolvers<void>();
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve({ running: false, stopping: false, configId: null });
        case 'get_configs': return Promise.resolve({ c1: { name: null, values: {} } });
        case 'start_server': return start2.promise;
        case 'stop_server': return Promise.resolve(undefined);
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App) as import('@vue/test-utils').VueWrapper<any>;
    await flush();
    const launchBtn = w.find('.module-launch .btn-launch');
    await launchBtn.trigger('click');
    start2.reject(new Error('boom'));
    await flush();
    expect(tabTexts(w, 'launcher')).toContain('[lms_launcher] 启动失败 · boom');
    expect(tabTexts(w, 'llama-server')).toContain('[lms_launcher] 启动失败 · boom');
    w.unmount();
  });

  it('process-exit line (local onProcessExit) lands in both tabs', async () => {
    const { w } = mountApp();
    await flush();
    processExitHandlers.at(-1)!({ code: 1 });
    await flush();
    expect(tabTexts(w, 'launcher')).toContain('[lms_launcher] 进程退出 code=1');
    expect(tabTexts(w, 'llama-server')).toContain('[lms_launcher] 进程退出 code=1');
    w.unmount();
  });
});
