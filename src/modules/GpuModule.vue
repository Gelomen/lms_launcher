<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onGpuStats, type GpuStats } from '../ipc';

// 模块 5 · 系统 GPU 显存卡片（spec 2026-09-09-gpu-card-design §5）：
// 数据由主进程每 ~2 秒经 gpu-stats 事件推送（onGpuStats）；多卡 ‹ › 轮播（模运算绕回）；
// 底部 N 圆点纯展示（当前实心灰、其余空心描边，不可点击）。
// formatGb 与 src-main/gpu-stats.ts 同名纯函数实现一致（渲染端不能跨构建导入主进程模块，
// 两份各自由单测用同一组 fixture 锁定防漂移）。
function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '–';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

const gpus = ref<GpuStats[] | null>(null); // null = 首帧未到达
const index = ref(0); // 当前卡下标（圆点/标题；点击立即切到目标）
const multi = computed(() => (gpus.value?.length ?? 0) > 1);

function cur(i: number): GpuStats | undefined {
  return gpus.value ? gpus.value[i] : undefined;
}
// 四格数值："22.7 GB / 24.0 GB"；任一侧 ≤0 → 该侧 "–"
function mem(used: number, total: number): string {
  return formatGb(used) + ' / ' + formatGb(total);
}

// 轮播层（spec §5.2）：两层绝对定位。x: 0=中心 / 1=+100%（右侧屏外）/ -1=-100%（左侧屏外）。
// v1（任务 5）：无动画，go() 只切 index 与当前层内容；任务 6 补 200ms 滑动。
interface GpuLayer { on: boolean; noAnim: boolean; cardIndex: number; x: -1 | 0 | 1 }
const layers = ref<GpuLayer[]>([
  { on: true, noAnim: true, cardIndex: 0, x: 0 },
  { on: false, noAnim: true, cardIndex: 0, x: 0 },
]);

function go(dir: 1 | -1): void {
  const n = gpus.value?.length ?? 0;
  if (n === 0) return;
  // 一律模运算绕回（单一循环逻辑，不分支卡数，spec §5.2 用户指定）
  index.value = (index.value + dir + n) % n;
  layers.value[0].cardIndex = index.value;
}

// 卡数组长度变化（热插拔，罕见）：index 越界钳回 0
watch(() => gpus.value?.length ?? 0, (n) => { if (index.value >= n) index.value = 0; });

let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = onGpuStats((e) => { gpus.value = e.gpus as GpuStats[]; }); // 数据刷新不打断动画
});
onUnmounted(() => { if (unsub) unsub(); });

function posClass(x: -1 | 0 | 1): string {
  return x === 0 ? 'gpu-pos-0' : x === 1 ? 'gpu-pos-r' : 'gpu-pos-l';
}
</script>

<template>
  <section class="module module-gpu">
    <h2>系统 GPU</h2>
    <div class="gpu-body" :class="{ 'gpu-body--nav': multi }">
      <!-- ‹ 贴卡片左边缘、› 贴右边缘（左右各占一边，纵向居中，用户指定）；单卡不渲染 -->
      <button v-if="multi" type="button" class="gpu-nav-btn gpu-nav-btn--left" aria-label="上一张卡" @click="go(-1)">‹</button>
      <div class="gpu-stage">
        <div
          v-for="(l, i) in layers"
          :key="i"
          class="gpu-layer"
          :class="[posClass(l.x), { 'gpu-layer--off': !l.on, 'gpu-no-anim': l.noAnim }]"
        >
          <template v-if="cur(l.cardIndex)">
            <!-- 标题行 = 当前卡名，始终显示（单卡也显示，用户指定） -->
            <div class="gpu-title-row"><span class="gpu-title">{{ cur(l.cardIndex)!.name }}</span></div>
            <div class="gpu-grid">
              <div class="gpu-cell"><span class="label">利用率</span><span class="gpu-val">{{ cur(l.cardIndex)!.utilization }} %</span></div>
              <div class="gpu-cell"><span class="label">专用 GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.dedicatedUsed, cur(l.cardIndex)!.dedicatedTotal) }}</span></div>
              <!-- 合计行 = 专用 + 共享（组件层计算，spec §3） -->
              <div class="gpu-cell"><span class="label">GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.dedicatedUsed + cur(l.cardIndex)!.sharedUsed, cur(l.cardIndex)!.dedicatedTotal + cur(l.cardIndex)!.sharedTotal) }}</span></div>
              <div class="gpu-cell"><span class="label">共享 GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.sharedUsed, cur(l.cardIndex)!.sharedTotal) }}</span></div>
            </div>
          </template>
          <template v-else>
            <!-- 首帧数据到达前：标题 "…"、四格 "…"，无圆点 -->
            <div class="gpu-title-row"><span class="gpu-title">…</span></div>
            <div class="gpu-grid">
              <div class="gpu-cell"><span class="label">利用率</span><span class="gpu-val">…</span></div>
              <div class="gpu-cell"><span class="label">专用 GPU 内存</span><span class="gpu-val">…</span></div>
              <div class="gpu-cell"><span class="label">GPU 内存</span><span class="gpu-val">…</span></div>
              <div class="gpu-cell"><span class="label">共享 GPU 内存</span><span class="gpu-val">…</span></div>
            </div>
          </template>
        </div>
        <!-- 底部指示点：N 卡 = N 点，当前实心灰、其余空心描边；纯展示不可点击（切换只走 ‹ ›） -->
        <div v-if="gpus" class="gpu-dots">
          <span v-for="(g, i) in gpus" :key="g.luid" class="dot" :class="{ 'dot--active': i === index }" />
        </div>
      </div>
      <button v-if="multi" type="button" class="gpu-nav-btn gpu-nav-btn--right" aria-label="下一张卡" @click="go(1)">›</button>
    </div>
  </section>
</template>
