# frameless 窗口 + 自绘窗口控制按钮 · 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 去掉 Windows 系统标题栏（Electron frame:false），在应用内右上角自绘 最小化 / 最大化(还原) / 关闭 三个按钮，通过 IPC 控制窗口；关闭窗口沿用「隐藏到托盘」语义，不退出。

**架构：** 渲染端 App.vue 顶部加一条 .winbar（高 36px、背景 = --bg），右侧三个 FontAwesome 图标按钮；点击经 invoke 打到主进程 3 个新 handler；最大化/还原态由主进程在 maximize/unmaximize 事件时 webContents.send('win-max-changed') 推送回渲染端切换图标。Electron 侧仅 createWindow 加 frame:false + 3 个 ipcMain.handle + 2 个事件推送，无测试基建（src-main 既有约定只测纯模块）。

**技术栈：** Electron 28、Vue 3 (SFC)、@fortawesome/vue-fontawesome、vitest + @vue/test-utils (happy-dom)。

---

## 文件结构

- 修改 `src/App.vue` —— 加 .winbar 模板 + 窗口控制 handlers + FontAwesome 注册；onMounted 订阅 onWinMaxChanged。
- 修改 `src/ipc.ts` —— window.lms 类型与导出新增 onWinMaxChanged 桥。
- 修改 `src-main/preload.ts` —— exposeInMainWorld 新增 onWinMaxChanged 监听器（'win-max-changed'）。
- 修改 `src-main/main.ts` —— createWindow frame:false；3 个 ipcMain.handle（win_minimize/win_maximize/win_close）；maximize/unmaximize 事件推送。
- 修改 `src/style.css` —— 新增 .winbar/.winbtn 样式；.layout 顶部 padding 归零。
- 测试：`src/App.test.ts` —— ipc mock 补 onWinMaxChanged + 新增 window controls describe（4 用例）。

## 图标口径

按需注册 4 枚 solid 图标（free-solid-svg-icons v7）：faMinus / faMaximize / faMinimize / faXmark。
- 最小化 → ['fas','minus']，aria-label「最小化」
- 最大化/还原 → maximized ? ['fas','minimize'] : ['fas','maximize']，aria-label 「还原」/「最大化」
- 关闭 → ['fas','xmark']，aria-label「关闭」

## 通道口径

- invoke('win_minimize') / invoke('win_maximize') / invoke('win_close')
- push：'win-max-changed' → { maximized: boolean }

---

### 任务 1：RED — window controls 测试契约（先失败）

**文件：**
- 修改/测试：`src/App.test.ts`

- [ ] **步骤 1：补 ipc mock（onWinMaxChanged + 捕获器）**

在 `src/App.test.ts` 顶部，把现有 `vi.mock('./ipc', () => ({ ... }));` 的工厂对象里，紧跟 `onTrayExitRequest: (fn) => { trayHandlers.push(fn); return () => {}; },` 之后新增一行（注意保持尾逗号）：

```ts
onWinMaxChanged: (fn: (e: { maximized: boolean }) => void) => { winMaxHandlers.push(fn); return () => {}; },
```

并在 `const trayHandlers: Array<() => void> = [];` 之后新增一行捕获器（与 trayHandlers 同模式）：

``ts
const winMaxHandlers: Array<(e: { maximized: boolean }) => void> = [];
``
（注意类型：onWinMaxChanged 的回调参数是 { maximized }，区别于 tray 的无参回调。）

- [ ] **步骤 2：新增 window controls describe（4 用例）**

在文件末尾（最后一个 describe 之后）追加：

```ts
describe('window controls (frameless winbar)', () => {
  it('renders winbar with three controls: minimize / maximize / close', async () => {
    const { w } = mountApp();
    await flush();
    const bar = w.find('.winbar');
    expect(bar.exists()).toBe(true);
    const btns = bar.findAll('.winbtn');
    expect(btns.length).toBe(3);
    expect(btns[0].attributes('aria-label')).toBe('最小化');
    expect(btns[1].attributes('aria-label')).toBe('最大化'); // 初始非最大化 → 最大化
    expect(btns[2].attributes('aria-label')).toBe('关闭');
  });

  it('clicking the three controls invokes win_minimize / win_maximize / win_close', async () => {
    const { w } = mountApp();
    await flush();
    const btns = w.find('.winbar').findAll('.winbtn');
    await btns[0].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_minimize');
    await btns[1].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_maximize');
    await btns[2].trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
  });

  it('close invokes win_close but NOT exit_app (tray-exit stays the only real quit)', async () => {
    const { w } = mountApp();
    await flush();
    const closeBtn = w.find('.winbar').findAll('.winbtn')[2];
    await closeBtn.trigger('click');
    expect(invoke).toHaveBeenCalledWith('win_close');
    expect(invoke).not.toHaveBeenCalledWith('exit_app');
  });

  it('maximized push switches the toggle label 最大化 → 还原', async () => {
    const { w } = mountApp();
    await flush();
    winMaxHandlers.forEach(fn => fn({ maximized: true })); // 模拟主进程推送
    await flush();
    const maxBtn = w.find('.winbar').findAll('.winbtn')[1];
    expect(maxBtn.attributes('aria-label')).toBe('还原');
  });
});
```

- [ ] **步骤 3：运行确认 RED**

运行：`npx vitest run src/App.test.ts`
预期：4 条新用例 FAIL（`Cannot find .winbar` / `.winbar` not exists），既有 stop/start 用例仍 PASS。若 mock 缺导出导致 mount 崩溃（onWinMaxChanged undefined），说明步骤 1 未落实——回到步骤 1。

- [ ] **步骤 4：Commit（RED 快照）**

```bash
git add src/App.test.ts
git commit -m 'test(win-controls): RED window controls contract'
```

---

### 任务 2：GREEN — ipc 桥 + App.vue winbar + style.css

**文件：**
- 修改：`src/ipc.ts`
- 修改：`src/App.vue`
- 修改：`src/style.css`

- [ ] **步骤 1：ipc.ts 加 onWinMaxChanged**

在 `declare global { interface Window { lms: { ... } } }` 里，紧跟 `onTrayExitRequest: (cb: () => void) => () => void;` 之后新增一行：

```ts
onWinMaxChanged: (cb: (e: { maximized: boolean }) => void) => () => void;
```

并在文件里 `export function onTrayExitRequest(cb: () => void): () => void {` 块之后新增导出：

```ts
export function onWinMaxChanged(cb: (e: { maximized: boolean }) => void): () => void {
  return window.lms.onWinMaxChanged(cb);
}
```

- [ ] **步骤 2：App.vue 脚本（imports + 图标注册 + state/handlers）**

2a. 把现有 `import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest } from './ipc';` 改为追加 onWinMaxChanged：

```ts
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest, onWinMaxChanged } from './ipc';
```

2b. 在 `import ConfirmDialog from './components/ConfirmDialog.vue';` 之后新增 FontAwesome 注册块：

```ts
// frameless winbar：最小化 / 最大化(还原) / 关闭 三键（自绘，替代系统标题栏）
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faMinus, faMaximize, faMinimize, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
config.autoGenerateCss = true;
library.add(faMinus, faMaximize, faMinimize, faXmark);
```

2c. 在 `const exitConfirm = ref(false);` 之后新增窗口控制 state/handlers：

```ts
const maximized = ref(false); // 由 onWinMaxChanged 推送驱动（初始非最大化）
function onWinMinimize(): void { invoke('win_minimize'); }
function onWinToggleMax(): void { invoke('win_maximize'); }
function onWinClose(): void { invoke('win_close'); } // 隐藏到托盘，不退出
```

2d. 在 `onMounted(async () => {` 里，紧跟 `unsubs.push(onLogLine(...));` 之后新增一行订阅：

```ts
unsubs.push(onWinMaxChanged((e) => { maximized.value = e.maximized; }));
```

- [ ] **步骤 3：App.vue 模板（.winbar 作为 .layout 首子）**

把 `<main class="layout">\n    <section class="grid">` 的开头改为在 grid 之前插入 .winbar（保持缩进 4 空格对齐）：

```html
<main class="layout">
    <header class="winbar">
      <span class="winbar__title">lms_launcher</span>
      <div class="winbar__controls">
        <button class="winbtn" aria-label="最小化" title="最小化" @click="onWinMinimize"><FontAwesomeIcon :icon="['fas','minus']" /></button>
        <button class="winbtn" :aria-label="maximized ? '还原' : '最大化'" :title="maximized ? '还原' : '最大化'" @click="onWinToggleMax"><FontAwesomeIcon :icon="maximized ? ['fas','minimize'] : ['fas','maximize']" /></button>
        <button class="winbtn winbtn--close" aria-label="关闭" title="关闭" @click="onWinClose"><FontAwesomeIcon :icon="['fas','xmark']" /></button>
      </div>
    </header>
    <section class="grid">
```

- [ ] **步骤 4：style.css（.layout 顶部归零 + .winbar/.winbtn）**

4a. 修改现有 `padding: var(--card-gap);`（在 `.layout { ... }` 内，约 L55）为顶部归零：

```css
padding: 0 var(--card-gap) var(--card-gap);
```

4b. 在 style.css 末尾（.icon-btn tooltip 段之后）追加 .winbar 块：

```css
/* ---- frameless winbar：自绘窗口控制条（替代系统标题栏；背景 = --bg 无缝）---- */
.winbar {
  height: 36px;
  display: flex;
  align-items: center;
  background: var(--bg);
  flex: none;                 /* 固定高，不参与收缩 */
}
.winbar__title {
  flex: 1;
  text-align: center;
  font-size: var(--fs-label);
  color: var(--muted);
  pointer-events: none;        /* 纯文字，不挡两侧按钮 */
}
.winbar__controls {
  display: flex;
  height: 100%;
}
.winbtn {
  width: 46px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  color: var(--text);
  cursor: pointer; padding: 0;
  font-size: 13px;             /* 控制 FontAwesome 图标尺寸 */
}
.winbtn:hover { background: #EBEDEF; }          /* winbar 底同色，hover 加深一档 */
.winbtn--close:hover { background: var(--danger); color: #fff; } /* Windows 关闭键红底白字 */
```

- [ ] **步骤 5：运行确认 GREEN**

运行：`npx vitest run src/App.test.ts`
预期：window controls 4 用例 PASS，且既有 stop/start 全部 PASS。

- [ ] **步骤 6：全量 + 构建**

运行：`npm run test`（全量绿）与 `npm run build`（EXIT=0）。

- [ ] **步骤 7：Commit（GREEN 渲染端）**

```bash
git add src/App.test.ts src/ipc.ts src/App.vue src/style.css
git commit -m 'feat(win-controls): frameless winbar with minimize/maximize/close controls'
```

---

### 任务 3：Electron 侧 —— frame:false + handlers + maximize 推送

**文件：**
- 修改：`src-main/preload.ts`
- 修改：`src-main/main.ts`

（Electron 侧无 vitest 基建；验证靠 tsc -p tsconfig.main.json + npm run build。既有约定：src-main 只单测纯模块。）

- [ ] **步骤 1：preload.ts 暴露 onWinMaxChanged**

在 `contextBridge.exposeInMainWorld('lms', { ... });` 里，紧跟 `onTrayExitRequest: (cb) => {...}` 块之后新增（参照现有三监听器模式）：

```ts
onWinMaxChanged: (cb: (e: { maximized: boolean }) => void) => {
  const listener = (_e: unknown, payload: { maximized: boolean }) => cb(payload);
  ipcRenderer.on('win-max-changed', listener);
  return () => ipcRenderer.removeListener('win-max-changed', listener);
},
```

- [ ] **步骤 2：main.ts createWindow 加 frame:false**

修改 `createWindow()` 里 `const win = new BrowserWindow({` 的对象，在 `title: 'lms_launcher',` 之后新增一行：

```ts
frame: false, // 去系统标题栏；窗口仍可边缘拖动/缩放（DWM 边框保留）
```

- [ ] **步骤 3：main.ts 加 3 个 ipcMain.handle**

在 `ipcMain.handle('exit_app', ...)` 块之后新增三个 handler（mainWin() null 静默返回，不抛错）：

```ts
// frameless winbar 窗口控制（渲染端自绘三键 → 主进程执行）
ipcMain.handle('win_minimize', () => { mainWin()?.minimize(); });
ipcMain.handle('win_maximize', () => {
  const w = mainWin(); if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});
ipcMain.handle('win_close', () => { mainWin()?.hide(); }); // 隐藏到托盘，不退出（真退出仍走 exit_app）
```

- [ ] **步骤 4：main.ts 加 maximize/unmaximize 事件推送**

在 `createWindow()` 里 `win.on('close', (e) => { e.preventDefault(); win.hide(); });` 之后新增两行（把最大化态推回渲染端切换图标）：

```ts
win.on('maximize', () => { win.webContents.send('win-max-changed', { maximized: true }); });
win.on('unmaximize', () => { win.webContents.send('win-max-changed', { maximized: false }); });
```

- [ ] **步骤 5：类型检查 + 构建**

运行：`npx tsc -p tsconfig.main.json --noEmit`（或 `npm run build`）。预期 EXIT=0、无新增报错。

- [ ] **步骤 6：Commit（Electron 侧）**

```bash
git add src-main/preload.ts src-main/main.ts
git commit -m 'feat(win-controls): frameless window + win_minimize/maximize/close IPC'
```

---

### 任务 4：全量验证 + 人工实机验收

**文件：** 无新增改动（仅验证）。

- [ ] **步骤 1：全量自动化**

运行：`npm run test`（vitest 全量，应 = 既有 +4 用例，全部 PASS）与 `npm run build`（EXIT=0）。
记录：vitest 「X files / Y tests 全绿」。

- [ ] **步骤 2：dev 实机目视验收（人工/控制者）**

运行 `npm run dev`，逐项核对并截图存档（.temp/ 下）：
1. 无 Windows 系统标题栏；顶部为浅色 .winbar，标题「lms_launcher」居中、右三键。
2. [最小化]→窗口最小化到任务栏；[最大化]→全屏，图标切还原态，[还原]恢复原尺寸；[关闭]→隐藏到托盘（非退出）。
3. 窗口仍可边缘拖动/缩放（frame:false 保留 DWM）；若发现不可拖 → 回报（计划未预留拖拽区，属需单独决策项）。
4. 托盘「启动 lms_launcher」唤回 + 托盘「退出」→ ConfirmDialog → 真退出 仍正常。

- [ ] **步骤 3：归档进度**

把本批次写入 `.superpowers/sdd/progress.md`（沿用既有格式：任务/commit/验证证据），无新增 commit（产物 gitignore）。

---

## 自检记录（writing-plans）

- 规格覆盖度：frame:false(任务2步3)、winbar 模板与三键(任务2步骤2c/3)、IPC 三通道+推送(任务3步骤1-4)、.layout 顶部归零(任务2步骤4a)、测试契约(任务1)。无遗漏。
- 占位符扫描：所有代码步骤均为实际内容，无 TODO/待定/「加适当处理」。
- 类型一致性：onWinMaxChanged 签名 (e:{maximized:boolean})=>()=>void 在 ipc.ts/preload/App/test 四处一致；通道名 win_minimize/win_maximize/win_close/win-max-changed 全计划统一。
