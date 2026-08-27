# 托盘双击唤回窗口 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 双击系统托盘图标唤回 lms_launcher 主窗口（show + restore + focus）。

**架构：** Electron Tray 在 win32 提供原生 'double-click' 事件。在 src-main/main.ts 中新增 restoreWindow() 辅助函数，供 second-instance、托盘菜单「启动」、托盘双击三处入口共用；不引入新 IPC 或渲染层改动。

**技术栈：** Electron 28（Tray / BrowserWindow）、TypeScript、Vitest + vite build 验证。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| 修改：`src-main/main.ts` | 新增 restoreWindow()；新增 tray 'double-click' 监听；second-instance 与菜单「启动」收敛到 restoreWindow() |

## 上下文速查

- 主窗口「关闭」= hide 到托盘（createWindow 内 win.on('close') preventDefault），app 不退出 → 窗口对象始终存在（window-all-closed 时 Windows 会 quit）。
- mainWin() 已存在：取 BrowserWindow.getAllWindows() 的第一个或 null。
- 现有重复入口：second-instance（行 ~15-18）与托盘菜单「启动」（行 ~60-63）均为 win.show() + win.focus()。
- 验证命令基线：`npx tsc -p tsconfig.main.json` 与 `npm run build` 必须零错误；`npx vitest run` 必须全绿（当前 96 tests）。
- 测试边界：Electron 主进程集成层无 vitest 单测基础（现有 main.ts 测试 0 个；config/build/process/ico 有）。本任务验证 = 编译 + 构建 + dev 目检。

### 任务 1：restoreWindow() + 双击监听 + 入口收敛

**文件：**
- 修改：`src-main/main.ts`

- [ ] **步骤 1：新增 restoreWindow() 辅助函数**

在 `mainWin()` 函数定义之后（行 ~38 附近）插入：

```ts
// 唤回主窗口：restore() 先解除最小化，再 show + focus；窗口不存在（仅 window-all-closed 边缘态）→ 重建
function restoreWindow(): void {
  const win = mainWin();
  if (win) { win.restore(); win.show(); win.focus(); }
  else { createWindow(); }
}
```

注：restoreWindow() 引用了 createWindow()，后者为函数声明提升（function declaration），且调用发生在运行时（双击事件回调内），无时序问题；createWindow 定义在行 ~79，restoreWindow 调用点（事件回调）晚于模块初始化，安全。

- [ ] **步骤 2：收敛 second-instance 入口**

把现有 second-instance 处理器：

``ts
app.on('second-instance', () => {
  const win = mainWin();
  if (win) { win.show(); win.focus(); }
});
``

改为：

``ts
app.on('second-instance', () => {
  restoreWindow();
});
``

- [ ] **步骤 3：收敛托盘菜单「启动」入口**

托盘菜单第一项（createTray 内）：

``ts
{ label: '启动 lms_launcher', click: () => {
  const win = mainWin();
  if (win) { win.show(); win.focus(); }
} },
``

改为：

``ts
{ label: '启动 lms_launcher', click: () => {
  restoreWindow();
} },
``

- [ ] **步骤 4：新增 double-click 监听**

在 createTray() 内 `tray.setContextMenu(menu)` 之后追加：

``ts
// 双击托盘图标 = 唤回窗口（方案 A：单击无反应，右键维持菜单）
tray.on('double-click', () => {
  restoreWindow();
});
``

- [ ] **步骤 5：编译 + 构建验证**

运行：`npx tsc -p tsconfig.main.json`
预期：exit 0，零输出。
运行：`npm run build`
预期：vite build 成功 + tsc 成功，EXIT 0。

- [ ] **步骤 6：全量测试回归**

运行：`npx vitest run`
预期：96/96 PASS（本任务不改任何受测代码）。

- [ ] **步骤 7：Commit**

``bash
git add src-main/main.ts
git commit -m "feat(tray): 双击托盘图标唤回主窗口（方案 A：仅双击，单击无反应）"
``

### 任务 2：dev 目检验收（人工）

**文件：** 无代码改动

- [ ] **步骤 1：启动 dev**

运行：`npm run dev`（vite + electron 并发）
预期：Electron 窗口打开 lms_launcher UI。

- [ ] **步骤 2：目检清单**

| # | 操作 | 预期 |
|---|---|---|
| 1 | 点击窗口右上角「关闭」键 | 窗口隐藏到托盘，进程仍存活 |
| 2 | **双击托盘图标** | 窗口出现、前台、聚焦 |
| 3 | 隐藏后最小化态再双击 | （窗口未最小化时 restore 为 no-op）窗口正常唤回 |
| 4 | 单击托盘图标 | 无反应 |
| 5 | 右键托盘 → 「启动 lms_launcher」 | 窗口唤回（原行为不变） |
| 6 | 右键托盘 → 「退出」 | ConfirmDialog 弹出 → 退出（原行为不变） |

- [ ] **步骤 3：确认台账**

把任务 1/2 结果追加到 `docs/superpowers/sdd/superpowers-sdd-progress.md` 的 v1.2 增量批次表（任务 29 行），按既有格式。
