# 规格：更新脚本改用计划任务启动新版应用

> 日期：2026-09-21 · 分支：master · 状态：已确认（设计评审完成，待实现）

## 背景

LMS 启动器的自动更新流程（2026-09-05 引入）：应用点击「重启应用」后，node 侧创建一次性计划任务 `LMSLauncherUpdate` 拉起 `lms-launcher-update.ps1`（更新等待旧进程退出 → 解压 → 覆盖安装目录 → 启动新版），随后应用退出。

`lms-launcher-update.ps1` 第 6 步用 `Start-Process -FilePath $newExe` 从更新脚本自己的 powershell 里启动新版应用。

## 问题

更新完成后出现一个 CMD 窗口：

1. **窗口不会自动关闭**：脚本 exit 0 后 cmd/powershell 已退出，但新启动的应用进程附着在该控制台（conhost）上，把窗口挂住；
2. **手动关闭窗口会连带杀死新版应用**：关闭控制台窗口向全部附着进程发 CTRL_CLOSE_EVENT。

### 根因（本机探针矩阵验证，2026-09-21）

| 探针 | 形态 | 结果 |
|------|------|------|
| B3 | 复刻当前 master 形态：任务 → cmd → ps1 → `Start-Process` 真实 exe | cmd/ps 进程退出，但 conhost 被新应用挂住（残留窗口） |
| B4 | 杀掉应用后复查 | conhost 立即消失 → 确认「窗口不关」与「关窗杀应用」均源于应用附着在任务控制台 |
| C | 计划任务 `/TR` 直接指向 GUI exe | 应用父进程 = svchost，无 conhost、无窗口、完全解耦 |
| D | 用户方案全链路：更新任务尾部 create 第二任务 → run → sleep 2s → delete，真实 exe | CMD 自动关闭、应用父进程 svchost、delete 安全、无 conhost 残留 |

注：`lms_launcher.exe` 为 GUI 子系统（PE subsystem=2），但 GUI 进程仍会继承并附着父进程的控制台。探针脚本留存于 `.temp/probeA~D.ps1`、`.temp/cleanupD.ps1`。

## 方案

更新脚本第 6 步不再直接 `Start-Process`，改为创建第二个一次性计划任务 `LMSLauncherStart`（`/TR` 直接指向新版 exe），立即触发并删除。新应用由任务计划程序（svchost）拉起，与更新脚本的进程树和控制台完全解耦。

该机制与项目已验证的 `LMSLauncherUpdate` 完全同模式（2026-09-05 探针矩阵已证明 schtasks 是唯一同时满足「真执行」与「父进程退出后存活」的机制），且 `/TR` 仅含 exe 路径（约 40 字符），远低于 261 字符上限，不需要 cmd 引导文件。

## 设计决策（已与用户确认）

1. **创建位置**：ps1 尾部全权负责——覆盖成功后 create → run → sleep 2s → delete 一气呵成。触发点精确等于「新版就绪」，不依赖时间估计。node 侧不预建启动任务（若更新中途失败，ST 兜底点会拉起旧版/半覆盖态 exe，语义错误）。
2. **清理（三层，不累积）**：
   - ps1 正常路径 run 后 sleep 2s 删除（探针 D 验证安全）；
   - `/Create /F` 强制覆盖：任务名固定，即使某次 delete 失败，下次更新直接覆盖同名任务，结构上不可能累积；
   - 兜底：ONCE 任务 ST 到点（+2 分钟）后 Windows 自动回收；`main.ts` 的 `cleanStaleUpdateTask` 扩展为同时删除 `LMSLauncherStart`（与 `LMSLauncherUpdate` 清理对称）。
3. **失败语义**：create/run 失败 → 记 `[ERROR]` 到 `lms_launcher_update.log`（应用下次启动自动回显）+ 更新算成功（exit 0 + 删更新任务），**不回退** `Start-Process`（避免在罕见路径复现窗口 bug）。实际状态是「更新成功、启动失败」，用户从日志看到提示后手动启动即可。
4. **更新窗口可见性**：保持现状——更新执行期间（约 10~60 秒）更新脚本自身的 CMD 窗口可见，ps1 退出后自动关闭。不做隐藏（隐藏需「不管是否登录都运行」存密码，或 wscript 中转——后者即已弃用的 temp 分支路线）。
5. **验收**：用户自行操作验收（本会话不做生产 E2E）。检查项：① 新版应用自动启动且父进程 svchost；② 更新完成后无 CMD 窗口残留；③ `schtasks /Query` 无 `LMSLauncherStart` / `LMSLauncherUpdate` 残留；④ 更新日志无 ERROR。

## 已知一次性残留行为（必须知晓）

执行更新的 ps1 取自**当前安装目录**（node 侧 `join(installDir, 'lms-launcher-update.ps1')`）。因此**首次升级到本修复版时，跑的还是旧 ps1，仍会看到窗口残留 + 关窗杀应用**；从修复版的下一次更新起才完全无窗口。任何改法（ps1 或 node 侧）都绕不开这一点。

## 安全性质

- **无 cwd 依赖**：`dataDir()` = exe 所在目录（`process.execPath` 的父目录），全部路径绝对，计划任务以任意工作目录启动 exe 无影响；
- **单实例锁兜底**：`requestSingleInstanceLock` 已存在，即使启动任务意外残留到 ST 触发点，第二实例拿不到锁立即退出，无副作用；
- **删除运行中 ONCE 任务安全**：既有 `Remove-UpdateTask` 注释已记录探针验证（任务库即时移除，脚本进程不受影响），本方案复用同模式（探针 D 再次验证）。

## 改动面

| 文件 | 改动 |
|------|------|
| `scripts/lms-launcher-update.ps1` | 第 6 步替换为第二计划任务启动（含失败语义）；头注释与流程说明同步 |
| `src-main/main.ts` | 新增常量 `LAUNCH_TASK_NAME`；`cleanStaleUpdateTask` 扩展同时删除 `LMSLauncherStart`；注释同步 |
| 测试 | 无新增（ps1 不在 vitest 覆盖范围，历来靠探针/真 E2E 验收；`cleanStaleUpdateTask` 为 IO 函数按现有约定不单测）；跑全量 494 例回归确认无破坏 |

## 明确不做（YAGNI）

- 不隐藏更新期间的 CMD 窗口；
- 不在 node 侧预建启动任务、不引入时间协调；
- 不重试 schtasks、不回退 `Start-Process`；
- 不分析 temp 分支（vbs 路线）失败原因——该路线已放弃。
