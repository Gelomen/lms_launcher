// @vitest-environment happy-dom
// App level tests: renderer state machine for the llama-server lifecycle with a SINGLE toggle button.
//  idle/failed   -> green [启动]
//  running       -> red   [停止]; stopping -> red 「...」disabled, back to green once the service truly stopped
//  start failure -> automatically falls back to green [启动] (authoritative get_state)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from './App.vue';
import QuickLaunch from './modules/QuickLaunch.vue'; // 修复轮 B：按组件取卡片实例，驱动它的 changed → App.refreshQlConfigs
import LogPanel from './modules/LogPanel.vue';
import { TERM_PALETTES } from './modules/term-palettes';

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
// 设置（2026-10-01 update-proxy-settings）：托盘「设置」事件桥；App.vue onMounted 无条件订阅
let traySettingsHandlers: Array<() => void> = [];
// GPU 卡片（spec 2026-09-09-gpu-card-design）：gpu-stats 推送事件桥
const gpuStatsHandlers: Array<(e: { gpus: unknown[] }) => void> = [];
// 启动检测（2026-11）：startup-llama-check 推送事件桥（DirModule 订阅；App 级测试不驱动）
const startupLlamaCheckHandlers: Array<(e: { status: string; dir: string }) => void> = [];
// llama.cpp 更新进度事件桥（Task 8）：UpdateModal 内通过 ipc.onLlamaUpdateProgress 订阅
const llamaUpdateProgressHandlers: Array<(e: { percent: number; stage: string }) => void> = [];
// 快捷启动（任务 6）：ql-data / ql-exit 事件桥。任务 6 只接线不驱动（渲染端订阅在任务 13），
// 这里按既有「捕获再驱动」的写法登记，供任务 9-13 的用例使用。
const qlDataHandlers: Array<(e: { tabId: string; data: string }) => void> = [];
const qlExitHandlers: Array<(e: { configId: string; code: number }) => void> = [];
vi.mock('./ipc', () => ({
  // Minor 10（修复轮 B）：夹具层补一份符合 ParamMeta 类型的空参数表（形状见 TemplateModal.vue:30-37）。
  // 各 harness 的 default 分支返回 undefined（例：本文件 mountQl 的 default 行）会让 TemplateModule.vue:63
  // 把 paramsMeta 置成 undefined → 每次渲染打 [Vue warn]: Invalid prop: type check failed for prop
  // "paramsMeta"（基线 332 条），淹掉真警告。放在 mock 边界 = 一处覆盖全部 harness；
  // 仍把调用转给 invoke，所以按次断言与 invoke.mock.calls 记录不受影响，也不改任何断言。
  invoke: (cmd: string, ...args: unknown[]) =>
    cmd === 'get_params' ? Promise.resolve({ params: {}, required: [] }) : invoke(cmd, ...args),
  errMsg: (e: unknown): string => (e as Error).message,
  isMissing: (m: string): boolean => m.includes('MISSING:'),
  isValidation: (m: string): boolean => m.includes('VALIDATION:'),
  onLogLine: (fn: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => { logHandlers.push(fn); return () => {} },
  onProcessExit: (fn: (e: { code: number }) => void) => { processExitHandlers.push(fn); return () => {} },
  onTrayExitRequest: (fn: () => void) => { trayHandlers.push(fn); return () => {} },
  onWinMaxChanged: (fn: (e: { maximized: boolean }) => void) => { winMaxHandlers.push(fn); return () => {}; },
  onUpdateDownloadProgress: (fn: (e: { pct: number }) => void) => { updateProgressHandlers.push(fn); return () => {}; },
  onTrayUpdateRequest: (fn: () => void) => { trayUpdateHandlers.push(fn); return () => {}; },
  onTraySettingsRequest: (fn: () => void) => { traySettingsHandlers.push(fn); return () => {}; },
  onLlamaUpdateProgress: (fn: (e: { percent: number; stage: string }) => void) => { llamaUpdateProgressHandlers.push(fn); return () => {}; },
  onGpuStats: (fn: (e: { gpus: unknown[] }) => void) => { gpuStatsHandlers.push(fn); return () => {} },
  // 启动检测事件桥（2026-11）：DirModule onMounted 无条件订阅；App 级测试不驱动该事件（no-op 注册）
  onStartupLlamaCheck: (fn: (e: { status: string; dir: string }) => void) => { startupLlamaCheckHandlers.push(fn); return () => {}; },
  // 快捷启动事件桥（任务 6）：真实实现在 src/ipc.ts + preload.ts，本文件只登记捕获（任务 13 驱动）
  onQlData: (fn: (e: { tabId: string; data: string }) => void) => { qlDataHandlers.push(fn); return () => {}; },
  onQlExit: (fn: (e: { configId: string; code: number }) => void) => { qlExitHandlers.push(fn); return () => {}; },
}));

const { t: i18nText } = await import('./i18n');
const EMPTY_LOG = i18nText('log.empty.missing');

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
      case 'get_app_config': return Promise.resolve({ llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 } });
      case 'save_proxy': return Promise.resolve('ok');
      default: return Promise.resolve(undefined);
    }
  });
  const w = mount(App) as import('@vue/test-utils').VueWrapper<any>;
  return { w, stop, start };
}

// the single toggle button: locate by its state class (btn-launch / btn-danger) — the dropdown's
// "…" button is btn-secondary, so these two classes uniquely identify the toggle.
// 每个用例重置设置事件捕获（App 每测 mount 一次，旧回调指向已 unmount 实例）
beforeEach(() => {
  traySettingsHandlers = [];
});

function btn(w: import('@vue/test-utils').VueWrapper<any>): any {
  const all = w.findAll('.module-launch .btn');
  expect(all.length).toBe(2); // toggle + dropdown …
  return all.find((b) => b.classes().includes('btn-launch') || b.classes().includes('btn-danger'));
}

// 2026-10-19（用户报告）：正在运行的模板不可删 —— App 持有的运行配置 id 经 runningConfigId 下发给
// TemplateModule（运行态唯一来源 = state，C1 与 QuickLaunch 的 qlStates 下发同构）；
// 卡片比对 + 弹窗禁用契约分别钉在 TemplateModule.test.ts / TemplateModal.test.ts。
describe('App running_config_id flows to TemplateModule', () => {
  it('running_state_passes_running_config_id_and_ready_clears_it', async () => {
    const { w } = mountApp(RUNNING); // { running: true, stopping: false, configId: 'c1' }
    await flush();
    const tm = w.findComponent({ name: 'TemplateModule' });
    expect(tm.exists()).toBe(true);
    expect(tm.props('runningConfigId')).toBe('c1'); // 运行中 → 下发该配置 id
    w.unmount();

    const r = mountApp(READY);
    await flush();
    expect(r.w.findComponent({ name: 'TemplateModule' }).props('runningConfigId')).toBeNull(); // 未运行 → null
    r.w.unmount();
  });
});

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
    return pane.findAll('p').map((p: any) => p.text()).filter((s: string) => s !== EMPTY_LOG);
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
  it('renders winbar with github + three controls: github / minimize / maximize / close', async () => {
    const { w } = mountApp();
    await flush();
    const bar = w.find('.winbar');
    expect(bar.exists()).toBe(true);
    const btns = bar.findAll('.winbtn');
    expect(btns.length).toBe(4);
    expect(btns[0].attributes('aria-label')).toBe('GitHub 仓库');
    expect(btns[1].attributes('aria-label')).toBe('最小化');
    expect(btns[2].attributes('aria-label')).toBe('最大化'); // 初始非最大化 → 最大化
    expect(btns[3].attributes('aria-label')).toBe('关闭');
  });

  it('github button renders the fab/github brand icon and opens the repo via open_external', async () => {
    const { w } = mountApp();
    await flush();
    const gh = w.find('.winbar').find('.winbtn--github');
    expect(gh.exists()).toBe(true);
    expect(gh.find('svg').exists()).toBe(true); // 未注册品牌图标会渲染 [object Object] 无 svg
    await gh.trigger('click');
    expect(invoke).toHaveBeenCalledWith('open_external', 'https://github.com/Gelomen/lms_launcher');
  });

  it('hover tooltip 仅 GitHub 键（tip-down + data-tooltip），原生 title 不保留', async () => {
    const { w } = mountApp();
    await flush();
    const btns = w.find('.winbar').findAll('.winbtn');
    expect(btns[0].classes()).toContain('tip-down');
    expect(btns[0].attributes('data-tooltip')).toBe('GitHub 仓库');
    expect(btns[0].attributes('title')).toBeUndefined();
    // 三键（最小化/最大化/关闭）已移除 hover tooltip（2026-09-23：英文 "Close" 的 ::after
    // 未变换盒越过 frameless 窗口右缘 → 触发横向滚动条，整条 winbar 被顶左 10px）
    for (const btn of btns.slice(1)) {
      expect(btn.classes()).not.toContain('tip-down');
      expect(btn.attributes('data-tooltip')).toBeUndefined();
      expect(btn.attributes('title')).toBeUndefined();
    }
  });

  it('clicking the controls invokes win_minimize / win_maximize / win_close', async () => {
    const { w } = mountApp();
    await flush();
    const btns = w.find('.winbar').findAll('.winbtn');
    await btns[1].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_minimize');
    await btns[2].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_maximize');
    await btns[3].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
  });

  it('close invokes win_close but NOT exit_app (tray-exit stays the only real quit)', async () => {
    const { w } = mountApp();
    await flush();
    const closeBtn = w.find('.winbar').findAll('.winbtn')[3];
    await closeBtn.trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
    expect(invoke).not.toHaveBeenCalledWith('exit_app');
  });

  it('maximized push switches the toggle label 最大化 → 还原', async () => {
    const { w } = mountApp();
    await flush();
    winMaxHandlers.forEach(fn => fn({ maximized: true })); // 模拟主进程推送
    await flush();
    const maxBtn = w.find('.winbar').findAll('.winbtn')[2];
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
    const maxBtn = w.find('.winbar').findAll('.winbtn')[2];
    expect(maxBtn.find('svg').exists()).toBe(true);
    winMaxHandlers.forEach(fn => fn({ maximized: true }));
    await flush();
    expect(w.find('.winbar').findAll('.winbtn')[2].find('svg').exists()).toBe(true);
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
    // 空桶渲染占位行「暂无日志」而非 0 个 p——日志行计数排除该占位
    const launcherPane = w.find('.log-pane[data-tab-id="launcher"]');
    const logLines = (el: any) => el.findAll('p').filter((p: any) => p.text() !== EMPTY_LOG);
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
      .filter((s: string) => s !== EMPTY_LOG);
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
// UpdateModal 为纯 props 驱动组件 → 测试经 document 层查询（.update-modal / .btn-primary）；
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
    return [...document.querySelectorAll('.update-modal .btn-primary')] as HTMLButtonElement[];
  }

  it('下载完成 → 顶栏 pill 不消失：文本变「重启以更新」，点击仍只开弹窗（不直接重启）', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)();
    await flush();
    updateBtns()[0].click();
    await flush();
    updateProgressHandlers.at(-1)!({ pct: 55 });
    await flush();
    expect(w.find('.update-pill--busy').text()).toContain('下载中 55%');
    (document.querySelector('.update-modal .update-close') as HTMLButtonElement).click();
    await flush();
    ctrl.download.resolve({ ok: true });
    await flush();
    const pill = w.find('.update-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe('重启以更新');
    expect(pill.classes()).not.toContain('update-pill--busy');
    expect(pill.classes()).toContain('tip-down');
    expect(pill.attributes('data-tooltip')).toBe('新版本 v9.9.9 已下载，点击查看并重启更新');
    expect(pill.attributes('title')).toBeUndefined();
    await pill.trigger('click');
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    expect(document.querySelector('.confirm-box')).toBeNull();
    expect(updateBtns()[0].textContent).toContain('重启应用');
    w.unmount();
  });

  it('ready 态 pill 英文文案与 tooltip', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)();
    await flush();
    updateBtns()[0].click();
    await flush();
    ctrl.download.resolve({ ok: true });
    await flush();
    const { applyLangLocal } = await import('./i18n');
    applyLangLocal('en');
    await nextTick();
    const pill = w.find('.update-pill');
    expect(pill.text()).toBe('Restart to update');
    expect(pill.attributes('data-tooltip')).toBe('Version 9.9.9 downloaded, click to view and restart');
    applyLangLocal('zh');
    w.unmount();
  });

  // 2026 契约变更（2026-09-15 的「托盘开弹窗 + 自动 re-check」废止）：托盘「检查更新」/顶栏「有新版本!」
  // = 只开弹窗，零自动检查；手动「检查更新」按钮是 LMS 启动器行的唯一检查触发（与 llama.cpp 行对齐：
  // 打开时的自动动作仅是本地版本查询，不是网络检查）。启动静默检查之后发布的新版本，
  // 需用户手动点「检查更新」后才可见。
  it('托盘「检查更新」只开弹窗（零自动检查）；启动后发布的新版本需手动点「检查更新」才可见', async () => {
    const { w, ctrl } = makeUpdateMount();
    // 启动静默检查时还是最新（up-to-date 不更新 UI，行保持 idle）；随后远端发布新版
    ctrl.checkScript = [{ available: false, status: 'up-to-date', version: '1.0.0' }, AVAILABLE];
    await flush(); // onMounted 的启动静默 check_update 已发生一次（消费脚本第 1 项）
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 托盘事件 → 只开弹窗（零自动检查）
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    // 托盘事件不得触发任何 check_update（零自动检查）
    const checks = invoke.mock.calls.filter((c) => c[0] === 'check_update');
    expect(checks.length).toBe(0);
    // 行保持 idle「检查更新」；新版号不可见
    expect(updateBtns()[0].textContent).toContain('检查更新');
    const row = (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(row).not.toContain('9.9.9');
    // 手动点「检查更新」→ check 消费新结果 → available 态「下载更新」+ 新版号
    updateBtns()[0].click();
    await flush();
    expect(invoke.mock.calls.filter((c) => c[0] === 'check_update').length).toBe(1);
    expect(updateBtns()[0].textContent).toContain('下载更新');
    expect((document.querySelector('.update-modal') as HTMLElement).textContent ?? '').toContain('9.9.9');
    // 也不得出现旧的两步确认对话框
    expect(document.querySelector('.confirm-box')).toBeNull();
    w.unmount();
  });

  it('托盘「检查更新」不自动检查；手动点击失败 → 行进入 error 态「重试」', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [{ available: false, status: 'error' }]; // 所有 check 都失败
    await flush(); // 启动静默检查失败 → 静默，行保持 idle
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 只开弹窗——零自动检查
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    // 零自动检查 → 行保持 idle，无错误文本
    expect(invoke.mock.calls.filter((c) => c[0] === 'check_update').length).toBe(0);
    expect(updateBtns()[0].textContent).toContain('检查更新');
    // 手动点「检查更新」→ 失败 → error 态：原因文本 + 「重试」按钮
    updateBtns()[0].click();
    await flush();
    const row = (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(row).toContain('无法连接更新服务器');
    expect(updateBtns()[0].textContent).toContain('重试');
    w.unmount();
  });

  it('downloading 态托盘「检查更新」→ 只开弹窗，不 re-check（托盘从不自动检查，天然不打断在途流程）', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush(); // 启动静默检查 → available
    trayUpdateHandlers.at(-1)(); // 只开弹窗（零自动检查）
    await flush();
    updateBtns()[0].click(); // 下载更新 → download_update 在途（downloading 态）
    await flush();
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 下载中再点托盘 → 仍只开弹窗
    await flush();
    expect(invoke.mock.calls.some((c) => c[0] === 'check_update')).toBe(false);
    expect(updateBtns()[0].textContent).toContain('下载中');
    w.unmount();
  });

  it('顶栏「有新版本!」点击打开同一 UpdateModal', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    const pill = w.find('.update-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe('有新版本!');
    // hover 提示 = 项目公共 tooltip（data-tooltip + .tip-down 向下定位），原生 title 不保留（2026-09-05-update-pill-tooltip）
    expect(pill.classes()).toContain('tip-down');
    expect(pill.attributes('data-tooltip')).toBe('发现新版本 v9.9.9，点击查看并安装');
    expect(pill.attributes('title')).toBeUndefined();
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
    // busy 态同公共 tooltip（规格 2026-09-05-update-pill-tooltip）
    expect(busy.classes()).toContain('tip-down');
    expect(busy.attributes('data-tooltip')).toBe('下载中 55%，点击查看进度');
    expect(busy.attributes('title')).toBeUndefined();
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

  // 2026-10-05 i18n 响应性（②）：run_update 失败改**结构化返回** { ok:false, errorKey } →
  // 红字存 key、渲染时翻译，切语言即时重译（旧契约经 throw 传译文串 → 渲染端当「不可译原文」透传而冻结）。
  it('run_update 结构化失败（errorKey）→ 行内红字随语言即时重译', async () => {
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
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      if (cmd === 'run_update') return Promise.resolve({ ok: false, errorKey: 'err.update.filesMissing' });
      return Promise.resolve(undefined);
    });
    invoke.mockClear();
    (document.querySelector('.confirm-box .confirm-ok') as HTMLButtonElement).click();
    await flush();
    const rowText = () => (document.querySelector('.update-modal') as HTMLElement).textContent ?? '';
    expect(rowText()).toContain('更新文件缺失');
    expect(document.querySelector('.update-row__error')).not.toBeNull();
    // 切英文 → 同一行红字即时重译为英文（关键回归）
    const { applyLangLocal } = await import('./i18n');
    applyLangLocal('en');
    await nextTick();
    expect(rowText()).toContain('Update files missing');
    applyLangLocal('zh');
    await nextTick();
    expect(rowText()).toContain('更新文件缺失');
    // 失败后 ready 态保持：按钮仍「重启应用」可重试；确认框已复位
    expect(updateBtns()[0].textContent).toContain('重启应用');
    expect(document.querySelector('.confirm-box')).toBeNull();
    w.unmount();
  });

  it('check 失败 → error 态；点「重试」→ 重新 invoke check_update', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [{ available: false, status: 'error' }];
    await flush(); // 启动静默检查失败 → 静默，行保持 idle
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 只开弹窗（零自动检查，行保持 idle）
    await flush();
    expect(updateBtns()[0].textContent).toContain('检查更新');
    // 手动点「检查更新」失败 → error 态：原因文本 + 「重试」按钮
    updateBtns()[0].click();
    await flush();
    expect(updateBtns()[0].textContent).toContain('重试');
    invoke.mockClear();
    updateBtns()[0].click(); // 重试 → 重发 check_update
    await flush();
    expect(invoke.mock.calls.find((c) => c[0] === 'check_update')).toBeDefined();
    w.unmount();
  });

  it('手动点「检查更新」失败 → error 态（托盘只开弹窗，不检查）', async () => {
    const { w, ctrl } = makeUpdateMount();
    // 脚本 2 项：启动静默检查（up-to-date，行保持 idle）/ 手动点击（失败）
    ctrl.checkScript = [
      { available: false, status: 'up-to-date', version: '1.0.0' },
      { available: false, status: 'error' },
    ];
    await flush();
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 只开弹窗（零自动检查，行保持 idle）
    await flush();
    expect(invoke.mock.calls.filter((c) => c[0] === 'check_update').length).toBe(0);
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
    // 脚本 2 项：启动静默检查（available）/ 下载失败后的自动重查（托盘只开弹窗，不检查）
    ctrl.checkScript = [AVAILABLE, { available: false, status: 'up-to-date', version: '1.0.0' }];
    await flush(); // 启动静默 check_update → available
    invoke.mockClear();
    trayUpdateHandlers.at(-1)(); // 只开弹窗（零自动检查）
    await flush();
    const baselineChecks = invoke.mock.calls.filter((c) => c[0] === 'check_update').length; // = 0
    expect(baselineChecks).toBe(0);
    updateBtns()[0].click(); // 下载更新
    ctrl.download.resolve({ ok: false, code: 'no-update-task', reason: '尚无更新任务，请先检查更新' });
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

// 设置（2026-10-01 update-proxy-settings）：托盘「设置」→ SettingsModal（纯 props 驱动，open 由 App 持有）
describe('App tray settings', () => {
  it('tray-settings-request opens settings modal', async () => {
    mountApp();
    await flush();
    expect(traySettingsHandlers.length).toBeGreaterThan(0);
    traySettingsHandlers[0]();
    await flush();
    const title = document.querySelector('.modal-overlay .modal-title');
    expect(title?.textContent).toBe('设置');
  });
});

// GPU 卡片（spec 2026-09-09-gpu-card-design §5，2026-09 挪位）：挂载位置 = .grid 第四列，快捷启动卡右侧（2026-10-10 规格 §4 把快捷启动插到第 3 列，GPU 顺移到第 4 列）
describe('App GPU card mount', () => {
  it('GPU 卡片是网格第四列（顺序契约 左列 dir → launch；列2 template；列3 quick；列4 gpu）', async () => {
    const { w } = mountApp();
    await flush();
    const stacks = w.findAll('.stack');
    expect(stacks.length).toBe(1);
    const leftCards = stacks[0].findAll('.card');
    expect(leftCards.length).toBe(2);
    expect(leftCards[0].find('.module-dir').exists()).toBe(true);
    expect(leftCards[1].find('.module-launch').exists()).toBe(true);
    // 网格直接子级 = 4 项：左列堆叠 / 模板卡 / 快捷启动卡 / GPU 卡（2026-10-10 规格 §4：快捷启动插到第 3 列）
    const grid = w.find('.grid');
    expect(grid.exists()).toBe(true);
    const gridItems = [...(grid.element as HTMLElement).children];
    expect(gridItems.length).toBe(4);
    expect(gridItems[1].querySelector('.module-template')).not.toBeNull();
    expect(gridItems[2].querySelector('.module-quick')).not.toBeNull();
    const gpuEl = gridItems[3].querySelector('.module-gpu') as HTMLElement;
    expect(gpuEl).not.toBeNull();
    expect(gpuEl.querySelector('h2')).toBeNull(); // 卡片 h2「GPU 信息」已删除（用户 2026-09-10：卡名上位到原 h2 行=层顶行）
    // 首帧未到达：占位与数据态位置结构一致（用户 2026-09-10 指定）——标题占位 "–"、四格占位、‹ › 禁用，无圆点
    expect(gpuEl.querySelector('.gpu-title')!.textContent).toBe('–');
    // 只查可见层（两层结构：当前层 0 + 隐藏备用层 1，见 GpuModule 槽位不变量）
    expect([...gpuEl.querySelectorAll('.gpu-layer:not(.gpu-layer--off) .gpu-val')].map((el) => el.textContent)).toEqual(['– / –', '– / –', '– / –', '–']);
    expect(gpuEl.querySelectorAll('.gpu-nav-btn[disabled]').length).toBe(2);
    expect(gpuEl.querySelectorAll('.dot').length).toBe(0);
    w.unmount();
  });

  it('gpu-stats 推送后卡片显示真实数据', async () => {
    const { w } = mountApp();
    await flush();
    const GB = 1073741824;
    gpuStatsHandlers.at(-1)!({ gpus: [{ luid: '0x0000edff_00000000', name: 'NVIDIA GeForce RTX 4090', utilization: 28, dedicatedUsed: 22 * GB, dedicatedTotal: 24 * GB, sharedUsed: 1 * GB, sharedTotal: 48 * GB, dxgiIndex: 0 }] });
    await flush();
    const gpuCard = w.find('.grid > .card:nth-child(4)'); // 第四列直接子级 = GPU 卡（第 3 列已被快捷启动占位）
    expect(gpuCard.find('.module-gpu').exists()).toBe(true);
    expect(gpuCard.find('.gpu-title').text()).toBe('#GPU 0 NVIDIA GeForce RTX 4090');
    expect(gpuCard.findAll('.gpu-val').map((v: any) => v.text())).toContain('22.0 / 24.0 GB');
    w.unmount();
  });
});

// 2026-10-13-grid-fill-width §4.1 + §7 修订（定宽）：网格宽度契约。happy-dom 不加载外部 CSS（先例 LogPanel.test.ts:365）
// → 断 src/style.css 的规则文本 + src-main/main.ts 的默认窗口宽：两者合起来把「不留空」钉成算术。
describe('App 网格宽度契约（2026-10-13-grid-fill-width）', () => {
  const css = readFileSync(join(__dirname, 'style.css'), 'utf-8');
  const gridRule = css.slice(css.indexOf('.grid {'), css.indexOf('.stack {'));
  const tracksRaw = gridRule.match(/grid-template-columns:\s*([^;]+);/)![1].trim();
  // 一条 track 一个 token（不按空白切：将来若出现 minmax(…) 内含空格会被切碎）
  const tracks = tracksRaw.match(/(?:minmax\([^)]*\)|\d+px)/g)!;
  const maxOf = (t: string): number => Math.max(...(t.match(/(\d+(?:\.\d+)?)px/g) ?? []).map((s) => parseFloat(s)));

  it('四列全部定宽：第 3 列 = 380px，无 minmax / fr（规格 §7 修订 / §4.1-1、3）', () => {
    expect(tracksRaw).toBe('280px 350px 380px 330px');
    expect(tracks.length).toBe(4);
    // 定宽语义（用户 2026-10-13 决定：与其它三列一致，不用 minmax）：任何一条 track 既无 minmax 也无 fr
    expect(tracksRaw).not.toMatch(/minmax|\bfr\b/);
  });

  it('四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）', () => {
    const mainSrc = readFileSync(join(__dirname, '..', 'src-main', 'main.ts'), 'utf-8');
    const winW = Number(mainSrc.match(/width:\s*(\d+),\s*height:/)![1]);
    const gap = Number(css.match(/--card-gap:\s*(\d+)px/)![1]);
    // 前提：.layout 的内边距 = --card-gap（可用宽度 = 窗口宽 − 2×gap）
    expect(css.slice(css.indexOf('.layout {'), css.indexOf('.grid {'))).toMatch(/padding:\s*var\(--card-gap\)/);
    expect(tracks.reduce((a, t) => a + maxOf(t), 0) + 3 * gap).toBe(winW - 2 * gap);
  });
});

// ===== Slice 1（2026-09-23-i18n-app-shell-design）：App 外壳 i18n =====
describe('i18n / App 外壳（Slice 1）', () => {
  // S0 记录的坑：./i18n 必须延迟 import（静态 import 会在 vi.mock('./ipc') 注册前绑定真实 ipc）
  async function applyEn(): Promise<void> {

    const { applyLangLocal } = await import('./i18n');
    applyLangLocal('en');
    await nextTick();
  }

  function mountShell(): any {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        default: return Promise.resolve(undefined);
      }
    });
    return mount(App);
  }

  it('winbar 品牌 / GitHub tooltip+aria 随语言切换;三键 aria-label 为静态中文不随语言切', async () => {
    const w = mountShell();
    await flush();
    expect(w.find('.winbar__name').text()).toBe('LMS 启动器');
    const btns = w.findAll('.winbtn');
    expect(btns[0].attributes('data-tooltip')).toBe('GitHub 仓库');
    await applyEn();
    expect(w.find('.winbar__name').text()).toBe('LMS Launcher');
    expect(btns[0].attributes('data-tooltip')).toBe('GitHub repository');
    expect(btns[0].attributes('aria-label')).toBe('GitHub repository');
    // S10: 三键 aria-label 已走 i18n（随语言切换）
    expect(btns[1].attributes('aria-label')).toBe('Minimize');
    expect(btns[2].attributes('aria-label')).toBe('Maximize');
    expect(btns[3].attributes('aria-label')).toBe('Close');
    w.unmount();
  });

  function mountWithUpdate(): any {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.resolve({ available: true, status: 'update-available', version: '9.9.9' });
        default: return Promise.resolve(undefined);
      }
    });
    return mount(App);
  }

  function updateBtns(): HTMLButtonElement[] {
    return [...document.querySelectorAll('.update-modal .btn-primary')] as HTMLButtonElement[];
  }

  it('更新 pill available 态英文最短文案 + tooltip', async () => {
    const w = mountWithUpdate();
    await flush();
    await applyEn();
    const pill = w.find('.update-pill');
    expect(pill.text()).toBe('New version!');
    expect(pill.attributes('data-tooltip')).toBe('Version 9.9.9 available, click to view and install');
    w.unmount();
  });

  it('更新 pill downloading 态英文只显示百分比 + tooltip', async () => {
    const w = mountWithUpdate();
    await flush();
    await applyEn();
    updateProgressHandlers.at(-1)!({ pct: 55 });
    await nextTick();
    const busy = w.find('.update-pill--busy');
    expect(busy.text()).toBe('55%');
    expect(busy.attributes('data-tooltip')).toBe('Downloading 55%, click to view progress');
    w.unmount();
  });

  it('退出确认框 title/message 随语言即时重译', async () => {
    const w = mountShell();
    await flush();
    trayHandlers.at(-1)!(); // 托盘「退出」→ 打开确认框
    await nextTick();
    expect(document.querySelector('.confirm-box')!.textContent).toContain('退出程序');
    // S9：按钮文本与 aria 走 common.cancel / common.confirm
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).textContent).toBe('取消');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).textContent).toBe('退出');
    await applyEn();
    await flush();
    const box = document.querySelector('.confirm-box') as HTMLElement;
    expect(box.textContent).toContain('Exit');
    expect(box.textContent).toContain('llama-server will be stopped. Continue?');
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).textContent).toBe('Cancel');
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).getAttribute('aria-label')).toBe('Cancel');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).textContent).toBe('Exit');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).getAttribute('aria-label')).toBe('Exit');
    w.unmount();
  });

  it('S8：弹窗行名走 app.brand；检查失败 errorText 为英文短句', async () => {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.reject(new Error('net down'));
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App);
    await flush();
    await applyEn(); // Apply English BEFORE triggering the check
    trayUpdateHandlers.at(-1)!(); // 托盘「检查更新」→ 打开弹窗（不自动检查）
    await nextTick();
    updateBtns()[0].click(); // 手动「检查更新」→ reject
    await flush();
    expect(document.querySelector('.update-modal .update-row__name')?.textContent?.trim()).toBe('LMS Launcher');
    expect(document.querySelector('.update-modal .update-row__error')?.textContent?.trim()).toBe('Update check failed. Try again.');
    w.unmount();
  });

  it('LMS 行错误红字：失败时中文 → 切英文后即时重译（i18n 响应性，2026-10-05）', async () => {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.reject(new Error('net down'));
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App);
    await flush();
    trayUpdateHandlers.at(-1)!(); // 托盘「检查更新」→ 开弹窗（不自动检查）
    await nextTick();
    updateBtns()[0].click(); // 手动「检查更新」→ reject → 按当次语言落库
    await flush();
    const err = () => document.querySelector('.update-modal .update-row__error')?.textContent?.trim();
    expect(err()).toBe('检查更新时发生未知错误，请稍后重试。');
    await applyEn(); // 切英文：同一个红字节点应即时重译为英文
    expect(err()).toBe('Update check failed. Try again.');
    w.unmount();
  });

  it('S8：无法连接 / 开发模式 errorText 为英文短句', async () => {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.resolve({ available: false, status: 'error' });
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App);
    await flush();
    await applyEn();
    trayUpdateHandlers.at(-1)!();
    await nextTick();
    updateBtns()[0].click();
    await flush();
    expect(document.querySelector('.update-modal .update-row__error')?.textContent?.trim()).toBe('Update server unreachable.');
    w.unmount();
  });
});

// ===== 任务 6：快捷启动 IPC 接线（计划 :266-274）=====
// 前两条断言逐字照计划 :269-273。本文件顶部的 vi.mock('./ipc') 会接管 './ipc'，
// 只断 mock 里的键就成了自证，所以再加一条走 vi.importActual 的**真实模块**断言（E1）。
describe('快捷启动 IPC 封装（任务 6）', () => {
  it('ipc 模块导出终端相关封装', async () => {
    const mod = await import('./ipc');
    expect(typeof mod.onQlData).toBe('function');
    expect(typeof mod.onQlExit).toBe('function');
    const real = await vi.importActual<typeof import('./ipc')>('./ipc');
    expect(typeof real.onQlData).toBe('function');
    expect(typeof real.onQlExit).toBe('function');
  });
});


// ===== 任务 13：App 接线（四列布局 / 终端页签数据路由 / 重载复原）=====
// 索引 M9：本文件 :33-34 登记的 qlDataHandlers / qlExitHandlers 由这一段驱动（任务 6 只登记不驱动）。
// xterm 与三个 addon 一律打桩（规格 §12.5 / 计划 全局约束）：App 级只测接线，真实渲染不在单测范围。
// happy-dom 无布局：原型级 offsetWidth/offsetHeight 覆写 = 「页签可见」，假 FitAddon 固定给出 118×41
// （与 TerminalTabView.test.ts 同一手法），于是「挂载首报 + 上层强制重报」两条尺寸路径都可观察。
const xh = vi.hoisted(() => {
  const state: { terms: any[]; fitCalls: number; proposed: { cols: number; rows: number } } = {
    terms: [], fitCalls: 0, proposed: { cols: 118, rows: 41 },
  };
  class FakeTerminal {
    cols = 80; rows = 24; written: string[] = []; focusCalls = 0; disposed = false;
    // 构造参数挂到实例（票 #13）：配色快照是否真的落到终端上，要看 new Terminal 的 theme
    options: Record<string, unknown> = {};
    constructor(options: unknown) { state.terms.push(this); this.options = { ...(options as object) }; }
    open(): void { /* 真实渲染不在范围 */ }
    loadAddon(addon: any): void { if (addon && typeof addon.activate === 'function') addon.activate(this); }
    write(data: string): void { this.written.push(data); }
    paste(): void {} clear(): void {}
    focus(): void { this.focusCalls += 1; }
    dispose(): void { this.disposed = true; }
    getSelection(): string { return ''; }
    onData(): { dispose: () => void } { return { dispose: () => {} }; }
    onResize(): { dispose: () => void } { return { dispose: () => {} }; }
    attachCustomKeyEventHandler(): void {}
  }
  class FakeFitAddon {
    term: any = null;
    activate(term: any): void { this.term = term; }
    dispose(): void {}
    proposeDimensions(): { cols: number; rows: number } { return { ...state.proposed }; }
    fit(): void {
      state.fitCalls += 1;
      if (this.term) { this.term.cols = state.proposed.cols; this.term.rows = state.proposed.rows; }
    }
  }
  class FakeSearchAddon {
    activate(): void {} dispose(): void {}
    onDidChangeResults(): { dispose: () => void } { return { dispose: () => {} }; }
    findNext(): boolean { return true; }
    findPrevious(): boolean { return true; }
    clearDecorations(): void {}
  }
  class FakeWebLinksAddon { constructor(_handler: unknown) {} activate(): void {} dispose(): void {} }
  return { state, FakeTerminal, FakeFitAddon, FakeSearchAddon, FakeWebLinksAddon };
});
vi.mock('@xterm/xterm', () => ({ Terminal: xh.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xh.FakeFitAddon }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: xh.FakeSearchAddon }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: xh.FakeWebLinksAddon }));

// afterEach 不在文件顶部的 import 里（既有一字不改）：按同一模块取函数引用，只在下面的 describe 内注册
const { afterEach: afterEachQl } = await import('vitest');

// 两条配置：c1 = shell（有终端页签）、c2 = exe（无页签，只变红按钮）。E3/E7 的分流依据是 ql_list 的 type
const QL_ITEMS = {
  c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd' },
  c2: { name: '记事本', type: 'exe', exe: 'notepad.exe' },
};

function qlRowBtn(w: any, index: number): any {
  const rows = w.findAll('.module-quick .tpl-row');
  expect(rows.length).toBe(2); // 行序 = ql_list 的键序（卡片侧契约，任务 11）
  return rows[index].find('.btn');
}
function tabIds(w: any): string[] {
  return w.findAll('.log-tab').map((b: any) => b.attributes('data-tab-id') ?? '');
}
function tabClose(w: any, id: string): any {
  return w.find(`.log-tab[data-tab-id="${id}"] .btn-close-tab`);
}
// 终端工具条最右那颗进程态按钮（2026-10-20 用户要求两步：[x] → [停止]，停完变 [重新启动]）：
// 挂在页签面板上，不是页签条上（页签条那颗是 tabClose）
function tabState(w: any, id: string): any {
  return w.find(`.log-pane[data-tab-id="${id}"] .btn-term-state`);
}
function tabLabel(w: any, id: string): string {
  return w.find(`.log-tab[data-tab-id="${id}"] .log-tab-label`).text();
}
function qlInvokes(cmd: string): unknown[][] {
  return invoke.mock.calls.filter((c) => c[0] === cmd).map((c) => c.slice(1));
}
function termWrites(): string[] {
  return xh.state.terms.flatMap((t: any) => t.written);
}

// startTabId = ql_start 的返回（exe 配置 = null）。停止/启动都即时 resolve：本段不测在途态
function mountQl(over: {
  states?: Record<string, { running: boolean; stopping: boolean }>;
  items?: Record<string, unknown>;
  startTabId?: string | null;
} = {}) {
  const items = over.items ?? QL_ITEMS;
  const states = over.states ?? {};
  let startTabId: string | null = over.startTabId === undefined ? 'ql:c1' : over.startTabId;
  invoke.mockImplementation((cmd: string): Promise<unknown> => {
    switch (cmd) {
      case 'get_state': return Promise.resolve(READY);
      case 'get_configs': return Promise.resolve(cfg());
      case 'ql_list': return Promise.resolve({ items, invalid: [] });
      case 'ql_states': return Promise.resolve(states);
      case 'ql_start': return Promise.resolve({ tabId: startTabId });
      case 'ql_stop': return Promise.resolve(undefined);
      default: return Promise.resolve(undefined);
    }
  });
  const w = mount(App) as import('@vue/test-utils').VueWrapper<any>;
  return { w, setStartTabId: (v: string | null): void => { startTabId = v; } };
}

describe('App 快捷启动接线（任务 13 · E1-E9）', () => {
  const realResizeObserver = globalThis.ResizeObserver;
  beforeEach(() => {
    invoke.mockClear(); // 文件级 vi.fn()：不清则本段的按次断言会读到前面用例的调用
    Object.assign(xh.state, { terms: [], fitCalls: 0, proposed: { cols: 118, rows: 41 } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
    class FakeRO { constructor(_cb: unknown) {} observe(): void {} unobserve(): void {} disconnect(): void {} }
    globalThis.ResizeObserver = FakeRO as unknown as typeof ResizeObserver;
  });
  afterEachQl(() => {
    globalThis.ResizeObserver = realResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 0 });
  });

  // E1（计划 步骤 1）：按 tabId 派发；未知 tabId 忽略、不抛错（防竞态）
  it('ql_data_dispatches_to_registered_sink_and_ignores_unknown_tab_id', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 点卡片的 [启动]
    await flush();
    expect(xh.state.terms.length).toBe(1); // 页签已建 → 它的 sink 已注册
    qlDataHandlers.at(-1)!({ tabId: 'ql:c1', data: 'hello' });
    qlDataHandlers.at(-1)!({ tabId: 'ql:nope', data: 'ghost' });
    await flush();
    expect(xh.state.terms[0].written).toContain('hello');
    expect(termWrites()).not.toContain('ghost');
    w.unmount();
  });

  // E2（规格 §7.5）：ql-exit → 运行态清空、按钮回落，页签保留（用户决策）
  it('ql_exit_clears_running_state_but_keeps_tab', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(qlRowBtn(w, 0).classes()).toContain('btn-danger'); // 运行中：红 [停止]
    qlExitHandlers.at(-1)!({ configId: 'c1', code: 0 });
    await flush();
    expect(qlRowBtn(w, 0).classes()).toContain('btn-launch'); // 按钮回落 [启动]
    expect(tabIds(w)).toContain('ql:c1');                     // 页签保留
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeUndefined(); // 已退出 → [x] 可用
    w.unmount();
  });

  // E3（规格 §7.6 / 索引 K11(2)(5)）：只给 shell 建空页签；历史不回放；复原路径发一次尺寸
  it('on_mounted_rebuilds_empty_tabs_for_running_shell_configs_only', async () => {
    const { w } = mountQl({ states: { c1: { running: true, stopping: false }, c2: { running: true, stopping: false } } });
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    expect(tabIds(w)).not.toContain('ql:c2'); // states() 不区分 shell/exe → 必须 join ql_list 的 type
    expect(termWrites()).toEqual([]);         // 空页签：历史不回放
    // 挂载首报（K11(2)）+ 复原路径的显式强制重报（K24(1)）= 两次；缺后者即「复原不发尺寸」
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41], ['c1', 118, 41]]);
    expect(qlInvokes('ql_write')).toEqual([]);
    w.unmount();
  });

  // E4（计划 步骤 1 / 审查重点 R3）：停止后 [x] 由禁用变可用
  it('stop_makes_tab_close_button_enabled', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(tabClose(w, 'ql:c1').exists()).toBe(true);
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeDefined(); // 运行中禁用
    await qlRowBtn(w, 0).trigger('click'); // 红 [停止]
    await flush();
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeUndefined(); // 停止后可关
    expect(tabIds(w)).toContain('ql:c1'); // 停止不关页签（规格 §7.5）
    w.unmount();
  });

  // 2026-10-20 用户要求两步：工具条最右那颗由 [x] 换成 [停止]，停完之后就地变 [重新启动]，
  // 点它 = 列表行那颗 [启动]。钉住整条链：页签里 [停止] → ql_stop → 卡片行同步回落 [启动] → 页签保留 →
  // 那颗转成 [重新启动] → 点它 → ql_start → 行按钮同步变红、页签不重复建、页签 [x] 重新禁用（运行中）。
  it('toolbar_state_button_stops_then_becomes_restart_and_starts_again', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签
    await flush();
    const stop = tabState(w, 'ql:c1');
    expect(stop.exists()).toBe(true);
    expect(stop.attributes('aria-label')).toBe('停止');
    expect(stop.attributes('disabled')).toBeUndefined();      // 运行中 → 可点
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeDefined(); // 运行中页签 [x] 仍禁用（R3）
    await stop.trigger('click');
    await flush();
    expect(qlInvokes('ql_stop')).toEqual([['c1']]);            // 与列表行同一个出口
    expect(qlRowBtn(w, 0).classes()).toContain('btn-launch');  // 列表行同步回落 [启动]
    expect(tabIds(w)).toContain('ql:c1');                      // 停止不关页签（§7.5）
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeUndefined();
    // 停完：同一颗就地变 [重新启动]（用户点名的「不用回列表找那一行」）
    const restart = tabState(w, 'ql:c1');
    expect(restart.attributes('aria-label')).toBe('重新启动');
    expect(restart.find('svg[data-icon="arrow-rotate-right"]').exists()).toBe(true);
    expect(restart.attributes('disabled')).toBeUndefined();
    await restart.trigger('click');
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1'], ['c1']]);   // 与列表行 [启动] 同一个出口（doQlStart）
    expect(qlRowBtn(w, 0).classes()).toContain('btn-danger');   // 列表行同步变红 [停止]
    expect(tabIds(w).filter((id) => id === 'ql:c1').length).toBe(1); // 同一页签再次启动，不重复建
    expect(tabState(w, 'ql:c1').attributes('aria-label')).toBe('停止'); // 起来之后又回到 [停止]
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeDefined();  // 运行中 [x] 重新禁用（R3）
    w.unmount();
  });

  // 负向门（2026-10-20）：工具条不再渲染 [x]；进程自己退出后那颗是 [重新启动]（不是「禁用的停止」）
  it('toolbar_has_no_close_button_and_offers_restart_after_process_exit', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(w.find('.log-pane[data-tab-id="ql:c1"] .btn-close-tab').exists()).toBe(false);
    qlExitHandlers.at(-1)!({ configId: 'c1', code: 0 });       // 进程自己退出 → 运行态清空、页签保留
    await flush();
    const btn = tabState(w, 'ql:c1');
    expect(btn.attributes('aria-label')).toBe('重新启动');
    expect(btn.attributes('disabled')).toBeUndefined();
    expect(tabClose(w, 'ql:c1').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  // restartDisabled（App 的 qlConfigs 只读镜像查不到该条）：那颗禁用，对着不存在的配置点重启
  // 不该发出 ql_start。票 #16 之后「删掉已停止的条目」直接关掉页签，这条只剩真实可达的那扇窗：
  // 条目从镜像里消失、进程还在跑 → R3 不关页签（关了会留孤儿 PTY）；进程退出后页签照 §7.5 保留，
  // 那颗转成 [重新启动] 并被禁用。删配置这件事本身仍只有「已停止」才做得到（弹窗 [删除] 禁用）。
  it('restart_is_disabled_when_the_config_disappears_under_a_running_process', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签
    await flush();
    // 条目从只读镜像里消失（ql_list 变空 + 卡片冒泡 changed），进程仍在跑
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: {}, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    expect(tabIds(w)).toContain('ql:c1');                    // R3：运行中不关页签（票 #16 的守卫）
    qlExitHandlers.at(-1)!({ configId: 'c1', code: 0 });      // 进程自己退出 → 页签保留（§7.5）
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    const btn = tabState(w, 'ql:c1');
    expect(btn.attributes('aria-label')).toBe('重新启动');
    expect(btn.attributes('disabled')).toBeDefined();         // 镜像里已查不到这条
    await btn.trigger('click');
    expect(qlInvokes('ql_start')).toEqual([['c1']]);           // 只有开头那次，重启没发出
    w.unmount();
  });

  // E5（规格 §9.2/§9.3 / 索引 K27(1) K24(1)）：建页签 + 真回写激活 + fit + 聚焦；
  // 两条尺寸路径分别钉：普通激活不重发（去重），同一页签再次启动必须重发一次
  it('start_success_creates_tab_activates_it_and_calls_fit_focus', async () => {
    const { w } = mountQl();
    await flush();
    expect(tabIds(w)).toEqual(['launcher', 'llama-server']); // 未启动：只有静态两页签
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    const tab = w.find('.log-tab[data-tab-id="ql:c1"]');
    expect(tab.classes()).toContain('active');          // 自动激活：状态归 App 且真回写
    expect(tab.attributes('aria-selected')).toBe('true');
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41]]); // 只有挂载首报；激活路径的 fit() 被去重吞掉
    expect(xh.state.terms[0].focusCalls).toBeGreaterThan(0);   // 聚焦
    // 同一页签再次启动：主进程把 PTY 重建为 80×24，尺寸没变也必须重报 → 显式 fit(true)
    await qlRowBtn(w, 0).trigger('click'); // 停止
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 再启动
    await flush();
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41], ['c1', 118, 41]]);
    expect(tabIds(w).filter((id) => id === 'ql:c1').length).toBe(1); // 已存在不重复建
    w.unmount();
  });

  // E6（规格 §7.5）：close → 删页签 + 注销 sink；running || stopping 时不触发
  it('tab_close_removes_tab_and_unregisters_sink', async () => {
    const { w } = mountQl();
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    await tabClose(w, 'ql:c1').trigger('click'); // 运行中：点了也不关
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    await qlRowBtn(w, 0).trigger('click'); // 停止
    await flush();
    await tabClose(w, 'ql:c1').trigger('click');
    await flush();
    expect(tabIds(w)).not.toContain('ql:c1');
    const before = termWrites().length;
    qlDataHandlers.at(-1)!({ tabId: 'ql:c1', data: 'after-close' });
    await flush();
    expect(termWrites().length).toBe(before); // sink 已注销
    w.unmount();
  });

  // 票 #16：删除条目 → 它的终端页签连带关闭。旧行为 = 页签留在原地、带着 restartDisabled
  // 变成「再也启动不了的东西」（changed 只刷配置镜像）。两条对照一起钉：
  // ① 停止 ≠ 删除 —— 页签仍保留（§7.5「进程退出 → 页签保留」的用户决策不变）；
  // ② 关的是那条页签本身：它的 sink 注销，迟到的 ql_data 没有落点。
  it('deleting_the_config_closes_its_terminal_tab', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    await qlRowBtn(w, 0).trigger('click'); // 停止 → 页签保留（对照：不是任何状态变化都关页签）
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    // 卡片那条删除路径：弹窗 [确认] → ql_delete → reload → changed → App 的镜像里查不到 c1
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: { c2: QL_ITEMS.c2 }, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    expect(tabIds(w)).not.toContain('ql:c1');   // 页签连带关闭
    const before = termWrites().length;
    qlDataHandlers.at(-1)!({ tabId: 'ql:c1', data: 'late output' });
    await flush();
    expect(termWrites().length).toBe(before);   // 走的仍是 [x] 那条既有路径：sink 已注销
    w.unmount();
  });

  // 票 #16 的对照面：关掉的是「镜像里查不到」那一条，而不是每次 changed 就清场。
  // 两条 shell 各开一块终端 → 删掉其中一条 → 另一条的页签、终端实例、sink 全都不动。
  it('deleting_one_config_leaves_the_other_terminal_tabs_alone', async () => {
    const items = {
      c1: { name: '甲终端', type: 'shell', shell: 'cmd', cmd: 'cmd' },
      c3: { name: '乙终端', type: 'shell', shell: 'cmd', cmd: 'cmd' },
    };
    const { w, setStartTabId } = mountQl({ items, startTabId: 'ql:c1' });
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 c1 → 建页签
    await flush();
    setStartTabId('ql:c3');
    await qlRowBtn(w, 1).trigger('click'); // 启动 c3 → 建另一块
    await flush();
    expect(tabIds(w)).toEqual(['launcher', 'llama-server', 'ql:c1', 'ql:c3']);
    await qlRowBtn(w, 0).trigger('click'); // 停止 c1（只有已停止的条目删得掉）
    await flush();
    await qlRowBtn(w, 1).trigger('click'); // 停止 c3
    await flush();
    expect(xh.state.terms.length).toBe(2);
    // 只删 c1：ql_list 里从此只剩 c3
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: { c3: items.c3 }, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    expect(tabIds(w)).toEqual(['launcher', 'llama-server', 'ql:c3']); // 只关被删那条
    const before = termWrites().length;
    qlDataHandlers.at(-1)!({ tabId: 'ql:c3', data: 'still here' });
    await flush();
    expect(termWrites().length).toBe(before + 1);                     // 另一块的 sink 仍在线
    expect(xh.state.terms.length).toBe(2);                            // 也没被重建（终端实例不动）
    w.unmount();
  });

  // 票 #16 的守卫面：一次 ql_list 失败不等于「条目被删」。镜像刷不动 → 页签也不动
  // （否则主进程抖一下就把用户正在看的终端关掉）
  it('a_failed_ql_list_refresh_closes_no_terminal_tab', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 停止 → 页签保留、可删
    await flush();
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.reject(new Error('IO: 读取失败')) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    expect(tabIds(w)).toContain('ql:c1');   // 读取失败：既没刷掉镜像，也就没关掉页签
    w.unmount();
  });

  // 票 #16 的界面门：删掉的正是「当前在看」的那块终端 → 面板不留空白。
  // 激活态归 App（受控 v-model:active），回落靠 LogPanel 的 watch(items) 冒 update:active ——
  // 本用例钉的是这条链在「非点击、由 App 自己摘掉页签」时同样生效。
  it('deleting_the_active_tab_falls_the_panel_back_to_the_first_tab', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签 + 自动激活
    await flush();
    expect(w.find('.log-tab[data-tab-id="ql:c1"]').classes()).toContain('active');
    await qlRowBtn(w, 0).trigger('click'); // 停止 → 这条才删得掉
    await flush();
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: { c2: QL_ITEMS.c2 }, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    expect(tabIds(w)).not.toContain('ql:c1');
    const actives = w.findAll('.log-tab').filter((b: any) => b.classes().includes('active'));
    expect(actives.length).toBe(1);
    expect(actives[0].attributes('data-tab-id')).toBe('launcher'); // 回落第一页签，不留空白面板
    w.unmount();
  });

  // E7（规格 §7.5）：exe 启动返回 tabId = null → 不建页签，只有按钮变红；也不发 write/resize（M8）
  it('exe_start_with_null_tab_id_creates_no_tab_only_red_button', async () => {
    const { w } = mountQl({ startTabId: null });
    await flush();
    await qlRowBtn(w, 1).trigger('click'); // c2 = exe
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c2']]);
    expect(tabIds(w)).toEqual(['launcher', 'llama-server']); // 不建页签
    expect(qlRowBtn(w, 1).classes()).toContain('btn-danger'); // 只按钮变红
    expect(qlInvokes('ql_resize')).toEqual([]);
    expect(qlInvokes('ql_write')).toEqual([]);
    w.unmount();
  });

  // E8（索引 K14(2) / K34(5) + 修复轮 B · I-2）：启动在途（最坏 ≈9s 的终端探测）必须有界面反馈。
  // 【本轮明示的契约变更】原断言「在途期间按钮既没变红也没禁用」是任务 13 修复轮的特征化快照、不是需求；
  // 现在 doQlStart 在 invoke('ql_start') 之前置 { running: true, stopping: true }，按钮走既有的
  // 「正在停止」视觉语言（红底 + 半角三点 + 禁用；QuickLaunch.vue:171 与 LaunchBar.vue:129 逐字一致，索引 K30(1)）。
  // 单飞断言保留：在途期间重复点击只发一次 ql_start（去掉 App.vue:448 的 qlStarting 守卫或去掉
  // doQlStart 的前置状态，本用例都必须红）。另钉「在途反馈 ≠ 永久禁用」：结束后同一行照常再启动。
  it('start_button_is_single_flight_while_ql_start_pending', async () => {
    const { w } = mountQl();
    // 只把 ql_start 换成挂住的 promise，其余路由沿用 mountQl 的实现（不另起 harness）
    const gate = Promise.withResolvers<{ tabId: string | null }>();
    const route = invoke.getMockImplementation()!;
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_start' ? gate.promise : route(cmd, ...args));
    await flush();
    expect(qlRowBtn(w, 0).classes()).toContain('btn-launch');
    await qlRowBtn(w, 0).trigger('click'); // 第一次点 [启动]
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1']]);
    // 在途：红底 + 半角三点 + 禁用（I-2 的界面反馈）。点击仍到 App：单飞守卫照旧拦得住
    const busy = qlRowBtn(w, 0);
    expect(busy.classes()).toContain('btn-danger');
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.text()).toBe('...');
    await qlRowBtn(w, 0).trigger('click');
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1']]); // 单飞：在途期间不再发
    gate.resolve({ tabId: 'ql:c1' });
    await flush();
    expect(tabIds(w)).toContain('ql:c1'); // 第一次点击的结果照常生效
    expect(qlRowBtn(w, 0).classes()).toContain('btn-danger');
    expect(qlRowBtn(w, 0).attributes('disabled')).toBeUndefined(); // 在途结束 → 红 [停止] 可点
    await qlRowBtn(w, 0).trigger('click'); // 停止
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 第三次点同一行 [启动]：不是永久禁用
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1'], ['c1']]);
    w.unmount();
  });

  // I-2 正对照（修复轮 B）：ql_start 失败（reject）→ 前置的「正在停止」态必须回落，
  // 按钮回到绿 [启动] 且可点、不建页签（否则卡在「...」里：既停不掉也再启动不了）。
  // 失败分支由 App.vue doQlStart 的 catch → clearQlState 兜住（既有代码，本轮不新增文案）。
  it('ql_start_rejection_falls_back_to_enabled_start_button', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_start' ? Promise.reject(new Error('STATE: 终端不可用')) : route(cmd, ...args));
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1']]);
    const btn = qlRowBtn(w, 0);
    expect(btn.classes()).toContain('btn-launch');                 // 回落绿 [启动]
    expect(btn.attributes('disabled')).toBeUndefined();            // 不是卡在禁用的「...」
    expect(btn.text()).not.toBe('...');
    expect(tabIds(w)).toEqual(['launcher', 'llama-server']);       // 失败不建页签
    // 失败后同一行还能再点（不是永久禁用）：仍 reject，只钉请求确实又到达了 App
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(qlInvokes('ql_start').length).toBe(2);
    w.unmount();
  });

  // Minor 2（修复轮 B）：页签名在建页签时随页签存一份，不再每次回查 qlConfigs 只读镜像。
  // 旧实现（`qlConfigs[id]?.name || tab.configId`）在镜像查不到该项时把页签名退化成配置 id。
  // 票 #16 之后这条只在「进程还在跑」那扇窗里可观察：删掉已停止的条目会连带关掉页签（见上面那条
  // deleting_… 用例），运行中的条目本来就删不掉，所以这里钉的是条目从镜像里消失、页签因 R3 留着时，
  // 文案仍是建页签那一刻存下的那份。手法不变：卡片冒泡 changed → App.refreshQlConfigs 把镜像刷空。
  it('tab_label_keeps_the_entry_name_when_the_config_disappears', async () => {
    const { w } = mountQl();
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签，文案 = ql_list 里的「我的终端」
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    expect(tabLabel(w, 'ql:c1')).toBe('我的终端');

    // 条目从只读镜像里消失：ql_list 变空 + 卡片冒泡 changed
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: {}, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();

    expect(tabIds(w)).toContain('ql:c1');            // 进程在跑 → R3 不关页签（票 #16 的守卫）
    expect(tabLabel(w, 'ql:c1')).toBe('我的终端');   // 不是 'c1'
    w.unmount();
  });

  // ── 票 #13 · 终端配色（tracer bullet 在 App 层的门）──
  // yaml 里 terminal_palette: charcoal 的条目 → 建页签时取一次快照 → 一路落到那块终端。
  // 两个观察点：① App 造给 LogPanel 的页签条目带 palette（透传链）；② 假 xterm 的构造参数 theme
  // 就是表里 charcoal 那一行（配色真的着色到画布，不是只停在 prop 上）。
  it('terminal_palette_snapshot_from_the_config_reaches_the_terminal', async () => {
    const { w } = mountQl({ items: { c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd', admin: false, terminal_palette: 'charcoal' }, c2: QL_ITEMS.c2 } });
    await flush();
    await qlRowBtn(w, 0).trigger('click'); // 启动 → 建页签（此刻取快照）
    await flush();
    const tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((t) => t.id === 'ql:c1')?.palette).toBe('charcoal');
    expect(xh.state.terms.length).toBe(1);
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['charcoal'].theme);
    w.unmount();
  });

  // ADR 0002 三分口径的第三瓣「条目被删 → 页签冻结在最后一档、不回落默认档」——与上面那条页签名用例同一
  // 手法：条目从镜像里消失（changed → 镜像刷空）→ 页签那份配色不动（对齐只处理「镜像里还在」的条目）。
  // 对照 = 票 #18 的 saved_palette_change_reaches_the_open_terminal_tab：条目**还在**、只换了一档。
  // 票 #16 之后「删掉已停止的条目」会连带关页签，所以这里同样取进程还在跑、R3 不关页签的那扇窗。
  it('tab_keeps_its_palette_snapshot_when_the_config_disappears', async () => {
    const { w } = mountQl({ items: { c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd', admin: false, terminal_palette: 'charcoal' }, c2: QL_ITEMS.c2 } });
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(xh.state.terms.length).toBe(1);
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: {}, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();
    const tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    const tab = tabs.find((t) => t.id === 'ql:c1');
    expect(tab?.palette).toBe('charcoal');            // 不是回落到 paper（那需要回查已刷空的镜像）
    expect(tab?.restartDisabled).toBe(true);          // 对照：镜像确实已经查不到这条了
    expect(xh.state.terms.length).toBe(1);            // 换 prop 不重建终端：仍是那一个实例
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme.background).toBe(TERM_PALETTES['charcoal'].theme.background);
    w.unmount();
  });

  // 页签工具条 / 弹窗选档（票 #14 / #15 的触发点）→ LogPanel 冒泡 palette(id, 档) → App 两件事：
  // 走窄通道 ql_set_palette（configId + 档，**不是** ql_save），并把这一条页签的快照改掉（prop 变 → 整对象换 theme）。
  it('palette_event_from_a_tab_writes_the_narrow_channel_and_updates_that_tab_snapshot', async () => {
    const { w } = mountQl(); // 夹具不带 terminal_palette → 快照 = 表里默认档（termPaletteOf 的回落）
    await flush();
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    const lp = w.findComponent(LogPanel);
    expect((lp.props('tabs') as Array<Record<string, unknown>>).find((t) => t.id === 'ql:c1')?.palette).toBeUndefined();
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['paper'].theme);
    lp.vm.$emit('palette', 'ql:c1', 'campbell');
    await flush();
    expect(qlInvokes('ql_set_palette')).toEqual([['c1', 'campbell']]); // 只发窄通道这一条
    expect(qlInvokes('ql_save')).toEqual([]);                          // 不得用整条覆盖的 ql_save 改配色
    const tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((t) => t.id === 'ql:c1')?.palette).toBe('campbell');
    expect(xh.state.terms.length).toBe(1);                             // 仍是同一个终端实例
    w.unmount();
  });

  // ── 票 #15 · 弹窗 [配色] 一行的 hover 预览（App 才是决策者）──
  // 弹窗只报「这条配置正在预览哪一档 / 移开了(null)」；App 判有没有对应的终端页签：
  // 有 → 把临时预览挂到**那条页签**上（一路落到 theme），没有 → 什么都不做（弹窗那一行自己显示说明文案）。
  // 全程不落盘：预览期间零 ql_set_palette / ql_save（落盘只有「保存」与「浮层点击」两条路，票 #13/#14 的门不变）。
  it('modal_palette_hover_previews_on_the_matching_terminal_tab_only', async () => {
    const { w } = mountQl({ items: { c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd', admin: false, terminal_palette: 'paper' }, c2: QL_ITEMS.c2 } });
    await flush();
    await qlRowBtn(w, 0).trigger('click');   // 启动 → 建页签 ql:c1（快照 = paper）
    await flush();
    expect(xh.state.terms.length).toBe(1);
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['paper'].theme);
    const ql = w.findComponent(QuickLaunch);
    ql.vm.$emit('paletteHover', 'c1', 'campbell');
    await flush();
    let tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((x) => x.id === 'ql:c1')?.palettePreview, '预览没挂到那条页签上').toBe('campbell');
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['campbell'].theme);
    expect(xh.state.terms.length).toBe(1);                       // 预览不重建终端（ADR:15）
    expect(qlInvokes('ql_set_palette'), 'hover 预览去写盘了').toEqual([]);
    expect(qlInvokes('ql_save'), 'hover 预览走了整条覆盖的 ql_save').toEqual([]);
    ql.vm.$emit('paletteHover', 'c1', null);
    await flush();
    tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((x) => x.id === 'ql:c1')?.palettePreview, '移开之后预览残留盖在页签上').toBeUndefined();
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['paper'].theme);
    expect(tabs.find((x) => x.id === 'ql:c1')?.palette, '预览把那条页签的快照改了（预览不改快照）').toBe('paper');
    w.unmount();
  });

  // 没有终端页签的配置（exe 条目、或页签还没建 / 已关）：hover 什么都不改 —— 不给不存在的页签造预览态，
  // 也不刷任何一条既有页签（弹窗那一行照常显示说明文案，这是它的唯一反馈）。
  it('modal_palette_hover_without_a_terminal_tab_changes_nothing', async () => {
    const { w } = mountQl({ states: {} });   // 不启动 → 只有两个静态文本页签，没有 ql: 页签
    await flush();
    const before = JSON.stringify(w.findComponent(LogPanel).props('tabs'));
    const ql = w.findComponent(QuickLaunch);
    ql.vm.$emit('paletteHover', 'c1', 'campbell');   // 有这条配置，但没有它的终端页签
    ql.vm.$emit('paletteHover', 'c2', 'charcoal');   // exe 条目：压根没有终端
    ql.vm.$emit('paletteHover', 'no-such-config', 'warm-night');
    await flush();
    const tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(JSON.stringify(tabs), '没有终端页签的 hover 改了页签条目').toBe(before);
    expect(tabs.some((x) => 'palettePreview' in x), '给没有终端的页签造了预览字段').toBe(false);
    expect(qlInvokes('ql_set_palette')).toEqual([]);
    expect(qlInvokes('ql_save')).toEqual([]);
    w.unmount();
  });

  // ── 票 #18 · 条目落盘的档变了 → 该条目正开着的页签当场跟着换（读侧对齐）──
  // 用户 2026-10-23 的直觉：「这条条目的配色 = 这条条目的终端的样子」。旧行为 = 页签那份档是建页签
  // 那一刻的快照，弹窗 [保存] 之后只有关掉页签或 F5 才跟上（就地 [重新启动] 也不换）。
  // 手法沿用上面两条：卡片冒泡 changed → App.refreshQlConfigs 重读 ql_list；差别是这次镜像里**还在**
  // 那条条目、只换了 terminal_palette 一档（对照：条目从镜像里消失那一扇窗见 tab_keeps_its_palette_snapshot）。
  // 一次钉死四条判据：① 页签条目的 palette 变新档；② 那块画布真的换色（theme 逐值 = 新档那一行）；
  // ③ 终端与进程都不动（同一个实例、屏上历史还在、ql_start 只发过最初那一次 —— ADR 0001:15）；
  // ④ 读侧对齐不写盘（零 ql_save / ql_set_palette）。
  it('saved_palette_change_reaches_the_open_terminal_tab', async () => {
    const CHARCOAL = { c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd', admin: false, terminal_palette: 'charcoal' }, c2: QL_ITEMS.c2 };
    const { w } = mountQl({ items: CHARCOAL });
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click');   // 启动 → 建页签（此刻 charcoal）
    await flush();
    expect(xh.state.terms.length).toBe(1);
    const term0 = xh.state.terms[0];
    qlDataHandlers.at(-1)!({ tabId: 'ql:c1', data: '换档前屏上已有的输出' }); // 屏上历史（换档不得丢）
    await flush();

    // 条目落盘换成 warm-night：弹窗 [保存] 之后卡片 reload 读到的就是这一档，于是冒泡 changed
    const WARM = { c1: { ...CHARCOAL.c1, terminal_palette: 'warm-night' }, c2: QL_ITEMS.c2 };
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: WARM, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();

    const tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((t) => t.id === 'ql:c1')?.palette, '条目落盘的档变了、页签还是旧档（票 #18 的症状）').toBe('warm-night');
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme, '画布没跟着换档')
      .toEqual(TERM_PALETTES['warm-night'].theme);
    expect(xh.state.terms[0], '换档把终端重建了（ADR 0001:15 要求整对象换 theme、不重建）').toBe(term0);
    expect(xh.state.terms[0].written, '换档丢了屏上已有的输出').toContain('换档前屏上已有的输出');
    expect(qlInvokes('ql_start'), '换档顺带重启了进程').toEqual([['c1']]);
    expect(qlInvokes('ql_save'), '读侧对齐顺带写了盘').toEqual([]);
    expect(qlInvokes('ql_set_palette'), '读侧对齐顺带写了盘').toEqual([]);
    w.unmount();
  });

  // 对齐不得盖掉正在进行的 hover 预览：优先级仍是「本地浮层预览 > 外部弹窗预览 > 条目落盘档」
  // （TerminalTabView 的 shownPalette）。弹窗指针还压在 campbell 色块上时该条目落盘换成 warm-night →
  // 画布仍停在 campbell；指针移开（paletteHover null）才落到刚落盘的 warm-night。
  it('palette_alignment_keeps_the_inflight_hover_preview_ahead_of_it', async () => {
    const PAPER = { c1: { name: '我的终端', type: 'shell', shell: 'cmd', cmd: 'cmd', admin: false, terminal_palette: 'paper' }, c2: QL_ITEMS.c2 };
    const { w } = mountQl({ items: PAPER });
    const route = invoke.getMockImplementation()!;
    await flush();
    await qlRowBtn(w, 0).trigger('click');   // 启动 → 建页签（此刻 paper）
    await flush();
    const ql = w.findComponent(QuickLaunch);
    ql.vm.$emit('paletteHover', 'c1', 'campbell'); // 弹窗里指针压在 campbell 上（未落盘）
    await flush();
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['campbell'].theme);

    const WARM = { c1: { ...PAPER.c1, terminal_palette: 'warm-night' }, c2: QL_ITEMS.c2 };
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_list' ? Promise.resolve({ items: WARM, invalid: [] }) : route(cmd, ...args));
    w.findComponent(QuickLaunch).vm.$emit('changed');
    await flush();
    await flush();

    let tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((x) => x.id === 'ql:c1')?.palette, '落盘的新档没对齐到页签上').toBe('warm-night');
    expect(tabs.find((x) => x.id === 'ql:c1')?.palettePreview, '对齐把 hover 预览撤掉了（预览归弹窗那侧管）').toBe('campbell');
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme, '对齐把正在进行的 hover 预览盖掉了')
      .toEqual(TERM_PALETTES['campbell'].theme);

    ql.vm.$emit('paletteHover', 'c1', null);  // 移开指针 → 落到刚落盘那一档
    await flush();
    tabs = w.findComponent(LogPanel).props('tabs') as Array<Record<string, unknown>>;
    expect(tabs.find((x) => x.id === 'ql:c1')?.palettePreview).toBeUndefined();
    expect((xh.state.terms[0].options as { theme: Record<string, string> }).theme).toEqual(TERM_PALETTES['warm-night'].theme);
    expect(qlInvokes('ql_save'), '读侧对齐顺带写了盘').toEqual([]);
    expect(qlInvokes('ql_set_palette'), '读侧对齐顺带写了盘').toEqual([]);
    w.unmount();
  });

  // E9（索引 M8 / K34(5)）：不可写的配置一律不发 ql_write / ql_resize。三种不可写：
  // ① 没有终端页签（未启动 / 页签已关）② exe 配置（ql_start 返回 tabId = null，运行态在也没有页签）
  // ③ 页签在但状态 = stopping（PTY 已 kill）。正例同测：可写时两个入口各发一次，否则「永远不发」也能过。
  // 两个入口就是 App.vue:577 递给 LogPanel、LogPanel 再透传给 TerminalTabView 的那两个回调（App 侧的守卫是这里唯一的新逻辑）。
  it('no_ql_write_or_ql_resize_for_non_writable_config', async () => {
    const { default: LogPanel } = await import('./modules/LogPanel.vue');
    const { w } = mountQl();
    const onInput = w.findComponent(LogPanel).props('onInput') as (id: string, data: string) => void;
    const onResize = w.findComponent(LogPanel).props('onResize') as (id: string, cols: number, rows: number) => void;
    expect(typeof onInput).toBe('function');
    expect(typeof onResize).toBe('function');
    await flush();

    // ① 没有页签：未启动的 shell 配置，两个入口都不发
    onInput('ql:c1', 'ls\r');
    onResize('ql:c1', 100, 30);
    await flush();
    expect(qlInvokes('ql_write')).toEqual([]);
    expect(qlInvokes('ql_resize')).toEqual([]);

    // 正例：页签在 + running + 非 stopping → write 发一次、resize 发一次（挂载首报之外再显式一次）
    await qlRowBtn(w, 0).trigger('click');
    await flush();
    expect(tabIds(w)).toContain('ql:c1');
    onInput('ql:c1', 'ls\r');
    onResize('ql:c1', 100, 30);
    await flush();
    expect(qlInvokes('ql_write')).toEqual([['c1', 'ls\r']]);
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41], ['c1', 100, 30]]); // 首报（K11(2)）+ 这一次

    // ③ 页签在但 stopping：把 ql_stop 挂住，停在「停止中」
    const stopGate = Promise.withResolvers<void>();
    const stopRoute = invoke.getMockImplementation()!;
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_stop' ? stopGate.promise : stopRoute(cmd, ...args));
    await qlRowBtn(w, 0).trigger('click'); // 红 [停止]
    await flush();
    expect(qlRowBtn(w, 0).attributes('disabled')).toBeDefined(); // 确认确实停在 stopping
    onInput('ql:c1', 'late\r');
    onResize('ql:c1', 90, 20);
    await flush();
    expect(qlInvokes('ql_write')).toEqual([['c1', 'ls\r']]); // 没有新增
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41], ['c1', 100, 30]]);
    stopGate.resolve();
    await flush();

    // ② exe 配置：ql_start 返回 tabId = null → 无页签；运行态置上了也不发
    const startRoute = invoke.getMockImplementation()!;
    invoke.mockImplementation((cmd: string, ...args: unknown[]): Promise<unknown> =>
      cmd === 'ql_start' && args[0] === 'c2' ? Promise.resolve({ tabId: null }) : startRoute(cmd, ...args));
    await qlRowBtn(w, 1).trigger('click'); // c2 = exe
    await flush();
    expect(qlInvokes('ql_start')).toEqual([['c1'], ['c2']]);
    expect(tabIds(w)).not.toContain('ql:c2');
    expect(qlRowBtn(w, 1).classes()).toContain('btn-danger'); // 运行态确实置上了（不是靠「没运行」蒙过守卫）
    onInput('ql:c2', 'x');
    onResize('ql:c2', 118, 41);
    await flush();
    expect(qlInvokes('ql_write')).toEqual([['c1', 'ls\r']]);
    expect(qlInvokes('ql_resize')).toEqual([['c1', 118, 41], ['c1', 100, 30]]);
    w.unmount();
  });
});
