# 任务栏托盘图标 hover 显示启动控制所选模板 — 设计规格

日期：2026-09-05
状态：已批准（方案：系统原生 tray.setToolTip）
关联模块：src-main/main.ts（createTray / IPC）、src-main/tray-tooltip.ts（新）、src/modules/LaunchBar.vue

## 1. 目的

任务栏（系统托盘）图标鼠标 hover 时显示「llama-server 启动控制」下拉当前选择的模板名：
- 有选择 → 显示模板完整名字（与 [编辑] 按钮 tooltip 同款 full 名，不截断）；
- 没有选择（配置缺失 / 模板为空 / 未选中）→ 显示固定文本「暂无模板配置」。

用户明确要求**系统原生 tooltip**（同 v2rayN 的托盘提示，见附图），不使用应用自绘 tooltip 视觉语言。

## 2. 方案与备选

- **方案 A（采纳）：Electron 原生 tray.setToolTip(text)**。改动最小，提示即 Windows 系统 tooltip（灰底圆角，行为同 v2rayN）；渲染进程选中态变化时经 IPC 通知主进程更新。
- 方案 B（弃）：离屏透明 BrowserWindow 自绘 tooltip。可完全自定义样式，但违背用户「就要原生」的要求，且引入新窗口生命周期管理，复杂度不必要。
- 方案 C（弃）：仅启动时设一次。无法反映运行中切换模板。

## 3. 设计

### 3.1 纯函数模块 src-main/tray-tooltip.ts（新文件，可单测）

export function trayTooltipText(name: string | null | undefined): string
- 入参 trim 后非空 → 返回 trim 后的名字（原样，不截断）；
- 其余（null / undefined / 空串 / 全空白）→ 返回 '暂无模板配置'。

### 3.2 主进程 src-main/main.ts

- createTray() 内 new Tray(...) 后、setContextMenu 前调用 tray.setToolTip(trayTooltipText(null))，初始提示为「暂无模板配置」。
- 新增 IPC（与其余 ipcMain.handle 同段，计数 +1）：
  ipcMain.handle('tray-tooltip-update', (_e, name: string | null): void => { if (tray) tray.setToolTip(trayTooltipText(name)); });
- 渲染端可能先于 createTray 发 IPC 的时序不存在（托盘在 whenReady 内建、先于页面交互）；仍加 if (tray) 防御。

### 3.3 渲染端 src/modules/LaunchBar.vue

- load() 成功分支：configs 载入后确定 selected 时 invoke('tray-tooltip-update', full(selected) || null)。
- load() 失败分支（MISSING / YAML 错）：invoke('tray-tooltip-update', null)。
- 用户切换下拉（@update:value）后：invoke('tray-tooltip-update', full(v) || null)。
- full(id) 复用现有函数（name ?? id，空则 ''）；selected 为空串时传 null。
- preload 的 invoke 为通用透传，**不改 preload.ts / ipc.ts**。

### 3.4 数据流

LaunchBar(selected 变化) → ipcRenderer.invoke('tray-tooltip-update', name|null)
  → 主进程 trayTooltipText() → tray.setToolTip(text) → Windows 原生 tooltip。
模板名只存于内存（不新增持久化）；应用重启后由 LaunchBar 首帧 load() 重新推送（与现有 configsReloadKey 重载机制一致）。

## 4. 测试与验证

- 新 src-main/tray-tooltip.test.ts：
  - 非空名（含首尾空白 trim）原样返回；
  - null / undefined / '' / 全空白 → '暂无模板配置'。
- src/modules/LaunchBar.test.ts 补断言（扩展既有 mockLms 的 invoke 记录调用）：
  - load 后默认选中第一个 → 推送该模板完整名；
  - 切换下拉 → 推送新选中名；
  - 无配置（get_configs 返回 {}）→ 推送 null。
- 回归：npm test 全绿。
- 手动（dev）：有模板时 hover 托盘图标出原生提示显示模板名；删除全部模板 / 未选模板时显示「暂无模板配置」；切换下拉后 hover 立即反映新名。

## 5. 不做的事

- 不改托盘右键菜单、双击唤回行为；
- 不改应用内任何自绘 tooltip（.tip-up / .tip-down / .dd-tip 等）；
- 不把模板名写入 yaml（启动控制选中态本就不持久化）；
- 无 tooltip 出现延迟 / 动画调整（原生行为由系统控制）。
