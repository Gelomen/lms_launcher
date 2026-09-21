# 规格：更新脚本改用 DETACHED_PROCESS 启动新版应用

> 日期：2026-09-21（评审修订版） · 分支：master · 状态：待实现（设计评审完成，待确认后实现）
> 本文档**取代**同日提出的 schtasks 第二计划任务方案（`2026-09-21-update-relaunch-via-task.md`）。
> 该方案在 2026-09-21 的设计评审中被否证、未实现；其要点与三条否证理由已完整留档于本文 §附录，
> 故旧文档已无独立保留必要 —— 本文自包含，引用的存在与否不影响阅读。

## 背景

LMS 启动器的自动更新流程（2026-09-05 引入）：应用点击「重启应用」后，node 侧创建一次性计划任务
`LMSLauncherUpdate` 拉起 `lms-launcher-update.ps1`（更新等待旧进程退出 → 解压 → 覆盖安装目录 → 启动新版），
随后应用退出。

`lms-launcher-update.ps1` 第 6 步用 `Start-Process -FilePath $newExe -WorkingDirectory $InstallDir`
从更新脚本自己的 powershell 里启动新版应用。

## 问题

更新完成后出现一个 CMD 窗口：

1. **窗口不会自动关闭**：脚本 exit 0 后 cmd/powershell 已退出，但新启动的应用进程附着在该控制台（conhost）上，把窗口挂住；
2. **手动关闭窗口会连带杀死新版应用**：关闭控制台窗口向全部附着进程发 CTRL_CLOSE_EVENT。

### 根因

`Start-Process` 创建的子进程**继承父进程的控制台**。探针 B3/B4（`.temp/probeB3.ps1`、`probeB4.ps1`）
复刻了该形态：cmd/ps 进程已退出，但 conhost 被新应用挂住；杀掉应用后 conhost 立即消失，
确认「窗口不关」与「关窗杀应用」同源。

2026-09-21 评审用 `GetConsoleProcessList` 直接枚举控制台附着进程，复现了该机制本身
（脚本 `.temp/grill/console-attach4.ps1`）：

| 用例（同一个探针 powershell，自身 attached=10） | 子进程存活 | 控制台附着增量 |
|------|------|------|
| `CreateProcess` 无特殊标志（= `Start-Process` 现行行为） | 是 | **+2**（cmd + PING 都挂上来） |
| `CreateProcess` + `DETACHED_PROCESS` (0x8) | 是 | **0** |

## 方案

更新脚本第 6 步不再 `Start-Process`，改用 P/Invoke 直接调用 Win32 `CreateProcessW`，
并以 `DETACHED_PROCESS (0x00000008)` 标志创建新版应用进程。

`DETACHED_PROCESS` 的语义（Win32 文档）：**新进程不继承父进程的控制台（默认行为），也不创建新控制台** ——
即完全不与控制台关联。因此：

- 更新脚本的 cmd 引导器与 powershell 退出后，该控制台上再无附着进程 → 窗口立即自动关闭；
- 关闭窗口不再向新应用发 CTRL_CLOSE_EVENT → 不会连带杀应用；
- 新应用仍然正常显示自己的 GUI 窗口（DETACHED 只影响控制台关联，不影响窗口站 / 桌面）。

**该形态等价于用户平时双击启动应用**（父进程 explorer.exe 同样没有控制台），因此不引入新的运行环境假设 ——
这是本方案最强的正确性论据。

## 设计决策（2026-09-21 评审确认）

1. **机制**：`CreateProcessW(lpApplicationName = $newExe, lpCurrentDirectory = $InstallDir,
   dwCreationFlags = DETACHED_PROCESS)`。`lpApplicationName` 是独立参数、不经过命令行拼接，
   因此**安装路径含空格天然可用**，不需要任何引号转义。
2. **工作目录**：`lpCurrentDirectory = $InstallDir`，与旧版 `Start-Process -WorkingDirectory` 语义一致。
   若不显式指定，Windows 会给 `C:\Windows\System32`，导致 `llama-server` 继承的 cwd 变化
   （相对路径参数会解析到错误位置）。另在 `src-main/process.ts` 的 `spawn` 显式补 `cwd: dataDir()` 作双保险。
3. **失败语义**：`CreateProcess` 返回 false → 记 `[ERROR]`（含 `GetLastError()` 码）；
   返回 true 后等 3 秒确认进程仍存活（覆盖「创建成功但缺 DLL 立即退出」）→ 失败同样记 `[ERROR]`。
   两种情况都**仍算更新成功**（`exit 0` + 删更新任务），不回退 `Start-Process`。
   实际状态是「更新成功、启动失败」，用户从下次启动的日志回显看到提示后手动启动即可。
4. **窗口可见性**：保持现状 —— 更新执行期间（约 10~60 秒）更新脚本自身的 CMD 窗口可见，
   ps1 退出后自动关闭。不做隐藏（隐藏需「不管是否登录都运行」存密码，或 wscript 中转 ——
   后者即已弃用的 temp 分支路线）。
5. **不做回退分支**：`Add-Type` 在受限语言模式（ConstrainedLanguage）/ 企业策略下可能不可用，
   此时更新成功但新版不自动启动（仅剩 `[ERROR]` 日志）。已确认接受该限制，不实现 schtasks 回退路径
   （两条路径都要实测、维护面翻倍）。
6. **验收**：用户自行操作验收（评审会话不做生产 E2E）。检查项：① 更新完成后无 CMD 窗口残留；
   ② 关闭任何残留窗口不影响新版应用；③ 新版应用自动启动且窗口正常；④ 应用日志回显无 `[ERROR]` 行。

## 实测证据链（2026-09-21 评审）

所有探针留存于 `.temp/grill/`。

### 1. 控制台附着（决定本方案的核心证据）

见 §根因 表；脚本 `.temp/grill/console-attach4.ps1`。该实验先测 DETACHED、杀干净后再测 flags=0，
顺序隔离以避免计数干扰。

### 2. `DETACHED_PROCESS` 路线的前提能力

`.temp/grill/detach.ps1`：`ADDTYPE_OK`（PS 5.1 下 `Add-Type` 可用）、
`CREATEPROCESS=True PID=… LASTERR=0`、`CHILD_ALIVE=True`。

### 3. 被否证路线：PS 5.1 无法把引号传给原生命令

`.temp/grill/ps51-arg.ps1`（用 node 打印真实 argv）：

| 写法 | 被调用原生程序收到的 argv |
|------|--------------------------|
| `'"' + $p + '"'` | `["C:\Program Files\Some App\app.exe"]`（**引号被剥离**） |
| `$p`（不写引号） | 同上，**完全一致** |
| `'\"' + $p + '\"'` | `["\"C:\Program", "Files\Some", "App\app.exe\""]`（**撕成三段**） |

`.temp/grill/p1.cmd` / `p2.ps1`：唯一能落地的形态是 cmd 层的嵌套写法 `"\"…\""`
（argv 得到带引号的单元素）。即 schtasks 路线要用它，ps1 与 main.ts 两处都要写这种转义。

### 4. `$ErrorActionPreference='Stop'` 与原生 stderr

`.temp/grill/ps51-sem.ps1`：原生命令写 stderr 且有 `2>&1` / `2>$null` 重定向时，**会抛终止异常**
（`System.Management.Automation.RemoteException`）；不重定向则不抛；`$LASTEXITCODE` 在重定向后仍保留。
本方案不依赖该行为（失败判定走 `CreateProcess` 返回值），但重写代码时不要引入「靠 stderr 判失败」的写法。

### 5. 评审环境限制说明

评审会话的沙箱下 `schtasks` 完全不可用（`/Query` 亦报 `The system cannot find the path specified`），
因此 schtasks 相关的真机结论（含「schtasks 是否原样保留 `/TR` 引号」）**未能在评审中实测** ——
这也是放弃该路线的原因之一。控制台附着与 `CreateProcess` 结论均为实测。

## 首次升级时执行的是哪一个 ps1（分发路径 vs 开发机）

执行更新的 ps1 取自**当前安装目录**（node 侧 `join(installDir, 'lms-launcher-update.ps1')`，
`src-main/main.ts:533`），不是仓库里的源文件。这决定了修复的生效时机：

- **通用分发路径（从 GitHub Release 的 zip 解压安装）**：安装目录里躺着上一版发布的 ps1，
  因此**首次升级到本修复版时跑的还是旧 ps1，仍会看到窗口残留 + 关窗杀应用**；
  从修复版的下一次更新起才完全无窗口。这是分发机制的固有结果，任何改法（ps1 或 node 侧）都绕不开。
- **开发机（先覆盖 ps1 再发版）**：build 之后、创建 Release 之前，把新 ps1 覆盖到自己的生产安装目录
  （`Copy-Item dist-release\win-unpacked\lms-launcher-update.ps1 <installDir>\ -Force`），
  则**第一次更新跑的就是新 ps1**，DETACHED 修复当场生效，不存在上述一次性现象。
  该流程不依赖本版本尚未发布的任何代码 —— node 侧 `run_update` / `LMSLauncherUpdate` /
  `cleanStaleUpdateTask` 本次都不改动，旧版应用照样能把新 ps1 拉起来。

覆盖必须用**文件复制**而非编辑器打开另存：ps1 为 UTF-8 with BOM + LF，另存易丢 BOM，
PS 5.1 会按 ANSI 解码中文注释与日志。发布流程约定见实现计划的任务 3。

## 安全性质

- **无 cwd 依赖（应用自身）**：`dataDir()` = exe 所在目录（`process.execPath` 的父目录），全部路径绝对；
  本方案额外用 `lpCurrentDirectory` 固定为安装目录，与旧实现一致。
- **`llama-server` 的工作目录**：由 `spawn` 的 `cwd` 显式决定（本方案补丁），不再隐含依赖应用自身的 cwd。
- **单实例锁兜底**：`requestSingleInstanceLock` 已存在，防用户手动双击造成双开。
- **无计划任务生命周期**：不创建任何 schtasks 任务，因此不存在任务残留、ST 兜底误触发、第二实例等问题。
- **句柄释放**：`CreateProcess` 返回的 `hProcess` / `hThread` 显式 `CloseHandle`（脚本退出也会释放，显式更干净）。

## 改动面

| 文件 | 改动 |
|------|------|
| `scripts/lms-launcher-update.ps1` | 第 6 步替换为 `CreateProcess` + `DETACHED_PROCESS`（含 P/Invoke 定义与失败语义）；头注释同步 |
| `src-main/process.ts` | `launch()` 新增可选 `cwd` 参数，`spawn` 透传 |
| `src-main/main.ts` | `start_server` 的 `ps.launch(…)` 调用传 `dataDir()` |
| `src-main/process.test.ts` | 新增 1 例：子进程 cwd = 指定目录 |
| `src-main/main.ts` 更新相关代码 | **不改**（不新增 `LAUNCH_TASK_NAME`，不扩展 `cleanStaleUpdateTask`） |

ps1 不在 vitest 覆盖范围（历来靠探针 / 真 E2E 验收）；`launch()` 的 cwd 透传补单测。

## 明确不做（YAGNI）

- 不隐藏更新期间的 CMD 窗口；
- 不实现 schtasks 回退分支（`Add-Type` 不可用时接受「更新成功、启动失败」）；
- 不重试 `CreateProcess`、不回退 `Start-Process`；
- 不为含空格安装路径做引号转义（`lpApplicationName` 已天然免疫）；
- 不分析 temp 分支（vbs 路线）失败原因 —— 该路线已放弃。

## 附录：被否证的 schtasks 第二任务方案

原方案（同日的 `2026-09-21-update-relaunch-via-task.md`，评审后已废弃）设计为：ps1 尾部 create → run → sleep 2s → delete
第二个一次性计划任务 `LMSLauncherStart`（`/TR` 直接指向 exe），由 svchost 拉起新版。

**机制上它同样能解决窗口问题**（换一个本身没有控制台的父进程来创建进程），且与 `main.ts` 既有
`LMSLauncherUpdate` 同模式。评审放弃它的理由：

1. **含空格路径无法干净表达**：`/TR` 最终经命令行拼接，通过 PS 5.1 无法传递内层引号（§实测证据 3），
   必须两处写成 `"\"…\""` 嵌套形式；且「schtasks 是否原样保留引号」这一前提在评审环境无法实测；
2. **启动成败不可确认**：`schtasks /Run` 返回 0 只代表「已请求运行」；删除任务前的固定
   `Start-Sleep -Seconds 2` 是拍脑袋的魔数 —— 若调度器尚未创建进程就删除任务，则进程永不启动，
   而日志会写「更新完成」、无任何 `[ERROR]`（静默失败）。`CreateProcess` 是同步 API，直接消掉这条路径；
3. **引入了任务生命周期**：任务残留、`/SC ONCE` 的 ST 兜底触发（会拉起第二实例）、三层清理逻辑 ——
   其中「ONCE 到点后 Windows 自动回收」这一层**实际不存在**（ONCE 任务触发后仍留在任务库，只是不再触发），
   复杂度 / 收益比明显劣于进程级方案。

原方案中仍然有效、已并入本文档的部分：根因分析、探针 B3/B4/C 证据、失败语义（记 ERROR、不回退、
更新仍算成功）、窗口可见性决策、首次升级残留说明、单实例锁兜底。
