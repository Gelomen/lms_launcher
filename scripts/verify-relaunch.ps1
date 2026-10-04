# verify-relaunch.ps1 —— 更新后一键回归断言脚本（2026-09-21 DETACHED_PROCESS 启动修复的验收配套）。
# 用法：
#   更新前留基线：powershell -NoProfile -ExecutionPolicy Bypass -File verify-relaunch.ps1 -Snapshot [-InstallDir <dir>]
#   更新后验证：  powershell -NoProfile -ExecutionPolicy Bypass -File verify-relaunch.ps1 [-InstallDir D:\AI\LMS-Launcher]
# 5 项检查（只读诊断：不创建/删除任何计划任务，不启动/杀掉任何进程）：
#   C1 新版存活     安装目录内的 lms_launcher.exe 进程存在（按路径过滤，多实例下不会拿错）
#   C2 独立存活     其父进程（更新脚本的 powershell）已退出——不再挂在脚本进程树上
#                  （Win32_Process.ParentProcessId 记录创建者 PID，DETACHED 形态下创建者随即退出）
#   C3 conhost 无新增 当前 conhost 集合 ⊆ 快照集合（需先跑 -Snapshot）
#                  只断言「无新增」，不要求「快照里的全退了」——常驻终端的 conhost 更新后仍存活，
#                  基线快照含用户自己的终端 conhost，要求「全退」在这类机器上必误报
#   C4 任务不残留   计划任务 LMSLauncherUpdate 不存在（更新脚本启动即自删）
#   C5 日志无 ERROR  lms_launcher_update.log 最后一段（自最后一个 `=== update run ===` 标记行起）无 [ERROR] 行
# 退出码：全部 PASS exit 0；任一 FAIL exit 1；[INFO] 跳过不算失败。
# 编码：UTF-8 with BOM + LF（与仓库其他 ps1 一致，PS 5.1 兼容）。
param(
  [string]$InstallDir = 'D:\AI\LMS-Launcher',
  [switch]$Snapshot
)

function Get-ConhostIds {
  $con = Get-Process -Name 'conhost' -ErrorAction SilentlyContinue
  if ($null -eq $con) { return @() }
  return @($con | ForEach-Object { $_.Id })
}

$SnapPath = Join-Path $InstallDir 'conhost-snapshot.txt'

# ---------- -Snapshot 模式：更新前留 conhost 基线（每次覆盖） ----------
if ($Snapshot) {
  if (-not (Test-Path $InstallDir)) {
    Write-Host ('[FAIL] Install directory not found: ' + $InstallDir)
    exit 1
  }
  $con = Get-Process -Name 'conhost' -ErrorAction SilentlyContinue
  $lines = @()
  if ($con) {
    $lines = @($con | ForEach-Object { ('{0} {1}' -f $_.Id, $(if ($null -eq $_.ParentProcessId) { 0 } else { $_.ParentProcessId })) })
  }
  Set-Content -LiteralPath $SnapPath -Value $lines -Encoding UTF8
  Write-Host ('[OK] conhost snapshot saved: ' + $SnapPath + ' (' + $lines.Count + ' lines)')
  exit 0
}

# ---------- 默认模式：5 项检查 ----------
$pass = 0; $fail = 0; $skip = 0

# C1 新版存活（只认安装目录内的实例：机器上可能同时存在其他路径的同名实例，按名取第一个会拿错）
$targetExe = Join-Path ([System.IO.Path]::GetFullPath($InstallDir)) 'lms_launcher.exe'
$main = $null
# 同目录内主进程与 GPU/renderer 子进程的可执行路径完全相同，故按 Id 升序取第一个：
# 主进程先创建、PID 通常最小，避免拿到子进程导致 C2 误判「父进程仍存活」
foreach ($proc in @(Get-Process -Name 'lms_launcher' -ErrorAction SilentlyContinue | Sort-Object Id)) {
  $procPath = $null
  try { $procPath = $proc.Path } catch { $procPath = $null }
  if ($null -ne $procPath -and $procPath -ieq $targetExe) { $main = $proc; break }
}
if ($null -eq $main) {
  Write-Host ('[FAIL] C1 new version alive: no lms_launcher.exe process found in the install directory (' + $targetExe + ')')
  $fail++
} else {
  Write-Host ('[PASS] C1 new version alive: lms_launcher.exe is running (PID ' + $main.Id + ')')
  $pass++
}

# C2 独立存活：父进程（更新脚本 powershell 创建者）已退出
if ($null -eq $main) {
  Write-Host '[INFO] C2 independent: lms_launcher is not running; cannot check the parent process, skipping (not a failure)'
  $skip++
} else {
  $proc = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $main.Id) -ErrorAction SilentlyContinue
  if ($null -eq $proc) {
    Write-Host '[INFO] C2 independent: no Win32_Process record (did the process just exit?); skipping (not a failure)'
    $skip++
  } else {
    $ppid = [int]$proc.ParentProcessId
    $parent = Get-Process -Id $ppid -ErrorAction SilentlyContinue
    if ($null -eq $parent) {
      Write-Host ('[PASS] C2 independent: parent PID ' + $ppid + ' no longer exists; not attached to the update script\'s process tree')
      $pass++
    } else {
      Write-Host ('[FAIL] C2 independent: parent PID ' + $ppid + ' (' + $parent.ProcessName + ') still exists; in the DETACHED form the update script\'s powershell should have exited')
      $fail++
    }
  }
}

# C3 conhost 无新增：当前 conhost Id 集合 ⊆ 快照 Id 集合。
# 只断言「无新增」，不要求「快照里的 conhost 全部已退出」——常驻终端/控制台的 conhost
# 在更新前后都存活，而基线快照包含用户自己终端的 conhost，若要求「全退」在这类机器上必然误报，
# 与计划步骤 3 的「无新增 conhost 占用」语义不符。
if (-not (Test-Path $SnapPath)) {
  Write-Host ('[INFO] C3 no new conhost: no baseline snapshot (' + $SnapPath + '); run -Snapshot before the update, skipping (not a failure)')
  $skip++
} else {
  $snapLines = @(Get-Content -LiteralPath $SnapPath -Encoding UTF8 | Where-Object { $_ -match '^\s*\d+\s+\d+\s*$' })
  $snapIds = @($snapLines | ForEach-Object { [int]($_ -split '\s+')[0] })
  $current = @(Get-ConhostIds)
  $newOnes = @($current | Where-Object { $snapIds -notcontains $_ })
  if ($newOnes.Count -eq 0) {
    Write-Host ('[PASS] C3 no new conhost: all ' + $current.Count + ' current conhost processes are in the baseline snapshot (' + $snapIds.Count + ' in baseline); none outside it')
    $pass++
  } else {
    $detail = @($newOnes | ForEach-Object {
      $pname = 'unknown'
      $p = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $_) -ErrorAction SilentlyContinue
      if ($null -ne $p -and $null -ne $p.ParentProcessId -and $p.ParentProcessId -gt 0) {
        $pp = Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue
        if ($null -ne $pp) { $pname = $pp.ProcessName }
      }
      ('PID ' + $_ + ' (parent: ' + $pname + ')')
    })
    Write-Host ('[FAIL] C3 no new conhost: ' + $newOnes.Count + ' conhost processes outside the baseline snapshot: ' + ($detail -join ', '))
    $fail++
  }
}

# C4 任务不残留：LMSLauncherUpdate 不存在（更新脚本启动即自删）
try {
  $null = & schtasks.exe /Query /TN 'LMSLauncherUpdate' 2>&1 | Out-Null
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Host ('[PASS] C4 no stale task: scheduled task LMSLauncherUpdate does not exist (schtasks exit code ' + $code + ')')
    $pass++
  } else {
    Write-Host '[FAIL] C4 no stale task: scheduled task LMSLauncherUpdate still exists (the update script should have deleted it)'
    $fail++
  }
} catch {
  Write-Host ('[INFO] C4 no stale task: schtasks is unavailable (' + $_.Exception.Message + '); skipping (not a failure)')
  $skip++
}

# C5 日志无 ERROR：最后一段（自最后一个 `=== update run ===` 标记行起）
# 注：锚点为结构化标记，与输出文案解耦；无标记时回落到全文件（现状行为）。
$logPath = Join-Path $InstallDir 'lms_launcher_update.log'
if (-not (Test-Path $logPath)) {
  Write-Host '[INFO] C5 no ERROR in log: lms_launcher_update.log does not exist; skipping (not a failure)'
  $skip++
} else {
  $lines = @(Get-Content -LiteralPath $logPath -Encoding UTF8)
  $startIdx = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i].Contains('=== update run ===')) { $startIdx = $i; break }
  }
  if ($startIdx -ge 0) { $segment = $lines[$startIdx..($lines.Count - 1)] } else { $segment = $lines }
  $errs = @($segment | Where-Object { $_ -match '\[ERROR\]' })
  if ($errs.Count -eq 0) {
    Write-Host ('[PASS] C5 no ERROR in log: the last segment (' + $segment.Count + ' lines since the run marker) has no [ERROR] lines')
    $pass++
  } else {
    Write-Host ('[FAIL] C5 no ERROR in log: the last segment has ' + $errs.Count + ' [ERROR] lines:')
    foreach ($e in $errs) { Write-Host ('    ' + $e.Trim()) }
    $fail++
  }
}

# ---------- SUMMARY ----------
Write-Host ''
Write-Host ('SUMMARY: passed ' + $pass + '/5 (FAIL ' + $fail + ', skipped ' + $skip + ')')
if ($fail -gt 0) { exit 1 } else { exit 0 }