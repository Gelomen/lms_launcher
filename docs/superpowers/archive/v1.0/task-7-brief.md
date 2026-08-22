### 任务 7：模块 1（DirModule）+ 模块 2（TemplateModule + Modal）

**文件：**
- 实现：`src/modules/DirModule.vue`、`src/modules/TemplateModule.vue`、`src/modules/TemplateModal.vue`

按规格 §4.1（模块 1 · llama.cpp 安装目录）+ §4.2（模块 2 · 启动参数模板管理）。

- [ ] **步骤 1：DirModule.vue**

- 输入框展示当前 `llama_dir`（`invoke('get_app_config')`）；
- 「选择目录…」按钮 → 调 Electron `dialog`（主进程侧加一个 `open_dir_dialog` handler，见下方补充 IPC）→ 回填；
- 「校验」按钮 → `invoke('validate_dir', dir)`，true 显示 ✓「llama-server.exe 已找到」，false 显示 ✗「未找到 llama-server.exe」；
- 校验通过后保存 `save_llama_dir`。

**补充 IPC**（主进程 main.ts 加一个 handler，渲染端经 invoke 调）：

~~~ ts
ipcMain.handle('open_dir_dialog', async (): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});
~~~

（preload.ts 的 invoke 白名单已覆盖——invoke 透传任意命令名，无需改 preload。）

- [ ] **步骤 2：TemplateModule.vue + TemplateModal.vue**

- TemplateModule：表格列 = id / desc / 参数预览（summarize 风格，取前 3 个 flag）/ 操作（编辑 · 删除）；顶部「新建模板」按钮；
- 删除确认（confirm 对话框）→ `invoke('delete_config', id)`，成功后 reload（`invoke('get_configs')`）；
- TemplateModal：按 `invoke('get_params')` 的映射表动态渲染——每行一个 key + desc（flag-form）+ 输入框；保存 → `invoke('save_config', id, desc, values)`；
- 错误展示统一：`isMissing(e)` / `isValidation(e)` 前缀分类（§6），MISSING 时提示去新建。

- [ ] **步骤 3：构建验证**

~~~ powershell
npm run build
~~~

预期：成功。

- [ ] **步骤 4：Commit**

~~~ bash
git add src/modules/ src-main/main.ts
git commit -m "feat: 模块 1 目录校验 + 模块 2 模板管理（含 open_dir_dialog IPC）"
~~~

---

### 任务 8：模块 3（LaunchBar）+ 模块 4（LogPanel）+ App 接线