任务 7 简报（从 plan 逐字抽取，勿改）

### 任务 7：`QuickLaunchManager` 的 admin 分支 + `main.ts` 接线

**改什么**：§6.8。`QlDeps` 加必填 `spawnElevatedShell`；加 `createElevatedShellProcess` 接缝；`start()` 的 shell 分支按 `e.admin === true` 分流。

- [ ] **步骤 0：起点核对**：`quick-launch.ts:166-172`（`QlDeps`）、`:175-182`（`ShellProcess`）、`:223-225`（`createShellProcess`）、`:232-266`（shell 分支）、`:242-245`（失败不残留）、`:249-258`（onData/onExit）、`:264`（自动命令）、`main.ts:1076-1085`（`new QuickLaunchManager(...)`）。
- [ ] **步骤 1：先改测试**（`quick-launch.test.ts`）：`:151-156` 的 `QlDeps` 夹具补 `spawnElevatedShell` 假实现（否则类型门红）；新增：
  - `admin_true_starts_through_the_elevated_host`（断言 `createElevatedShellProcess` 被调用、本地 `pty.spawn` 没被调用）
  - `admin_falsy_uses_the_plain_local_pty`（RF2）
  - `admin_true_failure_leaves_no_instance`（`:242-245` 的语义在提权路径同样成立）
  - `admin_true_auto_command_released_after_first_output`（RF1：断言写入顺序 = 先转 `onData` 再放命令）
  - `admin_true_stop_goes_through_the_same_path`
- [ ] **步骤 2：跑红**：`npx vitest run src-main/quick-launch.test.ts`。
- [ ] **步骤 3：实现**：`start()` 里 `const proc = e.admin === true ? await this.createElevatedShellProcess(...) : this.createShellProcess(...)`，`try/catch` 的 `PROC:` 包装与错误文案（`err.ql.ptySpawn`，`{exe} = shellExe(shell).exe`）不变。
- [ ] **步骤 4：`main.ts` 接线**：`new QuickLaunchManager({..., spawnElevatedShell: (shell, cols, rows, cwd) => startElevatedHost(...) }, ...)`；`startElevatedHost` 里解析硬链接、失败按 §6.10 先 `emitLog('[lms_launcher] ' + msg, 'sys')` 再抛（与 `main.ts:1064` 同一分工）。
- [ ] **步骤 5：`ipc-ql.test.ts` 加端到端形状门**：`admin:true` 的 shell 条目 → 走假宿主接缝 → 页签事件 / `ql_write` / `ql_resize` / [停止] 与非提权用例同一断言集。
- [ ] **步骤 6：跑绿 + G5 + G6 + 全量**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 快捷启动按 admin 分流到提权 PTY 宿主`

---
