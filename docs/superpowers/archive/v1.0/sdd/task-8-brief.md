### 任务 8：模块 3（LaunchBar）+ 模块 4（LogPanel）+ App 接线

**文件：**
- 实现：`src/modules/LaunchBar.vue`、`src/modules/LogPanel.vue`；
- 修改：`src/App.vue`（全局状态接线）。

按规格 §4.3（模块 3 · 启动控制与状态）+ §4.4（模块 4 · 日志区）。

- [ ] **步骤 1：App.vue 全局状态接线**

- `onMounted` 起：`onLogLine` / `onProcessExit` 订阅；`ref` 维护 `logLines[]`（上限 500 行滚动）、`state = {running, stopping, configId}`；
- 启动 → `invoke('start_server', configId)`，catch 按前缀分类（VALIDATION → 红字错误，MISSING → 提示）；
- 停止 → `invoke('stop_server')`；
- process-exit → 清 running、追加 sys 行「进程退出 code=N」；
- tray-exit-request（任务 9 事件）→ 确认后 `invoke('exit_app')`。

- [ ] **步骤 2：LaunchBar.vue**

- 「启动」按钮（主色）：Running 时禁用；
- 「停止」按钮（红色）：仅 Running 可用，Stopping 时显示「停止中…」；
- 状态文本：`{configId} · 运行中` / `就绪` / `停止中…`；
- 配置下拉选择（来自 TemplateModule 的 get_configs）。

- [ ] **步骤 3：LogPanel.vue**

- 白底 + Solarized Light ANSI 关键字着色（规格 §4.4——非深色终端块）：`, 状态行高亮（如 [lms_launch] 前缀 sys 行用蓝灰），错误行（含 error/fatal 关键字或 stream=err）用 Solarized 红；
- 等宽字体（Consolas/Menlo）；
- 自动滚动到底（可关）；
- 行上限 500（超出裁掉最旧）。

- [ ] **步骤 4：构建验证 + 手动冒烟**

~~~ powershell
npm run build
~~~

手动：`npm run dev` 后——新建一个模板（指向真实 llama-server.exe，参数随便填），点启动：sys 行「启动配置 · -m xxx …」出现，out 行实时滚动；点停止：3s 内 stopping → ready，sys 行「停止指令已发送」+ process-exit。

- [ ] **步骤 5：Commit**

~~~ bash
git add src/modules/ src/App.vue
git commit -m "feat: 模块 3 启动控制 + 模块 4 日志区（Solarized Light）+ App 状态接线"
~~~

---

### 任务 9：托盘（§4.6）