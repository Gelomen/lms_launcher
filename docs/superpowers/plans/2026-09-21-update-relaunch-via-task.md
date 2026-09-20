# 更新脚本改用计划任务启动新版应用 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 更新脚本第 6 步不再 `Start-Process` 直接启动新版应用，改为创建一次性计划任务 `LMSLauncherStart` 由任务计划程序（svchost）拉起，消除「CMD 窗口残留 + 关窗杀应用」问题。

**架构：** ps1 覆盖成功后 create → run → sleep 2s → delete 第二任务；`main.ts` 的 `cleanStaleUpdateTask` 扩展为同时清理 `LMSLauncherStart`。机制与既有 `LMSLauncherUpdate` 完全同模式。

**技术栈：** PowerShell 5.1 兼容语法（脚本运行于 Windows 自带 powershell.exe）、Electron 主进程 TypeScript、schtasks CLI。

**规格：** `docs/superpowers/specs/2026-09-21-update-relaunch-via-task.md`（含探针证据链与设计决策，实现前必读）

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `scripts/lms-launcher-update.ps1` | 更新脚本（本仓库源文件，build 时随包分发到安装目录） | 第 6 步替换 + 头注释同步 |
| `src-main/main.ts` | Electron 主进程 | 新增 `LAUNCH_TASK_NAME` 常量 + `cleanStaleUpdateTask` 扩展 |
| `src-main/gpu-stats.ts` 等 | 不涉及 | 无 |

约定：ps1 不在 vitest 覆盖范围（现有 494 例全是 TS 侧），ps1 改动靠 build 产物目检 + 用户真 E2E 验收；`cleanStaleUpdateTask` 为 IO 函数按现有约定不单测（同 `startGpuStats`）。

---

### 任务 1：ps1 第 6 步改为计划任务启动

**文件：**
- 修改：`scripts/lms-launcher-update.ps1:1-6`（头注释）
- 修改：`scripts/lms-launcher-update.ps1:94-100`（第 6 步）

- [ ] **步骤 1：修改头注释（第 1~6 行）**

将现有头注释：

```powershell
# lms-launcher-update.ps1 —— LMS 启动器更新脚本（2026-09-05 起取代 Electron update.exe）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File lms-launcher-update.ps1 <zipPath> <installDir>
# 流程：等待 lms_launcher.exe 退出（最多 60s）→ .NET 解压整包到 __update_tmp →
#       校验关键条目 → 全量覆盖 installDir（zip 不含 yaml/downloads，用户数据不受影响）→
#       清理（含旧版 update.exe 残留）→ 启动新版。
# 日志：追加写 <installDir>\lms_launcher_update.log，主应用下次启动时回显并删除。
```

替换为：

```powershell
# lms-launcher-update.ps1 —— LMS 启动器更新脚本（2026-09-05 起取代 Electron update.exe）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File lms-launcher-update.ps1 <zipPath> <installDir>
# 流程：等待 lms_launcher.exe 退出（最多 60s）→ .NET 解压整包到 __update_tmp →
#       校验关键条目 → 全量覆盖 installDir（zip 不含 yaml/downloads，用户数据不受影响）→
#       清理（含旧版 update.exe 残留）→ 创建一次性计划任务 LMSLauncherStart 启动新版。
# 日志：追加写 <installDir>\lms_launcher_update.log，主应用下次启动时回显并删除。
# 启动新版（2026-09-21 起）：不再 Start-Process 直接拉起——子进程会附着在本脚本的控制台，
# 导致更新完成后 CMD 窗口残留、关窗连带杀应用（探针 .temp/probeB3/B4 证实）。改为第二
# 一次性计划任务 LMSLauncherStart（/TR 直接指向 exe，svchost 发起，无控制台）：create →
# run → sleep 2s → delete。/F 覆盖防累积；残留由 ST 到点自动回收 + 主应用启动时
# cleanStaleUpdateTask 兜底删除；误触发时单实例锁保证第二实例立即退出。create/run
# 失败记 [ERROR] 日志、更新仍算成功（不回退 Start-Process，避免复现窗口 bug）。
```

- [ ] **步骤 2：替换第 6 步代码**

将现有（第 94~100 行）：

```powershell
  # 6) 启动新版
  $newExe = Join-Path $InstallDir 'lms_launcher.exe'
  Write-Log '[INFO] 启动新版 lms_launcher.exe'
  Start-Process -FilePath $newExe -WorkingDirectory $InstallDir
  Write-Log '[INFO] 更新完成'
  Remove-UpdateTask
  exit 0
```

替换为：

```powershell
  # 6) 启动新版（2026-09-21 起：第二一次性计划任务，svchost 发起，与本脚本控制台解耦）
  #    Start-Process 的子进程会附着本脚本的控制台：更新完成后 CMD 窗口残留、
  #    关窗连带杀应用。计划任务 /TR 直接指向 exe 无此问题（探针 probeC/probeD 验证）。
  $newExe = Join-Path $InstallDir 'lms_launcher.exe'
  $launchTask = 'LMSLauncherStart'
  $launchOk = $false
  try {
    $st = (Get-Date).AddMinutes(2)
    $stStr = $st.ToString('HH') + ':' + $st.ToString('mm')
    # /F 覆盖：即使上次 delete 失败留下残留，本次直接覆盖同名任务（结构上不累积）；
    # /ST 仅作崩溃兜底（/Run 失败时 ST 到点拉起，单实例锁防双开；ONCE 到点后自动回收）。
    # /TR 值显式带引号（含引号的参数在 PS 5.1 按原样传给原生命令，已实测验证）。
    Write-Log ('[INFO] 创建启动任务 ' + $launchTask + ' → ' + $newExe)
    & schtasks.exe /Create /F /SC ONCE /ST $stStr /TN $launchTask /TR ('"' + $newExe + '"') 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('schtasks /Create 失败（exit ' + $LASTEXITCODE + '）') }
    & schtasks.exe /Run /TN $launchTask 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('schtasks /Run 失败（exit ' + $LASTEXITCODE + '）') }
    Start-Sleep -Seconds 2 # 等调度器完成进程创建，再删任务记录（删运行中 ONCE 任务安全，与 Remove-UpdateTask 同模式）
    Write-Log '[INFO] 已触发启动任务（新版由任务计划程序拉起，与本脚本解耦）'
    $launchOk = $true
  } catch {
    Write-Log ('[ERROR] 启动任务创建/触发失败：' + $_.Exception.Message + ' —— 请手动启动新版 lms_launcher.exe')
  }
  try { & schtasks.exe /Delete /F /TN $launchTask 2>&1 | Out-Null } catch { }
  if ($launchOk) { Write-Log '[INFO] 更新完成' }
  else { Write-Log '[INFO] 更新完成（新版未自动启动，请手动启动）' }
  Remove-UpdateTask
  exit 0
```

实现注意：

- **必须显式检查 `$LASTEXITCODE`**：脚本运行于 Windows PowerShell 5.1（bootstrap cmd 用 `powershell.exe`），5.1 中原生命令非零退出**不会**抛异常（PS 7 的 `PSNativeCommandUseErrorActionPreference` 不可用），所以 `try/catch` 抓不到 schtasks 失败，代码里用 `if ($LASTEXITCODE -ne 0) { throw ... }` 显式转成异常。
- 失败分支语义：create 或 run 任一失败 → 记 `[ERROR]` → **继续往下走**（delete 兜底 + exit 0），**不得** exit 1，也不得让异常冒泡到外层 catch 把整次更新标记失败（文件已覆盖完成，实际状态是「更新成功、启动失败」，已确认的失败语义）。
- `/ST` 只接受 `HH:mm` 两段格式（与 main.ts 现有写法一致）；`$st.ToString('HH')` 为 24 小时制两位。
- `/TR` 的值是显式带引号的字符串（`'"' + $newExe + '"'`）：PS 5.1 对含引号的参数按原样传递给原生命令（已实测 `.temp/probeQuote.ps1` 验证），schtasks 收到带引号的 exe 路径；即使安装路径含空格也安全。
- ps1 源文件编码与 CRLF 行尾必须与现状一致（先 `git diff` 确认只改了预期行，未引入 BOM/行尾变化）。

- [ ] **步骤 3：语法自检**

运行：`powershell -NoProfile -Command "$errs=$null; [System.Management.Automation.Language.Parser]::ParseFile('D:\AI\Workspace\lms_launcher\scripts\lms-launcher-update.ps1',[ref]$null,[ref]$errs) | Out-Null; if($errs){$errs|ForEach-Object{Write-Output $_.Message}; exit 1}else{Write-Output 'PS_PARSE_OK'}"`
预期：`PS_PARSE_OK`，无错误行。

- [ ] **步骤 4：Commit**

```bash
git add scripts/lms-launcher-update.ps1
git commit -m "fix: 更新脚本改用计划任务 LMSLauncherStart 启动新版——Start-Process 子进程附着任务控制台导致窗口残留且关窗连带杀应用，改由任务计划程序（svchost）拉起彻底解耦"
```

---

### 任务 2：main.ts 启动时兜底清理 LMSLauncherStart

**文件：**
- 修改：`src-main/main.ts:17` 后（新增常量）
- 修改：`src-main/main.ts:579-588`（`cleanStaleUpdateTask`）

- [ ] **步骤 1：新增任务名常量**

在 `src-main/main.ts` 第 17 行（`const UPDATE_TASK_NAME = 'LMSLauncherUpdate';`）之后插入：

```typescript
// 新版启动任务名（schtasks）：2026-09-21 起更新脚本 ps1 尾部用它拉起新版 exe（svchost
// 发起，无控制台，与更新脚本解耦）；正常路径 ps1 触发后即删，此处启动时兜底清理残留。
const LAUNCH_TASK_NAME = 'LMSLauncherStart';
```

- [ ] **步骤 2：扩展 cleanStaleUpdateTask**

将现有：

```typescript
// 清理残留更新任务：上次 create 成功但 /Run 前应用崩溃（或用户强杀）会留下
// ONCE 任务，其计划触发点可能落在下次启动后的 2 分钟窗口内——ps1 会等 lms_launcher
// 退出才覆盖，届时应用正在运行，等待必然 60s 超时。启动时删除即可（任务幂等，
// 正常运行时它本来也已在 ps1 尾部自删）。
function cleanStaleUpdateTask(): void {
  try {
    execSync('schtasks /Delete /F /TN "' + UPDATE_TASK_NAME + '"', { stdio: 'ignore' });
    emitLog('[lms_launcher] LMS 启动器 · 更新 · 已清理残留计划任务 ' + UPDATE_TASK_NAME, 'sys');
  } catch { /* 任务不存在 / schtasks 不可用：均无影响 */ }
}
```

替换为：

```typescript
// 清理残留更新/启动任务：上次 create 成功但 /Run 前应用崩溃（或用户强杀）会留下
// ONCE 任务，其计划触发点可能落在下次启动后的 2 分钟窗口内——更新任务（LMSLauncherUpdate）
// 若触发会等 lms_launcher 退出才覆盖，届时应用正在运行，等待必然 60s 超时；启动任务
// （LMSLauncherStart）若触发会拉起第二实例，被单实例锁拦下后退出，无害但应清理。
// 启动时删除即可（任务幂等，正常运行时它们本来也已在 ps1 尾部自删）。
function cleanStaleUpdateTask(): void {
  try {
    execSync('schtasks /Delete /F /TN "' + UPDATE_TASK_NAME + '"', { stdio: 'ignore' });
    emitLog('[lms_launcher] LMS 启动器 · 更新 · 已清理残留计划任务 ' + UPDATE_TASK_NAME, 'sys');
  } catch { /* 任务不存在 / schtasks 不可用：均无影响 */ }
  try {
    execSync('schtasks /Delete /F /TN "' + LAUNCH_TASK_NAME + '"', { stdio: 'ignore' });
    emitLog('[lms_launcher] LMS 启动器 · 更新 · 已清理残留计划任务 ' + LAUNCH_TASK_NAME, 'sys');
  } catch { /* 任务不存在 / schtasks 不可用：均无影响 */ }
}
```

实现注意：两段 try/catch 相互独立——更新任务删除成功、启动任务不存在（常态）时，后者静默失败即可，不产生多余日志。

- [ ] **步骤 3：全量回归**

运行：`npm test`
预期：全绿，且通过数与改动前基线一致（先跑一次 `npm test` 记录改动前基线，改动后再跑对比；本改动不影响任何现有测试，数量应完全相同）。

- [ ] **步骤 4：构建验证**

运行：`npm run build`
预期：vite 前端与 tsc 主进程构建通过，无类型错误。

- [ ] **步骤 5：目检构建产物中的 ps1**

运行：`type dist-release\win-unpacked\lms-launcher-update.ps1 | findstr /C:"LMSLauncherStart"`
预期：命中多行（常量赋值 + create/run/delete 各 1 行），证明 build 流程会把改后的 ps1 带进产物。

- [ ] **步骤 6：Commit**

```bash
git add src-main/main.ts
git commit -m "fix: 应用启动时兜底清理残留 LMSLauncherStart 任务——与 LMSLauncherUpdate 清理对称，防 ps1 崩在 create/delete 之间留下 ONCE 任务"
```

---

### 任务 3：交接（用户自行验收）

**文件：** 无代码改动。

- [ ] **步骤 1：交付说明**

告知用户验收步骤（用户已确认自行操作验收）：

1. 构建 + 打包新版：`build.bat`（或 `npm run build && npx electron-builder && pwsh -File scripts/package-zip.ps1`）；
2. 把 zip 放到生产安装目录（如 `D:\AI\LMS-Launcher\downloads\lms-launcher-update.zip`）并走完更新流程；
3. **注意一次性残留行为**：首次升级时跑的是旧版 ps1，窗口残留仍会出现；从本次修复版的下一次更新起才无窗口；
4. 验收检查项：① 新版应用自动启动（任务管理器中 `lms_launcher.exe` 父进程为 `svchost.exe`）；② 更新完成后无 CMD 窗口残留；③ `schtasks /Query /TN LMSLauncherStart` 与 `schtasks /Query /TN LMSLauncherUpdate` 均报「找不到」；④ 应用日志回显无 `[ERROR]` 行。

- [ ] **步骤 2：留存探针证据**

`.temp/probeA.ps1`、`.temp/probeB*.ps1`、`.temp/probeC.ps1`、`.temp/probeD*.ps1`、`.temp/cleanupD.ps1` 保留不删（规格 §根因 的证据链）。`lms_launcher_update.cmd` 引导器（node 侧 run_update 生成）不变——它仍负责拉起更新脚本，本次只改「启动新版」一环。
