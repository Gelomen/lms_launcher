# lms-launcher-update.ps1 —— LMS 启动器更新脚本（2026-09-05 起取代 Electron update.exe）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File lms-launcher-update.ps1 <zipPath> <installDir>
# 流程：等待安装目录内的 lms_launcher.exe 退出（最多 60s）→ .NET 解压整包到 __update_tmp →
#       校验关键条目 → 全量覆盖 installDir（2026-10-06 起 zip 内含 configs/llama_params.yaml，
#       解压即完成参数表升级；configs/ 下另两份 yaml 与 downloads 不进 zip，用户数据不受影响）→
#       清理（含旧版 update.exe 残留）→ 启动新版。
# 日志：追加写 <installDir>\lms_launcher_update.log，主应用下次启动时回显并删除。
# 启动新版（2026-09-21 评审修订）：不再 Start-Process —— 它的子进程会继承本脚本的控制台，
# 导致更新完成后 CMD 窗口残留、关窗连带杀应用（.temp/probeB3/B4 + .temp/grill/console-attach4
# 实测附着增量 +2）。改为 P/Invoke CreateProcessW + DETACHED_PROCESS(0x8)：新进程不与任何控制台
# 关联（实测增量 0），等价于用户双击启动（explorer 同样无控制台）。lpApplicationName 独立传参，
# 安装路径含空格也无需引号转义；lpCurrentDirectory 固定安装目录，与旧 -WorkingDirectory 语义一致。
# 失败语义：CreateProcess 失败、或进程 3 秒内退出 → 记 [ERROR]，更新仍算成功（exit 0，不回退
# Start-Process，避免在罕见路径复现窗口 bug）。
param(
  [string]$ZipPath = '',
  [string]$InstallDir = ''
)

$ErrorActionPreference = 'Stop'
$LogPath = ''

function Write-Log([string]$Msg) {
  $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $Msg
  try {
    if ($LogPath -ne '') { Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 }
    Write-Host $Msg
  } catch { }
}

if ($ZipPath -eq '' -or $InstallDir -eq '') {
  [Console]::Error.WriteLine('Missing arguments (usage: lms-launcher-update.ps1 <zipPath> <installDir>)')
  exit 1
}
$LogPath = Join-Path $InstallDir 'lms_launcher_update.log'
Write-Log '[INFO] === update run ==='
Write-Log ('[INFO] Update script started | zip=' + $ZipPath + ' | dir=' + $InstallDir)

# 自清理调度任务（2026-09-05）：本脚本由任务计划程序 LMSLauncherUpdate 拉起。启动即自删
# —— /Delete /F 对运行中的一次性任务安全（探针验证：任务库即时移除，脚本进程不受影响），
# 失败路径（提前 exit）同样兜底一次，避免 ONCE 任务残留到下次启动误触发；
# 应用启动时另有 cleanStaleUpdateTask 兜底。
function Remove-UpdateTask() {
  try { & schtasks.exe /Delete /F /TN 'LMSLauncherUpdate' 2>&1 | Out-Null } catch { }
}
Remove-UpdateTask
if (-not (Test-Path $InstallDir)) {
  Write-Log ('[ERROR] Install directory not found: ' + $InstallDir)
  exit 1
}
if (-not (Test-Path $ZipPath)) {
  Write-Log ('[ERROR] Update package not found: ' + $ZipPath)
  exit 1
}

$tmp = ''
try {
  # 1) 等待【本安装目录内】的主程序退出（运行中的 exe 无法被覆盖；60 秒超时，与旧 update.exe 一致）
  #    2026-09-21 真机验收修订：原实现 Get-Process -Name 是全机器按进程名匹配，任何其他位置的同名实例
  #    （开发构建产物 / 另一份解压副本 / 托盘里没退出的旧实例）都会让等待永远无法满足 → 60s 后误判
  #    超时、中止更新。实测现场：安装目录内实例早已退出（路径过滤 = 0），机器上仍有 3 个同名的
  #    dist-release 实例。只有本安装目录内的 lms_launcher.exe 锁着待覆盖的文件，因此只等它；
  #    其他位置的实例仅首次记一条 INFO（明示不影响本次更新），不再参与等待判定。
  $targetExe = Join-Path ([System.IO.Path]::GetFullPath($InstallDir)) 'lms_launcher.exe'
  $deadline = (Get-Date).AddSeconds(60)
  $othersNoted = $false
  $unknownNoted = $false
  while ($true) {
    $mine = @()
    $others = @()
    $unknown = @()
    foreach ($proc in @(Get-Process -Name 'lms_launcher' -ErrorAction SilentlyContinue)) {
      $procPath = $null
      try { $procPath = $proc.Path } catch { $procPath = $null }
      if ($null -eq $procPath) {
        # 路径读不到（权限不足 / 枚举与退出之间的竞态）时按「可能属于本安装目录」保守处理：
        # 宁可多等 60s 后超时中止，也不能跳过等待去覆盖可能仍在运行的 exe —— 覆盖被占用的文件
        # 会抛异常，留下混版本的安装目录且不可回滚。方向必须是「宁可误等」，不能是「误跳过」。
        $mine += $proc
        $unknown += ('PID ' + $proc.Id)
      } elseif ($procPath -ieq $targetExe) {
        $mine += $proc
      } else {
        $others += ('PID ' + $proc.Id + ' @ ' + $procPath)
      }
    }
    if (-not $othersNoted -and $others.Count -gt 0) {
      Write-Log ('[INFO] Found lms_launcher.exe in other locations (not locking this install directory, does not affect this update): ' + ($others -join ', '))
      $othersNoted = $true
    }
    if (-not $unknownNoted -and $unknown.Count -gt 0) {
      Write-Log ('[INFO] Some lms_launcher.exe processes have an unreadable executable path (access denied or exiting); waiting conservatively as they may belong to this install directory: ' + ($unknown -join ', '))
      $unknownNoted = $true
    }
    if ($mine.Count -eq 0) { break }
    if ((Get-Date) -ge $deadline) {
      $stay = ($mine | ForEach-Object {
        $started = 'unknown'
        try { $started = $_.StartTime.ToString('HH:mm:ss') } catch { $started = 'unknown' }
        'PID ' + $_.Id + '@' + $started
      }) -join ', '
      Write-Log ('[ERROR] Timed out after 60s waiting for lms_launcher.exe in this install directory to exit; aborting update | still running: ' + $stay)
      exit 1
    }
    Start-Sleep -Seconds 1
  }

  # 2) .NET 解压整包到 __update_tmp（先清理上次失败残留）
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmp = Join-Path $InstallDir '__update_tmp'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Write-Log '[INFO] Extracting update package to temporary directory...'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $tmp)

  # 3) 校验关键条目（防空包/损坏包覆盖安装目录）
  $mainExe = Join-Path $tmp 'lms_launcher.exe'
  $asar = Join-Path (Join-Path $tmp 'resources') 'app.asar'
  if (-not (Test-Path $mainExe)) {
    Write-Log '[ERROR] Update package is missing lms_launcher.exe; aborting (no files were overwritten)'
    exit 1
  }
  if (-not (Test-Path $asar) -or (Get-Item $asar).Length -lt 1MB) {
    Write-Log '[ERROR] Update package is missing resources/app.asar (or the file is suspiciously small); aborting (no files were overwritten)'
    exit 1
  }
  Write-Log ('[INFO] Validation passed: lms_launcher.exe + resources/app.asar (' + (Get-Item $asar).Length + ' bytes)')

  # 4) 全量覆盖安装目录
  #    2026-09-21 真机验收修订 2（生产失败复盘）：**进程列表为空 ≠ 文件已可覆盖**。
  #    实测出现过「等待步骤已通过，但 Copy-Item 覆盖 lms_launcher.exe 报『正由另一进程使用』」
  #    —— 说明存在脚本看不到、却仍持有该文件句柄的占用者（正在退出的进程 / 杀毒实时扫描 /
  #    更新窗口内被手动拉起的实例）。所以覆盖前先对关键文件做「可独占写」预检：拿不到独占
  #    句柄就每 0.5s 重试，最多 60s；仍拿不到则中止 —— 此刻尚未覆盖任何文件，安装目录完好，
  #    不会像 Copy-Item 中途失败那样留下混版本目录。
  foreach ($rel in @('lms_launcher.exe', 'resources\app.asar')) {
    $target = Join-Path $InstallDir $rel
    if (-not (Test-Path $target)) { continue }
    $wdeadline = (Get-Date).AddSeconds(60)
    $blocked = $false
    while ($true) {
      try {
        $fs = [System.IO.File]::Open($target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $fs.Close()
        break
      } catch {
        if ((Get-Date) -ge $wdeadline) { $blocked = $true; break }
        Start-Sleep -Milliseconds 500
      }
    }
    if ($blocked) {
      $who = @(Get-Process -Name 'lms_launcher' -ErrorAction SilentlyContinue)
      $detail = ''
      if ($who.Count -gt 0) { $detail = ' | current lms_launcher processes: ' + (($who | ForEach-Object { 'PID ' + $_.Id }) -join ', ') }
      Write-Log ('[ERROR] Target file is locked; exclusive write access not obtained within 60s: ' + $target + $detail + ' ... aborting update (no files were overwritten)')
      try { if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force } } catch { }
      exit 1
    }
  }
  Write-Log '[INFO] Overwriting install directory...'
  Copy-Item -Path (Join-Path $tmp '*') -Destination $InstallDir -Recurse -Force

  # 5) 清理临时目录与旧版 Electron 更新器残留（update.exe 已被本脚本取代）
  Remove-Item $tmp -Recurse -Force
  $tmp = ''
  $oldUpdater = Join-Path $InstallDir 'update.exe'
  if (Test-Path $oldUpdater) { Remove-Item $oldUpdater -Force; Write-Log '[INFO] Removed legacy update.exe' }
  $oldStaged = Join-Path $InstallDir 'update.exe.new'
  if (Test-Path $oldStaged) { Remove-Item $oldStaged -Force }

  # 6) 启动新版（2026-09-21 二次修订：改用【独立一次性计划任务】，由 svchost 拉起）
  #    上一版用 CreateProcess + DETACHED_PROCESS：它确实让新进程不再继承控制台（实测新版 4 个
  #    进程全部"无控制台"），但【没有】让它脱离 Task Scheduler 为本次更新任务创建的 Job Object
  #    —— 实测本脚本自身 IsProcessInJob=True，DETACHED 启动的新版同样 =True，且
  #    CREATE_BREAKAWAY_FROM_JOB(0x01000000) 被该 Job 拒绝（CreateProcess 返回 err=5）。
  #    后果：新版应用的生命周期被绑在这次更新任务上 —— 任务因 Job 内仍有活进程而不算结束，
  #    终端窗口一直挂着不关；用户一关那个窗口，任务被终止 → Job 终止 → 新版应用被一起杀掉。
  #    改为：写一个独立 ONCE 任务（svchost 拉起，落在它自己的 Job 里），/Run 后【轮询确认进程
  #    真的出现】再收工 —— /Run 返回 0 只代表「已请求运行」，不用 sleep 猜启动成败。
  #    任务定义走 XML 导入：安装路径含空格也无需引号转义（PS 5.1 传引号给原生命令会被剥离）。
  #    刻意【不】在脚本里删这个任务：对正在运行的实例执行 /Delete 有连带终止它的风险；
  #    残留交给应用启动时的 cleanStaleUpdateTask 清理（它同时清 LMSLauncherUpdate）。
  #    DETACHED 路线保留为回退（任务创建失败，或 15s 内未见新版进程时使用）。
  $newExe = Join-Path $InstallDir 'lms_launcher.exe'
  if (-not (Test-Path $newExe)) {
    Write-Log ('[ERROR] New version not found at ' + $newExe + '; please check the install directory manually')
  } else {
    $launchOk = $false
    $startedPid = 0
    $startTaskName = 'LMSLauncherStart'
    try {
      $userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
      $xmlPath = Join-Path $env:TEMP ('lms-launcher-start-' + [System.Guid]::NewGuid().ToString('N') + '.xml')
      $taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>LMS Launcher: start the new version (one-shot; cleaned up by the app on startup)</Description>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <UserId>$userName</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$newExe</Command>
      <WorkingDirectory>$InstallDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
      [System.IO.File]::WriteAllText($xmlPath, $taskXml, (New-Object System.Text.UnicodeEncoding($false, $true)))
      & schtasks.exe /Create /F /XML $xmlPath /TN $startTaskName 2>&1 | Out-Null
      $createCode = $LASTEXITCODE
      Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue
      if ($createCode -eq 0) {
        Write-Log ('[INFO] Launching new version (standalone scheduled task ' + $startTaskName + ', started by svchost): ' + $newExe)
        & schtasks.exe /Run /TN $startTaskName 2>&1 | Out-Null
        $startDeadline = (Get-Date).AddSeconds(15)
        while ((Get-Date) -lt $startDeadline) {
          $found = @(Get-Process -Name 'lms_launcher' -ErrorAction SilentlyContinue | Where-Object {
            $pp = $null
            try { $pp = $_.Path } catch { $pp = $null }
            $null -ne $pp -and $pp -ieq $newExe
          })
          if ($found.Count -gt 0) { $startedPid = [int]$found[0].Id; break }
          Start-Sleep -Milliseconds 500
        }
        if ($startedPid -gt 0) {
          $launchOk = $true
          Write-Log ('[INFO] New version started (PID ' + $startedPid + ', standalone scheduled task; independent of this script''s task, console and job object)')
        } else {
          Write-Log '[ERROR] Start task was triggered but no new-version process appeared within 15s; falling back to DETACHED launch'
        }
      } else {
        Write-Log ('[ERROR] Failed to create the start task (schtasks exit code ' + $createCode + '); falling back to DETACHED launch')
      }
    } catch {
      Write-Log ('[ERROR] Scheduled-task launch route failed: ' + $_.Exception.Message + '; falling back to DETACHED launch')
    }
    # 6b) 回退：CreateProcess + DETACHED_PROCESS（实测无控制台；仅在任务路线失败时兜底）
    if (-not $launchOk) {
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
      Write-Log ('[INFO] Launching new version (DETACHED_PROCESS, decoupled from this script''s console): ' + $newExe)
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
          Write-Log ('[INFO] New version started (PID ' + $pi.dwProcessId + ', no console attached)')
        } else {
          Write-Log ('[ERROR] New version exited immediately after launch (PID ' + $pi.dwProcessId + '); please start lms_launcher.exe manually')
        }
      } else {
        $winErr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Log ('[ERROR] CreateProcess failed (Win32 error ' + $winErr + '); please start lms_launcher.exe manually')
      }
    } catch {
      Write-Log ('[ERROR] Failed to launch the new version (DETACHED fallback): ' + $_.Exception.Message + ' - please start lms_launcher.exe manually')
    }
    }
    if ($launchOk) { Write-Log '[INFO] Update completed' }
    else { Write-Log '[INFO] Update completed (the new version was not started automatically; please start it manually)' }
  }
  Remove-UpdateTask
  exit 0
}
catch {
  Write-Log ('[ERROR] Update failed: ' + $_.Exception.Message)
  try { if ($tmp -ne '' -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force } } catch { }
  Remove-UpdateTask
  exit 1
}
