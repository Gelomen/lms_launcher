# GPU 显存使用率面积图实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（- [ ]）语法来跟踪进度。

**目标：** 在 GPU 信息卡片的显卡名称与 4 项信息格之间添加一个紫色填充的面积图，展示专用显存使用率（百分比）最近 60 秒的历史变化。

**架构：** 在 GpuModule.vue 的每个渲染层中添加 canvas 元素；利用已有的 gpu-stats IPC 事件（每 ~2 秒推送）计算使用率百分比并推入按 luid 索引的环形缓冲区（30 点）；使用 Canvas 2D API 绘制极简面积图（无坐标轴、无刻度）。布局通过 CSS 调整：显卡名称下方预留 ~65px 图表区域，4 格信息和轮播指示点整体下移。

**技术栈：** Vue 3、Canvas 2D API、CSS Flex/Grid、ResizeObserver

---

## 文件结构

- 修改：src/modules/GpuModule.vue — 添加 canvas 元素、数据收集逻辑、绘制逻辑
- 修改：src/style.css — 调整 GPU 卡片内部布局（图表区域、信息格间距、指示点位置）
- 修改：src/modules/GpuModule.test.ts — 补充面积图相关测试

---

### 任务 1：创建 feat 分支

**文件：** 无（git 操作）

- [ ] **步骤 1：创建并切换到 feat 分支**

运行：
```bash
git checkout -b feat/gpu-memory-usage-chart
```

预期：成功切换到新分支

---

### 任务 2：调整 CSS 布局为图表腾出空间

**文件：**
- 修改：src/style.css:517-570（GPU 卡片相关样式）

- [ ] **步骤 1：修改 .gpu-stage 的 min-height**

将 min-height 从 150px 调整为 190px（为图表预留空间）：
```css
.gpu-stage { position: relative; min-height: 190px; flex: 1; }
```

- [ ] **步骤 2：修改 .gpu-title-row 的 margin-bottom**

将标题行与下方内容的间距从 8px 调整为 4px（图表紧挨标题）：
```css
.gpu-title-row { flex: 0 0 auto; margin-bottom: 4px; }
```

- [ ] **步骤 3：添加图表区域样式**

在 GPU 卡片样式区域添加新样式类：
```css
.gpu-chart {
  width: 100%;
  height: 65px;
  margin-bottom: 8px;
  flex: 0 0 auto;
  border: 1px solid #E5E7EB;
  border-radius: 4px;
  background: #FAFAFA;
}
.gpu-chart canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

- [ ] **步骤 4：修改 .gpu-grid 的 gap**

将 4 格信息间距从 10px 24px 调整为 6px 24px（行距压缩，腾出空间）：
```css
.gpu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
```

- [ ] **步骤 5：修改 .gpu-dots 的 padding**

让轮播指示点更靠近底部：
```css
.gpu-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding-top: 4px;
  padding-bottom: 8px;
  flex: 0 0 auto;
}
```

- [ ] **步骤 6：运行测试确认无回归**

运行：`npm test -- --testNamePattern=GpuModule`
预期：所有现有 GpuModule 测试通过

---

### 任务 3：在 GpuModule.vue 中添加 canvas 元素和数据收集逻辑

**文件：**
- 修改：src/modules/GpuModule.vue:1-140（script 部分）
- 修改：src/modules/GpuModule.vue:140-178（template 部分）

- [ ] **步骤 1：添加 canvas 元素到每个 layer**

在 template 中，每个 .gpu-layer 内，在 .gpu-title-row 和 .gpu-grid 之间插入：
```vue
<div class="gpu-chart">
  <canvas :ref="(el) => setChartCanvas(i, el)" />
</div>
```
（i 是 v-for 的层索引，l 是层对象）

- [ ] **步骤 2：添加 canvas 引用管理函数**

在 script 中添加（注意：key 是层索引 0/1，不是 GPU 索引）：
```ts
const chartCanvases = new Map<number, HTMLCanvasElement>();

function setChartCanvas(layerIndex: number, el: unknown): void {
  if (el instanceof HTMLCanvasElement) {
    chartCanvases.set(layerIndex, el);
  }
}
```

- [ ] **步骤 3：添加环形缓冲区数据收集逻辑**

在 script 中添加：
```ts
// 每个 GPU 的显存使用率历史（按 luid 索引，最多 30 点 = 60 秒）
const gpuHistory = new Map<string, number[]>();
const BUFFER_SIZE = 30;

function updateGpuHistory(gpus: GpuStats[]): void {
  for (const g of gpus) {
    if (!gpuHistory.has(g.luid)) {
      gpuHistory.set(g.luid, []);
    }
    const history = gpuHistory.get(g.luid)!;
    if (g.dedicatedTotal > 0) {
      const pct = (g.dedicatedUsed / g.dedicatedTotal) * 100;
      history.push(Math.min(100, Math.max(0, pct)));
      while (history.length > BUFFER_SIZE) {
        history.shift();
      }
    }
  }
}
```

- [ ] **步骤 4：在 onGpuStats 回调中调用更新逻辑**

修改现有的 onMounted 中的 onGpuStats 回调：
```ts
onMounted(() => {
  unsub = onGpuStats((e) => {
    gpus.value = e.gpus as GpuStats[];
    updateGpuHistory(e.gpus as GpuStats[]);
    nextTick(() => drawAllCharts());
  });
});
```

- [ ] **步骤 5：运行测试确认无回归**

运行：`npm test -- --testNamePattern=GpuModule`
预期：所有现有 GpuModule 测试通过

---

### 任务 4：实现 Canvas 面积图绘制

**文件：**
- 修改：src/modules/GpuModule.vue:1-140（script 部分）

- [ ] **步骤 1：添加单个图表绘制函数**

在 script 中添加：
```ts
function drawChart(canvas: HTMLCanvasElement, history: number[]): void {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  // 设置 canvas 实际尺寸（考虑 dpr）
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  
  if (history.length < 2) return;
  
  const stepX = width / (BUFFER_SIZE - 1);
  
  // 绘制填充区域
  ctx.beginPath();
  ctx.moveTo(0, height);
  
  for (let i = 0; i < history.length; i++) {
    const x = i * stepX;
    const y = height - (history[i] / 100) * height;
    ctx.lineTo(x, y);
  }
  
  ctx.lineTo((history.length - 1) * stepX, height);
  ctx.closePath();
  
  // 紫色填充（任务管理器风格）
  ctx.fillStyle = 'rgba(124, 77, 255, 0.25)';
  ctx.fill();
  
  // 顶部边界线
  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const x = i * stepX;
    const y = height - (history[i] / 100) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(124, 77, 255, 1)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
```

- [ ] **步骤 2：添加绘制所有图表的函数**

在 script 中添加：
```ts
function drawAllCharts(): void {
  if (!gpus.value) return;
  
  for (const layer of layers.value) {
    const layerIndex = layers.value.indexOf(layer);
    const canvas = chartCanvases.get(layerIndex);
    if (!canvas) continue;
    
    const gpu = gpus.value[layer.cardIndex];
    if (!gpu) continue;
    
    const history = gpuHistory.get(gpu.luid) || [];
    drawChart(canvas, history);
  }
}
```

- [ ] **步骤 3：在动画 settle 后重绘**

在 go() 函数的 settleTimer 回调中（settle 完成后），添加重绘调用：
```ts
settleTimer = setTimeout(() => {
  animating.value = false;
  layers.value[0].cardIndex = target;
  layers.value[0].on = true;
  layers.value[0].x = 0;
  layers.value[0].noAnim = true;
  layers.value[1].on = false;
  layers.value[1].x = 0;
  layers.value[1].noAnim = true;
  settleTimer = null;
  
  // settle 后层 cardIndex 变化，重绘所有图表
  nextTick(() => drawAllCharts());
}, SETTLE_MS);
```

- [ ] **步骤 4：处理 ResizeObserver（canvas 宽度跟随容器）**

在 script 中添加：
```ts
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    drawAllCharts();
  });
  
  // 观察所有 canvas 容器
  document.querySelectorAll('.gpu-chart').forEach((el) => {
    resizeObserver!.observe(el);
  });
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
});
```

- [ ] **步骤 5：运行测试确认无回归**

运行：`npm test -- --testNamePattern=GpuModule`
预期：所有现有 GpuModule 测试通过

---

### 任务 5：补充测试

**文件：**
- 修改：src/modules/GpuModule.test.ts

- [ ] **步骤 1：添加 canvas 元素存在性测试**

```ts
it('renders a canvas chart element per GPU layer', () => {
  const wrapper = mount(GpuModule, { /* ...mock gpus... */ });
  expect(wrapper.findAll('.gpu-chart canvas').length).toBe(2);
});
```

- [ ] **步骤 2：添加数据流测试（mock IPC 事件触发历史更新）**

```ts
it('updates gpu history on gpu-stats event', async () => {
  // ... setup and trigger mock gpu-stats event with known data
  // ... verify gpuHistory has correct percentage
});
```

- [ ] **步骤 3：运行所有测试**

运行：`npm test`
预期：所有测试通过

---

### 任务 6：手动验证和 commit

**文件：** 无（验证操作）

- [ ] **步骤 1：启动开发模式**

运行：`npm run dev`

- [ ] **步骤 2：验证多卡场景**

观察 GPU 卡片：
- 显卡名称下方出现紫色面积图
- 图表随时间平滑更新（每 ~2 秒新数据点）
- 4 格信息和轮播指示点正确显示
- 卡片总高度未变化（与相邻卡片等高）

- [ ] **步骤 3：验证单卡场景**

同上，确认单卡时图表也正常工作

- [ ] **步骤 4：Commit**

运行：
```bash
git add src/modules/GpuModule.vue src/style.css src/modules/GpuModule.test.ts
git commit -m "feat: add dedicated GPU memory usage chart to GPU info cards"
```
