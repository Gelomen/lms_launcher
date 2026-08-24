# exe / 标题栏 logo 不显示 — 修复规格

**Date:** 2026-08-25
**范围：** 图标资源 + 主进程两行代码；不涉及 IPC / 渲染器业务逻辑。

## 现象

手动构建（tsc + vite + electron-builder --win portable）后：
1. 可执行文件资源管理器图标无 logo；
2. 应用窗口标题栏也无 logo，显示 Electron 默认闪电图标。

## 根因（双 bug）

### Bug A：icon.ico 容器畸形，Windows GDI+ 拒载

原 `src-main/icon.ico`（270,398 B）只含**一条** 256×256 32bpp 记录，但其 ICONDIR
条目表**不符合 MS ICO 规范**：按规范字段解读时 planes/bitCount/bytesInRes/dataOffset
互相矛盾，且像素区以非标准的 **top-down** 行序存放（偏移 62），Windows 无法识别。
对照实验（GDI+ `New-Object System.Drawing.Icon` / `ExtractAssociatedIcon`）：

- 自制 32×32 纯红 control.ico → **LOAD OK**；
- 重新生成的多尺寸 lms-new.ico → **LOAD OK**；
- 原 icon.ico → **LOAD FAIL**："must be a picture that can be used as an Icon"。

即资源本身打不开，exe 即便内嵌了 RT_ICON/RT_GROUP_ICON 也只是把坏容器照搬进去，
Explorer / 标题栏拿到的是坏图标 → 显示为「无 logo」。

### Bug B：BrowserWindow 从未传入 icon

`src-main/main.ts` `createWindow()` 只设了 `title`，没有 `icon`。Electron 未收到
窗口图标时回退到 Electron 默认图标（闪电），与磁盘上 icon.ico 无关 —— 这解释了
「标题栏没有 logo」。

## 修复

### A. 用合法多尺寸 ico 替换源文件

从原文件的 256×256 BGRA 像素重新打包为标准 ICO：单一蓝→紫渐变方块（无透明），
含 **6 个尺寸 16 / 32 / 48 / 64 / 128 / 256**，全部 32bpp BI_RGB，
BITMAPINFOHEADER + AND/XOR mask 规范填写。覆盖 `src-main/icon.ico`
（新 sha256 `8F1C956FCA7548994ADA612E3775B4510DFFE416AF6DECFB23A51B7B69ABF499`，
370,070 B）。GDI+ 验证 LOAD OK。

### B. main.ts 补 BrowserWindow icon

- 抽 `appIconPath()` 助手（打包态 = `process.resourcesPath/icon.ico`，开发态 =
  `../src-main/icon.ico`），托盘与窗口共用；
- `createTray()` 改用 `appIconPath()`（去重）；
- `BrowserWindow({ icon: appIconPath(), ... })` —— 标题栏从此显示应用图标。

## 验证（evidence-backed，2026-08-25 执行）

- GDI+ 对照：纯色红 control.ico ✅ / 新多尺寸 ico ✅ / **旧 ico ❌ 拒载**；
- `ExtractAssociatedIcon`（Explorer 显示 exe 图标的原生 API）：旧资源 → **null**（修复前根因坐实）；
  重建后 `win-unpacked/lms_launcher.exe` 与 `lms-launcher-1.0.0-portable.exe` 均返回关联图标 ✅；
- `render` 合成图（绿色 control + 新 ico 64/128）肉眼确认蓝紫渐变 logo 正确渲染 ✅；
- `win-unpacked/resources/icon.ico` sha256 = `src-main/icon.ico`（= `239710d5...`）✅；
- `npx tsc && npm run build && npx electron-builder --win portable` 全量重建成功 ✅；
- `npm test`：5 文件 **38/38 PASS** ✅。

## 生成脚本说明

多尺寸 ico 由 `src-main` 侧脚本从原始 256×256 BGRA（原始 top-down 偏移 62）重打包：
16/32/48/64/128/256 六档、32bpp BI_RGB、标准 **bottom-up** DIB、AND mask 全 0；
alpha 对齐自检（全部采样点 A=255）通过后写入，中心像素逐帧复核为蓝紫渐变。

## 说明

当前 icon 内容是**纯色渐变方块**，非品牌图形；若后续有正式 logo（png/svg），
应以其重新生成多尺寸 ico 覆盖本文件 —— 本规格保证的是「图标能被正确加载并显示」，
而非像素内容本身。
