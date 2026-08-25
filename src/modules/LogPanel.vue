<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

// 模块 4 · 日志区（§4.4）：白底 Solarized Light、等宽 13px、自动滚动可关、500 行上限由 App 维持。
const props = defineProps<{ lines: Array<{ line: string; stream: 'sys' | 'out' | 'err' }> }>();

// 自动滚动：默认开；用户滚离底部暂停，滚回底部恢复
const autoScroll = ref(true);
const view = ref<HTMLElement | null>(null);

// sys 行蓝灰（[lms_launcher]）；stream=err 或 error/fatal → log-error；warn/warning → log-warn；ready/listening → log-ok
function cls(e: { line: string; stream: 'sys' | 'out' | 'err' }): string {
  if (e.stream === 'sys') return 'ln-dim';
  const low = e.line.toLowerCase();
  if (e.stream === 'err' || low.includes('error') || low.includes('fatal')) return 'ln-err';
  if (low.includes('warn')) return 'ln-warn'; // warning/warn 均含该子串
  if (low.includes('server ready') || low.includes('listening')) return 'ln-ok';
  return '';
}

// 仅当用户在底部附近才滚，避免读日志时跳回；nextTick 等 DOM 更新后再读 scrollHeight
watch((): number => props.lines.length, () => {
  if (!autoScroll.value) return;
  void nextTick(() => {
    const el = view.value;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTop = el.scrollHeight;
  });
});

function onScroll(): void {
  const el = view.value;
  if (!el) return;
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
}
// DOM 事件随组件销毁失效；无定时器 / IPC 订阅需清理。
</script>
<template>
  <section class="log-panel">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h3>日志</h3>
      <label style="display: flex; gap: 4px; align-items: center;" class="label">
        <input type="checkbox" v-model="autoScroll" style="margin: 0;" />
        <span>自动滚动</span>
      </label>
    </div>
    <div ref="view" class="log-view" @scroll="onScroll">
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">{{ e.line }}</p>
    </div>
  </section>
</template>
