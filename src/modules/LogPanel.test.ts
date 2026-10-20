// @vitest-environment happy-dom
// 组件级测试：LogPanel —— §4.4 五档行级关键字着色（纯显示层）：
// sys 行 ln-dim / error·fatal·err 关键字 → ln-err / warn 关键字或 glog W 级别 → ln-warn /
// server ready·listening → ln-ok / 其余普通输出无类。
//
// RED 依据（用户实机截图）：llama-server 在 Windows 上把 I/W/E 各级日志全写进 stderr，
// main.ts 标记 stream='err'；旧 cls() 里 stream==='err' 优先于关键字判定 → 每行全红。
// 规格 §4.4：着色只靠内容关键字启发式，stream 不是颜色依据；
// glog 时间戳+级别前缀（0.02.572.005 W srv）是稳定信号：W→橙、E/F→红、I→默认。
import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import LogPanel from './LogPanel.vue';
// 任务 10 追加（页签条两种页签 + [x] + 横向滚动）：假 xterm 打桩与 CSS 规则取证所需，见文件末段。
import { vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogTabItem } from './log-tabs';

interface E { line: string; stream: 'sys' | 'out' | 'err' }

// 规则文本取证：happy-dom 不加载 style.css，computed style 读不到 → 只能读 style.css 的规则文本。
// 边界按「选择器 + 它自己的 { … }」取一条规则，不依赖下一条规则叫什么名字；注释一律剥掉 ——
// 断的是声明本身，不是解释历史的那段注释（本文件的注释恰恰会写出被删掉的那条声明）。
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
function cssRule(css: string, selector: string): string {
  const at = css.indexOf(selector + ' {');
  if (at === -1) throw new Error('css rule not found: ' + selector);
  return stripComments(css.slice(at, css.indexOf('}', at)));
}

function rowClass(tab: 'launcher' | 'llama-server', lines: E[]): string[] {
  const buckets = { launcher: [], 'llama-server': [] } as Record<'launcher' | 'llama-server', E[]>;
  buckets[tab] = lines;
  const wrapper = mount(LogPanel, { props: { buckets } });
  const cls = wrapper.findAll('.log-pane[data-tab-id="' + tab + '"] p').map((p) => p.classes().join(' '));
  wrapper.unmount();
  return cls;
}

describe('LogPanel 行级着色', () => {
  it('stderr_line_without_error_keyword_is_not_red', () => {
    // 核心 bug：stream='err' 单独不能判红（llama-server I/W 日志全走 stderr）
    expect(rowClass('llama-server', [{ line: '0.02.489.298 I cmn  common_param: verbosity = 3', stream: 'err' }])).toEqual(['']);
    expect(rowClass('llama-server', [{ line: 'random crash text', stream: 'err' }])).toEqual(['']);
  });

  it('error_keyword_line_renders_ln_err_regardless_of_stream', () => {
    expect(rowClass('llama-server', [{ line: 'ERROR: model file not found', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass('llama-server', [{ line: 'llama_server: FATAL exception thrown', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass('llama-server', [{ line: '1.2.3.4 E srv  llama_server: boom', stream: 'err' }])).toEqual(['ln-err']);
  });

  it('warn_or_warning_line_renders_ln_warn_on_any_stream', () => {
    expect(rowClass('llama-server', [{ line: '[WARN] 显卡显存不足，回退 CPU', stream: 'out' }])).toEqual(['ln-warn']);
    // 截图中的 CORS 警告：stream=err + W 级别前缀 → 橙
    expect(rowClass('llama-server', [{ line: "0.02.572.010 W srv  llama_server: CORS is set to allow all origins ('*')", stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('glog_level_prefix_maps_i_to_default_and_w_to_warn', () => {
    // I 级别：无关键字 → 默认深灰（不再红）
    expect(rowClass('llama-server', [{ line: "0.03.226.108 I srv  llama_server: server is ready", stream: 'err' }])).toEqual(['']);
    // W model unused tensor……（截图中一行）→ 橙
    expect(rowClass('llama-server', [{ line: '0.03.226.614 W model has unused tensor blk.64.attn_norm.weight -- ignoring', stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('sys_line_renders_ln_dim_and_ready_renders_ln_ok', () => {
    expect(rowClass('launcher', [{ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' }])).toEqual(['ln-dim']);
    expect(rowClass('llama-server', [{ line: 'server ready, listening on :8080', stream: 'out' }])).toEqual(['ln-ok']);
    // 普通输出不叠加着色类（无 class → join 为空串）
    expect(rowClass('llama-server', [{ line: 'n_gpu_layers 999', stream: 'out' }])).toEqual(['']);
  });
});

describe('LogPanel tab 隔离', () => {
  it('autoScroll state is per-tab (pausing one tab does not affect the other)', async () => {
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    // 两个 pane 各有一个自动滚动 checkbox
    const boxes = w.findAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    await boxes[0].setChecked(false);   // 暂停 launcher
    expect(boxes[1].element.checked as boolean | undefined).toBe(true); // llama-server 仍开
    // 再点恢复，仅本 tab 状态变化（互不串扰）
    await boxes[0].setChecked(true);
    expect(boxes[1].element.checked as boolean | undefined).toBe(true);
    w.unmount();
  });
});

describe('LogPanel 自动滚动行为', () => {
  it('autoScroll_keeps_view_pinned_to_bottom_on_new_lines', async () => {
    // RED 依据（用户反馈）：勾选 [自动滚动] 后新增日志行，视图不跟随滚到最新位置。
    // 根因：watch 里「仅当用户已在底部附近才滚」——scrollTop 永远停在顶部，判定永远为假（死循环）。
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    const view = w.find('.log-pane[data-tab-id="llama-server"] .log-view');
    const el = view.element as HTMLElement;
    // happy-dom 无真实布局：手工钉住滚动几何（内容 2000px，视口 100px）
    Object.defineProperty(el, 'scrollHeight', { value: 2000, writable: true });
    Object.defineProperty(el, 'clientHeight', { value: 100, writable: true });
    el.scrollTop = 0; // bug 场景：视图停在上部
    await w.setProps({ buckets: { launcher: [], 'llama-server': [
      { line: '0.01.000.000 I srv  first line', stream: 'err' },
      { line: '0.01.000.001 I srv  second line', stream: 'err' },
    ] } });
    await nextTick(); // Vue 渲染
    await nextTick(); // 组件内部 nextTick 后再读 DOM
    // 勾选自动滚动时，新日志到达应把视图滚到最新位置（底部 = scrollHeight）
    expect(el.scrollTop).toBe(2000);
    w.unmount();
  });

  it('rechecking_autoScroll_pins_view_to_bottom_immediately', async () => {
    // 用户在底部上方读历史 → 取消勾选 → 重新勾选：视图应立即贴底，
    // 而不是等下一条日志才跟（勾选后"没反应"的体验问题）。
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    const el = w.find('.log-pane[data-tab-id="llama-server"] .log-view').element as HTMLElement;
    Object.defineProperty(el, 'scrollHeight', { value: 2000, writable: true });
    Object.defineProperty(el, 'clientHeight', { value: 100, writable: true });
    await w.setProps({ buckets: { launcher: [], 'llama-server': [
      { line: '0.01.000.000 I srv  line', stream: 'err' },
    ] } });
    await nextTick();
    await nextTick();
    expect(el.scrollTop).toBe(2000); // 跟随
    const box = w.find('.log-pane[data-tab-id="llama-server"] input[type="checkbox"]');
    await box.setChecked(false); // 取消勾选（模拟用户暂停读历史）
    el.scrollTop = 0;            // 视图停在顶部
    await box.setChecked(true);  // 重新勾选
    await nextTick();
    await nextTick();
    expect(el.scrollTop).toBe(2000); // 应立即贴底，无需等下一条日志
    w.unmount();
  });

  it('autoScroll_keeps_following_after_500_line_trim', async () => {
    // 满 500 行后 App 端 splice+push 保持长度恒定 → 仅靠 length watch 不再触发。
    // 这里模拟 App 的裁剪行为（splice(0,1)+push），断言视图仍持续贴底。
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    const el = w.find('.log-pane[data-tab-id="llama-server"] .log-view').element as HTMLElement;
    Object.defineProperty(el, 'scrollHeight', { value: 2000, writable: true });
    Object.defineProperty(el, 'clientHeight', { value: 100, writable: true });
    const MAX_LINES = 500;
    const bucket: E[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      bucket.push({ line: '0.01.000.' + String(i).padStart(3, '0') + ' I srv  init line', stream: 'err' });
    }
    await w.setProps({ buckets: { launcher: [], 'llama-server': [...bucket] } });
    await nextTick();
    await nextTick();
    expect(el.scrollTop).toBe(2000); // 填充阶段跟随
    el.scrollTop = 0; // 视图停在上部
    // 模拟两条新日志：splice 裁最旧 + push，长度恒为 500
    const append = (n: number) => {
      bucket.push({ line: '0.01.000.' + n + ' I srv  new line', stream: 'err' });
      if (bucket.length > MAX_LINES) bucket.splice(0, bucket.length - MAX_LINES);
    };
    append(MAX_LINES + 1);
    await w.setProps({ buckets: { launcher: [], 'llama-server': [...bucket] } });
    await nextTick();
    await nextTick();
    expect(el.scrollTop).toBe(2000); // 长度未变，仍应贴底
    w.unmount();
  });
});

// 2026-08-28 清空日志按钮：每个 tab 面板内渲染一个无文字 icon 按钮（aria-label=清空日志）；
// 点击 emit('clear') 且携带本 tab id —— App 只清空该桶，另一 tab 不受影响。
describe('LogPanel 清空日志按钮', () => {
  it('renders a clear-log button per tab (icon only, aria-labeled)', () => {
    const w = mount(LogPanel, { props: { buckets: { launcher: [], 'llama-server': [] } } });
    const btns = w.findAll('button[aria-label="清空日志"]');
    expect(btns.length).toBe(2); // 每个 tab 一个
    // 无可见文字（icon-only）：按钮内无文本节点
    for (const b of btns) expect(b.text()).toBe('');
    w.unmount();
  });

  it('clicking clear emits clear with the current tab id (per-tab scoping)', async () => {
    const w = mount(LogPanel, { props: { buckets: { launcher: [], 'llama-server': [] } } });
    const btns = w.findAll('button[aria-label="清空日志"]');
    await btns[0].trigger('click'); // LMS Launcher（左）
    expect(w.emitted('clear')).toEqual([['launcher']]);
    await btns[1].trigger('click'); // llama-server（右）
    expect(w.emitted('clear')).toEqual([['launcher'], ['llama-server']]);
    w.unmount();
  });
});

// ============================================================================
// 任务 10 · 页签条支持两种页签 + [x] + 横向滚动（check 表 E1-E8；规格 §9.1 / §11-1 / §11-2）
// 与上面 11 条的区别：这里显式传 tabs；上面 7 处 mount 只传 buckets = 缺省页签路径（E6 的证据）。
// xterm 与三个 addon 必须打桩（索引 G8 / 规格 §12.5：真实渲染不在单测范围），打桩法照 TerminalTabView.test.ts。
// ============================================================================

const xh = vi.hoisted(() => {
  const state: { terms: any[] } = { terms: [] };
  class FakeTerminal {
    cols = 80; rows = 24; disposed = false; written: string[] = [];
    dataCb: ((d: string) => void) | null = null;
    constructor() { state.terms.push(this); }
    open(): void { /* 真实渲染不在范围 */ }
    loadAddon(addon: any): void { if (addon && typeof addon.activate === 'function') addon.activate(this); }
    write(d: string): void { this.written.push(d); }
    paste(): void { /* noop */ }
    clear(): void { /* noop */ }
    focus(): void { /* noop */ }
    dispose(): void { this.disposed = true; }
    getSelection(): string { return ''; }
    hasSelection(): boolean { return false; }
    onData(cb: (d: string) => void): { dispose: () => void } { this.dataCb = cb; return { dispose: () => {} }; }
    onResize(): { dispose: () => void } { return { dispose: () => {} }; }
    attachCustomKeyEventHandler(): void { /* noop */ }
  }
  class FakeFitAddon {
    activate(): void { /* noop */ }
    dispose(): void { /* noop */ }
    fit(): void { /* noop */ }
    proposeDimensions(): { cols: number; rows: number } { return { cols: 80, rows: 24 }; }
  }
  class FakeSearchAddon {
    activate(): void { /* noop */ }
    dispose(): void { /* noop */ }
    clearDecorations(): void { /* noop */ }
    onDidChangeResults(): { dispose: () => void } { return { dispose: () => {} }; }
    findNext(): boolean { return false; }
    findPrevious(): boolean { return false; }
  }
  class FakeWebLinksAddon {
    constructor(_handler: unknown) { /* noop */ }
    activate(): void { /* noop */ }
    dispose(): void { /* noop */ }
  }
  return { state, FakeTerminal, FakeFitAddon, FakeSearchAddon, FakeWebLinksAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: xh.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xh.FakeFitAddon }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: xh.FakeSearchAddon }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: xh.FakeWebLinksAddon }));

// happy-dom 无 ResizeObserver：TerminalTabView.onMounted 会 new 一个，给它空壳（照 TerminalTabView.test.ts 的做法）
class NoopResizeObserver {
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
const realResizeObserver = globalThis.ResizeObserver;

function emptyBuckets(): Record<'launcher' | 'llama-server', E[]> {
  return { launcher: [], 'llama-server': [] };
}
function textTab(id: 'launcher' | 'llama-server', over: Partial<LogTabItem> = {}): LogTabItem {
  return { id, label: id, fullLabel: id, kind: 'text', closable: false, closeDisabled: false, running: false, stopping: false, restartDisabled: false, ...over };
}
// running / stopping / restartDisabled = 终端工具条那颗进程态按钮的三态来源（2026-10-20 替换原工具条 [x]）：
// 缺省 = 运行中、未停止、配置还在 → [停止] 可点
function termTab(id: string, over: Partial<LogTabItem> = {}): LogTabItem {
  return { id, label: id, fullLabel: id, kind: 'terminal', closable: true, closeDisabled: false, running: true, stopping: false, restartDisabled: false, configId: id.slice(3), ...over };
}
// 页签按钮上的测试钩子 data-tab-id（与 LogTabView / TerminalTabView 的根节点同名钩子，M4：只作测试用）
function tabBtn(w: any, id: string) { return w.find('.tab-bar .log-tab[data-tab-id="' + id + '"]'); }

describe('LogPanel 两种页签（E1/E2/E8）', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
    xh.state.terms = [];
  });
  afterEach(() => { globalThis.ResizeObserver = realResizeObserver; });

  // E1（规格 §9.1）：kind=text 渲染 LogTabView，行渲染/着色/清空行为一字不改（F6：不改 LogTabView）
  it('text_tab_renders_logtabview_and_clear_behaviour_unchanged', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [textTab('launcher'), textTab('llama-server')] } });
    expect(w.findAll('.log-pane .log-view').length).toBe(2);
    await w.setProps({ buckets: { launcher: [{ line: 'ERROR: model file not found', stream: 'out' }], 'llama-server': [] } });
    expect(w.find('.log-pane[data-tab-id="launcher"] p').classes()).toContain('ln-err');
    const clears = w.findAll('button[aria-label="清空日志"]');
    expect(clears.length).toBe(2);
    await clears[1].trigger('click');
    expect(w.emitted('clear')).toEqual([['llama-server']]);
    w.unmount();
  });

  // E2（规格 §9.1）：kind=terminal 渲染 TerminalTabView；未激活时它仍在 DOM 里、只是 v-show 隐藏（F7）
  it('terminal_tab_renders_terminaltabview', () => {
    const register = vi.fn(); const unregister = vi.fn(); const onInput = vi.fn(); const onResize = vi.fn();
    const w = mount(LogPanel, {
      props: {
        buckets: emptyBuckets(),
        tabs: [textTab('launcher'), termTab('ql:demo', { label: 'Demo', fullLabel: 'Demo · PowerShell 7 (pwsh)' })],
        register, unregister, onInput, onResize,
      },
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('ql:demo');
    expect(typeof register.mock.calls[0][1]).toBe('function');
    expect(xh.state.terms.length).toBe(1);
    const term = w.find('.log-pane[data-tab-id="ql:demo"]');
    expect(term.exists()).toBe(true);
    expect(term.attributes('style') ?? '').toContain('display: none');
    expect(w.find('.log-pane[data-tab-id="launcher"]').attributes('style') ?? '').not.toContain('display: none');
    w.unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledWith('ql:demo');
  });

  // E8（索引 K26(4) / F7）：切页签不卸载终端页签 —— 卸载即 unregister + term.dispose()
  it('switching_tabs_does_not_unmount_terminal_tab', async () => {
    const register = vi.fn(); const unregister = vi.fn();
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [textTab('launcher'), termTab('ql:demo')], register, unregister } });
    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
    await tabBtn(w, 'ql:demo').trigger('click');
    expect(tabBtn(w, 'ql:demo').classes()).toContain('active');
    expect(w.find('.log-pane[data-tab-id="ql:demo"]').attributes('style') ?? '').not.toContain('display: none');
    await tabBtn(w, 'launcher').trigger('click');
    await tabBtn(w, 'ql:demo').trigger('click');
    expect(unregister).not.toHaveBeenCalled();
    expect(xh.state.terms.length).toBe(1);
    expect(xh.state.terms[0].disposed).toBe(false);
    w.unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(xh.state.terms[0].disposed).toBe(true);
  });
});

describe('LogPanel 页签关闭按钮与溢出（E3/E4/E5/E7）', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
    xh.state.terms = [];
  });
  afterEach(() => { globalThis.ResizeObserver = realResizeObserver; });

  // E3（计划 审查重点 3 / R3）：只有 closable 的页签出 [x]；closeDisabled 时禁用且点击无效
  it('only_closable_tabs_render_close_button_and_close_disabled_when_closeDisabled', async () => {
    const w = mount(LogPanel, {
      props: {
        buckets: emptyBuckets(),
        tabs: [textTab('launcher'), textTab('llama-server', { closable: true }), termTab('ql:running', { closeDisabled: true }), termTab('ql:idle')],
      },
    });
    expect(w.findAll('.tab-bar .btn-close-tab').length).toBe(3);
    expect(tabBtn(w, 'ql:running').find('.btn-close-tab').attributes('disabled')).toBeDefined();
    expect(tabBtn(w, 'ql:idle').find('.btn-close-tab').attributes('disabled')).toBeUndefined();
    await tabBtn(w, 'ql:running').find('.btn-close-tab').trigger('click');
    expect(w.emitted('close')).toBeUndefined();
    // 缺省路径（不传 tabs）：两个 text 页签 closable:false → 页签条没有 [x]（索引 K26(1)）
    const d = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    expect(d.findAll('.tab-bar .btn-close-tab').length).toBe(0);
    d.unmount();
    w.unmount();
  });

  // E4（计划 步骤 1）：点 [x] 冒泡 close(id)；且 [x] 的点击不切换激活页签
  it('clicking_close_emits_close_with_tab_id', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [textTab('launcher'), termTab('ql:demo')] } });
    await tabBtn(w, 'ql:demo').find('.btn-close-tab').trigger('click');
    expect(w.emitted('close')).toEqual([['ql:demo']]);
    expect(tabBtn(w, 'ql:demo').classes()).not.toContain('active');
    // 2026-10-20 用户要求：终端工具条那颗不再是 [x]（与页签条重复），已换成进程态按钮 →
    // 负向门：工具条里没有 .btn-close-tab，close 只剩页签条一个来源；工具条运行中的点击冒泡 stop(id)。
    expect(w.find('.log-pane[data-tab-id="ql:demo"] .btn-close-tab').exists()).toBe(false);
    await w.find('.log-pane[data-tab-id="ql:demo"] .btn-term-state').trigger('click');
    expect(w.emitted('close')).toEqual([['ql:demo']]);
    expect(w.emitted('stop')).toEqual([['ql:demo']]);
    w.unmount();
  });

  // 2026-10-20 两步：running / stopping / restartDisabled 一律透传（进程态与配置镜像归 App），三态落点由
  // TerminalTabView 定。钉住用户要的两条链：运行中 = [停止] 可点且页签 [x] 禁用；未运行 = [重新启动] 可点
  // 且页签 [x] 可用；restartDisabled（配置已删）= 那颗禁用，只剩 [x] 可关。
  it('state_button_forwards_running_stopping_and_restartDisabled', async () => {
    const w = mount(LogPanel, {
      props: {
        buckets: emptyBuckets(),
        tabs: [
          // closeDisabled = App 那侧按进程态算出来的（App.vue 的 closeDisabled: !!s && …），
          // 这里照着真实条目传进来：运行中的页签 = 工具条 [停止] 可点 + 页签 [x] 禁用
          termTab('ql:run', { closeDisabled: true }),
          termTab('ql:busy', { running: true, stopping: true, closeDisabled: true }),
          termTab('ql:idle', { running: false, closeDisabled: false }),
          termTab('ql:gone', { running: false, restartDisabled: true }),
        ],
      },
    });
    const run = w.find('.log-pane[data-tab-id="ql:run"] .btn-term-state');
    expect(run.attributes('aria-label')).toBe('停止');
    expect(run.attributes('disabled')).toBeUndefined();
    expect(tabBtn(w, 'ql:run').find('.btn-close-tab').attributes('disabled')).toBeDefined(); // 运行中 [x] 禁用（R3）
    const busy = w.find('.log-pane[data-tab-id="ql:busy"] .btn-term-state');
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.text()).toBe('...');
    const idle = w.find('.log-pane[data-tab-id="ql:idle"] .btn-term-state');
    expect(idle.attributes('aria-label')).toBe('重新启动');
    expect(idle.attributes('disabled')).toBeUndefined();
    expect(tabBtn(w, 'ql:idle').find('.btn-close-tab').attributes('disabled')).toBeUndefined();
    await idle.trigger('click');
    expect(w.emitted('restart')).toEqual([['ql:idle']]);
    expect(w.emitted('stop')).toBeUndefined();
    const gone = w.find('.log-pane[data-tab-id="ql:gone"] .btn-term-state');
    expect(gone.attributes('disabled')).toBeDefined();
    w.unmount();
  });

  // E5（规格 §11-2）：页签多于 6 条时页签条不换行。
  // happy-dom 不加载外部 CSS，computed style 读不到 style.css → 断的是「渲染出的页签数 + style.css 里的规则文本」，
  // 即 .tab-bar 的 flex-wrap:nowrap / overflow-x:auto 与 .log-tab 的 flex:none（不被压扁）。见 check 表 J 段说明。
  it('tab_bar_does_not_wrap_with_many_tabs', async () => {
    const many: LogTabItem[] = [textTab('launcher'), textTab('llama-server')];
    for (let i = 1; i <= 8; i++) many.push(termTab('ql:cfg' + i));
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: many, register: vi.fn(), unregister: vi.fn() } });
    expect(w.findAll('.tab-bar .log-tab').length).toBe(10);
    const css = readFileSync(join(__dirname, '..', 'style.css'), 'utf-8');
    const barRule = cssRule(css, '.tab-bar');
    expect(barRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(barRule).toMatch(/overflow-x:\s*auto/);
    expect(cssRule(css, '.log-tab')).toMatch(/flex:\s*none/);
    // F2：切换页签时把激活页签滚进可视区（happy-dom 无 scrollIntoView → 打桩断被调用与参数）
    const seen: unknown[] = [];
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: (o: unknown) => void };
    const realScroll = proto.scrollIntoView;
    proto.scrollIntoView = (o: unknown) => { seen.push(o); };
    try {
      await tabBtn(w, 'ql:cfg8').trigger('click');
    } finally {
      proto.scrollIntoView = realScroll;
    }
    expect(seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ inline: 'nearest' });
    w.unmount();
  });

  // 缺口回归（2026-10-19，用户实机截图：面板左缘从页签到内容区少了一段竖线）。
  // 致错模式：页签条是 overflow-x:auto 的滚动容器（上面 E5 断的就是它），裁切边界在它的 padding box；
  // 页签一旦用 margin-left:-1px 做「共边」，首 tab 就整体悬出裁切框 1px —— 那 1px 正是它的左边线，被裁掉
  // （.log-pane 的 margin-left:-1px 是为了把面板左边框再去对齐那条被裁掉的线，一并删）。
  // 所以共边的负边距只能朝右。像素级判定见 .scratch/tab-gap/loop.cjs（Electron 离屏渲染 + 逐像素读线）：
  // 本仓的 vitest 层没有 layout/paint，够不到「线连不连得上」这条真缝，这里断的是致错的写法本身。
  it('tab_shared_edge_negative_margin_points_right_not_left', () => {
    const css = readFileSync(join(__dirname, '..', 'style.css'), 'utf-8');
    expect(cssRule(css, '.log-tab')).toMatch(/margin-right:\s*-1px/);
    expect(cssRule(css, '.log-tab')).not.toMatch(/margin-left:\s*-1px/);
    expect(stripComments(css)).not.toMatch(/\.log-tab\s*\+\s*\.log-tab\s*\{[^}]*margin-left:\s*-1px/);  // 共边只写在页签自身，且方向朝右
    expect(cssRule(css, '.log-pane')).not.toMatch(/margin-left:\s*-1px/);                     // pane 不再补偿页签的悬出
  });

  // 缺口回归 2（2026-10-19 第二轮）：用户这次看的是「页签多到溢出」的截图 —— 左缘断 9px，且断口下方多一处拐弯。
  // 致错模式：页签条本身是横向滚动容器，而本文件的全局滚动条是 10px（*::-webkit-scrollbar），
  // 于是页签一多，页签条就在自己盒子里让出这 10px（实测 26 → 36），把 .log-pane 整块推下去 10px：
  // 左边框断一截、面板顶边与页签底错开 = 「拐弯」。这条滚动条按设计本来就看不见（track/thumb 全透明），
  // 所以它连一位都不该占。像素级判定同样见 .scratch/tab-gap/loop.cjs（--more-tabs 8 那条会断在 y=38..46）。
  it('tab_bar_reserves_no_scrollbar_layout', () => {
    const css = readFileSync(join(__dirname, '..', 'style.css'), 'utf-8');
    const barScrollbar = cssRule(css, '.tab-bar::-webkit-scrollbar');   // 缺这条规则时 cssRule 直接抛 = 红
    expect(barScrollbar).toMatch(/width:\s*0/);
    expect(barScrollbar).toMatch(/height:\s*0/);
    expect(cssRule(css, '.tab-bar')).toMatch(/scrollbar-width:\s*none/);
  });

  // E7（规格 §11-1 / 索引 K26(2)）：页签文案原样渲染、不二次截断（截断只在构造方）。
  // 完整名的提示 2026-10-20 起改口径（用户要求）：native title → 仓内自绘 .dd-tip 视口浮层
  // （与下拉长名同视觉语言、hover 即出、不受浏览器 ~1s 延迟与系统样式约束）。显示判据一字未改：只在 label !== fullLabel 时出。
  function stubRect(el: HTMLElement, left: number, width: number, top = 4, height = 26): void {
    (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left, right: left + width, top, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
  }
  /** 钉住视口宽（flip 判据读 window.innerWidth）；happy-dom 默认 1024，测试不依赖它。 */
  async function withInnerWidth(v: number, fn: () => Promise<void>): Promise<void> {
    const orig = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { value: v, configurable: true });
    try { await fn(); }
    finally {
      // 还原按原 descriptor 原样写回：innerWidth 在 happy-dom 是 accessor，补 value 会撞 get（Dropdown.test.ts:79 同一手法）
      if (orig) Object.defineProperty(window, 'innerWidth', orig);
      else delete (window as unknown as Record<string, unknown>)['innerWidth'];
    }
  }
  const LONG_FULL = 'Very Long Launch Name · PowerShell 7 (pwsh)';
  const LONG_LABEL = 'Very Long Launch Na…';

  it('truncated_tab_hovers_custom_tip_with_full_label_and_leave_clears_it', async () => {
    const w = mount(LogPanel, {
      props: {
        buckets: emptyBuckets(),
        tabs: [textTab('launcher'), termTab('ql:short', { label: 'Short', fullLabel: 'Short' }), termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })],
      },
    });
    // native title 已彻底移除（三条页签都不留）
    expect(tabBtn(w, 'launcher').attributes('title')).toBeUndefined();
    expect(tabBtn(w, 'ql:short').attributes('title')).toBeUndefined();
    expect(tabBtn(w, 'ql:long').attributes('title')).toBeUndefined();
    expect(tabBtn(w, 'ql:long').text()).toBe(LONG_LABEL);   // 文案原样（不二次截断）

    await tabBtn(w, 'ql:long').trigger('mouseenter');
    expect(w.find('.dd-tip').exists()).toBe(true);
    expect(w.find('.dd-tip').text()).toBe(LONG_FULL);
    await tabBtn(w, 'ql:long').trigger('mouseleave');
    expect(w.find('.dd-tip').exists()).toBe(false);

    // 未截断（label === fullLabel）→ 无浮层；构造方没截断时 LogPanel 也不截断（两处预算会互相抵消）
    await tabBtn(w, 'ql:short').trigger('mouseenter');
    expect(w.find('.dd-tip').exists()).toBe(false);
    const w2 = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [termTab('ql:raw', { label: LONG_FULL, fullLabel: LONG_FULL })] } });
    expect(tabBtn(w2, 'ql:raw').text()).toBe(LONG_FULL);
    await tabBtn(w2, 'ql:raw').trigger('mouseenter');
    expect(w2.find('.dd-tip').exists()).toBe(false);
    expect(tabBtn(w2, 'ql:raw').attributes('title')).toBeUndefined();
    w2.unmount();
    w.unmount();
  });

  // title 撤掉后完整名不能丢：可访问名（aria-label）取完整名；未截断的页签不动（保持文案即名字）
  it('truncated_tab_aria_label_is_full_label_short_tabs_have_none', () => {
    const w = mount(LogPanel, {
      props: {
        buckets: emptyBuckets(),
        tabs: [textTab('launcher'), termTab('ql:short', { label: 'Short', fullLabel: 'Short' }), termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })],
      },
    });
    expect(tabBtn(w, 'ql:long').attributes('aria-label')).toBe(LONG_FULL);
    expect(tabBtn(w, 'ql:short').attributes('aria-label')).toBeUndefined();
    expect(tabBtn(w, 'launcher').attributes('aria-label')).toBeUndefined();
    w.unmount();
  });

  // 定位沿用 Dropdown 长名口径：挂页签右侧垂直居中（left = 右缘 + 8，top = 垂直中心，CSS translateY(-50%)）
  it('tab_tip_positions_right_of_tab_vertically_centered', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })] } });
    stubRect(tabBtn(w, 'ql:long').element, 50, 150);   // left 50 / width 150 → right 200；中心 = 4 + 26/2 = 17
    await withInnerWidth(1024, async () => { await tabBtn(w, 'ql:long').trigger('mouseenter'); });
    const tipEl = w.find('.dd-tip');
    expect(tipEl.exists()).toBe(true);
    const style = tipEl.attributes('style') ?? '';
    expect(style).toContain('left: 208px');
    expect(style).toContain('top: 17px');
    expect(tipEl.classes()).not.toContain('dd-tip--flip');
    w.unmount();
  });

  // 右侧估宽放不下视口 → .dd-tip--flip：右缘贴页签左缘内侧（left = 左缘 - 8），不出窗口（同 Dropdown 的 flip）
  it('tab_tip_flips_left_when_no_room_right_in_viewport', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })] } });
    stubRect(tabBtn(w, 'ql:long').element, 642, 150);  // right = 792，估宽 42*12+36 = 540 → 右侧放不下
    await withInnerWidth(800, async () => { await tabBtn(w, 'ql:long').trigger('mouseenter'); });
    const tipEl = w.find('.dd-tip');
    expect(tipEl.exists()).toBe(true);
    const style = tipEl.attributes('style') ?? '';
    expect(style).toContain('left: 634px');
    expect(style).toContain('top: 17px');
    expect(tipEl.classes()).toContain('dd-tip--flip');
    w.unmount();
  });

  // 页签条是横向滚动容器，fixed 浮层不随内容滚动 → 滚动时按锚点矩形重算坐标（滚轮横滚时浮层不脱锚）
  it('tab_tip_follows_tab_when_tab_bar_scrolls', async () => {
    // attachTo：placeTip 的滚动监听挂在 document（capture，scroll 不冒泡）→ 组件必须真进文档，
    // 否则游离元素的事件传播路径里没有 document，监听永远不触发（VTU 默认不 attach，Dropdown.test.ts:25 同理）
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })] }, attachTo: document.body });
    stubRect(tabBtn(w, 'ql:long').element, 50, 150);
    await withInnerWidth(1024, async () => {
      await tabBtn(w, 'ql:long').trigger('mouseenter');
      expect((w.find('.dd-tip').attributes('style') ?? '')).toContain('left: 208px');
      stubRect(tabBtn(w, 'ql:long').element, 250, 150);   // 页签横滚后右缘 400
      await w.find('.tab-bar').trigger('scroll');
      expect((w.find('.dd-tip').attributes('style') ?? '')).toContain('left: 408px');
    });
    w.unmount();
  });

  // 关掉的正是 hover 中的页签：浮层已 fixed 脱离页签 DOM，不显式关就留在原地变孤儿
  it('closing_a_tab_clears_its_open_tip', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: [termTab('ql:long', { label: LONG_LABEL, fullLabel: LONG_FULL })] } });
    await tabBtn(w, 'ql:long').trigger('mouseenter');
    expect(w.find('.dd-tip').exists()).toBe(true);
    await tabBtn(w, 'ql:long').find('.btn-close-tab').trigger('click');
    expect(w.emitted('close')).toEqual([['ql:long']]);
    expect(w.find('.dd-tip').exists()).toBe(false);
    w.unmount();
  });
});

// ============================================================================
// 任务 10 · 定向修复轮 1（E9/E10）：受控激活 —— 规格 §9.2:243「自动激活」/ §9.2:244 所有权 + 索引 K27(1)。
// 缺口：active 原本写死在 LogPanel 内部，任务 13 的 B 段不含 LogPanel.vue → 点 [启动] 无法自动激活该页签。
// 接口（C4）：可选 prop `active?: string` + emit `update:active: [id]`；不传时自持（既有 11 条用例一字不变）。
// ============================================================================

describe('LogPanel 受控激活（E9/E10 · 索引 K27(1)）', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
    xh.state.terms = [];
  });
  afterEach(() => { globalThis.ResizeObserver = realResizeObserver; });

  // 可见 pane = v-show 未隐藏的那个（「面板空白」的判据：一个都没有）
  function visiblePanes(w: any): string[] {
    return w.findAll('.log-pane')
      .filter((p: any) => !(p.attributes('style') ?? '').includes('display: none'))
      .map((p: any) => p.attributes('data-tab-id') ?? '');
  }

  // E9（规格 §9.2:243-244 / K27(1)）：传 active → 面板以 prop 为准；点击只冒泡 update:active、不自行切换；
  // App 改 prop → 面板切换且激活页签 scrollIntoView（F2 在受控路径同样生效）；不传 active → 自持（既有行为不变）。
  it('active_is_controlled_when_prop_given_and_emits_update_active', async () => {
    const tabs = [textTab('launcher'), termTab('ql:demo')];
    const w = mount(LogPanel, {
      props: { buckets: emptyBuckets(), tabs, active: 'ql:demo', register: vi.fn(), unregister: vi.fn() },
    });
    // 面板按 prop 显示（不是「默认第一个」）
    expect(tabBtn(w, 'ql:demo').classes()).toContain('active');
    expect(visiblePanes(w)).toEqual(['ql:demo']);
    // 点另一个页签 → 只冒泡 update:active(id)，面板不自行切换（切换归 App）
    await tabBtn(w, 'launcher').trigger('click');
    expect(w.emitted('update:active')).toEqual([['launcher']]);
    expect(tabBtn(w, 'ql:demo').classes()).toContain('active');
    expect(tabBtn(w, 'launcher').classes()).not.toContain('active');
    expect(visiblePanes(w)).toEqual(['ql:demo']);
    // App 改 prop → 面板切换 + 该页签滚进可视区（F2）
    const seen: unknown[] = [];
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: (o: unknown) => void };
    const realScroll = proto.scrollIntoView;
    proto.scrollIntoView = (o: unknown) => { seen.push(o); };
    try {
      await w.setProps({ active: 'launcher' });
    } finally {
      proto.scrollIntoView = realScroll;
    }
    expect(tabBtn(w, 'launcher').classes()).toContain('active');
    expect(visiblePanes(w)).toEqual(['launcher']);
    expect(seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ inline: 'nearest' });
    w.unmount();
    // 不传 active：自持，点击即切换（既有行为回归，与 E8 同一路径）
    const u = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs } });
    await tabBtn(u, 'ql:demo').trigger('click');
    expect(tabBtn(u, 'ql:demo').classes()).toContain('active');
    expect(visiblePanes(u)).toEqual(['ql:demo']);
    u.unmount();
  });

  // E10（K27(1) 后半）：激活项被摘掉 → 不得留空白面板。非受控内部回落第一个；受控只冒泡 update:active(第一个 id)。
  it('removed_active_tab_falls_back_to_first_not_blank', async () => {
    // 非受控：摘掉当前激活页签 → 内部回落到第一个，面板不空白
    const w = mount(LogPanel, {
      props: { buckets: emptyBuckets(), tabs: [textTab('launcher'), termTab('ql:demo')], register: vi.fn(), unregister: vi.fn() },
    });
    await tabBtn(w, 'ql:demo').trigger('click');
    expect(visiblePanes(w)).toEqual(['ql:demo']);
    await w.setProps({ tabs: [textTab('launcher')] });
    expect(tabBtn(w, 'launcher').classes()).toContain('active');
    expect(visiblePanes(w)).toEqual(['launcher']);   // 不空白
    w.unmount();
    // 受控：状态归 App，不越权改它 → 断 update:active 带第一个 id；App 应用后面板不空白
    const c = mount(LogPanel, {
      props: { buckets: emptyBuckets(), tabs: [textTab('launcher'), termTab('ql:demo')], active: 'ql:demo', register: vi.fn(), unregister: vi.fn() },
    });
    await c.setProps({ tabs: [textTab('launcher')] });
    expect(c.emitted('update:active')).toEqual([['launcher']]);
    await c.setProps({ active: 'launcher' });
    expect(tabBtn(c, 'launcher').classes()).toContain('active');
    expect(visiblePanes(c)).toEqual(['launcher']);
    c.unmount();
  });
});

// ============================================================================
// spec #8 · T1（#9）· 页签条滚轮直接横滚。
// 致错根因：Chromium 对纯 overflow-x 容器不响应竖向滚轮（只有 shift+滚轮走原生），
// 组件 wheel 处理器把 deltaY 转成横向滚动。happy-dom 无布局 → 页签条的滚动几何
// （scrollWidth/clientWidth/scrollLeft）一律打桩在元素实例上——与 E5/F2 同一「无布局取证」
// 口径：断的是处理器的行为本身，不是浏览器的滚动语义（真实手感归 #11 真机门）。
// ============================================================================
describe('LogPanel 页签条滚轮横滚（T1 #9）', () => {
  // 打桩滚动几何：max = scrollWidth - clientWidth；scrollLeft 是真变量，返回读取器。
  function stubBar(w: any, clientWidth: number, scrollWidth: number, startLeft = 0): () => number {
    const el = w.find('.tab-bar').element as HTMLElement;
    let sl = startLeft;
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => clientWidth });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => sl, set: (v: number) => { sl = v; } });
    return () => sl;
  }
  function wheel(el: HTMLElement, init: { deltaY?: number; deltaX?: number; deltaMode?: number }): WheelEvent {
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(ev);
    return ev;
  }
  function barEl(w: any): HTMLElement { return w.find('.tab-bar').element as HTMLElement; }

  // 核心：溢出时普通滚轮（deltaY）直接横滚并被拦截
  it('wheel_deltaY_scrolls_horizontally_when_overflow', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    const getLeft = stubBar(w, 100, 500);
    const ev = wheel(barEl(w), { deltaY: 120 });
    expect(getLeft()).toBe(120);
    expect(ev.defaultPrevented).toBe(true);
    w.unmount();
  });

  // 边界不介入：左端往左 / 右端往右 → 不滚动、不 preventDefault；贴边钳制仍介入
  it('wheel_at_edges_not_consumed_clamped_at_end_consumed', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    const gl0 = stubBar(w, 100, 500, 0);
    let ev = wheel(barEl(w), { deltaY: -50 });
    expect(gl0()).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
    const glMax = stubBar(w, 100, 500, 400);
    ev = wheel(barEl(w), { deltaY: 50 });
    expect(glMax()).toBe(400);
    expect(ev.defaultPrevented).toBe(false);
    const glNear = stubBar(w, 100, 500, 380);
    ev = wheel(barEl(w), { deltaY: 50 });
    expect(glNear()).toBe(400); // 钳到 max = 500-100
    expect(ev.defaultPrevented).toBe(true);
    w.unmount();
  });

  // 不溢出 → 完全不介入（页签数量正常时滚轮无副作用）
  it('wheel_without_overflow_not_consumed', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    const gl = stubBar(w, 100, 100);
    const ev = wheel(barEl(w), { deltaY: 120 });
    expect(gl()).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
    w.unmount();
  });

  // 已带横向意图（deltaX≠0：原生 shift+滚轮、触摸板横滚）→ 走原生路径，处理器不动作
  it('native_horizontal_intent_passes_through', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    const gl = stubBar(w, 100, 500);
    const ev = wheel(barEl(w), { deltaY: 120, deltaX: 30 });
    expect(gl()).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
    w.unmount();
  });

  // deltaMode=line 换算成像素（Firefox 系语义；Electron 恒为 pixel，此条只锁换算分支）
  it('line_delta_mode_scaled', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    const gl = stubBar(w, 100, 500);
    const ev = wheel(barEl(w), { deltaY: 3, deltaMode: 1 });
    expect(gl()).toBe(48);
    expect(ev.defaultPrevented).toBe(true);
    w.unmount();
  });
});

// ============================================================================
// spec #8 · T2（#10）· 两端翻页箭头：仅溢出出现、端点自隐、一页签一步。
// 无布局口径与 T1 相同：页签条几何（clientWidth/scrollWidth/scrollLeft）与各页签的
// offsetLeft/offsetWidth 打桩在元素实例上，重测由真实 'scroll' 事件驱动（组件 @scroll.passive）。
// 断的是显隐判定、步长换算、按钮位置（role=tablist 之外）；真实布局与手感归 #11 真机门。
// ============================================================================
describe('LogPanel 页签条翻页箭头（T2 #10）', () => {
  function manyTabs(n: number): LogTabItem[] {
    const many: LogTabItem[] = [textTab('launcher'), textTab('llama-server')];
    for (let i = 1; i <= n; i++) many.push(termTab('ql:cfg' + i));
    return many;
  }
  const TAB_W = 100;
  // 页签条视口 100px，10 个页签各 100px（scrollWidth = 1000，max = 900）
  function stubGeom(w: any, startLeft = 0) {
    const el = w.find('.tab-bar').element as HTMLElement;
    let sl = startLeft;
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 1000 });
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => sl, set: (v: number) => { sl = v; } });
    const scrollToCalls: Array<Record<string, unknown>> = [];
    Object.defineProperty(el, 'scrollTo', { configurable: true, value: (o: Record<string, unknown>) => { scrollToCalls.push(o); } });
    w.findAll('.tab-bar .log-tab').forEach((t: any, i: number) => {
      Object.defineProperty(t.element, 'offsetLeft', { configurable: true, get: () => i * TAB_W });
      Object.defineProperty(t.element, 'offsetWidth', { configurable: true, get: () => TAB_W });
    });
    return { sl: () => sl, setSl: (v: number) => { sl = v; }, scrollToCalls, el };
  }
  function tickScroll(el: HTMLElement): void { el.dispatchEvent(new Event('scroll')); }
  const LEFT_ARIA = '向左翻页签';
  const RIGHT_ARIA = '向右翻页签';

  // 不溢出（真实数全 0 → max<0）：两端都不渲染
  it('no_arrows_when_not_overflowing', () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets() } });
    expect(w.findAll('.tab-nav-btn').length).toBe(0);
    w.unmount();
  });

  // 显隐 = 可滚方向：左端只出右箭头；中段双箭头；右端只出左箭头。按钮不在 nav（tablist）内。
  it('arrows_follow_scrollable_direction_outside_tablist', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: manyTabs(8), register: vi.fn(), unregister: vi.fn() } });
    const g = stubGeom(w, 0);
    tickScroll(g.el); await nextTick();
    expect(w.findAll(`.tab-nav-btn[aria-label="${LEFT_ARIA}"]`).length).toBe(0);
    expect(w.findAll(`.tab-nav-btn[aria-label="${RIGHT_ARIA}"]`).length).toBe(1);
    g.setSl(300); tickScroll(g.el); await nextTick();
    expect(w.findAll(`.tab-nav-btn[aria-label="${LEFT_ARIA}"]`).length).toBe(1);
    expect(w.findAll(`.tab-nav-btn[aria-label="${RIGHT_ARIA}"]`).length).toBe(1);
    g.setSl(900); tickScroll(g.el); await nextTick();   // max = 1000 - 100，右端
    expect(w.findAll(`.tab-nav-btn[aria-label="${LEFT_ARIA}"]`).length).toBe(1);
    expect(w.findAll(`.tab-nav-btn[aria-label="${RIGHT_ARIA}"]`).length).toBe(0);
    expect(w.findAll('.tab-bar .tab-nav-btn').length).toBe(0);          // 箭头不是 tablist 的孩子
    expect(w.findAll('.tab-bar-wrap > .tab-nav-btn').length).toBe(1);   // 是包裹层的直接兄弟
    w.unmount();
  });

  // 右步 = 把最近被截断的页签完整带入：tab#2 右缘(200) 对齐视口右缘(100) → left=100，smooth
  it('step_right_brings_nearest_clipped_tab_into_view', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: manyTabs(8), register: vi.fn(), unregister: vi.fn() } });
    const g = stubGeom(w, 0);
    tickScroll(g.el); await nextTick();
    await w.find(`.tab-nav-btn[aria-label="${RIGHT_ARIA}"]`).trigger('click');
    expect(g.scrollToCalls.length).toBe(1);
    expect(g.scrollToCalls[0]).toMatchObject({ left: 100, behavior: 'smooth' });
    w.unmount();
  });

  // 剩余不足一整页 → 贴边（钳到 max）
  it('step_right_clamps_at_end', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: manyTabs(8), register: vi.fn(), unregister: vi.fn() } });
    const g = stubGeom(w, 850);
    tickScroll(g.el); await nextTick();
    await w.find(`.tab-nav-btn[aria-label="${RIGHT_ARIA}"]`).trigger('click');
    expect(g.scrollToCalls[0]).toMatchObject({ left: 900, behavior: 'smooth' }); // 900 = 1000 - 100 = max
    w.unmount();
  });

  // 左步镜像：最近被截断 = tab#3（300 < 349），其左缘对齐视口左缘 → left=300
  it('step_left_mirrors', async () => {
    const w = mount(LogPanel, { props: { buckets: emptyBuckets(), tabs: manyTabs(8), register: vi.fn(), unregister: vi.fn() } });
    const g = stubGeom(w, 350);
    tickScroll(g.el); await nextTick();
    await w.find(`.tab-nav-btn[aria-label="${LEFT_ARIA}"]`).trigger('click');
    expect(g.scrollToCalls[0]).toMatchObject({ left: 300, behavior: 'smooth' });
    w.unmount();
  });

  // CSS 取证：灰线与 -16px 延伸在包裹层（箭头段上连续）；按钮 26px 与页签同高、flex:none
  it('css_line_on_wrap_and_btn_metrics', () => {
    const css = readFileSync(join(__dirname, '..', 'style.css'), 'utf-8');
    const wrap = cssRule(css, '.tab-bar-wrap');
    expect(wrap).toMatch(/display:\s*flex/);
    expect(wrap).toMatch(/margin-right:\s*-16px/);
    expect(wrap).toMatch(/linear-gradient\(0deg,\s*var\(--border\)\s*1px/);
    const btn = cssRule(css, '.tab-nav-btn');
    expect(btn).toMatch(/height:\s*26px/);
    expect(btn).toMatch(/flex:\s*none/);
  });
});


