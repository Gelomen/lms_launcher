# 审查包 · 任务 9（`TerminalTabView.vue`，xterm 交互终端页签）

BASE = 49df85c（HEAD）。两份文件都是**新建且未跟踪**（按 K5 实现者不提交），所以这里给的是全文而非 diff：
- `src/modules/TerminalTabView.vue`（225 行）
- `src/modules/TerminalTabView.test.ts`（403 行，18 条用例）

本任务经历过一次**定向修复**：主代理核实了实现者对 `fontFamily` 的取证，判定 F1/规格 §9.3 的写法是文档缺陷 → 先改三份文档（`41e04a2` / `49df85c`，登记 K23(1)），再派新实现者按更正后的口径改代码。下面的全文**已含**该修复。

主代理已独立核过（供参考，不是结论）：
```
G1 npx vitest run src/modules/TerminalTabView.test.ts → Tests 18 passed (18), exit 0
G2 npx vitest run src/modules/LogTabView.test.ts src/modules/LogPanel.test.ts src/App.test.ts → Tests 80 passed (80), exit 0
G3 npx vitest run src-main/i18n src/i18n.test.ts → Tests 25 passed (25), exit 0（含 key-coverage / no-hardcoded）
npx tsc -p tsconfig.main.json --noEmit → exit 0（注：tsconfig.main.json:15 排除 .test.ts，且不覆盖 src/ 渲染端）
取值同值（我自己读的两行）：style.css:29 = --font-mono: 'Cascadia Code', Consolas, monospace;  ↔  TerminalTabView.vue:151 fontFamily: "'Cascadia Code', Consolas, monospace"
我自己的变异：把 fontFamily 改回 var(--font-mono) → 恰 1 红（terminal_is_created_with_spec_options_and_three_addons）；还原后 SHA 前后同为 a61640e3c573
范围：git status --porcelain 只有这两份未跟踪文件 + 该 check 表
```
实现者自报的四处变异自检（去首帧上报 / 去隐藏守卫 / 拦截 Ctrl+C / WebLinks 不传处理器）分别让 3/1/1/1 条用例红。

## `src/modules/TerminalTabView.vue`（全文）

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCircleDown, faCircleUp, faCircleXmark, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '../ipc';
import { t } from '../i18n';

// 终端页签（规格 2026-10-10-quick-launch-card-design §9.3）：一个 xterm 实例 = 一个 PTY。
// 单向数据流：输出由上层按 tabId 派发进来（挂载时 register 交出的 sink），
// 输入与尺寸经 props 的回调出去（对应 §8 的 ql_write / ql_resize）；本组件不订阅任何事件。
// 外壳复用静态页签的尺寸链（style.css 的 .log-pane → .log-view，见 :262 那条高度链注释），不新增 CSS 类。
library.add(faTrashCan, faCircleUp, faCircleDown, faCircleXmark, faXmark);

// props 以计划 §任务 9 为准（索引 K2 / 本任务 A4）：含 label/fullLabel，不含 configId。
const props = defineProps<{
  id: string;
  label: string;
  fullLabel: string;
  closable: boolean;
  closeDisabled: boolean;
  register: (id: string, sink: (d: string) => void) => void;
  unregister: (id: string) => void;
  onInput: (id: string, data: string) => void;
  onResize: (id: string, cols: number, rows: number) => void;
}>();
const emit = defineEmits<{ close: [id: string] }>();

const view = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let observer: ResizeObserver | null = null;
let reportedCols = 0;
let reportedRows = 0;

// ---- 尺寸（规格 §9.3 / 计划 审查重点 2）----
// v-show 切走的页宽高为 0，此时 fit() 会把 cols/rows 算成异常值写坏 PTY → 先按盒尺寸挡掉；
// 重新可见时 ResizeObserver 必然收到一次尺寸变化，再 fit。
function fitAndReport(force = false): void {
  const el = view.value;
  if (!el || !fitAddon) return;
  if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
  fitAddon.fit();
  reportSize(force);
}

// 首帧必须上报（索引 K11(2)）：主进程 start() 不带尺寸、按 80×24 兜底建 PTY，
// 不上报这一次，终端就一直按 80×24 排版。ResizeObserver 会多次回调，同尺寸不重复发；
// force = true 供上层在「同一页签再次启动」（PTY 被重建为 80×24）时强制再报一次。
function reportSize(force = false): void {
  if (!term) return;
  const cols = term.cols;
  const rows = term.rows;
  if (cols <= 0 || rows <= 0) return;
  if (!force && cols === reportedCols && rows === reportedRows) return;
  reportedCols = cols;
  reportedRows = rows;
  props.onResize(props.id, cols, rows);
}

// ---- 复制 / 粘贴（规格 §8：file:// 下 navigator.clipboard 不可靠 → 走主进程）----
function copySelection(): void {
  if (!term) return;
  const text = term.getSelection();
  if (!text) return;
  void invoke('clipboard_write', text).catch(() => {});
}

async function pasteClipboard(): Promise<void> {
  if (!term) return;
  try {
    const text = await invoke<string>('clipboard_read');
    if (text) term.paste(text);
  } catch {
    // 主进程读失败：无界面后果（与 open_external 同口径）
  }
}

// 右键 = 粘贴（规格 §9.3）
function onContextMenu(): void { void pasteClipboard(); }

// ---- 键盘（规格 §9.3 / 计划 审查重点 5）----
// 返回 false = 这条按键不进终端；除两个 Ctrl+Shift 组合外一律返回 true，
// 所以 Ctrl+C 原样交给终端（中断当前命令），不会被当成复制。
function onCustomKey(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  if (!e.ctrlKey || !e.shiftKey || e.altKey) return true;
  const key = (e.key ?? '').toLowerCase();
  const code = e.code ?? '';
  if (key === 'c' || code === 'KeyC') { copySelection(); return false; }
  if (key === 'v' || code === 'KeyV') { void pasteClipboard(); return false; }
  return true;
}

// ---- 查找（规格 §9.1「同一套工具条 UI 语言」）----
const query = ref('');
const searchCount = ref<{ cur: number; total: number }>({ cur: 0, total: 0 });
// 占位符名以词典为准（索引 K21(3)）
const countText = computed(() => t('ql.terminal.count', { cur: searchCount.value.cur, total: searchCount.value.total }));
const navDisabled = computed(() => searchCount.value.total === 0);
const queryEmpty = computed(() => query.value.length === 0);

// 计数来自 SearchAddon 的结果事件，而它只在带 decorations 时发；
// 颜色取 style.css 既有查找高亮（--log-mark / --log-mark-current）与主题紫，保持同一套视觉语言。
function searchOptions(): { decorations: Record<string, string> } {
  return {
    decorations: {
      matchBackground: '#E9D5FF',
      activeMatchBackground: '#C4B5FD',
      matchOverviewRuler: '#8B5CF6',
      activeMatchColorOverviewRuler: '#8B5CF6',
    },
  };
}

// dir = 0：输入变化时的增量查找；±1：上/下一个
function runSearch(dir: -1 | 0 | 1): void {
  if (!searchAddon) return;
  const q = query.value.trim();
  if (!q) {
    searchAddon.clearDecorations();
    searchCount.value = { cur: 0, total: 0 };
    return;
  }
  const opts = searchOptions();
  if (dir === -1) searchAddon.findPrevious(q, opts);
  else if (dir === 1) searchAddon.findNext(q, opts);
  else searchAddon.findNext(q, { ...opts, incremental: true });
}
watch(query, () => runSearch(0));
function onQueryClear(): void { query.value = ''; }

// 清空终端（规格 §9.1）：只清本实例的 buffer 与滚动区，不动上层状态
function onClearTerminal(): void { term?.clear(); }

// 链接（规格 §9.1）：复用既有 open_external（主进程已白名单校验，reject 静默）
function openLink(uri: string): void { void invoke('open_external', uri).catch(() => {}); }

onMounted(() => {
  const el = view.value;
  if (!el) return;
  // 取值逐字按计划 步骤 3 / 规格 §9.3
  // fontFamily 用字面量栈，必须与 src/style.css:29 的 --font-mono 逐字同值（改字体时两处同步）：这里不能用 CSS 变量——xterm 5.5.0 的 CharSizeService 走 canvas 测量，canvas 的 font 不解析 var()，格子按 canvas 默认字体量、字形按 CSS 解析的字体画 → 网格与字形不匹配（索引 K23(1)）
  term = new Terminal({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace" });
  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(new WebLinksAddon((_e, uri) => openLink(uri)));
  term.open(el);
  term.onData((data) => props.onInput(props.id, data));
  term.attachCustomKeyEventHandler(onCustomKey);
  searchAddon.onDidChangeResults((r) => {
    searchCount.value = { cur: r.resultIndex < 0 ? 0 : r.resultIndex + 1, total: r.resultCount };
  });
  props.register(props.id, (data) => term?.write(data));
  observer = new ResizeObserver(() => fitAndReport());
  observer.observe(el);
  fitAndReport();
});

onBeforeUnmount(() => {
  props.unregister(props.id);
  observer?.disconnect();
  observer = null;
  term?.dispose();
  term = null;
  fitAddon = null;
  searchAddon = null;
});

// 供上层在「自动激活 / 再次启动」时显式 fit + 聚焦（规格 §9.2 的启动流程、任务 13 的 E5）；
// 常规切页签不需要它——v-show 恢复显示必然触发 ResizeObserver。
// fit 默认强制上报：页签还在、PTY 被重建时，去重会挡住那次必要的 ql_resize。
defineExpose({
  fit: (force = true): void => fitAndReport(force),
  focus: (): void => term?.focus(),
});
</script>
<template>
  <div class="log-pane" :data-tab-id="id" :data-tab-label="label">
    <div style="display: flex; justify-content: flex-start; align-items: center;">
      <!-- [清空终端]：icon-only + aria-label，盒型复用既有 .icon-btn（同 LogTabView 的清空日志） -->
      <button type="button" class="icon-btn icon-btn--noborder btn-term-clear"
        :aria-label="t('ql.terminal.clear')" :data-tooltip="t('ql.terminal.clear')" @click="onClearTerminal">
        <FontAwesomeIcon :icon="['far', 'trash-can']" />
      </button>
      <!-- 查找一组：输入即查 + 计数 + 上/下一个；清空查找复用 log.search.clear（索引 K21(2)） -->
      <div class="log-search">
        <input type="text" class="input log-search-input" v-model="query"
          :placeholder="t('ql.terminal.searchPlaceholder')" :aria-label="t('ql.terminal.searchPlaceholder')" />
        <button type="button" class="icon-btn icon-btn--noborder btn-search-clear"
          :aria-label="t('log.search.clear')" :data-tooltip="t('log.search.clear')" :disabled="queryEmpty" @click="onQueryClear">
          <FontAwesomeIcon :icon="['far', 'circle-xmark']" />
        </button>
        <span class="label log-search-count">{{ countText }}</span>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-prev"
          :aria-label="t('ql.terminal.searchPrev')" :data-tooltip="t('ql.terminal.searchPrev')" :disabled="navDisabled" @click="runSearch(-1)">
          <FontAwesomeIcon :icon="['far', 'circle-up']" />
        </button>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-next"
          :aria-label="t('ql.terminal.searchNext')" :data-tooltip="t('ql.terminal.searchNext')" :disabled="navDisabled" @click="runSearch(1)">
          <FontAwesomeIcon :icon="['far', 'circle-down']" />
        </button>
      </div>
      <!-- [x]：运行中（closeDisabled）禁用并给出「请先停止」tooltip（计划 审查重点 3） -->
      <button v-if="closable" type="button" class="icon-btn icon-btn--noborder btn-close-tab"
        :aria-label="t('ql.btn.closeTab')"
        :data-tooltip="closeDisabled ? t('ql.tab.closeBlocked') : t('ql.btn.closeTab')"
        :disabled="closeDisabled" @click="emit('close', id)">
        <FontAwesomeIcon :icon="['fas', 'xmark']" />
      </button>
    </div>
    <!-- xterm 挂载点：沿用 .log-view 的 flex:1 高度链，只把它的 overflow-y 关掉（xterm 自带视口滚动） -->
    <div ref="view" class="log-view term-view" style="overflow: hidden; min-height: 0;" @contextmenu.prevent="onContextMenu"></div>
  </div>
</template>
```

## `src/modules/TerminalTabView.test.ts`（全文）

```ts
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
```
