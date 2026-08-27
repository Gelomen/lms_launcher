# 规格 — frameless 窗口 + 自绘窗口控制按钮（2026-08-27）

## 背景与目标

应用窗口顶栏（Windows 系统标题栏）与应用浅色背景（--bg #F6F7F8）色差不一致，且顶栏独立于应用布局。
用户选择：**隐藏系统标题栏**，将最小化/最大化/关闭按钮移入界面内（应用自绘）。

## 范围

- 主进程：BrowserWindow frame:false + 3 个窗口控制 IPC。
- 渲染进程：App.vue 顶部自绘标题栏条（.winbar），右侧三个图标按钮。
- TDD：App.test.ts 新增契约用例；全量 vitest 保持绿。

## 主进程（src-main/main.ts）

1. createWindow() 增加 frame: false。其余选项（width/height/minWidth、icon、webPreferences）不变。
   - Windows DWM 边框阴影仍保留，窗口仍可从边缘拖动、可缩放、任务管理器「任务」浮窗仍工作（frameless 仅去标题栏，非 borderless 的 kiosk 式裸窗口）。
2. 新增 IPC handler（ipcMain.handle）：
   - win_minimize → mainWin()?.minimize()
   - win_maximize → 切换：isMaximized ? unmaximize() : maximize()
   - win_close → 走既有 close 事件语义 = 隐藏到托盘（win.hide()），**不退出**；真退出仍只走 tray-exit-request → exit_app。
   - mainWin() 为 null 时静默返回，不抛错。
3. preload / src/ipc.ts：桥接三个新 channel（与现有 invoke 风格一致，invoke('win_minimize') 等）。

## 渲染进程

### App.vue —— .winbar 结构

<main class="layout"> 内、grid 与 log-area **之前**插入：

```html
<header class="winbar">
  <span class="winbar__title">lms_launcher</span>
  <div class="winbar__controls">
    <button class="winbtn" aria-label="最小化" @click="onWinMinimize"><i class="fa fa-window-minimize" /></button>
    <button class="winbtn" :aria-label="maximized ? '还原' : '最大化'" @click="onWinToggleMax"><i class="fa fa-square / fa-compress…" /></button>
    <button class="winbtn winbtn--close" aria-label="关闭" @click="onWinClose"><i class="fa fa-xmark" /></button>
  </div>
</header>
```

- 标题文字：现有色板 --muted 小字（12px），水平居中（flex + 绝对定位居中或三段布局）。
- 按钮：复用 FontAwesome（@fortawesome/free-solid-svg-icons 已含 fa-window-minimize / fa-maximize / fa-minimize / fa-xmark，vue-fontawesome 已有用法）；三个按钮顺序 = 最小化、最大化/还原、关闭。
- 状态同步：mount 时 invoke('get_maximized') 取初始态 + window 'resize' 监听（isMaximized 由 resize 事件推断：window.innerWidth === screen 宽…——**更稳的做法**：主进程 maximize/unmaximize 事件 webContents.send 渲染端）。选择主进程推送：win.on('maximize')/'unmaximize' → win.webContents.send('win-max-changed', { maximized })，渲染端 onWinMaxChanged 桥接更新 ref。
- onWinClose → invoke('win_close')（隐藏到托盘；不触发 exit_app、不弹确认框）。

### style.css —— .winbar 纯追加

- .winbar：height 36px; background: var(--bg); display:flex; align-items:center; 位置：在 flex column 的 .layout 顶部（自然占位，不用 fixed/absolute——layout 本身已是 flex column + padding）。
  - .layout 现有 padding: 12px 会让 winbar 与窗口顶边留缝 → .layout 改 padding: 0 12px 12px，winbar 自带 36px 高度贴合窗口顶缘；grid/log-area 之间仍保留 --card-gap（gap 不变）。
- .winbtn：宽 46px × 高 36px，无边框无底色（与 LM Studio 式自绘窗口按钮一致），color: var(--text)；hover 背景 #F6F7F8→**注意**：.winbar 本身已是该色，hover 加深一档用 #EBEDEF。
- .winbtn--close:hover：background: var(--danger); color: #fff（Windows 关闭键红底白字习惯）。
- 最大化/还原图标双态：maximized ? fa-minimize(压缩态) : fa-maximize。

## 测试（TDD）

src/App.test.ts 新增：
1. renders_winbar_with_three_controls —— .winbar 渲染 3 个 button，aria-label 依次为 [最小化, 最大化, 关闭]。
2. winbar_click_minimize_invokes_win_minimize / ...maximize → invoke('win_maximize') / ...close → invoke('win_close')。
3. close_does_not_exit —— win_close 不调用 exit_app（与托盘退出解耦的既有行为保持）。

ipc.ts mock：现有 App.test.ts 的 invoke mock 需支持新 channel（沿用同一桩模式）。

## 验证

- vitest 全量绿；npm run build EXIT=0。
- dev 实机（npm run dev）目视验收：无系统标题栏、窗口可边缘拖动/缩放、三按钮功能正确、关闭窗口→托盘唤回仍正常、托盘退出仍为唯一真退出口径。

## 非目标（YAGNI）

- 不加自绘拖拽区（frame:false Windows 默认保留 DWM 拖拽；若实机发现不可拖再单独处理）。
- 不引入新依赖；不改现有卡片/日志区布局数值。
