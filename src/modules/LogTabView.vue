<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCircleDown, faCircleUp, faCircleXmark, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke } from '../ipc';
import { findMatches, splitLineForSearch, type MarkRange, type RenderSeg } from '../util/log-search';

// 清空日志（2026-08-28）：无文字 icon 按钮——复用编辑模板弹窗左下角的删除图标
// （faTrashCan regular，TemplateModal .btn-delete 同源）；emit('clear')，App 只清本 tab 桶。
library.add(faTrashCan, faCircleUp, faCircleDown, faCircleXmark);
const emit = defineEmits<{ (e: 'clear'): void }>();
function onClear(): void { emit('clear'); }

// 日志链接 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2）：
// invoke 的 reject（协议被主进程拒绝等）静默——主进程已白名单校验，无 UI 后果。
function onLink(url: string): void {
  void invoke('open_external', url).catch(() => {});
}

// ---- 日志查找（规格 2026-09-05-log-search-design）----
// 状态自持于本实例（与 autoScroll 同模式）：切 tab 互不影响；清空日志不清查找状态。
const query = ref('');
// 扁平匹配列表：第 n 个匹配 = { 行号, 行内区间 }；currentIdx = -1 表示尚未跳转。
interface Hit { line: number; range: MarkRange }
const matches = computed<Hit[]>(() => {
  const q = query.value.trim();
  const out: Hit[] = [];
  if (!q) return out;
  props.lines.forEach((e, i) => {
    for (const r of findMatches(e.line, q)) out.push({ line: i, range: r });
  });
  return out;
});
const currentIdx = ref(-1);
// 匹配列表变化（输入变化 / 新日志到达）：当前序号越界时回落到最后一个匹配（规格 §行为 6）。
watch(matches, (ms) => {
  if (currentIdx.value >= ms.length) currentIdx.value = ms.length > 0 ? ms.length - 1 : -1;
});
const countText = computed(() =>
  `${Math.max(currentIdx.value + 1, 0)} / ${matches.value.length}`); // 空查询/无匹配 = 0 / 0（2026-09-05 用户追加）
const navDisabled = computed(() => matches.value.length === 0);
// 清空查找输入（2026-09-05 用户追加）：far circle-xmark，输入框与计数之间；输入为空时禁用。
const clearDisabled = computed(() => query.value.length === 0);
function onQueryClear(): void { query.value = ''; }
// 每行渲染分组（模板逐行调用）：链接/高亮/当前高亮 三类属性合并切分；
// 连续 inLink 段归入一个链接分组——链接外层只渲染一个 .ln-link（文本完整、
// Ctrl+Click 命中整链接），高亮段嵌套其中（测试 link 内高亮要求嵌套 DOM）。
interface LinkGroup { inLink: true; url: string; parts: RenderSeg[] }
type RenderUnit = RenderSeg | LinkGroup;
function segsOf(e: Entry, i: number): RenderUnit[] {
  const cur = currentIdx.value >= 0 && matches.value[currentIdx.value]?.line === i
    ? matches.value[currentIdx.value].range
    : null;
  const segs = splitLineForSearch(e.line, query.value.trim(), cur);
  const out: RenderUnit[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (s.inLink && last && 'parts' in last && last.url === s.url) last.parts.push(s);
    else if (s.inLink) out.push({ inLink: true, url: s.url!, parts: [s] });
    else out.push(s);
  }
  return out;
}
// 上/下一个跳转：循环（无当前时 ↓=第 1 个、↑=最后一个）；跳转同时关闭自动滚动——
// 否则下一批日志到达立即贴底，刚跳到的位置瞬间失效（规格 §行为 5）。
function jump(delta: 1 | -1): void {
  const n = matches.value.length;
  if (n === 0) return;
  const cur = currentIdx.value;
  currentIdx.value = cur < 0 ? (delta === 1 ? 0 : n - 1) : (cur + delta + n) % n;
  autoScroll.value = false;
  // 滚到当前匹配：等 .ln-mark--current 渲染后 scrollIntoView 视野中部（happy-dom 无该方法 → 可选链守卫）。
  void nextTick(() => {
    const el = view.value?.querySelector<HTMLElement>('.ln-mark--current');
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });
}
function goPrev(): void { jump(-1); }
function goNext(): void { jump(1); }

// 单个 tab 的日志视图（§4.4）：白底 Solarized Light、等宽 13px、自动滚动可关。
// 自动滚动状态由本组件自持——每个 tab 一个实例，切走再切回各自保留。
const props = defineProps<{ id: string; lines: Array<{ line: string; stream: 'sys' | 'out' | 'err' }> }>();

type Entry = { line: string; stream: 'sys' | 'out' | 'err' };

// 自动滚动：默认开；勾选框直接驱动跟随（勾选 = 立即贴底 + 此后每批新日志持续贴底）。
const autoScroll = ref(true);
const view = ref<HTMLElement | null>(null);

// 贴底：nextTick 等 DOM 更新后再读 scrollHeight（行高 1.6×13px，内容按批次增长）。
function scrollToBottom(): void {
  void nextTick(() => {
    const el = view.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}

// §4.4 五档着色（纯内容启发式，stream 不作颜色依据）——原 LogPanel cls() 原文迁移：
function cls(e: Entry): string {
  if (e.stream === 'sys') return 'ln-dim';
  const low = e.line.toLowerCase();
  // glog 前缀：0.02.489.298 I srv（数字 + ≥2 组点分小数 + 空格 + 单字母级别）
  const lvl = low.match(/\s*\d+(?:[.:]\d+){2,}\s+([iwe])\b/)?.[1] ?? null;
  if (lvl === 'e' || low.includes('error') || low.includes('fatal')) return 'ln-err';
  if (lvl === 'w' || low.includes('warn')) return 'ln-warn'; // warning/warn 均含该子串
  if (low.includes('server ready') || low.includes('listening')) return 'ln-ok';
  return '';
}

// 勾选时：每批新日志都把视图滚到最新位置。
// 信号源 1 —— 行数：常规增长（<500 行）时长度递增即触发。
// 信号源 2 —— 桶内首行身份：满 500 行后 App 端 splice+push 保持长度恒定，
//   长度 watch 永不触发 → 不再跟随；用首行对象引用作为"内容已变"的兜底信号。
watch([
  (): number => props.lines.length,
  (): unknown => props.lines[0] ?? null,
], () => {
  if (!autoScroll.value) return;
  scrollToBottom();
});

// 重新勾选立即贴底：用户在底部上方读历史时，勾选框是唯一恢复跟随的入口——
// 若只依赖上面两条信号，勾选后视图要等下一条日志才跟（体验上"勾选没反应"）。
watch(autoScroll, (on) => {
  if (on) scrollToBottom();
});
// DOM 事件随组件销毁失效；无定时器 / IPC 订阅需清理。
</script>
<template>
  <div class="log-pane" :data-tab-id="id">
    <div style="display: flex; justify-content: flex-start; align-items: center;">
      <label style="display: flex; gap: 4px; align-items: center; user-select: none;" class="label">
        <input type="checkbox" v-model="autoScroll" style="margin: 0; accent-color: var(--primary);" />
        <span>自动滚动</span>
      </label>
      <!-- [清空日志]：icon-only（无文字）+ aria-label；icon 复用 TemplateModal 删除图标（trash-can regular）；
           盒型 = style.css 既有 .icon-btn（32×32、hover 浅灰），hover tooltip 由 data-tooltip 提供 -->
      <button type="button" class="icon-btn icon-btn--noborder" aria-label="清空日志" data-tooltip="清空日志" @click="onClear">
        <FontAwesomeIcon :icon="['far', 'trash-can']" />
      </button>
      <!-- [日志查找]（2026-09-05）：输入即查 + 计数 + 上/下一个（far circle-up/down，regular 优先）。
           （2026-09-05 用户反馈）控件收进 .log-search 一组，统一 gap:4px——原 margin 散落导致按钮间距过大 -->
      <div class="log-search">
        <input type="text" class="input log-search-input" v-model="query"
          placeholder="查找…" aria-label="日志查找" />
        <!-- [清空查找]（2026-09-05 用户追加）：far circle-xmark 圆形内 x；清空输入即复位高亮与计数 -->
        <button type="button" class="icon-btn icon-btn--noborder btn-search-clear"
          aria-label="清空查找" data-tooltip="清空查找" :disabled="clearDisabled" @click="onQueryClear">
          <FontAwesomeIcon :icon="['far', 'circle-xmark']" />
        </button>
        <span class="label log-search-count">{{ countText }}</span>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-prev"
          aria-label="上一个匹配" data-tooltip="上一个" :disabled="navDisabled" @click="goPrev">
          <FontAwesomeIcon :icon="['far', 'circle-up']" />
        </button>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-next"
          aria-label="下一个匹配" data-tooltip="下一个" :disabled="navDisabled" @click="goNext">
          <FontAwesomeIcon :icon="['far', 'circle-down']" />
        </button>
      </div>
    </div>
    <div ref="view" class="log-view">
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">
        <template v-for="(g, k) in segsOf(e, i)" :key="k">
          <span v-if="g.inLink && g.parts" class="ln-link tip-up" data-tooltip="Ctrl + Click 打开链接" @click.ctrl="onLink(g.url)">
            <template v-for="(seg, j) in g.parts" :key="j">
              <span v-if="seg.current" class="ln-mark--current">{{ seg.text }}</span>
              <span v-else-if="seg.mark" class="ln-mark">{{ seg.text }}</span>
              <template v-else>{{ seg.text }}</template>
            </template>
          </span>
          <span v-else-if="g.current" class="ln-mark--current">{{ g.text }}</span>
          <span v-else-if="g.mark" class="ln-mark">{{ g.text }}</span>
          <template v-else>{{ g.text }}</template>
        </template>
      </p>
    </div>
  </div>
</template>