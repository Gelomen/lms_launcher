<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke } from '../ipc';
import { linkify } from '../util/linkify';

// 清空日志（2026-08-28）：无文字 icon 按钮——复用编辑模板弹窗左下角的删除图标
// （faTrashCan regular，TemplateModal .btn-delete 同源）；emit('clear')，App 只清本 tab 桶。
library.add(faTrashCan);
const emit = defineEmits<{ (e: 'clear'): void }>();
function onClear(): void { emit('clear'); }

// 日志链接 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2）：
// invoke 的 reject（协议被主进程拒绝等）静默——主进程已白名单校验，无 UI 后果。
function onLink(url: string): void {
  void invoke('open_external', url).catch(() => {});
}

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
    </div>
    <div ref="view" class="log-view">
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">
        <template v-for="(seg, j) in linkify(e.line)" :key="j">
          <span v-if="seg.isLink" class="ln-link" :title="seg.url" @click.ctrl="onLink(seg.url!)">{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
    </div>
  </div>
</template>