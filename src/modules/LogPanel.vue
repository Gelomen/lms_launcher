<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

// 模块 4 · 日志区（§4.4）：白底 Solarized Light、等宽 13px、自动滚动可关、500 行上限由 App 维持。
const props = defineProps<{ lines: Array<{ line: string; stream: 'sys' | 'out' | 'err' }> }>();

// 自动滚动：默认开；用户滚离底部暂停，滚回底部恢复
const autoScroll = ref(true);
const view = ref<HTMLElement | null>(null);

// §4.4 五档着色（纯内容启发式，stream 不作颜色依据）：
// llama-server 在 Windows 把 I/W/E 各级日志全写进 stderr（glog），
// 仅靠 stream='err' 判红会把每行都涂红——必须识别 glog 级别前缀 <sec.usec> I|W|E：
// error/fatal 关键字或 glog E → ln-err；warn 关键字或 glog W → ln-warn；
// server ready/listening → ln-ok；sys 行 → ln-dim；其余（含 glog I）默认。
function cls(e: { line: string; stream: 'sys' | 'out' | 'err' }): string {
  if (e.stream === 'sys') return 'ln-dim';
  const low = e.line.toLowerCase();
  // glog 前缀：0.02.489.298 I srv（数字 + ≥2 组点分小数 + 空格 + 单字母级别）
  const lvl = low.match(/^\s*\d+(?:[.:]\d+){2,}\s+([iwe])\b/)?.[1] ?? null;
  if (lvl === 'e' || low.includes('error') || low.includes('fatal')) return 'ln-err';
  if (lvl === 'w' || low.includes('warn')) return 'ln-warn'; // warning/warn 均含该子串
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
    <div style="display: flex; justify-content: flex-end; align-items: center;">
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
