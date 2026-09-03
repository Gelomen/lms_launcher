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

// 任务 3（2026-09-01 检查更新弹窗）：入口统一（托盘/顶栏只开弹窗）+ 共用退出确认 + 七态流转。
// UpdateModal 为纯 props 驱动组件 → 测试经 document 层查询（.update-modal / .text-btn）；
// invoke 按 cmd 分流（check_update 按脚本顺序返回、download_update 用可控 promise）。
describe('App update modal (入口统一 + 共用退出确认 + 七态流转)', () => {
  const AVAILABLE = { available: true, status: 'update-available', version: '9.9.9' };

  function makeUpdateMount() {
    const ctrl = {
      // check_update 依次返回脚本中的结果；耗尽后复用最后一个（空脚本 → 默认 up-to-date）
      checkScript: [] as unknown[],
      // download_update：可控 promise
      download: Promise.withResolvers<{ ok: boolean; reason?: string }>(),
    };
    let checkIdx = 0;
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': {
          const script = ctrl.checkScript;
          const r = script.length
            ? script[Math.min(checkIdx, script.length - 1)]
            : { available: false, status: 'up-to-date', version: '1.0.0' };
          checkIdx += 1;
          return Promise.resolve(r);
        }
        case 'download_update': return ctrl.download.promise;
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App) as any;
    return { w, ctrl };
  }

  function updateBtns(): HTMLButtonElement[] {
    return [...document.querySelectorAll('.update-modal .text-btn')] as HTMLButtonElement[];
  }

  it('托盘「检查更新」只打开 UpdateModal（不 re-check、不弹旧确认框）', async () => {
    const { w } = makeUpdateMount();
    await flush(); // onMounted 的启动静默 check_update 已发生一次
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 托盘事件 → 只开弹窗
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    // 打开弹窗不得再次 invoke check_update
    expect(invoke.mock.calls.some((c) => c[0] === 'check_update')).toBe(false);
    // 也不得出现旧的两步确认对话框
    expect(document.querySelector('.confirm-box')).toBeNull();
    w.unmount();
  });

  it('顶栏「有新版本!」点击打开同一 UpdateModal', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    const pill = w.find('.update-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe('有新版本!');
    await pill.trigger('click'); // 入口统一：只开弹窗
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    // available 态按钮为「下载更新」
    expect(updateBtns()[0].textContent).toContain('下载更新');
    w.unmount();
  });

  it('downloading 态顶栏「下载中 NN%」可点 → 打开同一 UpdateModal（恢复当前状态）', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    // 进入 downloading：托盘开弹窗 → 点「下载更新」→ 进度事件驱动 55%
    trayUpdateHandlers.at(-1)();
    await flush();
    updateBtns()[0].click(); // 下载更新 → download_update 在途
    await flush();
    updateProgressHandlers.at(-1)!({ pct: 55 });
    await flush();
    expect(updateBtns()[0].textContent).toContain('下载中 55%');
    // 关闭弹窗（下载继续）
    (document.querySelector('.update-modal .update-close') as HTMLButtonElement).click();
    await flush();
    expect(document.querySelector('.update-modal')).toBeNull();
    // 顶栏显示「下载中 55%」且未禁用
    const busy = w.find('.update-pill--busy');
    expect(busy.exists()).toBe(true);
    expect(busy.text()).toContain('下载中 55%');
    expect(busy.attributes('disabled')).toBeUndefined();
    // 点击 → 打开同一 UpdateModal
    await busy.trigger('click');
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    // 恢复当前状态：仍为「下载中 55%」（弹窗内动作按钮不可点，下载进行中）
    expect(updateBtns()[0].textContent).toContain('下载中 55%');
    expect(updateBtns()[0].disabled).toBe(true);
    w.unmount();
  });

  it('available → 下载(进度事件) → ready → 重启应用 → 共用退出确认 → 确认 → invoke run_update', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)(); // 开弹窗
    await flush();
    expect(updateBtns()[0].textContent).toContain('下载更新');
    updateBtns()[0].click(); // 下载更新 → download_update 在途
    await flush(); // downloading 态（0%）
    // 进度事件驱动 pct
    updateProgressHandlers.at(-1)!({ pct: 55 });
    await flush();
    expect(updateBtns()[0].textContent).toContain('下载中 55%');
    // 下载完成 → ready
    ctrl.download.resolve({ ok: true });
    await flush();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    updateBtns()[0].click(); // 重启应用 → 共用「退出程序」确认框
    await flush();
    const box = document.querySelector('.confirm-box');
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain('退出程序');
    invoke.mockClear();
    (document.querySelector('.confirm-box .confirm-ok') as HTMLButtonElement).click();
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'run_update')).toBeDefined();
    w.unmount();
  });

  it('重启确认取消 → 不 invoke run_update，保持 ready 态', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)();
    await flush();
    updateBtns()[0].click(); // 下载更新
    ctrl.download.resolve({ ok: true });
    await flush();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    updateBtns()[0].click(); // → 退出确认框
    await flush();
    expect(document.querySelector('.confirm-box')).not.toBeNull();
    invoke.mockClear();
    (document.querySelector('.confirm-box .confirm-cancel') as HTMLButtonElement).click();
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'run_update')).toBeUndefined();
    // ready 态保持：弹窗仍在，按钮仍为「重启应用」
    expect(document.querySelector('.update-modal')).not.toBeNull();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    w.unmount();
  });

  // run_update 失败（主进程 update.exe/更新包缺失时 throw）→ 渲染端不得吞掉：
  // ready 态行内显示错误文案（可重试），且未调用 exit_app、确认框复位。
  it('run_update 失败 → ready 态行内显示错误文案（不 exit_app、按钮仍可点）', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)(); // 开弹窗
    await flush();
    updateBtns()[0].click(); // 下载更新
    ctrl.download.resolve({ ok: true });
    await flush();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    updateBtns()[0].click(); // 重启应用 → 共用「退出程序」确认框
    await flush();
    expect(document.querySelector('.confirm-box')).not.toBeNull();
    // 独立控制 run_update：reject（覆盖 mount 内默认 resolve）
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      if (cmd === 'run_update') return Promise.reject(new Error('更新文件缺失（update.exe / lms-launcher-update.zip）'));
      return Promise.resolve(undefined);
    });
    invoke.mockClear();
    (document.querySelector('.confirm-box .confirm-ok') as HTMLButtonElement).click();
    await flush();
    // 错误文案行内可见（红字 .update-row__error）
    const rowText = (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(rowText).toContain('更新文件缺失');
    expect(document.querySelector('.update-row__error')).not.toBeNull();
    // 未走 exit_app 分支
    expect(invoke.mock.calls.find((c) => c[0] === 'exit_app')).toBeUndefined();
    // ready 态保持：按钮仍为「重启应用」可点（用户可重试），弹窗仍在
    expect(document.querySelector('.update-modal')).not.toBeNull();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    expect(updateBtns()[0].disabled).toBe(false);
    // 确认框复位（finally 逻辑保留）
    expect(document.querySelector('.confirm-box')).toBeNull();
    w.unmount();
  });

  it('check 失败 → error 态；点「重试」→ 重新 invoke check_update', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [{ available: false, status: 'error' }];
    await flush();
    trayUpdateHandlers.at(-1)();
    await flush();
    expect(updateBtns()[0].textContent).toContain('检查更新'); // idle 态
    updateBtns()[0].click();
    await flush();
    // error 态：原因文本 + 「重试」按钮
    const row = (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(row).toContain('无法连接更新服务器');
    expect(updateBtns()[0].textContent).toContain('重试');
    invoke.mockClear();
    updateBtns()[0].click(); // 重试 → 重发 check_update
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'check_update')).toBeDefined();
    w.unmount();
  });

  it('download 失败 reason 含「尚无更新任务」→ 回落 idle 并自动重新 check', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE, { available: false, status: 'up-to-date', version: '1.0.0' }];
    await flush(); // 启动静默 check_update → available
    trayUpdateHandlers.at(-1)();
    await flush();
    const baselineChecks = invoke.mock.calls.filter((c) => c[0] === 'check_update').length;
    updateBtns()[0].click(); // 下载更新
    ctrl.download.resolve({ ok: false, reason: '尚无更新任务，请先检查更新' });
    await flush();
    // 自动重新 check：除启动静默外恰好新增 1 次 check_update
    const checks = invoke.mock.calls.filter((c) => c[0] === 'check_update');
    expect(checks.length).toBe(baselineChecks + 1);
    // 不再显示下载失败错误文本；回落 idle 后走了 check 流程（第二次返回 up-to-date）
    const row = (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(row).not.toContain('尚无更新任务');
    expect(updateBtns()[0].textContent).toContain('检查更新');
    w.unmount();
  });
});
