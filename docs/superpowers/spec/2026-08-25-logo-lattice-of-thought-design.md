# logo 定稿：思维晶格 Lattice of Thought — 设计规格

**Date:** 2026-08-25
**范围：** 应用图标资源（SVG 主稿 + 多尺寸 ICO）。不涉及 IPC / 业务逻辑；main.ts 侧已有 appIconPath()，无需改动代码。
**背景：** 前代图标为蓝紫渐变方块占位（见 docs/superpowers/spec/2026-08-25-exe-and-titlebar-logo-fix.md）。本次用定稿的彩色 AI 主题图形正式替换。

## 定稿结论（头脑风暴 2026-08-24 ~ 08-25，视觉伴侣迭代）

- 方向：A′ · 思维晶格（v3 正圆修订后，用户确认）。
- 修正记录：
  - v1（发光球 / 卡通大脑 / 玩具原子）→ 被判「幼稚」；
  - v2/v3 收紧为宝石色 + 精确几何 + 正圆轮廓；
  - v3-A′ 外围星点修订为正圆排布后，用户确认去掉外围——16px 下噪点收益低，主体更干净。
- **最终：只有六棱双锥晶簇本体，全透明底，无光晕、无徽章、无外围元素。**

## 图形（SVG 主稿几何基准）

viewBox 240×240，中心 (120,120)，坐标系与比例如下：

| 元素 | 参数 |
|---|---|
| 晶体顶 T | (120, 46) |
| 晶体底 B | (120, 206) |
| 中环顶点 V_i（i=0..5） | 椭圆 rx=62 / ry=24，中心 (120,120)，角 = π/3·i − π/2 |
| 上切面（6 个） | polygon(T, V_i, V_{i+1})，fill = topShades[i]，opacity .95 |
| 下切面（6 个） | polygon(B, V_{i+1}, V_i)，fill = botShades[i]，opacity .95 |
| 棱线（12 条） | T→V_i、B→V_i，stroke = linearGradient(#c3ccff → #7a68f0)，width .9，opacity .8 |
| 中脊高光 | line(T, B)，stroke #e8ecff，width 1.4，opacity .6 |

配色：

- topShades = ["#a4b3ff", "#7f76e8", "#c0a6ff", "#6d64e4", "#8f9dff", "#5b56d4"]
- botShades  = ["#4a42a8", "#2e2470", "#4a42a8", "#332a7e", "#463da0", "#2a2166"]

寓意：面 = 结晶下来的想法；棱 = 想法之间的约束关系——「思维被结构本身承载」。

## 交付物

1. **src-main/logo.svg**（新增）— 上述几何的 SVG 主稿，矢量入库。
2. **src-main/icon.ico**（替换）— 从 logo.svg 光栅化生成的多尺寸 ICO：
   - 尺寸：16 / 20 / 24 / 32 / 48 / 64 / 128 / 256 px；
   - 格式：每个尺寸独立条目，32bpp RGBA（BI_RGBA 或 BITMAPINFOHEADER + AND/XOR 按 MS ICO 规范正确填写 planes/bitCount/dataOffset）；
   - **alpha 通道必须保留**——透明底直接透出标题栏 / 任务栏背景。

## 硬约束（来自前次事故，非协商项）

- ICO 容器必须 GDI+ 可加载（对照：旧图标曾因容器畸形被拒载）。
- 验证手段（全部在 Windows PowerShell 执行）：
  - New-Object System.Drawing.Icon (path) → LOAD OK；
  - ExtractAssociatedIcon 对重建产物 exe 返回非 null；
  - 渲染截图 32 / 64 / 128 px 目检晶簇切面与透明底正确。
- 浅色 / 深色系统主题下均不显脏：顶面亮靛紫（#a4b3ff 系）保白底对比，底面深靛（#2e2470 系）压住灰底——已在头脑风暴中于 #ffffff 与 #e8e8e6 下目检通过。

## 光栅化方案（实现阶段细节留给 writing-plans）

- 一次性构建脚本（放 .temp/）：SVG → PNG（256px，sharp 等工具）→ 各尺寸缩放 → 打包 ICO；
- main.ts **零改动**：appIconPath() 已处理窗口 / 托盘取图路径；
- electron-builder --win portable 重建后，dist-release 下 exe / resources/icon.ico 与 src-main/icon.ico sha256 一致。

## 测试与验收

- npm test 全绿（基线 38/38）；
- npx tsc -p tsconfig.main.json 通过；
- electron-builder --win portable 构建成功，且上述 GDI+ / ExtractAssociatedIcon 验证全部通过。
