<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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

// 轮播层（spec §5.2）：两层绝对定位滑动。x: 0=中心 / 1=+100%（右侧屏外）/ -1=-100%（左侧屏外）。
// 槽位不变量：settle 后（静止态）当前卡恒在 0 层；点击动画期间目标层走 1 层（dir=+1 时从右滑入、
// dir=-1 时从左滑入），0 层滑出到对侧；settle 再把当前卡归位回 0 层、闲置 1 层隐藏复位。
interface GpuLayer { on: boolean; noAnim: boolean; cardIndex: number; x: -1 | 0 | 1 }
const layers = ref<GpuLayer[]>([
  { on: true, noAnim: true, cardIndex: 0, x: 0 },
  { on: false, noAnim: true, cardIndex: 0, x: 0 },
]);

const activeLayer = ref(0); // 当前停在中心的层下标（静止态恒为 0）
const animating = ref(false);
const SETTLE_MS = 220; // 200ms 过渡 + 20ms 余量
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function go(dir: 1 | -1): void {
  const n = gpus.value?.length ?? 0;
  if (n === 0) return;
  if (animating.value) {
    // 连续快速点击（spec §5.2）：先把在飞动画归位——滑出中的 0 层与在飞 1 层
    // 都 no-anim 复位并立即隐藏，取消 settle，再对新目标跑动画；
    // 新目标仍走 1 层（槽位不变量），滑入时舞台只有一个可见层。
    layers.value[0].on = false;
    layers.value[0].x = 0;
    layers.value[0].noAnim = true;
    layers.value[1].on = false;
    layers.value[1].x = 0;
    layers.value[1].noAnim = true;
    activeLayer.value = 0;
    animating.value = false;
    if (settleTimer !== null) { clearTimeout(settleTimer); settleTimer = null; }
  }
  // 目标 = 模运算绕回（用户指定：单一循环逻辑，不分支卡数）
  const target = (index.value + dir + n) % n;
  index.value = target; // 圆点/标题立即切到目标（标题行在舞台外，不跟随层滑动）
  // 目标层 = 1 层，no-anim 定位到屏外（不触发过渡）；0 层（当前卡）保持可见
  layers.value[1].cardIndex = target;
  layers.value[1].noAnim = true;
  layers.value[1].x = dir === 1 ? 1 : -1;
  layers.value[1].on = true;
  animating.value = true;
  // 滑动须推迟到第 3 层 nextTick：实测（happy-dom + @vue/test-utils）trigger()
  // 内部自带一次 nextTick，前两层链会在测试的第一个读帧 tick 之前执行，定位帧
  // （pos-r/pos-l + no-anim）就观察不到；第 3 层时测试 tick1 读到定位帧、
  // tick2/3 读到滑动帧（1 层 → 0，0 层 → 反方向屏外）。settle 后把当前卡归位
  // 回 0 层、闲置 1 层隐藏复位。数据刷新不触发本路径（只有点击触发）。
  void nextTick().then(() => {
    void nextTick().then(() => {
      void nextTick().then(() => {
      layers.value[1].noAnim = false;
      layers.value[0].noAnim = false;
      layers.value[1].x = 0;
      layers.value[0].x = dir === 1 ? -1 : 1;
      settleTimer = setTimeout(() => {
        animating.value = false;
        layers.value[0].cardIndex = target;
        layers.value[0].on = true;
        layers.value[0].x = 0;
        layers.value[0].noAnim = true;
        layers.value[1].on = false;
        layers.value[1].x = 0;
        layers.value[1].noAnim = true;
        activeLayer.value = 0;
        settleTimer = null;
      }, SETTLE_MS);
      });
    });
  });
}

// 卡数组长度变化（热插拔，罕见）：index 越界钳回 0
watch(() => gpus.value?.length ?? 0, (n) => { if (index.value >= n) index.value = 0; });

let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = onGpuStats((e) => { gpus.value = e.gpus as GpuStats[]; }); // 数据刷新不打断动画
});
onUnmounted(() => {
  if (unsub) unsub();
  if (settleTimer !== null) clearTimeout(settleTimer);
});

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
        <!-- 标题行在滑动层之外：始终显示当前卡名，点击立即切换，不跟随层滑动（spec §5.1） -->
        <div class="gpu-title-row">
          <span class="gpu-title">{{ gpus && gpus[index] ? gpus[index].name : '…' }}</span>
        </div>
        <div
          v-for="(l, i) in layers"
          :key="i"
          class="gpu-layer"
          :class="[posClass(l.x), { 'gpu-layer--off': !l.on, 'gpu-no-anim': l.noAnim }]"
        >
          <template v-if="cur(l.cardIndex)">
            <!-- 标题行已移到舞台级（层之外）；层内只保留四格网格（滑动内容） -->
            <div class="gpu-grid">
              <div class="gpu-cell"><span class="label">利用率</span><span class="gpu-val">{{ cur(l.cardIndex)!.utilization }} %</span></div>
              <div class="gpu-cell"><span class="label">专用 GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.dedicatedUsed, cur(l.cardIndex)!.dedicatedTotal) }}</span></div>
              <!-- 合计行 = 专用 + 共享（组件层计算，spec §3） -->
              <div class="gpu-cell"><span class="label">GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.dedicatedUsed + cur(l.cardIndex)!.sharedUsed, cur(l.cardIndex)!.dedicatedTotal + cur(l.cardIndex)!.sharedTotal) }}</span></div>
              <div class="gpu-cell"><span class="label">共享 GPU 内存</span><span class="gpu-val">{{ mem(cur(l.cardIndex)!.sharedUsed, cur(l.cardIndex)!.sharedTotal) }}</span></div>
            </div>
          </template>
          <template v-else>
            <!-- 首帧数据到达前：四格 "…"（标题行已移到舞台级显示 "…"），无圆点 -->
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
