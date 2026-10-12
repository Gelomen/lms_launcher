<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import LogTabView from './LogTabView.vue';
import TerminalTabView from './TerminalTabView.vue';
import { LOG_TABS, type LogTabId, type LogTabItem } from './log-tabs';
import { t } from '../i18n';

// 标签条 + 激活切换；行数据由 App 分桶后按 tab 下发，视图状态全在 LogTabView 实例内。
// 两种页签共存（规格 §9.1）：text → LogTabView（不改）；terminal → TerminalTabView（xterm，任务 9）。
library.add(faXmark);   // [x]（F3：本组件内注册；TerminalTabView 在它自己组件内也 add 过，两处各自注册）

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
// close(id)（任务 10 / 审查重点 3）：页签条与终端工具条的 [x] → App 关页签；终端运行中时 [x] 禁用，否则留孤儿 PTY。
const emit = defineEmits<{ (e: 'clear', id: LogTabId): void; (e: 'close', id: string): void; (e: 'update:active', id: string): void }>();

// 缺省 = 静态两页签（LOG_TABS 仍是 id 与顺序的单一真源）；label === fullLabel ⇒ 不挂 title（E7 / 索引 K26(2)）。
const fallbackTabs: LogTabItem[] = LOG_TABS.map((tab) => ({
  id: tab.id, label: tab.label, fullLabel: tab.label, kind: 'text', closable: false, closeDisabled: false,
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

function onTabClick(item: LogTabItem): void {
  if (active.value === item.id) return;
  // 受控：只冒泡 update:active(id)，切换由 App 改 prop 完成（E9）；非受控：自持（既有行为不变）。
  if (controlled.value) { emit('update:active', item.id); return; }
  internalActive.value = item.id;
}

// [x]：closable 才渲染（E3）；closeDisabled（终端运行中，R3）时禁用且不冒泡 close。
function onCloseClick(item: LogTabItem): void {
  if (!item.closable || item.closeDisabled) return;
  emit('close', item.id);
}

// 终端数据接线的透传（C4）：props 未给时按 no-op —— TerminalTabView 的这几个 prop 是必填的。
const pipeRegister = (id: string, sink: (d: string) => void): void => { props.register?.(id, sink); };
const pipeUnregister = (id: string): void => { props.unregister?.(id); };
const pipeInput = (id: string, data: string): void => { props.onInput?.(id, data); };
const pipeResize = (id: string, cols: number, rows: number): void => { props.onResize?.(id, cols, rows); };
</script>
<template>
  <section class="log-panel">
    <nav class="tab-bar" role="tablist">
      <!-- data-tab-id 只是测试/调试钩子（索引 M4）；页签文案取 item.label（构造方给的短名），不反取终端组件的 data-* -->
      <button v-for="item in items" :key="item.id" type="button" role="tab"
        class="log-tab" :data-tab-id="item.id" :class="{ active: item.id === active }"
        :aria-selected="item.id === active ? 'true' : 'false'"
        :title="item.label === item.fullLabel ? undefined : item.fullLabel"
        :ref="(el) => setTabEl(item.id, el)" @click="onTabClick(item)">
        <span class="log-tab-label">{{ item.label }}</span>
        <button v-if="item.closable" type="button" class="icon-btn icon-btn--noborder btn-close-tab"
          :aria-label="t('ql.btn.closeTab')"
          :data-tooltip="item.closeDisabled ? t('ql.tab.closeBlocked') : t('ql.btn.closeTab')"
          :disabled="item.closeDisabled" @click.stop="onCloseClick(item)">
          <FontAwesomeIcon :icon="['fas', 'xmark']" />
        </button>
      </button>
    </nav>
    <!-- 两种页签的内容一律 v-show 保活（索引 K26(4) / F7）：TerminalTabView 卸载即 unregister + term.dispose()
         （TerminalTabView.vue:180-188），用 v-if 等于「切页签杀终端」。下面的 v-if 只按 kind 分流，与激活态无关。 -->
    <template v-for="item in items" :key="item.id">
      <LogTabView v-if="item.kind === 'text'" v-show="item.id === active"
        :id="item.id" :lines="buckets[item.id as LogTabId]" @clear="emit('clear', item.id as LogTabId)" />
      <TerminalTabView v-else v-show="item.id === active"
        :id="item.id" :label="item.label" :full-label="item.fullLabel"
        :closable="item.closable" :close-disabled="item.closeDisabled"
        :register="pipeRegister" :unregister="pipeUnregister" :on-input="pipeInput" :on-resize="pipeResize"
        @close="emit('close', $event)" />
    </template>
  </section>
</template>
