# 规格：托盘图标双击唤回主窗口

日期：2026-08-28 · 状态：已批准（方案 A，用户对话确认）

## 背景与现状

lms_launcher 关闭按钮 = 隐藏窗口到系统托盘（main.ts §4.6），不退出进程。托盘图标当前只响应右键菜单（「启动 lms_launcher」/「退出」）；左键单击、双击均无任何处理。用户诉求：**双击托盘图标自动打开应用窗口**。

现状入口盘点（src-main/main.ts）：
- 单实例锁 second-instance 事件 → 主窗口 show() + focus()（行 15-18）
- 托盘菜单「启动 lms_launcher」→ 同样的 show+focus（行 60-63）
- 托盘菜单「退出」→ show+focus + tray-exit-request（行 64-72）

## 方案（A，已批准）

**仅双击唤回，单击维持无反应。**

技术依据：Electron Tray 在 win32/darwin 提供原生 'double-click' 事件（electron.d.ts L10882，签名 (event: KeyboardEvent, ...)），无需手写时间戳判定；本应用仅面向 Windows，win32 平台该事件可靠。

## 行为规格

| 触发 | 行为 |
|---|---|
| 托盘左键双击 | 唤回主窗口：restore()（若最小化）+ show() + focus()；窗口不存在 → createWindow() 兜底 |
| 托盘左键单击 | 无反应（维持现状） |
| 托盘右键 | 现有上下文菜单（「启动」/「退出」）行为不变 |

唤回后窗口可见、位于前台并获得焦点——与「启动 lms_launcher」菜单入口、second-instance 入口语义一致。

## 实现

改动文件：src-main/main.ts（唯一实现文件）

1. 新增辅助函数 restoreWindow()：取 mainWin()；存在则 win.restore(); win.show(); win.focus()，不存在则 createWindow()。
2. 新增 tray.on('double-click', ...) → restoreWindow()。
3. 收敛既有重复：second-instance 处理器与托盘菜单「启动」项改为调用 restoreWindow()。

无新 IPC、无渲染层改动、无新依赖。

## 错误处理

- 双击时窗口已存在但被最小化 → restore() 先恢复再 show/focus。
- 双击时窗口不存在（window-all-closed 边缘态，Windows 上实际不会发生）→ createWindow() 兜底。
- double-click 在 darwin 也触发；本项目不发布 darwin，不单独处理。

## 测试与验证

main.ts 托盘逻辑属 Electron 主进程集成层，无既有单测基础（现有测试覆盖 config/build/process/ico）。验证方式：
1. tsc -p tsconfig.main.json 编译零错误。
2. npm run build 整体构建零错误。
3. dev 目检清单：启动 dev → 点关闭按钮（窗口隐藏到托盘）→ 双击托盘图标 → 窗口可见且前台聚焦；单击托盘 → 无反应；右键菜单两项行为不变。

## 验收标准

- 窗口隐藏状态下双击托盘图标，窗口出现在前台并获得焦点。
- 单击托盘图标无反应；右键菜单行为不变。
- 「退出」流程（show + ConfirmDialog）不受影响。
