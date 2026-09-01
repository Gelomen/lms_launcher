# 顶栏版本号显示 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在顶栏「LMS 启动器」文本右侧显示当前版本号（v + package.json version，如 v0.1.0）。

**架构：** 主进程新增 `get_version` IPC（直接返回 `app.getVersion()`，即 asar 内 package.json 的 version）；渲染端 `App.vue` 在 onMounted 里 invoke 获取并显示，失败静默。

**技术栈：** Electron 28 + Vue 3（script setup）+ 原生 CSS 变量。

**规格：** `docs/superpowers/specs/2026-09-01-titlebar-version-design.md`

**背景（零上下文必读）：**
- 渲染端所有 IPC 走 `src/ipc.ts` 的 `invoke(cmd, ...args)`，preload 是通用白名单外的直通通道，新增命令**不需要改 preload.ts**。
- 现有 handler 集中在 `src-main/main.ts` 的 ipcMain.handle 区块（win_* 三键在 313-319 行，`app` 已从 electron import）。
- winbar 模板在 `src/App.vue` 149-161 行；`.winbar__brand` 是 `display:flex; align-items:center; gap:8px`，新增的 span 会自动获得 8px 间距。
- CSS 变量表见 `src/style.css` :root（2-38 行）：**没有** `--fs-caption` / `--text-faint`；可用的最小编号/弱化组合是 `--fs-label`(12px) + `--muted`(#6B7280)。
- 无单元测试可写（`app.getVersion()` 无本地副作用，Electron API 不在 vitest 覆盖范围）；验证 = `npm test` 回归全绿 + 手动 dev 启动观察。

---

### 任务 1：主进程 get_version IPC

**文件：**
- 修改：`src-main/main.ts`（在 319 行 win_close handler 之后、320 行 `// ---------- app lifecycle ----------` 之前插入）

- [ ] **步骤 1：新增 handler**

在 `src-main/main.ts` 的

```ts
ipcMain.handle('win_close', () => { mainWin()?.hide(); }); // 隐藏到托盘，不退出（真退出仍走 exit_app）
```

之后插入：

```ts
// get_version：顶栏显示用（package.json 的 version；electron-builder 打包命名同源）
ipcMain.handle('get_version', (): string => app.getVersion());
```

- [ ] **步骤 2：类型检查 + 回归**

运行：`npm run build`（含 `tsc -p tsconfig.main.json`）
预期：编译通过无错误。再运行：`npm test`，预期：全绿（本改动不影响现有测试）。

- [ ] **步骤 3：Commit**

```bash
git add src-main/main.ts
git commit -m 'feat: 主进程新增 get_version IPC（app.getVersion）'
```

### 任务 2：渲染端显示版本号

**文件：**
- 修改：`src/App.vue`（script：version ref + onMounted 获取；template：winbar__brand 内加 span）
- 修改：`src/style.css`（.winbar__name 规则后加 .winbar__version）

- [ ] **步骤 1：script 加 ref**

在 `src/App.vue` 的

```ts
const exitConfirm = ref(false); // §4.6：托盘「退出」→ ConfirmDialog（主题化二次确认），替代系统 window.confirm
```

之后插入：

```ts
const version = ref(''); // 顶栏版本号（get_version IPC → app.getVersion；获取失败静默，不显示）
```

- [ ] **步骤 2：onMounted 获取**

在 `src/App.vue` 的 onMounted 内、现有 get_state 恢复块

```ts
  } catch { /* 首次启动无状态可恢复 */ }
```

之后插入：

```ts
  // 顶栏版本号：package.json 的 version（主进程 app.getVersion）；非 Electron/IPC 异常 → 静默不显示
  try {
    version.value = await invoke<string>('get_version');
  } catch { /* 版本号缺失不影响应用 */ }
```

- [ ] **步骤 3：模板加 span**

在 `src/App.vue` 模板的

```html
        <span class="winbar__name">LMS 启动器</span>
```

之后插入：

```html
        <span v-if="version" class="winbar__version">v{{ version }}</span>
```

- [ ] **步骤 4：CSS**

在 `src/style.css` 的

```css
.winbar__name { font-size: var(--fs-label); color: var(--text); white-space: nowrap; }
```

之后插入：

```css
.winbar__version { font-size: var(--fs-label); color: var(--muted); white-space: nowrap; }
```

（规格中写的 --fs-caption/--text-faint 在 :root 不存在；按规格 §2.3 的回退条款采用现有 --fs-label + --muted。）

- [ ] **步骤 5：构建 + 回归**

运行：`npm run build` 预期编译通过；`npm test` 预期全绿。

- [ ] **步骤 6：手动验证**

运行：`npm run dev`（vite + electron 双进程）。验证点：
1. 窗口顶栏「LMS 启动器」右侧显示灰色小字「v0.1.0」（与 package.json version 一致）
2. 顶栏仍可整条拖动窗口；三键（最小化/最大化/关闭）点击正常
3. 无 console 报错
验证后关闭 dev 进程。

- [ ] **步骤 7：Commit**

```bash
git add src/App.vue src/style.css
git commit -m 'feat: 顶栏 LMS 启动器右侧显示版本号 v+package.json version'
```