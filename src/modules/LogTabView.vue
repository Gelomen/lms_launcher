<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

// 单个 tab 的日志视图（§4.4）：白底 Solarized Light、等宽 13px、自动滚动可关。
// 自动滚动状态由本组件自持——每个 tab 一个实例，切走再切回各自保留。
const props = defineProps<{ id: string; lines: Array<{ line: string; stream: 'sys' | 'out' | 'err' }> }>();

type Entry = { line: string; stream: 'sys' | 'out' | 'err' };

// 自动滚动：默认开；勾选框直接驱动跟随（勾选 = 新日志到达即滚到最新位置）。
const autoScroll = ref(true);
const view = ref<HTMLElement | null>(null);

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

// 勾选时：每批新日志都把视图滚到最新位置。nextTick 等 DOM 更新后再读 scrollHeight
watch((): number => props.lines.length, () => {
  if (!autoScroll.value) return;
  void nextTick(() => {
    const el = view.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
});
// DOM 事件随组件销毁失效；无定时器 / IPC 订阅需清理。
</script>
<template>
  <div class="log-pane" :data-tab-id="id">
    <div style="display: flex; justify-content: flex-end; align-items: center;">
      <label style="display: flex; gap: 4px; align-items: center;" class="label">
        <input type="checkbox" v-model="autoScroll" style="margin: 0;" />
        <span>自动滚动</span>
      </label>
    </div>
    <div ref="view" class="log-view">
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">{{ e.line }}</p>
    </div>
  </div>
</template>