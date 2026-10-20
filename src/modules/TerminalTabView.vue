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

// 查找状态复位：清掉高亮装饰 + 计数归零（空查询与「清空终端」共用同一条路径）
function resetSearchState(): void {
  searchAddon?.clearDecorations();
  searchCount.value = { cur: 0, total: 0 };
}

// dir = 0：输入变化时的增量查找；±1：上/下一个
function runSearch(dir: -1 | 0 | 1): void {
  if (!searchAddon) return;
  const q = query.value.trim();
  if (!q) {
    resetSearchState();
    return;
  }
  const opts = searchOptions();
  if (dir === -1) searchAddon.findPrevious(q, opts);
  else if (dir === 1) searchAddon.findNext(q, opts);
  else searchAddon.findNext(q, { ...opts, incremental: true });
}
watch(query, () => runSearch(0));
function onQueryClear(): void { query.value = ''; }

// 清空终端（规格 §9.1）：只清本实例的 buffer 与滚动区，不动上层状态。
// buffer 清空 = 既有匹配一并消失，所以查找计数与高亮也要复位，否则计数停在「1 / 3」、
// 上/下一个指向已经不存在的匹配。
function onClearTerminal(): void {
  if (!term) return;
  term.clear();
  resetSearchState();
}

// 链接（规格 §9.1）：复用既有 open_external（主进程已白名单校验，reject 静默）
function openLink(uri: string): void { void invoke('open_external', uri).catch(() => {}); }

onMounted(() => {
  const el = view.value;
  if (!el) return;
  // 取值逐字按计划 步骤 3 / 规格 §9.3
  // fontFamily 用字面量栈，必须与 src/style.css:29 的 --font-mono 逐字同值（改字体时两处同步）：这里不能用 CSS 变量——xterm 5.5.0 的 CharSizeService 走 canvas 测量，canvas 的 font 不解析 var()，格子按 canvas 默认字体量、字形按 CSS 解析的字体画 → 网格与字形不匹配（索引 K23(1)）
  // allowProposedApi 必开：查找计数依赖 addon-search 建匹配装饰，而装饰走 xterm 的 registerDecoration——
  // 该 API 在 @xterm/xterm 5.5.0 里仍是 EXPERIMENTAL（typings/xterm.d.ts:1118），未开此开关时它抛
  // 「You must set the allowProposedApi option to true to use proposed API」；抛出点在 _highlightAllMatches 内、
  // 早于 _fireResults，故计数事件从不触发 → 输入终端里存在的文本也恒显「0 / 0」且无上/下一个可用。
  // 打桩套件看不见这条真机契约（假 addon 无条件发结果事件），由 TerminalTabView.search.test.ts 钉住。
  term = new Terminal({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace", allowProposedApi: true });
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
// fit 默认「不」强制上报（F8 去重）：任务 13 每次激活都会调 fit()，默认强制就等于每次切页签
// 都发一次多余的 ql_resize。只有「同一页签再次启动」那次例外——主进程把 PTY 重建为 80×24
// （索引 K11(2)），尺寸没变却必须重报，所以那种调用必须显式 fit(true)。
defineExpose({
  fit: (force = false): void => fitAndReport(force),
  focus: (): void => term?.focus(),
});
</script>
<template>
  <div class="log-pane" :data-tab-id="id" :data-tab-label="label" :data-tab-full-label="fullLabel">
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
