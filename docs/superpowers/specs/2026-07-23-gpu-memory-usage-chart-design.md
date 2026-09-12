# GPU 显存使用率面积图设计

## 概述
在 GPU 信息卡片的显卡名称与 4 项信息格之间，添加一个紫色填充的面积图，展示该显卡专用显存使用率（百分比）随时间变化的历史曲线。风格参考 Windows 任务管理器 - 性能 - GPU 视图。

## 布局变化

### 单卡内部结构（从上到下）
1. **显卡名称**（不变）
2. **面积图区域**（新增，高度 ~65px）
3. **4 项信息格**（整体下移，间距略压缩）
4. **轮播指示点**（下移，更靠近卡片底部）

总卡片高度不变（由 grid 布局决定，与其他卡片等高）。

## 图表规格

| 属性 | 值 |
|------|-----|
| 数据类型 | 专用显存使用率百分比 (dedicatedUsed / dedicatedTotal * 100) |
| Y 轴范围 | 固定 0% → 100% |
| X 轴范围 | 最近 60 秒 |
| 采样间隔 | ~2 秒（由 gpu-stats IPC 推送频率决定） |
| 数据点数 | 最多 30 个 |
| 渲染方式 | HTML5 Canvas（无外部依赖） |
| 填充色 | 紫色 #7C4DFF（参考任务管理器风格） |
| 透明度 | 填充区域 opacity ~0.3，顶部边界线 opacity 1.0 |
| 空数据 | 无数据时显示空白（或极浅灰色占位） |

## 数据流

```
主进程 gpu-stats 事件（每 ~2s）
    ↓ IPC: window.lms.onGpuStats
GpuModule.vue 收到 gpus[]
    ↓
对每个 GPU: 计算 pct = dedicatedUsed / dedicatedTotal * 100
    ↓
推入按 luid 索引的环形缓冲区（保留最新 30 点）
    ↓
requestAnimationFrame 触发 canvas 重绘
```

## 组件状态

```ts
// 每个 GPU 的显存使用率历史（按 luid 索引）
const gpuHistory = ref<Map<string, number[]>>(new Map());
// 缓冲区容量
const BUFFER_SIZE = 30;
```

每次收到 gpu-stats 事件时：
1. 对每个 GPU 计算使用率百分比
2. push 到对应 luid 的数组
3. 如果数组长度 > 30，shift 最旧的点
4. 标记对应 canvas 需要重绘

## 实现细节

### Canvas 绘制
- 使用设备像素比（dpr）缩放以保证清晰
- 面积图由折线 + 底部闭合路径构成
- 折线平滑：使用简单线性插值（或 Catmull-Rom 样条）
- 无坐标轴、无刻度、无网格（极简风格，与任务管理器一致）
- 无数据标签（右侧的 GB 数字已经在信息格中）

### 响应式
- canvas 宽度跟随容器宽度（使用 ResizeObserver）
- canvas 高度固定（~65px）

### 错误处理
- dedicatedTotal = 0 时跳过该 GPU（不计算百分比）
- 首帧无历史数据时不绘制

## 分支策略
在 feat 分支工作，命名：`feat/gpu-memory-usage-chart`

## 影响范围
- src/modules/GpuModule.vue（主要修改）
- src/style.css（GPU 卡片布局调整）
- src/ipc.ts（无修改，接口已满足）
- src-main/（无修改，数据推送已存在）

## 测试
- GpuModule.test.ts 需要补充面积图相关测试（canvas 存在、数据流正确）
- 手动验证多卡场景下每卡图表独立更新
