# 应用 Logo 更换设计（电源块 · 平涂紫 + 渐变深蓝）

日期：2026-09-01
状态：已实现（icon.ico 已替换，ico.test.ts 已同步，测试 212/212 通过）

## 背景

旧 logo 为「思维晶格」（紫色晶体方块）。用户要求新 logo，主题围绕启动器/火箭/AI/原子，颜色使用当前主题紫色（--primary: #8B5CF6）。经浏览器视觉伴侣三轮迭代（火箭+轨道 / 三色互扣 / 电源块几何），最终定稿为「电源块」几何：上方平涂紫块 + 主体斜折角深蓝块，整体形似电源/启动键。

## 定稿规格

### 几何

两个 SVG path（viewBox 0 0 95.27 102.59）：

- 上块（平涂紫 #8B5CF6）：
  `M59.81 0H21.68l-4.43 11.14 18.84 12.75h14.23L59.81 0z`
- 主体块（渐变深蓝 #312E81 → #191B5C，纵向）：
  `M95.27 72.93l-66.98.01 14.67-4.28L70.23 0H40.74L0 102.59H83.49l11.78-29.66z`

渲染：512px master（6% 内边距，居中）→ sharp lanczos3 降采样各档。

### 配色

| 部件 | 颜色 |
|------|------|
| 上块 | #8B5CF6 平涂（= --primary 主题紫） |
| 主体块 | 纵向渐变 #312E81（顶）→ #191B5C（底） |
| 背景 | 真透明（无圆底/无光晕） |

### ICO 规格

- 8 档：16/20/24/32/48/64/128/256，升序
- 全部 32bpp、planes=1、方形
- BITMAPINFOHEADER 40 字节、biHeight = 2w（bottom-up）
- XOR 行序 bottom-up；AND mask 全 0（alpha 承载透明）
- **字节序 BGRA**（Windows ICO 规范；sharp RGBA 输出需 R/B 交换——2026-09-01 生成时踩坑：初版按 RGBA 存入导致紫/蓝对调）
- 容器条目 sizeBytes 约定与项目现有 icon.ico 一致：仅计 XOR+AND（不含 40 字节 DIB 头）；该格式已通过项目 ico.test.ts 结构断言与 Windows GDI+/Electron nativeImage 加载验证
- 256 档四角 alpha=0（真透明底）

### 应用位置（无需代码改动，同源生效）

- 窗口标题栏 .winbar__logo（App.vue 从 src-main/icon.ico 导入）
- 任务栏窗口图标（BrowserWindow icon）
- 系统托盘（Tray）
- 打包 exe 图标（electron-builder win.icon + extraResources）

### 测试防线

ico.test.ts 像素断言已更新为电源块图形：
- 256 档中心 (128,127) 实心且 B > R（深蓝渐变中段）
- 紫块区 (86,38)：R > 100、B > 200、G < 150（#8B5CF6 特征，防图形回退/对调）
- 16 档角落 alpha=0（标题栏最小档透明底）

## 产物

- src-main/icon.ico（374,262 字节）
- .temp/icon-final.ico、.temp/logo-final-*.png（生成脚本 .temp/make-final-ico.cjs 可复现）

## 决策记录

- 候选 A（平涂紫+平涂深蓝）与 B（双渐变）均做出完整 ICO 供应用内对比；用户最终选定组合：平涂紫 + 渐变深蓝。
- 未改任何 .vue/.css：logo 单源（icon.ico），尺寸/样式由现有 .winbar__logo 控制。
