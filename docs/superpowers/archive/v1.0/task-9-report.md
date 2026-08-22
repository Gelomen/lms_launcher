# 任务 9 报告：系统托盘（§4.6）

**状态：DONE** ✅

- 提交：**210b547** feat: 系统托盘（§4.6）——启动/退出菜单 + tray-exit-request + 关闭隐藏到托盘
- 父提交：b280ff8；改动 2 个文件，+27/−2。

## 改动明细

### src-main/main.ts
1. import 行加 `Tray, Menu, nativeImage`（electron）。
2. 新增 createTray()（模块级 tray: Tray | null）：icon 用 src-main/icon.ico，空图兜底 createEmpty()；菜单两项「启动 lms_launch」（mainWin() show+focus）/「退出」（win.webContents.send('tray-exit-request', {})）。
3. whenReady().then 内 createWindow() 后调 createTray()。
4. createWindow 末尾：win.on('close', (e) => { e.preventDefault(); win.hide(); })——关闭=隐藏到托盘。

### src/App.vue
- import 加 onTrayExitRequest（src/ipc.ts 既有导出）。
- onMounted unsubs.push(onTrayExitRequest(() => { if (window.confirm('将停止 llama-server 并退出，确认？')) void invoke('exit_app'); }))——onUnmounted 既有 for 循环自动清理。

未碰：config/build/process/preload/package.json/style.css/其他 .vue；未写新测试。

## 验证（真实执行）
- npm run build：✓ built in 395ms ✓
- npx tsc -p tsconfig.main.json --noEmit：exit=0，零错 ✓
- npx vitest run：Test Files 3 passed，Tests **20/20** passed（3.6s）✓
- GUI 冒烟：未做（headless 不可行，按任务 10 移交人工验收）。

## 原始输出
```
$ git log --oneline -2
210b547 feat: 系统托盘（§4.6）——启动/退出菜单 + tray-exit-request + 关闭隐藏到托盘
b280ff8 fix: configsReloadKey 改 ref（下拉刷新链路 App 端非响应式死代码）

$ git diff --name-only HEAD~1..HEAD
src-main/main.ts
src/App.vue

$ git status --short   # 空，工作树干净
```
