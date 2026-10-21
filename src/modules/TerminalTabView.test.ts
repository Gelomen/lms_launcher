// @vitest-environment happy-dom
// 组件级测试：TerminalTabView —— 只测接线（规格 §12.5：xterm 的真实渲染不在单测范围；
// 计划全局约束与索引 G8：xterm 与三个 addon 必须打桩）。
// happy-dom 无布局：页签可见性用覆写 offsetWidth/offsetHeight 模拟（0 = v-show 隐藏），
// 尺寸由假 FitAddon 固定给出 118×41，用来断言首帧与恢复可见后的尺寸上报（索引 K11(2)）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import TerminalTabView from './TerminalTabView.vue';
import { TERM_PALETTES } from './term-palettes';
import { TERM_PALETTE_IDS, type TermPaletteId } from '../../src-main/term-palettes';
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
    // 构造参数同时挂到实例（票 #13）：「换配色不重建终端」要断 term.options.theme 被**整对象替换**，
    // 假 xterm 不给实例挂 options 那条断言就无从落点。
    options: Record<string, unknown> = {};
    constructor(options: unknown) { state.termOptions.push(options); state.terms.push(this); this.options = { ...(options as object) }; }
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
    // 进程态（App 的 qlStates 下发）：缺省 = 运行中 → 工具条那颗 = [停止] 可点（2026-10-20 替换原 closable/closeDisabled）
    running: true,
    stopping: false,
    restartDisabled: false,
    // 终端配色快照（票 #13）：App 在建页签时取一次，缺省 = 默认档
    palette: 'paper' as TermPaletteId,
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
    // allowProposedApi：查找装饰（= 计数与高亮）依赖它，见 TerminalTabView.vue 构造处注释与
    // TerminalTabView.search.test.ts（真 xterm 集成，本套件的假 addon 看不见该真机契约）
    expect(h.state.termOptions[0]).toEqual({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace", allowProposedApi: true, theme: TERM_PALETTES['paper'].theme });
    expect(h.state.linkHandlers.length).toBe(1);   // WebLinksAddon 构造时拿到 open_external 处理器
    w.unmount();
  });

  // ── 票 #13 · 终端配色（ADR 0001 / spec #12 的渲染端决定）----
  // 三条门：① 构造参数带 theme，且 theme 由 palette prop 决定；② 换配色 = term.options.theme 整对象替换，
  // 终端实例不变（PTY 与滚动缓冲不动）；③ 查找高亮 decorations 与 theme 取自**同一张表**
  // （搜索高亮曾被单独硬编码成两档淡紫，硬编码是这次要根除的东西）。

  it('palette_prop_decides_the_theme_the_terminal_is_constructed_with', () => {
    const { w } = mountTab({ palette: 'charcoal' });
    expect(h.state.termOptions[0]).toMatchObject({ theme: TERM_PALETTES['charcoal'].theme });
    w.unmount();
  });

  // 描边也取表里那一行。happy-dom 把 outline 简写展开成长写属性，断言按长写来；
  // 只钉字面 hex / transparent 的两档 —— console 与 warm-paper 存的是应用令牌 var(--border)，CSSOM 不解析 var()。
  it('canvas_border_of_the_view_comes_from_the_same_palette_row', () => {
    const { w } = mountTab({ palette: 'campbell' });
    const style = (w.find('.term-view').attributes('style') ?? '').toLowerCase();
    expect(style).toMatch(/outline-width:\s*1px/);
    expect(style).toMatch(/outline-style:\s*solid/);
    expect(style).toContain(TERM_PALETTES['campbell'].canvasBorder.toLowerCase());
    w.unmount();
    const second = mountTab({ palette: 'charcoal' });
    expect((second.w.find('.term-view').attributes('style') ?? '')).toContain(TERM_PALETTES['charcoal'].canvasBorder);
    second.w.unmount();
  });

  it('palette_change_replaces_the_whole_theme_object_without_recreating_the_terminal', async () => {
    const { w } = mountTab({ palette: 'charcoal' });
    const term0 = h.state.terms[0];
    await w.setProps({ palette: 'warm-night' });
    // 终端实例必须还是那一个（重建 = 杀 PTY、丢滚动缓冲，正是票 #13 禁止的做法）
    expect(h.state.terms.length).toBe(1);
    expect(h.state.terms[0]).toBe(term0);
    expect(term0.disposed).toBe(false);
    expect(term0.options.theme).toEqual(TERM_PALETTES['warm-night'].theme);
    // 整对象替换（ADR:15 的真机取证：改 term.options.theme.background 这类内部属性不生效）
    expect(term0.options.theme).not.toBe(TERM_PALETTES['warm-night'].theme);
    w.unmount();
  });

  it('search_decorations_and_theme_come_from_the_same_palette_row', async () => {
    const { w } = mountTab({ palette: 'warm-paper' });
    await w.find('input.log-search-input').setValue('abc');
    const opts = h.state.searches[0]?.opts as { decorations: Record<string, string> };
    expect(opts.decorations).toEqual(TERM_PALETTES['warm-paper'].decorations);
    expect((h.state.termOptions[0] as { theme: unknown }).theme).toEqual(TERM_PALETTES['warm-paper'].theme);
    // 结构性门：组件源码里不得再出现任何 hex 字面量（配色只能从表里取）
    const src = readFileSync(join(__dirname, 'TerminalTabView.vue'), 'utf8');
    expect(src, 'TerminalTabView.vue 里不得再硬编码 hex —— 配色与查找高亮一律取自 TERM_PALETTES').not.toMatch(/#[0-9A-Fa-f]{6}/);
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

  it('exposed_fit_does_not_re_report_by_default_but_fit_true_does', () => {
    // F8 / 索引 K23(3)：默认不强制上报 —— 任务 13 每次激活都会调 fit()，
    // 默认强制就等于每次切页签都发一次多余的 ql_resize（正是去重要消除的那次）。
    // 「同一页签再次启动」时主进程把 PTY 重建为 80×24（索引 K11(2)），尺寸没变却必须重报
    // → 调用方必须显式 fit(true)（任务 13 的 E5 会这么做）。
    const { onResize, w } = mountTab();
    const vm = w.vm as unknown as { fit: (force?: boolean) => void };
    expect(onResize).toHaveBeenCalledTimes(1);
    vm.fit();                            // 默认：fit 照跑，尺寸未变 → 不再发一次上报
    expect(h.state.fitCalls).toBe(2);
    expect(onResize).toHaveBeenCalledTimes(1);
    vm.fit(true);                        // 显式强制：重启后的 PTY 必须拿到真实尺寸
    expect(h.state.fitCalls).toBe(3);
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

  it('changed_size_is_reported_again', () => {
    // F2 / 索引 K23(3) 的正半边：容器真的变了 → fit 给出新尺寸 → 必须再发一次 ql_resize。
    // 上面那条只钉住负半边（同尺寸不重发）；没有这条，去重写成「每实例只报一次」也照样全绿。
    const { onResize, w } = mountTab();
    expect(onResize).toHaveBeenCalledTimes(1);
    h.state.proposed = { cols: 90, rows: 30 };   // 假 FitAddon 这次给出不同的尺寸
    fireResize();
    expect(h.state.fitCalls).toBe(2);            // 照常 fit
    expect(onResize).toHaveBeenCalledTimes(2);   // 且新尺寸再上报一次
    expect(onResize).toHaveBeenLastCalledWith('ql:demo', 90, 30);
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

describe('TerminalTabView 工具条进程态按钮（E6/E8/E10 · 2026-10-20 工具条 [x] → [停止] → 停完 [重新启动]）', () => {
  it('clear_button_clears_the_terminal_only', async () => {
    const { w, register } = mountTab();
    const btn = w.find('.btn-term-clear');
    expect(btn.attributes('aria-label')).toBe('清空终端');
    await btn.trigger('click');
    expect(h.state.terms[0].cleared).toBe(1);
    expect(register).toHaveBeenCalledTimes(1);   // 清空不重建终端
    w.unmount();
  });

  it('clear_terminal_resets_search_count_and_decorations', async () => {
    // 顺手修 C：term.clear() 把 buffer（连同匹配）清掉了，
    // 计数与高亮必须一起复位，否则显示停在「1 / 3」、上/下一个指向不存在的匹配。
    const { w } = mountTab();
    await w.find('.log-search-input').setValue('warn');
    expect(w.find('.log-search-count').text()).toBe('1 / 3');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeUndefined();
    await w.find('.btn-term-clear').trigger('click');
    expect(h.state.terms[0].cleared).toBe(1);
    expect(h.state.clearDecorations).toBe(1);   // 高亮随 buffer 一起清掉
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('root_exposes_short_and_full_tab_labels_in_separate_attributes', () => {
    // 顺手修 D：data-tab-label 装的是短 label，全名另有 data-tab-full-label，
    // 任务 10 做 tooltip 时取后者，不会取到截断名。props（C1）未动。
    const { w } = mountTab();
    const root = w.find('.log-pane');
    expect(root.attributes('data-tab-id')).toBe('ql:demo');
    expect(root.attributes('data-tab-label')).toBe('Demo');
    expect(root.attributes('data-tab-full-label')).toBe('Demo · PowerShell 7 (pwsh)');
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

  it('result_index_sentinel_minus_one_displays_zero_based_index', async () => {
    // 顺手修 E：addon-search 的文档（node_modules/@xterm/addon-search/typings/addon-search.d.ts:142）
    // 说匹配数超过阈值时 resultIndex 是 -1。实现把它钳到 0，
    // 这条钉住「哨兵值不会变成负数计数或 NaN」——假 addon 平时从不发 -1，所以单独喂一次。
    const { w } = mountTab();
    const cb = h.state.resultsCb as (r: { resultIndex: number; resultCount: number }) => void;
    expect(typeof cb).toBe('function');
    cb({ resultIndex: -1, resultCount: 1200 });
    await w.vm.$nextTick();
    expect(w.find('.log-search-count').text()).toBe('0 / 1200');
    w.unmount();
  });

  // ===== 工具条最右那颗 = 进程态按钮（2026-10-20 用户要求两步：[x] → [停止]，停完变 [重新启动]）=====
  // 三态判据与 QuickLaunch 列表行的状态按钮逐字同口径（索引 K30(1)）：运行中 [停止] / 在途「...」禁用 / 未运行 [重新启动]。
  it('running_state_button_shows_stop_and_emits_stop_with_tab_id', async () => {
    const { w } = mountTab({ running: true, stopping: false });
    const btn = w.find('.btn-term-state');
    expect(btn.exists()).toBe(true);
    expect(btn.attributes('disabled')).toBeUndefined();
    // 文案复用既有 ql.btn.stop（词典中英齐全）
    expect(btn.attributes('aria-label')).toBe('停止');
    expect(btn.attributes('data-tooltip')).toBe('停止');
    expect(btn.find('svg[data-icon="stop"]').exists()).toBe(true);   // 字形 = 列表行那颗的 faStop
    // 字号随工具条继承（UA 的 button{font:13.3333px}，与 [清空终端] / 查找三个逐字同尺寸）：
    // 写 inline font-size 就是「比同排小一圈」→ 用户看到的「不在一条水平线」（取证台 .temp/term-toolbar-align）
    expect(btn.find('svg[data-icon="stop"]').attributes('style') ?? '').not.toContain('font-size');
    await btn.trigger('click');
    expect(w.emitted('stop')).toEqual([['ql:demo']]);                // 只报意图，进程归 App（doQlStop）
    expect(w.emitted('restart')).toBeUndefined();
    expect(w.emitted('close')).toBeUndefined();
    w.unmount();
  });

  it('in_flight_state_button_shows_ellipsis_and_is_disabled', () => {
    const { w } = mountTab({ running: true, stopping: true });
    const btn = w.find('.btn-term-state');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(btn.text()).toBe('...');   // 半角三点 = LaunchBar.vue:129 / QuickLaunch.vue:221 同款在途反馈
    w.unmount();
  });

  it('not_running_state_button_shows_restart_and_emits_restart_with_tab_id', async () => {
    // 用户 2026-10-20 第二轮：停完（或进程自己退出后）那颗必须是 [重新启动]，点它 = 列表行那颗 [启动]
    const { w } = mountTab({ running: false, stopping: false, restartDisabled: false });
    const btn = w.find('.btn-term-state');
    expect(btn.attributes('disabled')).toBeUndefined();
    expect(btn.attributes('aria-label')).toBe('重新启动');           // 新增 key ql.terminal.restart（zh/en 齐全）
    expect(btn.attributes('data-tooltip')).toBe('重新启动');
    expect(btn.find('svg[data-icon="arrow-rotate-right"]').exists()).toBe(true);
    expect(btn.find('svg[data-icon="arrow-rotate-right"]').attributes('style') ?? '').not.toContain('font-size'); // 同上：不写 inline 字号
    expect(btn.find('svg[data-icon="stop"]').exists()).toBe(false);  // 状态切换 = 字形也换，不留「停止」的样子
    await btn.trigger('click');
    expect(w.emitted('restart')).toEqual([['ql:demo']]);             // → App.doQlStart（与列表行同一个出口）
    expect(w.emitted('stop')).toBeUndefined();
    w.unmount();
  });

  it('restart_is_disabled_when_the_config_no_longer_exists', async () => {
    // restartDisabled = App 的 qlConfigs 镜像查不到该条（配置已删）→ 对着不存在的配置发 ql_start 只会失败
    const { w } = mountTab({ running: false, stopping: false, restartDisabled: true });
    const btn = w.find('.btn-term-state');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(btn.attributes('aria-label')).toBe('重新启动');
    await btn.trigger('click');
    expect(w.emitted('restart')).toBeUndefined();
    w.unmount();
  });

  it('toolbar_renders_no_close_button_anymore', () => {
    // 负向门：工具条的 [x] 已删（与页签条的 [x] 重复 → 用户 2026-10-20 要求换成进程态按钮）
    const { w } = mountTab();
    expect(w.find('.btn-close-tab').exists()).toBe(false);
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

// ── 票 #14 · 工具条那颗配色按钮 + 六行浮层（hover 预览 / 点击才落盘 / 配置已删时禁用）──
// 三条不变量：① 预览只换 theme（同一个终端实例，PTY 与滚动缓冲不动）且移开必还原快照；
// ② 只有点击才冒 palette 事件（落盘在 App 的窄通道，本组件不发任何 ql_* 调用）；
// ③ 浮层里每一档的颜色一律取 TERM_PALETTES 那一行，行序取 TERM_PALETTE_IDS，档名取词典字面量 key。
describe('票 #14 · 工具条配色浮层', () => {
  it('palette_button_sits_in_the_toolbar_disabled_once_the_config_is_gone', async () => {
    const { w } = mountTab();
    const btn = w.find('.btn-term-palette');
    expect(btn.exists()).toBe(true);
    expect(btn.attributes('aria-label')).toBe('配色');
    expect(btn.attributes('data-tooltip')).toBe('配色');
    expect(btn.attributes('disabled')).toBeUndefined();
    w.unmount();

    // 条目配置已删（restartDisabled）→ 按钮禁用且浮层开不出，页签沿用创建时的快照档（ADR:14）
    const gone = mountTab({ restartDisabled: true });
    const gb = gone.w.find('.btn-term-palette');
    expect(gb.attributes('disabled')).toBeDefined();
    await gb.trigger('click');
    expect(gone.w.find('.term-palette-pop').exists()).toBe(false);
    gone.w.unmount();
  });

  it('the_popover_lists_six_rows_in_light_and_dark_groups_marking_current_palette', async () => {
    const { w } = mountTab({ palette: 'warm-night' });
    await w.find('.btn-term-palette').trigger('click');
    const pop = w.find('.term-palette-pop');
    expect(pop.exists()).toBe(true);
    const rows = pop.findAll('.term-palette-row');
    expect(rows.length).toBe(6);
    expect(pop.findAll('.term-palette-group').length).toBe(2);
    expect(pop.findAll('.term-palette-group-label').map((g) => g.text())).toEqual(['明底', '暗底']);
    // 行序 = id 真源（三明三暗），不在此处重排
    expect(rows.map((r) => r.attributes('data-palette'))).toEqual([...TERM_PALETTE_IDS]);
    expect(rows.map((r) => r.find('.term-palette-name').text())).toEqual(['纯白', '浅灰画布', '暖纸', '炭黑', '控制台深黑', '暖夜']);   // 当前档那一行还挂一个 ✓，故取名字那一截
    const current = pop.findAll('.term-palette-row.is-current');
    expect(current.length).toBe(1);
    expect(current[0].attributes('data-palette')).toBe('warm-night');
    expect(current[0].attributes('aria-current')).toBe('true');
    // 色块底色也取表里那一行（不得有硬编码 hex，源码门在同文件那条 structural 测试里）
    expect(rows[4].find('.term-palette-swatch').attributes('style') ?? '').toContain(TERM_PALETTES['campbell'].theme.background);
    w.unmount();
  });

  it('hovering_a_row_previews_it_on_the_same_terminal_and_leaving_restores_the_snapshot', async () => {
    const { w } = mountTab({ palette: 'paper' });
    await w.find('.btn-term-palette').trigger('click');
    const term = h.state.terms[0];
    await w.find('.term-palette-row[data-palette="campbell"]').trigger('mouseenter');
    expect(h.state.terms.length).toBe(1);                 // 预览不重建终端
    expect(term.options.theme).toEqual(TERM_PALETTES['campbell'].theme);
    expect(term.options.theme).not.toBe(TERM_PALETTES['campbell'].theme);   // 整对象替换（ADR:15）
    expect(w.find('.term-palette-pop').exists()).toBe(true);
    await w.find('.term-palette-row[data-palette="campbell"]').trigger('mouseleave');
    expect(term.options.theme).toEqual(TERM_PALETTES['paper'].theme);
    w.unmount();
  });

  it('clicking_a_row_emits_the_choice_closes_the_popover_and_persists_nothing_itself', async () => {
    const { w } = mountTab({ palette: 'paper' });
    await w.find('.btn-term-palette').trigger('click');
    await w.find('.term-palette-row[data-palette="charcoal"]').trigger('mouseenter');
    await w.find('.term-palette-row[data-palette="charcoal"]').trigger('click');
    expect(w.emitted('palette')).toEqual([['ql:demo', 'charcoal']]);   // → LogPanel → App.onTerminalPalette（那里才发 ql_set_palette）
    expect(w.find('.term-palette-pop').exists()).toBe(false);
    expect(invoke.mock.calls.filter((c) => String(c[0]).startsWith('ql_'))).toEqual([]);
    // 选定后不回跳成旧快照：屏幕就停在选中的那一档，等 App 把 prop 改成同一档（否则用户看到一次回闪）
    expect(h.state.terms[0].options.theme).toEqual(TERM_PALETTES['charcoal'].theme);
    w.unmount();
  });

  it('escape_and_outside_mousedown_close_the_popover_and_restore_the_previewed_palette', async () => {
    const { w } = mountTab({ palette: 'warm-paper' });
    await w.find('.btn-term-palette').trigger('click');
    await w.find('.term-palette-row[data-palette="charcoal"]').trigger('mouseenter');
    expect(h.state.terms[0].options.theme).toEqual(TERM_PALETTES['charcoal'].theme);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(w.find('.term-palette-pop').exists()).toBe(false);
    expect(h.state.terms[0].options.theme).toEqual(TERM_PALETTES['warm-paper'].theme);   // 关闭时还原快照，不把预览留下
    expect(w.emitted('palette')).toBeUndefined();                                        // ESC 不落盘

    await w.find('.btn-term-palette').trigger('click');
    expect(w.find('.term-palette-pop').exists()).toBe(true);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    expect(w.find('.term-palette-pop').exists()).toBe(false);
    w.unmount();
  });
});
