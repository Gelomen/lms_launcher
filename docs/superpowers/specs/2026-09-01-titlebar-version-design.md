# 顶栏版本号显示设计

日期：2026-09-01
状态：待实现

## 1. 需求

在应用顶栏（winbar）「LMS 启动器」文本右侧显示当前应用版本号，如「v0.1.0」。

版本号来源（已与用户确认，方案 A）：**package.json 的 version 字段**，运行时经主进程
app.getVersion() 获取。理由：electron-builder 打包命名（lms-launcher-${version}-portable.exe）
与 asar 内 package.json 同源；git tag 仅是发版时同步的副本，不作运行时来源。

## 2. 方案（方案 A：主进程 IPC）

### 2.1 主进程（src-main/main.ts）

在现有 ipcMain.handle 区块（win_* 三键附近）新增：

    ipcMain.handle('get_version', (): string => app.getVersion());

app.getVersion() 在生产环境读 asar 内 package.json 的 version；dev 模式
（electron . 运行 workspace）读 workspace 根 package.json，两种情形均返回
0.1.0 这类 semver 字符串。无需改 preload（invoke 为通用通道，见 src/ipc.ts）。

### 2.2 渲染端（src/App.vue）

- 新增 const version = ref('')。
- onMounted 内（与现有 get_state 恢复逻辑并列，独立 try/catch）：
    version.value = await invoke<string>('get_version');
  失败（非 Electron 环境/IPC 异常）静默吞掉——版本号不显示，不影响应用。
- 模板：<span class="winbar__name">LMS 启动器</span> 后加
  <span v-if="version" class="winbar__version">v{{ version }}</span>。

显示格式：v + semver 原样（v0.1.0）；不做解析/裁剪。

### 2.3 样式（src/style.css，.winbar__name 规则后）

    .winbar__version { font-size: var(--fs-caption); color: var(--text-faint); white-space: nowrap; }

沿用现有 CSS 变量体系（--fs-caption、--text-faint 若不存在则改用 style.css 中
实际存在的等价已定义变量）。字号小于应用名、弱化为次级文字色，与品牌区
「无交互、pointer-events: none」保持一致（继承自 .winbar__brand）。

## 3. 不做的事（YAGNI）

- 不新增 preload 白名单条目、不新增独立事件通道。
- 不在构建脚本里注入版本、不改 package.json、不改 electron-builder 配置。
- 不显示 git hash / 构建时间。

## 4. 测试与验证

- 无新增纯逻辑（app.getVersion() 无本地副作用），不新增单元测试。
- 手动验证：npm run dev 启动后，winbar「LMS 启动器」右侧出现「v0.1.0」；
  窗口最小化/最大化拖拽不受影响（版本号在 brand 区，drag 区内无 no-drag 需求）。
- 回归：npm test 全绿。

## 5. 涉及文件

| 文件 | 改动 |
|------|------|
| src-main/main.ts | +1 个 ipcMain.handle('get_version') |
| src/App.vue | +version ref、onMounted 获取、模板加 span |
| src/style.css | +.winbar__version 规则 |