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
  [Console]::Error.WriteLine('缺少参数（用法：lms-launcher-update.ps1 <zipPath> <installDir>）')
  exit 1
}
$LogPath = Join-Path $InstallDir 'lms_launcher_update.log'
Write-Log ('[INFO] 更新脚本启动 · zip=' + $ZipPath + ' · dir=' + $InstallDir)

# 自清理调度任务（2026-09-05）：本脚本由任务计划程序 LMSLauncherUpdate 拉起。启动即自删
# —— /Delete /F 对运行中的一次性任务安全（探针验证：任务库即时移除，脚本进程不受影响），
# 失败路径（提前 exit）同样兜底一次，避免 ONCE 任务残留到下次启动误触发；
# 应用启动时另有 cleanStaleUpdateTask 兜底。
function Remove-UpdateTask() {
  try { & schtasks.exe /Delete /F /TN 'LMSLauncherUpdate' 2>&1 | Out-Null } catch { }
}
Remove-UpdateTask
if (-not (Test-Path $InstallDir)) {
  Write-Log ('[ERROR] 安装目录不存在：' + $InstallDir)
  exit 1
}
if (-not (Test-Path $ZipPath)) {
  Write-Log ('[ERROR] 更新包不存在：' + $ZipPath)
  exit 1
}

$tmp = ''
try {
  # 1) 等待主程序退出（运行中的 exe 无法被覆盖；60 秒超时，与旧 update.exe 一致）
  $deadline = (Get-Date).AddSeconds(60)
  while ($true) {
    $p = Get-Process -Name 'lms_launcher' -ErrorAction SilentlyContinue
    if ($null -eq $p) { break }
    if ((Get-Date) -ge $deadline) {
      Write-Log '[ERROR] 等待 lms_launcher.exe 退出超时（60s），中止更新'
      exit 1
    }
    Start-Sleep -Seconds 1
  }

  # 2) .NET 解压整包到 __update_tmp（先清理上次失败残留）
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmp = Join-Path $InstallDir '__update_tmp'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Write-Log '[INFO] 解压更新包到临时目录…'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $tmp)

  # 3) 校验关键条目（防空包/损坏包覆盖安装目录）
  $mainExe = Join-Path $tmp 'lms_launcher.exe'
  $asar = Join-Path (Join-Path $tmp 'resources') 'app.asar'
  if (-not (Test-Path $mainExe)) {
    Write-Log '[ERROR] 更新包缺少 lms_launcher.exe，中止（未覆盖任何文件）'
    exit 1
  }
  if (-not (Test-Path $asar) -or (Get-Item $asar).Length -lt 1MB) {
    Write-Log '[ERROR] 更新包缺少 resources/app.asar（或文件异常小），中止（未覆盖任何文件）'
    exit 1
  }
  Write-Log ('[INFO] 校验通过：lms_launcher.exe + resources/app.asar（' + (Get-Item $asar).Length + ' 字节）')

  # 4) 全量覆盖安装目录
  Write-Log '[INFO] 覆盖安装目录…'
  Copy-Item -Path (Join-Path $tmp '*') -Destination $InstallDir -Recurse -Force

  # 5) 清理临时目录与旧版 Electron 更新器残留（update.exe 已被本脚本取代）
  Remove-Item $tmp -Recurse -Force
  $tmp = ''
  $oldUpdater = Join-Path $InstallDir 'update.exe'
  if (Test-Path $oldUpdater) { Remove-Item $oldUpdater -Force; Write-Log '[INFO] 已移除旧版 update.exe' }
  $oldStaged = Join-Path $InstallDir 'update.exe.new'
  if (Test-Path $oldStaged) { Remove-Item $oldStaged -Force }

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
}
catch {
  Write-Log ('[ERROR] 更新失败：' + $_.Exception.Message)
  try { if ($tmp -ne '' -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force } } catch { }
  Remove-UpdateTask
  exit 1
}
