任务 9 简报（从 plan 逐字抽取，勿改）

### 任务 9：`build.bat` 预建硬链接 + 打包真机门（用户执行）

- [ ] **步骤 1：`build.bat`**：在 `:102`（`:pack_done`）之后插入预建步骤（§6.11）：已存在则跳过；`mklink /H` 失败只警告不中断（运行时会自建，§6.4-1）。echo 行里不得出现未转义的 `)`（`build.bat:91-92` 的既有告诫）。
- [ ] **步骤 2：跑 `build.bat`**（主代理），核对产物：
  - `dist-release\win-unpacked\node.exe` 存在且与 `lms_launcher.exe` 同 inode（`fsutil hardlink list node.exe`）
  - `resources\app.asar\dist-main\ql-pty-host.js` 在包里（`npx asar list`）
  - `resources\app.asar.unpacked\node_modules\@lydell\**` 与 `koffi` / `@koromix` 在
- [ ] **步骤 3：把 §7.2 的 9 条清单逐字交给用户**，并**同时**交前置 feature 的六步（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7）。本实现环境起不了 ConPTY（§2-5），**不得用「自动化已过」代替这一条**。
- [ ] **步骤 4：等回报**，逐条把「通过 / 不通过 + 现象」填进本任务 check 表的 J 段；R1 命中时按 §9-R1 的回退口径改 `electron-builder.yml` 并**同一 commit** 同步 spec/plan/check 表。
- [ ] **步骤 5：Commit（主代理）**：`build: 预建提权宿主的 node.exe 硬链接 + 真机门清单`

---

## 计划自检（写完当场跑过）

- 规格 §4 的 4 条目标 → 任务 1（持久化）、3（exe 提权）、7（终端提权 + 页签保真）、8（弹窗）、9（真机）；§5 的每条非目标都没有对应任务。
- 规格 §6.1–§6.11 每节都有任务承载；§9 的 R1–R8 落在任务 9 的真机门与任务 4/6 的用例里。
- 无占位符 / 无「二选一」遗留（`main.ts` 适配器取 `admin` 的两种方式在任务 3 步骤 4 里明确「选定后写进 C 段」——那是实现选择，不是规格空洞）。
- 每个任务都有「先红」的步骤与定向命令；每个任务的收尾都带 G5/G6。
