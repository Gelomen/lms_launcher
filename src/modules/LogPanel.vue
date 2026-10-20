<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import LogTabView from './LogTabView.vue';
import TerminalTabView from './TerminalTabView.vue';
import { LOG_TABS, type LogTabId, type LogTabItem } from './log-tabs';
import { t } from '../i18n';

// 标签条 + 激活切换；行数据由 App 分桶后按 tab 下发，视图状态全在 LogTabView 实例内。
// 两种页签共存（规格 §9.1）：text → LogTabView（不改）；terminal → TerminalTabView（xterm，任务 9）。
library.add(faXmark, faChevronLeft, faChevronRight);   // [x]（F3：本组件内注册；TerminalTabView 在它自己组件内也 add 过，两处各自注册）；chevron 对 = 票 #10 的翻页箭头（free-solid 才有 chevron，同 GpuModule 先例）

interface Entry { line: string; stream: 'sys' | 'out' | 'err' }

const props = defineProps<{
  // 缺省页签（索引 K26(1)）：App.vue:373 只传 :buckets，所以 tabs 必须可选，缺省 = 由 LOG_TABS 生成两个 text 页签。
  tabs?: LogTabItem[];
  buckets: Record<LogTabId, Entry[]>;
  // 受控激活（索引 K27(1) / 规格 §9.2:244）：App 经 v-model:active 持有激活态（任务 13 点 [启动] → 自动激活，§9.2:243）。
  // 传了 = 激活项以 prop 为准；不传 = 自持（既有行为一字不变，索引 K26(1) 同一兼容性口径）。
  active?: string;
  // 终端页签的数据接线（C4 透传）：App 在任务 13 传入；缺省按 no-op，不传时终端页签仍能挂载/卸载。
  register?: (id: string, sink: (d: string) => void) => void;
  unregister?: (id: string) => void;
  onInput?: (id: string, data: string) => void;
  onResize?: (id: string, cols: number, rows: number) => void;
}>();

// [清空日志]（2026-08-28）：LogTabView emit('clear') → 携带本 tab id 透传 App，只清该桶。
// close(id)（任务 10 / 审查重点 3）：页签条的 [x] → App 关页签；终端运行中时 [x] 禁用，否则留孤儿 PTY。
//   （2026-10-20 用户要求：终端工具条那颗不再是 [x]，close 只有页签条一个来源。）
// stop(id)（2026-10-20）：终端工具条的 [停止] → App.doQlStop（= 列表行 [停止] 同一条路），本组件不碰进程。
const emit = defineEmits<{ (e: 'clear', id: LogTabId): void; (e: 'close', id: string): void; (e: 'stop', id: string): void; (e: 'update:active', id: string): void }>();

// 缺省 = 静态两页签（LOG_TABS 仍是 id 与顺序的单一真源）；label === fullLabel ⇒ 不挂 title（E7 / 索引 K26(2)）。
const fallbackTabs: LogTabItem[] = LOG_TABS.map((tab) => ({
  id: tab.id, label: tab.label, fullLabel: tab.label, kind: 'text',
  closable: false, closeDisabled: false, running: false, stopping: false,
}));
const items = computed<LogTabItem[]>(() => props.tabs ?? fallbackTabs);

// 受控 = 传了 active（K27(1)）：激活项以 prop 为准，本组件不自行改它；不传时自持，默认激活第一个 tab
// （LMS Launcher——用户指定顺序的第 1 位）。既有 11 条用例与 App.vue 都走非受控路径，行为一字不变。
const controlled = computed(() => props.active !== undefined);
const internalActive = ref<string>(items.value[0]?.id ?? '');
const active = computed<string>(() => (controlled.value ? props.active ?? '' : internalActive.value));

// 关掉页签后 App 会把它从 tabs 里摘掉：激活项已不存在时不得留空白面板（E10）。
// 非受控 → 内部回落到第一个；受控 → 只冒泡 update:active(第一个 id)，状态归 App，我不越权改它（K27(1)）。
watch(items, (list) => {
  if (list.some((item) => item.id === active.value)) return;
  const first = list[0]?.id ?? '';
  if (controlled.value) { if (first) emit('update:active', first); }
  else internalActive.value = first;
});

// 页签条横向滚动（规格 §11-2 / F2）：切换时把激活页签滚进可视区。
// happy-dom 无 scrollIntoView → 可选链守卫（与 LogTabView.vue:77 同一口径）。
const tabEls = new Map<string, HTMLElement>();
function setTabEl(id: string, el: unknown): void {
  if (el) tabEls.set(id, el as HTMLElement);
  else tabEls.delete(id);
}
// 激活项变化就把它滚进可视区：非受控由点击驱动，受控由 App 改 active 驱动（F2 在两条路径同样生效）。
// flush: 'post' → DOM 已 patch 完，:ref 已把（新出现的）页签元素登记进 tabEls。
watch(active, (id) => {
  tabEls.get(id)?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
}, { flush: 'post' });

// 滚轮直接横滚（spec #8 / T1 #9）：Chromium 对纯 overflow-x 容器不响应竖向滚轮
// （历史只有 shift+滚轮），style.css 旧注释「wheel 照旧」实测不成立（用户 2026-10-19 回报）。
// 这里把 deltaY 转成横向滚动；shift+滚轮（事件里表现为 deltaX）与触摸板横向手势走原生路径不动。
// 不溢出、或该方向已无可滚量时不介入（不 preventDefault），把事件还给页面；滚动条 CSS 不动。
function wheelPixels(el: HTMLElement, e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16;            // 行 → px
  if (e.deltaMode === 2) return e.deltaY * el.clientWidth; // 页 → px
  return e.deltaY;
}
function onTabBarWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return;
  if (e.deltaX !== 0) return; // 已带横向意图（含原生 shift+滚轮）→ 原生路径
  const d = wheelPixels(el, e);
  if (d === 0) return;
  const at = el.scrollLeft;
  if ((d < 0 && at <= 0) || (d > 0 && at >= max)) return;
  el.scrollLeft = Math.min(Math.max(at + d, 0), max);
  e.preventDefault();
}

// ---- 两端翻页箭头（spec #8 / T2 #10）：只在「还能滚的方向」渲染；端点自隐；一步 = 最近被截断页签完整带入 ----
// 显隐判据读真实几何：max = scrollWidth − clientWidth − ε（ε=1px：共边负边距最多 1px，防误报）。happy-dom 无布局
// → 这些数在单测里全 0（箭头天然不出现），测试打桩几何并用 scroll 事件驱动重测（与 T1 同一「无布局取证」口径）。
const tabBarEl = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
function measureBar(): void {
  const el = tabBarEl.value;
  if (!el) { canScrollLeft.value = false; canScrollRight.value = false; return; }
  const max = el.scrollWidth - el.clientWidth - 1;
  canScrollLeft.value = el.scrollLeft > 0;
  canScrollRight.value = max > 0 && el.scrollLeft < max;
}
let barObserver: ResizeObserver | null = null;
onMounted(() => {
  measureBar();
  // 刷新时机：容器尺寸（窗口 resize / RO）+ 页签增删（watch items）+ 一切来源的滚动（nav @scroll）。
  window.addEventListener('resize', measureBar);
  if (typeof ResizeObserver === 'function' && tabBarEl.value) {   // happy-dom 无 RO：跳过，测试靠打桩 + scroll 事件驱动
    barObserver = new ResizeObserver(() => measureBar());
    barObserver.observe(tabBarEl.value);
  }
});
onUnmounted(() => {
  window.removeEventListener('resize', measureBar);
  if (barObserver) { barObserver.disconnect(); barObserver = null; }
  hideTip();   // 卸载时浮层正开着：不摘 scroll/resize 监听 = 永久泄漏（回调指向已卸载组件的 ref）
});
// 页签增删 → 下一帧重测（新开页签立刻出现右箭头；关掉到不溢出则两端都消失）；
// 同时关掉浮层：增删会让被 hover 页签的 label/fullLabel 变化，留着就是过期文本。
watch(items, () => { hideTip(); nextTick(measureBar); }, { flush: 'post' });

// 步长（设计确认：把最近被截断的页签完整带入视野）：右 = 该页签右缘对齐视口右缘；左 = 左缘对齐视口左缘；剩余不足贴边。
// 坐标用 offsetLeft/offsetWidth：偏移父 = .tab-bar 自身（position:relative），不随滚动变化 —— 读 getBoundingClientRect 也行，
// 但偏移属性无视口换算、在单测里可直接打桩。
function stepBar(dir: 1 | -1): void {
  const el = tabBarEl.value;
  if (!el) return;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return;
  const cur = el.scrollLeft;
  const tabs = Array.from(el.querySelectorAll<HTMLElement>('.log-tab'));
  let target = dir === 1 ? max : 0;
  if (dir === 1) {
    const cut = tabs.find((t) => t.offsetLeft + t.offsetWidth > cur + el.clientWidth + 1);
    if (cut) target = Math.min(Math.max(cut.offsetLeft + cut.offsetWidth - el.clientWidth, 0), max);
  } else {
    const cut = [...tabs].reverse().find((t) => t.offsetLeft < cur - 1);
    if (cut) target = Math.min(Math.max(cut.offsetLeft, 0), max);
  }
  if (target === cur) return;
  if (typeof el.scrollTo === 'function') el.scrollTo({ left: target, behavior: 'smooth' });
  else el.scrollLeft = target;   // 无 scrollTo 的兜底（与 F2 scrollIntoView 可选链同一口径）
}

function onTabClick(item: LogTabItem): void {
  if (active.value === item.id) return;
  // 受控：只冒泡 update:active(id)，切换由 App 改 prop 完成（E9）；非受控：自持（既有行为不变）。
  if (controlled.value) { emit('update:active', item.id); return; }
  internalActive.value = item.id;
}

// [x]：closable 才渲染（E3）；closeDisabled（终端运行中，R3）时禁用且不冒泡 close。
function onCloseClick(item: LogTabItem): void {
  if (!item.closable || item.closeDisabled) return;
  hideTip();   // 关掉的正是 hover 中的页签时，浮层不能留在原地（fixed 已脱离页签 DOM）
  emit('close', item.id);
}

// ---- 页签长名 tooltip（2026-10-20 用户要求：native title 改自绘 tooltip 显示完整页签名）----
// 原来（E7 / 索引 K26(2)）：label !== fullLabel 时把 fullLabel 挂成 title → hover 出浏览器原生提示：
// 系统黄底样式与应用脱节、要等 ~1s、且不受控。现改用仓内既有的 .dd-tip 视口浮层
// （Dropdown.vue:154 长名同款：深灰底白字/12px/圆角/z-30，position:fixed）——
// 必须 fixed：.tab-bar 是 overflow-x:auto 的滚动容器，行内 absolute 浮层会被它裁掉
// （本仓同口径手法：.dd-tip / .tpl-tip / .flag-tip 的注释都写着这条）。
// 定位沿用 Dropdown 口径：挂页签右侧垂直居中，右侧估宽放不下视口时 .dd-tip--flip 翻到左缘内侧。
// 显示判据与旧 title 一字不改：label !== fullLabel（截断只在构造方，App.vue:370）。
const tip = ref<{ text: string; x: number; y: number; flip: boolean } | null>(null);
/** 当前浮层锚定的页签元素：fixed 不随内容滚动，故滚动/改窗时要按它的矩形重算坐标。 */
let tipAnchor: HTMLElement | null = null;
/** tooltip 估算宽：与 Dropdown.vue:103 同一口径（CJK 12px/字 × 字数 + padding 2×8 + 余量）。 */
function estTipWidth(text: string): number { return text.length * 12 + 36; }
function placeTip(): void {
  const el = tipAnchor;
  const cur = tip.value;
  if (!el || !cur) return;
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;   // 垂直中心（CSS translateY(-50%) 居中）
  // 右侧放不下（right + 8 + 估宽 > 视口宽 - 8px 安全边距）→ flip 到左缘内侧
  const fitsRight = r.right + 8 + estTipWidth(cur.text) <= (window.innerWidth ?? 0) - 8;
  const x = fitsRight ? r.right + 8 : r.left - 8;
  if (cur.x === x && cur.y === y && cur.flip === !fitsRight) return;   // 值没变不写，省掉无谓重渲染
  tip.value = { text: cur.text, x, y, flip: !fitsRight };
}
function onTabEnter(e: MouseEvent, item: LogTabItem): void {
  if (item.label === item.fullLabel) return;   // 未截断 → 无浮层（与旧 title 同判据）
  tipAnchor = e.currentTarget as HTMLElement;
  tip.value = { text: item.fullLabel, x: 0, y: 0, flip: false };
  placeTip();   // 首帧就带坐标，不留「先渲染再跳位」的一帧
  // 页签条是横向滚动容器（滚轮 / 翻页箭头 / 拖拽都走它）：fixed 浮层不跟着内容滚 → 滚动时按锚点矩形重算。
  // scroll 不冒泡：capture 才收得到 .tab-bar 的滚动（同 Dropdown.vue:68）。
  document.addEventListener('scroll', placeTip, true);
  window.addEventListener('resize', placeTip);
}
function hideTip(): void {
  tip.value = null;
  tipAnchor = null;
  document.removeEventListener('scroll', placeTip, true);
  window.removeEventListener('resize', placeTip);
}

// 终端数据接线的透传（C4）：props 未给时按 no-op —— TerminalTabView 的这几个 prop 是必填的。
const pipeRegister = (id: string, sink: (d: string) => void): void => { props.register?.(id, sink); };
const pipeUnregister = (id: string): void => { props.unregister?.(id); };
const pipeInput = (id: string, data: string): void => { props.onInput?.(id, data); };
const pipeResize = (id: string, cols: number, rows: number): void => { props.onResize?.(id, cols, rows); };
</script>
<template>
  <section class="log-panel">
    <div class="tab-bar-wrap">
      <!-- 翻页箭头（票 #10）：v-if 只在「还能滚的方向」渲染（端点自隐）；放在 role=tablist 之外 —— 它们不是页签。
           aria-label 走 i18n（tab.nav.prev/next，中英）。无 disabled 态：不可滚 = 不存在。 -->
      <button v-if="canScrollLeft" type="button" class="tab-nav-btn"
        :aria-label="t('tab.nav.prev')" @click="stepBar(-1)">
        <FontAwesomeIcon :icon="['fas', 'chevron-left']" />
      </button>
      <nav class="tab-bar" role="tablist" ref="tabBarEl" @wheel="onTabBarWheel" @scroll.passive="measureBar">
      <!-- data-tab-id 只是测试/调试钩子（索引 M4）；页签文案取 item.label（构造方给的短名），不反取终端组件的 data-*。
           aria-label：截断页签把完整名给可访问名（native title 已移除，它原本也参与计算可访问名 → 不能一删了之）。 -->
      <button v-for="item in items" :key="item.id" type="button" role="tab"
        class="log-tab" :data-tab-id="item.id" :class="{ active: item.id === active }"
        :aria-selected="item.id === active ? 'true' : 'false'"
        :aria-label="item.label === item.fullLabel ? undefined : item.fullLabel"
        :ref="(el) => setTabEl(item.id, el)"
        @click="onTabClick(item)" @mouseenter="onTabEnter($event, item)" @mouseleave="hideTip">
        <span class="log-tab-label">{{ item.label }}</span>
        <button v-if="item.closable" type="button" class="icon-btn icon-btn--noborder btn-close-tab"
          :aria-label="t('ql.btn.closeTab')"
          :data-tooltip="item.closeDisabled ? t('ql.tab.closeBlocked') : t('ql.btn.closeTab')"
          :disabled="item.closeDisabled" @click.stop="onCloseClick(item)">
          <FontAwesomeIcon :icon="['fas', 'xmark']" />
        </button>
      </button>
      </nav>
      <button v-if="canScrollRight" type="button" class="tab-nav-btn"
        :aria-label="t('tab.nav.next')" @click="stepBar(1)">
        <FontAwesomeIcon :icon="['fas', 'chevron-right']" />
      </button>
    </div>
    <!-- 两种页签的内容一律 v-show 保活（索引 K26(4) / F7）：TerminalTabView 卸载即 unregister + term.dispose()
         （TerminalTabView.vue:180-188），用 v-if 等于「切页签杀终端」。下面的 v-if 只按 kind 分流，与激活态无关。 -->
    <template v-for="item in items" :key="item.id">
      <LogTabView v-if="item.kind === 'text'" v-show="item.id === active"
        :id="item.id" :lines="buckets[item.id as LogTabId]" @clear="emit('clear', item.id as LogTabId)" />
      <TerminalTabView v-else v-show="item.id === active"
        :id="item.id" :label="item.label" :full-label="item.fullLabel"
        :running="item.running" :stopping="item.stopping"
        :register="pipeRegister" :unregister="pipeUnregister" :on-input="pipeInput" :on-resize="pipeResize"
        @stop="emit('stop', $event)" />
    </template>
    <!-- 长名 tooltip：仓内既有 .dd-tip 视口浮层（深灰底白字/12px/圆角/z-30，position:fixed 避开
         .tab-bar overflow-x 裁切），坐标由 onTabEnter/placeTip 写内联；挂页签右侧垂直居中，
         放不下视口右侧时 .dd-tip--flip 翻左缘内侧。替换原 native title（用户 2026-10-20 要求）。 -->
    <div v-if="tip" class="dd-tip" :class="{ 'dd-tip--flip': tip.flip }"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </section>
</template>
