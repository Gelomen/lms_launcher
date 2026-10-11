// @vitest-environment happy-dom
// 组件级测试：TerminalTabView —— 只测接线（规格 §12.5：xterm 的真实渲染不在单测范围；
// 计划全局约束与索引 G8：xterm 与三个 addon 必须打桩）。
// happy-dom 无布局：页签可见性用覆写 offsetWidth/offsetHeight 模拟（0 = v-show 隐藏），
// 尺寸由假 FitAddon 固定给出 118×41，用来断言首帧与恢复可见后的尺寸上报（索引 K11(2)）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';

// 假 xterm：记录构造参数、写入/清空/粘贴、onData 与自定义键盘处理器的注册位。
const h = vi.hoisted(() => {
  const state: {
    termOptions: unknown[];
    terms: any[];
    linkHandlers: unknown[];
    fitCalls: number;
    searches: Array<{ dir: string; term: string; opts: unknown }>;
    clearDecorations: number;
    resultsCb: null | ((r: { resultIndex: number; resultCount: number }) => void);
    proposed: { cols: number; rows: number };
  } = {
    termOptions: [],
    terms: [],
    linkHandlers: [],
    fitCalls: 0,
    searches: [],
    clearDecorations: 0,
    resultsCb: null,
    proposed: { cols: 118, rows: 41 },
  };

  class FakeTerminal {
    cols = 80;
    rows = 24;
    written: string[] = [];
    pasted: string[] = [];
    cleared = 0;
    disposed = false;
    focusCalls = 0;
    selection = '';
    dataCb: ((d: string) => void) | null = null;
    resizeCb: ((e: { cols: number; rows: number }) => void) | null = null;
    keyHandler: ((e: unknown) => boolean) | null = null;
    constructor(options: unknown) { state.termOptions.push(options); state.terms.push(this); }
    open(): void { /* 真实渲染不在范围 */ }
    loadAddon(addon: any): void { if (addon && typeof addon.activate === 'function') addon.activate(this); }
    write(data: string): void { this.written.push(data); }
    paste(text: string): void { this.pasted.push(text); }
    clear(): void { this.cleared += 1; }
    focus(): void { this.focusCalls += 1; }
    dispose(): void { this.disposed = true; }
    getSelection(): string { return this.selection; }
    hasSelection(): boolean { return this.selection.length > 0; }
    onData(cb: (d: string) => void): { dispose: () => void } { this.dataCb = cb; return { dispose: () => {} }; }
    onResize(cb: (e: { cols: number; rows: number }) => void): { dispose: () => void } { this.resizeCb = cb; return { dispose: () => {} }; }
    attachCustomKeyEventHandler(cb: (e: unknown) => boolean): void { this.keyHandler = cb; }
  }

  class FakeFitAddon {
    term: any = null;
    activate(term: any): void { this.term = term; }
    dispose(): void { /* noop */ }
    proposeDimensions(): { cols: number; rows: number } { return { ...state.proposed }; }
    fit(): void {
      state.fitCalls += 1;
      if (this.term) { this.term.cols = state.proposed.cols; this.term.rows = state.proposed.rows; }
    }
  }

  class FakeSearchAddon {
    term: any = null;
    activate(term: any): void { this.term = term; }
    dispose(): void { /* noop */ }
    onDidChangeResults(cb: (r: { resultIndex: number; resultCount: number }) => void): { dispose: () => void } {
      state.resultsCb = cb;
      return { dispose: () => {} };
    }
    findNext(term: string, opts: unknown): boolean {
      state.searches.push({ dir: 'next', term, opts });
      // 真实 xterm 只在带 decorations 时发结果事件 —— 计数依赖这条链路
      if (state.resultsCb && (opts as any)?.decorations) state.resultsCb({ resultIndex: 0, resultCount: 3 });
      return true;
    }
    findPrevious(term: string, opts: unknown): boolean {
      state.searches.push({ dir: 'prev', term, opts });
      if (state.resultsCb && (opts as any)?.decorations) state.resultsCb({ resultIndex: 1, resultCount: 3 });
      return true;
    }
    clearDecorations(): void { state.clearDecorations += 1; }
  }

  class FakeWebLinksAddon {
    constructor(handler: unknown) { state.linkHandlers.push(handler); }
    activate(): void { /* noop */ }
    dispose(): void { /* noop */ }
  }

  return { state, FakeTerminal, FakeFitAddon, FakeSearchAddon, FakeWebLinksAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: h.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: h.FakeFitAddon }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: h.FakeSearchAddon }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: h.FakeWebLinksAddon }));

// 渲染端 IPC：本组件只用 open_external / clipboard_read / clipboard_write
const invoke = vi.fn();
vi.mock('../ipc', () => ({
  invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
}));

// 假 ResizeObserver：捕获回调，测试里手动触发「尺寸变化」
const observers: Array<{ cb: (entries: unknown[], o: unknown) => void; targets: Element[]; disconnected: boolean }> = [];
class FakeResizeObserver {
  cb: (entries: unknown[], o: unknown) => void;
  targets: Element[] = [];
  disconnected = false;
  constructor(cb: (entries: unknown[], o: unknown) => void) { this.cb = cb; observers.push(this); }
  observe(el: Element): void { this.targets.push(el); }
  unobserve(): void { /* noop */ }
  disconnect(): void { this.disconnected = true; }
}
function fireResize(): void {
  for (const o of observers) o.cb(o.targets.map((t) => ({ target: t })), o);
}

const realResizeObserver = globalThis.ResizeObserver;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// happy-dom 无布局：原型级覆写 = 「页签可见」；单个元素再覆写为 0 = 「v-show 隐藏」
function setProtoBox(width: number, height: number): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
}
function setElementBox(el: Element, width: number, height: number): void {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => height });
}

function baseProps(over: Record<string, unknown> = {}) {
  const register = vi.fn();
  const unregister = vi.fn();
  const onInput = vi.fn();
  const onResize = vi.fn();
  const props = {
    id: 'ql:demo',
    label: 'Demo',
    fullLabel: 'Demo · PowerShell 7 (pwsh)',
    closable: true,
    closeDisabled: false,
    register,
    unregister,
    onInput,
    onResize,
    ...over,
  };
  return { props, register, unregister, onInput, onResize };
}

function mountTab(over: Record<string, unknown> = {}) {
  const b = baseProps(over);
  const w = mount(TerminalTabView, { props: b.props });
  return { ...b, w };
}

beforeEach(() => {
  applyLangLocal('zh');
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => (cmd === 'clipboard_read' ? 'clip-text' : undefined));
  Object.assign(h.state, {
    termOptions: [], terms: [], linkHandlers: [], fitCalls: 0, searches: [],
    clearDecorations: 0, resultsCb: null, proposed: { cols: 118, rows: 41 },
  });
  observers.length = 0;
  setProtoBox(800, 600);
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  setProtoBox(0, 0);
});

describe('TerminalTabView 生命周期与数据接线（E1/E2/E9、F1）', () => {
  it('mount_registers_data_sink_and_unmount_unregisters_it', () => {
    const { register, unregister, w } = mountTab();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('ql:demo');
    expect(typeof register.mock.calls[0][1]).toBe('function');
    expect(h.state.terms.length).toBe(1);
    expect(observers.length).toBe(1);
    expect(observers[0].targets.length).toBe(1);
    w.unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledWith('ql:demo');
    expect(h.state.terms[0].disposed).toBe(true);
    expect(observers[0].disconnected).toBe(true);
  });

  it('terminal_is_created_with_spec_options_and_three_addons', () => {
    const { w } = mountTab();
    // F1 逐字：scrollback 5000 / fontSize 13 / fontFamily 是与 src/style.css:29 逐字同值的字面量栈（索引 K23(1)）
    expect(h.state.termOptions[0]).toEqual({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace" });
    expect(h.state.linkHandlers.length).toBe(1);   // WebLinksAddon 构造时拿到 open_external 处理器
    w.unmount();
  });

  it('sink_writes_terminal_output_into_the_terminal_instance', () => {
    const { register, w } = mountTab();
    const sink = register.mock.calls[0][1] as (d: string) => void;
    sink('\x1b[31m中文\x1b[0m');
    sink('second chunk');
    expect(h.state.terms[0].written).toEqual(['\x1b[31m中文\x1b[0m', 'second chunk']);
    w.unmount();
  });

  it('first_frame_reports_size_without_waiting_for_resize_observer', () => {
    // 索引 K11(2)：主进程按 80×24 兜底建 PTY，首帧不上报就永远按 80×24 排版
    const { onResize, w } = mountTab();
    expect(h.state.fitCalls).toBe(1);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('ql:demo', 118, 41);
    w.unmount();
  });
});

describe('TerminalTabView 输入与尺寸（E3/E4）', () => {
  it('term_onData_forwards_ctrl_c_verbatim_to_onInput', () => {
    const { onInput, w } = mountTab();
    const term = h.state.terms[0];
    expect(typeof term.dataCb).toBe('function');
    term.dataCb('\x03');                       // 审查重点 5：Ctrl+C 必须原样送达 PTY
    expect(onInput).toHaveBeenCalledWith('ql:demo', '\x03');
    term.dataCb('dir /w\r');
    expect(onInput).toHaveBeenLastCalledWith('ql:demo', 'dir /w\r');
    w.unmount();
  });

  it('hidden_container_skips_fit_and_onResize_until_it_has_width_again', () => {
    setProtoBox(0, 0);                          // 挂载时页签处于 v-show 隐藏态
    const { onResize, w } = mountTab();
    expect(h.state.fitCalls).toBe(0);
    expect(onResize).not.toHaveBeenCalled();
    fireResize();
    expect(h.state.fitCalls).toBe(0);
    expect(onResize).not.toHaveBeenCalled();
    const el = w.find('.term-view').element;
    setElementBox(el, 800, 600);               // 重新可见
    fireResize();
    expect(h.state.fitCalls).toBe(1);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('ql:demo', 118, 41);
    w.unmount();
  });

  it('exposed_fit_re_reports_size_for_a_restarted_terminal', () => {
    // 同一页签上再次启动：主进程按 80×24 兜底新建 PTY（索引 K11(2)），
    // 上层「自动激活 + fit」时必须能强制再报一次，否则新 PTY 永远按 80×24 排版。
    const { onResize, w } = mountTab();
    expect(onResize).toHaveBeenCalledTimes(1);
    (w.vm as unknown as { fit: (force?: boolean) => void }).fit();
    expect(h.state.fitCalls).toBe(2);
    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenLastCalledWith('ql:demo', 118, 41);
    w.unmount();
  });

  it('same_size_is_not_reported_twice', () => {
    const { onResize, w } = mountTab();
    fireResize();
    fireResize();
    expect(h.state.fitCalls).toBe(3);          // 每次都 fit（尺寸可能变），但…
    expect(onResize).toHaveBeenCalledTimes(1); // …尺寸未变就不再发一次上报
    w.unmount();
  });
});

describe('TerminalTabView 键盘与剪贴板（E5/E7，审查重点 5）', () => {
  it('ctrl_shift_c_copies_selection_and_is_not_sent_to_terminal', () => {
    const { onInput, w } = mountTab();
    const term = h.state.terms[0];
    expect(typeof term.keyHandler).toBe('function');
    term.selection = 'selected line';
    const handled = (term.keyHandler as (e: unknown) => boolean)({
      type: 'keydown', key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, altKey: false,
    });
    expect(handled).toBe(false);               // false = xterm 不处理 → 不会作为输入写进 PTY
    expect(invoke).toHaveBeenCalledWith('clipboard_write', 'selected line');
    expect(onInput).not.toHaveBeenCalled();
    w.unmount();
  });

  it('ctrl_c_is_not_intercepted_and_reaches_the_terminal', () => {
    const { onInput, w } = mountTab();
    const term = h.state.terms[0];
    const handled = (term.keyHandler as (e: unknown) => boolean)({
      type: 'keydown', key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: false, altKey: false,
    });
    expect(handled).toBe(true);                // 交给终端 → 中断当前命令
    term.dataCb('\x03');
    expect(onInput).toHaveBeenCalledWith('ql:demo', '\x03');
    w.unmount();
  });

  it('ctrl_shift_v_pastes_from_clipboard_read', async () => {
    const { w } = mountTab();
    const term = h.state.terms[0];
    const handled = (term.keyHandler as (e: unknown) => boolean)({
      type: 'keydown', key: 'v', code: 'KeyV', ctrlKey: true, shiftKey: true, altKey: false,
    });
    expect(handled).toBe(false);
    await flush();
    expect(invoke).toHaveBeenCalledWith('clipboard_read');
    expect(term.pasted).toEqual(['clip-text']);
    w.unmount();
  });

  it('right_click_pastes_from_clipboard_read', async () => {
    const { w } = mountTab();
    await w.find('.term-view').trigger('contextmenu');
    await flush();
    expect(invoke).toHaveBeenCalledWith('clipboard_read');
    expect(h.state.terms[0].pasted).toEqual(['clip-text']);
    w.unmount();
  });
});

describe('TerminalTabView 工具条与关闭（E6/E8/E10）', () => {
  it('clear_button_clears_the_terminal_only', async () => {
    const { w, register } = mountTab();
    const btn = w.find('.btn-term-clear');
    expect(btn.attributes('aria-label')).toBe('清空终端');
    await btn.trigger('click');
    expect(h.state.terms[0].cleared).toBe(1);
    expect(register).toHaveBeenCalledTimes(1);   // 清空不重建终端
    w.unmount();
  });

  it('search_box_drives_addon_and_count_uses_dict_placeholders', async () => {
    const { w } = mountTab();
    const input = w.find('.log-search-input');
    expect(input.attributes('placeholder')).toBe('查找终端输出…');
    expect(w.find('.btn-search-prev').attributes('aria-label')).toBe('上一个匹配');
    expect(w.find('.btn-search-next').attributes('aria-label')).toBe('下一个匹配');
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    await input.setValue('warn');
    const next = h.state.searches.filter((s) => s.dir === 'next' && s.term === 'warn');
    expect(next.length).toBeGreaterThan(0);
    expect((next[0].opts as any).decorations).toBeTruthy();  // 计数依赖 decorations 才发结果事件
    expect(w.find('.log-search-count').text()).toBe('1 / 3');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeUndefined();
    await w.find('.btn-search-prev').trigger('click');
    expect(h.state.searches.some((s) => s.dir === 'prev' && s.term === 'warn')).toBe(true);
    expect(w.find('.log-search-count').text()).toBe('2 / 3');
    await w.find('.btn-search-next').trigger('click');
    expect(h.state.searches.filter((s) => s.dir === 'next').length).toBe(2);
    // 清空查找按钮复用既有 log.search.clear（索引 K21(2)），不新建键
    const clear = w.find('.btn-search-clear');
    expect(clear.attributes('aria-label')).toBe('清空查找');
    await clear.trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(h.state.clearDecorations).toBe(1);
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    w.unmount();
  });

  it('close_button_is_disabled_with_blocked_tooltip_when_closeDisabled', () => {
    const { w } = mountTab({ closeDisabled: true });
    const btn = w.find('.btn-close-tab');
    expect(btn.exists()).toBe(true);
    expect(btn.attributes('disabled')).toBeDefined();
    expect(btn.attributes('aria-label')).toBe('关闭页签');
    expect(btn.attributes('data-tooltip')).toBe('终端运行中，请先停止再关闭');
    w.unmount();
  });

  it('closable_false_renders_no_close_button', () => {
    const { w } = mountTab({ closable: false });
    expect(w.find('.btn-close-tab').exists()).toBe(false);
    w.unmount();
  });

  it('clicking_enabled_close_button_emits_close_with_tab_id', async () => {
    const { w } = mountTab();
    const btn = w.find('.btn-close-tab');
    expect(btn.attributes('disabled')).toBeUndefined();
    expect(btn.attributes('data-tooltip')).toBe('关闭页签');
    await btn.trigger('click');
    expect(w.emitted('close')).toEqual([['ql:demo']]);
    w.unmount();
  });

  it('weblink_activation_opens_uri_through_open_external', async () => {
    const { w } = mountTab();
    const handler = h.state.linkHandlers[0] as (e: MouseEvent, uri: string) => void;
    expect(typeof handler).toBe('function');
    handler({} as MouseEvent, 'https://example.com/guide');
    expect(invoke).toHaveBeenCalledWith('open_external', 'https://example.com/guide');
    w.unmount();
  });
});
