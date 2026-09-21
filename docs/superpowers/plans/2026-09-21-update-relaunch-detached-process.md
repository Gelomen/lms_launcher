# 更新脚本改用 DETACHED_PROCESS 启动新版应用 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 更新脚本第 6 步不再 `Start-Process` 直接启动新版应用，改为 P/Invoke `CreateProcessW` +
`DETACHED_PROCESS` 让新版进程不与更新脚本的控制台关联，消除「CMD 窗口残留 + 关窗杀应用」。

**架构：** ps1 第 6 步 `Add-Type` 注入 `CreateProcessW` 声明 → 以 `DETACHED_PROCESS (0x8)` 创建新版 exe
（`lpApplicationName` = exe 全路径、`lpCurrentDirectory` = 安装目录）→ 同步判成败 + 等 3 秒确认存活 →
写日志 → `exit 0`。`main.ts` 的更新相关代码**不改**；另在 `process.ts` 的 `spawn` 显式补 `cwd`。

**技术栈：** PowerShell 5.1 兼容语法（脚本运行于 Windows 自带 powershell.exe）、Win32 `CreateProcessW`、
Electron 主进程 TypeScript。

**规格：** `docs/superpowers/specs/2026-09-21-update-relaunch-detached-process.md`（含实测证据链与设计决策，实现前必读）

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `scripts/lms-launcher-update.ps1` | 更新脚本（本仓库源文件，build 时随包分发到安装目录） | 第 6 步替换（P/Invoke + DETACHED_PROCESS）+ 头注释同步 |
| `src-main/process.ts` | llama-server 进程状态机 | `launch()` 新增可选 `cwd`，`spawn` 透传 |
| `src-main/main.ts` | Electron 主进程 | `start_server` 的 `launch` 调用传 `dataDir()` |
| `src-main/process.test.ts` | 进程模块单测 | 新增 cwd 用例 |

约定：ps1 不在 vitest 覆盖范围（现有用例全是 TS 侧），ps1 改动靠语法解析自检 + 真 E2E 验收。

---

### 任务 1：ps1 第 6 步改为 CreateProcess + DETACHED_PROCESS

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
#       清理（含旧版 update.exe 残留）→ 启动新版。
# 日志：追加写 <installDir>\lms_launcher_update.log，主应用下次启动时回显并删除。
# 启动新版（2026-09-21 评审修订）：不再 Start-Process —— 它的子进程会继承本脚本的控制台，
# 导致更新完成后 CMD 窗口残留、关窗连带杀应用（.temp/probeB3/B4 + .temp/grill/console-attach4
# 实测附着增量 +2）。改为 P/Invoke CreateProcessW + DETACHED_PROCESS(0x8)：新进程不与任何控制台
# 关联（实测增量 0），等价于用户双击启动（explorer 同样无控制台）。lpApplicationName 独立传参，
# 安装路径含空格也无需引号转义；lpCurrentDirectory 固定安装目录，与旧 -WorkingDirectory 语义一致。
# 失败语义：CreateProcess 失败、或进程 3 秒内退出 → 记 [ERROR]，更新仍算成功（exit 0，不回退
# Start-Process，避免在罕见路径复现窗口 bug）。
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
  # 6) 启动新版（2026-09-21 评审修订：CreateProcess + DETACHED_PROCESS）
  #    Start-Process 的子进程会继承本脚本的控制台（探针实测 GetConsoleProcessList 增量 +2）：
  #    更新完成后 CMD 窗口被新应用挂住不关，关窗又向它发 CTRL_CLOSE_EVENT 连带杀进程。
  #    DETACHED_PROCESS(0x8) 让新进程不与任何控制台关联（实测增量 0）——等价于用户双击启动。
  #    lpApplicationName 独立传参 → 安装路径含空格无需引号转义；lpCurrentDirectory 固定安装目录
  #    （与旧 Start-Process -WorkingDirectory 语义一致；否则 Windows 会给 C:\Windows\System32，
  #    连带改变 llama-server 继承的工作目录）。
  $newExe = Join-Path $InstallDir 'lms_launcher.exe'
  if (-not (Test-Path $newExe)) {
    Write-Log ('[ERROR] 未找到新版 ' + $newExe + '，请手动检查安装目录')
  } else {
    $launchOk = $false
    try {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class LmsDetachedLaunch {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX; public int dwY; public int dwXSize; public int dwYSize;
    public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute;
    public int dwFlags; public short wShowWindow; public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId;
  }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CreateProcess(string lpApplicationName, string lpCommandLine,
    IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles,
    uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory,
    ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);
}
'@
      $si = New-Object LmsDetachedLaunch+STARTUPINFO
      $si.cb = [System.Runtime.InteropServices.Marshal]::SizeOf([type][LmsDetachedLaunch+STARTUPINFO])
      $pi = New-Object LmsDetachedLaunch+PROCESS_INFORMATION
      # 0x00000008 DETACHED_PROCESS：新进程既不继承父控制台、也不创建新控制台
      $DETACHED_PROCESS = 0x00000008
      Write-Log ('[INFO] 启动新版（DETACHED_PROCESS，与本脚本控制台解耦）：' + $newExe)
      $ok = [LmsDetachedLaunch]::CreateProcess($newExe, ('"' + $newExe + '"'),
        [IntPtr]::Zero, [IntPtr]::Zero, $false, $DETACHED_PROCESS, [IntPtr]::Zero, $InstallDir,
        [ref]$si, [ref]$pi)
      if ($ok) {
        [void][LmsDetachedLaunch]::CloseHandle($pi.hThread)
        [void][LmsDetachedLaunch]::CloseHandle($pi.hProcess)
        # 等 3 秒确认进程仍在：CreateProcess 成功只代表创建成功，缺 DLL / 被拦截会立刻退出
        Start-Sleep -Seconds 3
        if (Get-Process -Id $pi.dwProcessId -ErrorAction SilentlyContinue) {
          $launchOk = $true
          Write-Log ('[INFO] 新版已启动（PID ' + $pi.dwProcessId + '，无控制台关联）')
        } else {
          Write-Log ('[ERROR] 新版启动后立即退出（PID ' + $pi.dwProcessId + '），请手动启动 lms_launcher.exe')
        }
      } else {
        $winErr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Log ('[ERROR] CreateProcess 失败（Win32 错误 ' + $winErr + '），请手动启动 lms_launcher.exe')
      }
    } catch {
      Write-Log ('[ERROR] 启动新版失败：' + $_.Exception.Message + ' —— 请手动启动 lms_launcher.exe')
    }
    if ($launchOk) { Write-Log '[INFO] 更新完成' }
    else { Write-Log '[INFO] 更新完成（新版未自动启动，请手动启动）' }
  }
  Remove-UpdateTask
  exit 0
```

实现注意：

- **失败分支必须继续往下走**：任何失败只记 `[ERROR]`，**不得** `exit 1`、也不得让异常冒泡到外层 catch
  （文件已覆盖完成，实际状态是「更新成功、启动失败」）。内层 `try/catch` 就是为此存在。
- **不要用 `2>&1` 之类的 stderr 重定向判成败**：`$ErrorActionPreference='Stop'` 下原生命令的 stderr
  重定向会抛 `RemoteException`（见规格 §实测证据 4）。本方案只用 `CreateProcess` 的返回值判成败。
- **`lpApplicationName` 必须显式传 exe 全路径**，不能传 `$null`：PowerShell 会把 `$null` 转成空字符串，
  而 Win32 要求是 NULL —— 实测传空串会得到 `ERROR_PATH_NOT_FOUND (3)`。
- **`$si.cb` 必须用 `Marshal::SizeOf([type][LmsDetachedLaunch+STARTUPINFO])`**（传类型而非实例）。
- **`Get-Process -Id … -ErrorAction SilentlyContinue`**：`$ErrorActionPreference='Stop'` 下进程不存在时
  必须显式 SilentlyContinue，否则会抛。
- **`lpCommandLine` 里的引号只是保险**（`lpApplicationName` 已独立指定）。保留它无害，去掉也能工作。
- ps1 源文件编码与行尾必须保持现状：**UTF-8 with BOM + LF**（当前实测 `CRLF=0, bareLF=107`）。
  仓库无 `.gitattributes`、`core.autocrlf=false`，行尾原样入库；BOM 丢失会让 PS 5.1 按 ANSI 解码中文。
  改完先 `git diff --stat` 确认只有预期行数变化。

- [ ] **步骤 3：语法自检**

运行：

```powershell
powershell -NoProfile -Command "$errs=$null; [System.Management.Automation.Language.Parser]::ParseFile('D:\AI\Workspace\lms_launcher\scripts\lms-launcher-update.ps1',[ref]$null,[ref]$errs) | Out-Null; if($errs){$errs|ForEach-Object{Write-Output $_.Message}; exit 1}else{Write-Output 'PS_PARSE_OK'}"
```

预期：`PS_PARSE_OK`，无错误行。

- [ ] **步骤 4：P/Invoke 形态自检（可选但推荐）**

把新第 6 步的 P/Invoke 段单独跑一次，用一个无害目标（如 `C:\Windows\System32\notepad.exe` 或
`cmd.exe /c ping -n 5 127.0.0.1`）验证 `CreateProcess` 返回 true 且进程存活，然后杀掉。
参考已验通的 `.temp/grill/console-attach4.ps1`。

- [ ] **步骤 5：Commit**

```bash
git add scripts/lms-launcher-update.ps1
git commit -m "fix: 更新脚本改用 CreateProcess+DETACHED_PROCESS 启动新版——Start-Process 的子进程继承任务控制台导致窗口残留且关窗连带杀应用，DETACHED 让新进程不与控制台关联（实测附着增量 0），且 lpApplicationName 独立传参使含空格路径天然可用"
```

---

### 任务 2：`process.ts` / `main.ts` 显式指定 llama-server 的工作目录

**背景：** 新版应用改由 `CreateProcess` 启动后，若不给 `lpCurrentDirectory`，Windows 默认给
`C:\Windows\System32`，而 `llama-server` 通过 `spawn` 继承该 cwd —— 相对路径参数（模板里的
`-m` / `--mmproj` / `--chat-template-file` 等）会解析到错误位置。任务 1 已在 ps1 侧固定安装目录，
本任务在应用侧再补一道显式契约。

**文件：**
- 修改：`src-main/process.ts:22-27`（`launch` 签名 + `spawn` 选项）
- 修改：`src-main/main.ts:262`（调用点）
- 修改：`src-main/process.test.ts`（新增用例）

- [ ] **步骤 1：`process.ts` 新增可选 `cwd` 参数**

将现有：

```typescript
  // 启动子进程（隐藏窗口、双管道）；非 ready → STATE 拒绝（防二次启动）
  async launch(exe: string, args: string[], configId: string | null): Promise<void> {
    if (this.state !== 'ready') throw new Error('STATE: 已有进程在运行');
    this.exitCode = null;
    this.exited = false;
    this.runningConfigId = configId;
    const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
```

替换为：

```typescript
  // 启动子进程（隐藏窗口、双管道、显式工作目录）；非 ready → STATE 拒绝（防二次启动）
  // cwd：调用方传 dataDir()（exe 所在目录）。必须显式——更新后应用由 ps1 的
  // CreateProcess(DETACHED_PROCESS) 启动，lpCurrentDirectory 若未指定则由 Windows 给
  // C:\Windows\System32，llama-server 会继承该 cwd，使模板中相对路径的文件参数解析错位。
  // 缺省（undefined）时保持 Node 默认：继承本进程工作目录。
  async launch(exe: string, args: string[], configId: string | null, cwd?: string): Promise<void> {
    if (this.state !== 'ready') throw new Error('STATE: 已有进程在运行');
    this.exitCode = null;
    this.exited = false;
    this.runningConfigId = configId;
    const child = spawn(exe, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...(cwd ? { cwd } : {}),
    });
```

- [ ] **步骤 2：`main.ts` 调用点传 `dataDir()`**

将现有（`src-main/main.ts:262`）：

```typescript
  await ps.launch(args[0], args.slice(1), configId);
```

替换为：

```typescript
  await ps.launch(args[0], args.slice(1), configId, dataDir());
```

- [ ] **步骤 3：`process.test.ts` 新增 cwd 用例**

在文件顶部补 import：

```typescript
import { join } from 'node:path';
```

在 `describe` 块内追加：

```typescript
  it('launch_applies_cwd_to_child', async () => {
    const ps = new ProcessState();
    const dir = join(process.cwd(), 'src-main');
    await ps.launch(PS, ['-Command', '[System.IO.Directory]::GetCurrentDirectory()'], 'c1', dir);
    const { stdout } = ps.takePipes();
    const chunks: string[] = [];
    stdout.on('data', (c: Buffer) => chunks.push(c.toString()));
    await new Promise((r) => setTimeout(r, 3000));
    expect(chunks.join('')).toContain('src-main');
    await ps.stopGraceful(3);
  });
```

- [ ] **步骤 4：全量回归**

运行：`npm test`
预期：全绿，且用例总数为改动前基线 **+1**（先跑一次记录基线；改动前为 494 例）。

- [ ] **步骤 5：构建验证**

运行：`npm run build`
预期：vite 前端与 tsc 主进程构建通过，无类型错误（`launch` 新增参数是可选参数，不破坏既有调用）。

- [ ] **步骤 6：目检构建产物中的 ps1**

运行：`type dist-release\win-unpacked\lms-launcher-update.ps1 | findstr /C:"DETACHED_PROCESS"`
预期：命中多行（常量 + CreateProcess 调用 + 注释），证明 build 流程会把改后的 ps1 带进产物。

- [ ] **步骤 7：Commit**

```bash
git add src-main/process.ts src-main/main.ts src-main/process.test.ts
git commit -m "fix: llama-server 启动显式指定工作目录为安装目录——更新后应用由 CreateProcess(DETACHED_PROCESS) 启动，未指定 lpCurrentDirectory 时 Windows 默认给 System32，会使模板中相对路径的文件参数解析错位（新增 1 例，全量 495/495 全绿，build 通过）"
```

---

### 任务 3：交接（用户自行验收）

**文件：** 无代码改动。

**发布流程约定（凡改动 ps1 的版本必须遵守）：** 执行更新的 ps1 取自**安装目录**
（`src-main/main.ts:533` 的 `join(installDir, 'lms-launcher-update.ps1')`），不是仓库源文件。
因此改动 `scripts/lms-launcher-update.ps1` 的版本，在创建 Release 之前先把新 ps1 覆盖到自己的
生产安装目录，否则那一版会退化成「旧 ps1 跑一次」，验收项 ① ② 必然失败：

```powershell
Copy-Item dist-release\win-unpacked\lms-launcher-update.ps1 'D:\AI\LMS-Launcher\' -Force
```

必须用文件复制而非编辑器另存 —— ps1 为 UTF-8 with BOM + LF，另存易丢 BOM，
PS 5.1 会按 ANSI 解码中文注释与日志（可用规格 §改动面 里的字节自检命令复核）。

- [ ] **步骤 1：交付说明**

告知用户验收步骤（用户已确认自行操作验收，评审会话不做生产 E2E）：

1. 构建 + 打包新版：`build.bat`（或 `npm run build && npx electron-builder --config electron-builder.yml --win portable`），
   发布 zip 用 `pwsh -File scripts\package-zip.ps1`；
2. 把 zip 放到生产安装目录（如 `D:\AI\LMS-Launcher\downloads\lms-launcher-update.zip`）并走完更新流程；
3. **ps1 覆盖检查（必做）**：确认本机安装目录的 `lms-launcher-update.ps1` 已是本次 build 的版本
   （`Copy-Item dist-release\win-unpacked\lms-launcher-update.ps1 <installDir>\ -Force`，
   见上方发布流程约定）；若仍是旧 ps1，这次更新跑的是旧逻辑，验收项 ① ② 必然失败；
4. 验收检查项：
   - ① 更新完成后**无 CMD 窗口残留**；
   - ② 更新完成后**关闭任何残留窗口不影响新版应用**（旧版行为是关窗即杀应用，这是本次的核心验证点）；
   - ③ 新版应用自动启动且窗口正常显示；
   - ④ 应用日志回显**无 `[ERROR]` 行**（启动失败会记 `[ERROR] CreateProcess 失败` 或
     `[ERROR] 新版启动后立即退出`）；
   - ⑤ 应用启动后点「启动」拉起 llama-server 正常，日志区「启动命令」行完整。

- [ ] **步骤 2：留存探针证据**

`.temp/probeA.ps1`、`.temp/probeB*.ps1`、`.temp/probeC.ps1`、`.temp/probeD*.ps1`、`.temp/cleanupD.ps1`
保留不删（规格 §根因 的证据链）。评审新增的 `.temp/grill/*.ps1`（`console-attach4.ps1` 为控制台附着证据、
`ps51-arg.ps1` 为引号否证证据）同样保留。

`lms_launcher_update.cmd` 引导器（node 侧 `run_update` 生成）不变 —— 它仍负责拉起更新脚本，
本次只改「启动新版」一环。`main.ts` 的 `LMSLauncherUpdate` 任务创建 / `cleanStaleUpdateTask` 逻辑也不变。

- [ ] **步骤 3（可选）：补一个可重复的回归脚本**

把 `.temp/grill/console-attach4.ps1` 的思路固化为 `scripts/verify-relaunch.ps1`：
更新完成后自动断言「无新增 conhost 占用」+「`lms_launcher.exe` 的父进程 PID 已不存在（说明它独立于脚本进程树存活）」。
一次性探针是一次性证据，回归脚本才是资产。
