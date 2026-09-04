# lms-launcher-update.ps1 —— LMS 启动器更新脚本（2026-09-05 起取代 Electron update.exe）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File lms-launcher-update.ps1 <zipPath> <installDir>
# 流程：等待 lms_launcher.exe 退出（最多 60s）→ .NET 解压整包到 __update_tmp →
#       校验关键条目 → 全量覆盖 installDir（zip 不含 yaml/downloads，用户数据不受影响）→
#       清理（含旧版 update.exe 残留）→ 启动新版。
# 日志：追加写 <installDir>\lms_launcher_update.log，主应用下次启动时回显并删除。
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
Write-Log '[INFO] 更新脚本启动 · zip=' + $ZipPath + ' · dir=' + $InstallDir
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

  # 6) 启动新版
  $newExe = Join-Path $InstallDir 'lms_launcher.exe'
  Write-Log '[INFO] 启动新版 lms_launcher.exe'
  Start-Process -FilePath $newExe -WorkingDirectory $InstallDir
  Write-Log '[INFO] 更新完成'
  exit 0
}
catch {
  Write-Log ('[ERROR] 更新失败：' + $_.Exception.Message)
  try { if ($tmp -ne '' -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force } } catch { }
  exit 1
}
