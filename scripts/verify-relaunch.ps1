# verify-relaunch.ps1 —— 更新后一键回归断言脚本（2026-09-21 DETACHED_PROCESS 启动修复的验收配套）。
# 用法：
#   更新前留基线：powershell -NoProfile -ExecutionPolicy Bypass -File verify-relaunch.ps1 -Snapshot [-InstallDir <dir>]
#   更新前采样窗口：powershell -NoProfile -ExecutionPolicy Bypass -File verify-relaunch.ps1 -Watch [-Seconds <n>] [-IntervalMs <n>] [-InstallDir <dir>]
#                  （-Watch 是纯采集器：除安装目录不存在或探针类型不可解析时 exit 1，其余无论命中多少都 exit 0，
#                  判定由更新后默认模式的 C3 读它的结果文件）
#   更新后验证：  powershell -NoProfile -ExecutionPolicy Bypass -File verify-relaunch.ps1 [-InstallDir D:\AI\LMS-Launcher]
# 5 项检查（只读诊断：不创建/删除任何计划任务，不启动/杀掉任何进程）：
#   C1 新版存活     安装目录内的 lms_launcher.exe 进程存在（按路径过滤，多实例下不会拿错）
#   C2 独立存活     其父进程（更新脚本的 powershell）已退出——不再挂在脚本进程树上
#                  （Win32_Process.ParentProcessId 记录创建者 PID，DETACHED 形态下创建者随即退出）
#   C3 无新增可见控制台窗口（需更新前跑 -Watch）：读 console-watch.txt，有 `watch start` 头且出现 HIT 行即 FAIL
#                  旧口径「无新增 conhost 进程」是错的：隐藏启动（wscript + sh.Run style 0）之后仍存在
#                  不可见的 conhost/cmd 进程，而用户要的是「看不到窗口」。conhost 进程差值已降为 C3b
#                  [INFO] 信息项，不计入 PASS/FAIL。
#                  陈旧性判定（锚点：安装目录内 lms_launcher.exe 的 LastWriteTime = 构建产物落地时间，
#                  不是本次更新完成时刻：Copy-Item 保留源文件的 LastWriteTime，打包链
#                  scripts/package-zip.ps1:19/:22（Copy-Item + Compress-Archive）→
#                  scripts/lms-launcher-update.ps1:116 的 ZipFile::ExtractToDirectory → :163 的 Copy-Item -Force
#                  把它原样带进安装目录（实测整链保留，zip 只有 2 秒粒度），所以它 ≤ 更新时刻、可能早任意久；
#                  现场证据：同目录里 lms_launcher.exe 22:03:06 与 lms-launcher-update.ps1 22:01:30 相差 96 秒——
#                  若 mtime 是复制时刻，同一次复制产出的文件应共享同一时刻，实测并非如此，故它不是复制时刻。不拿更新日志作锚点：更新成功后应用会在重启后读取并删除它
#                  （src-main/main.ts:669 的 unlinkSync，由 :1001 的 replayUpdateLog 调用），正常时序里不存在。
#                  所以这条判定是保守下界、不是精确时刻：采样文件的 LastWriteTime 早于该 exe 的 LastWriteTime
#                  → 这份采样必然在当次构建落地之前就结束了、没覆盖到本次更新 → [INFO] 并计入 skip，不打 PASS；
#                  「不早于」只说明没被这条下界排除，不等于采样真的覆盖了更新（见下面局限③）。
#                  exe 不存在时不做这条判定（没有「构建产物落地」的时间基准），退回按内容形态判定。
#                  缺这条判定就是假绿：-Watch 只在启动时覆盖该文件，更新脚本既不生成也不清理它，
#                  忘跑 -Watch 时会拿几天前的 hits=0 打 PASS。
#                  换用 exe 作锚点的四条局限：① 更新之后才补跑 -Watch 时采样文件比 exe 新，判不出来；
#                  ② 手动复制/还原 console-watch.txt 会把它的 mtime 刷新成「新」，同样使判定失效；
#                  ③ 安装的是比采样文件更早打包的构建时判定不触发（例：3 天前跑的采样 + 今天安装一个 7 天前
#                     打包的包 → 采样 mtime 晚于 exe mtime），此时仍可能假绿；
#                  ④ 更新中止（校验失败、目标文件被占用等）时 exe 未被覆盖，锚点还是上一轮那次的构建时间，
#                     判定失效；⑤ 不经更新脚本而手动复制/还原 lms_launcher.exe 会把 exe 的 mtime 刷成「现在」，
#                     于是任何更早的采样都被判陈旧（安全侧的假 skip）。
#                  -Watch 的已知局限：基线只排除采样器启动时已存在的窗口句柄，因此采样期间用户自己新开
#                  的终端窗口会被记为 HIT；HIT 行的 pid 是窗口属主（Windows Terminal）的 pid，
#                  不是被启动进程的 pid。
#   C4 任务不残留   计划任务 LMSLauncherUpdate 不存在（更新脚本启动即自删）
#   C5 日志无 ERROR  lms_launcher_update.log 最后一段（自最后一个 `=== update run ===` 标记行起）无 [ERROR] 行
# 退出码：全部 PASS exit 0；任一 FAIL exit 1；[INFO] 跳过不算失败。
# 编码：本文件自带 BOM（UTF-8 BOM + LF，PowerShell 5.1 按 ANSI 解码中文注释所需）；实测仓库 6 个被跟踪的
#       .ps1 中只有本文件带 BOM（其余如 scripts/lms-launcher-update.ps1、scripts/package-zip.ps1、src-main/gpu-counters.ps1 都没有）。
#       编辑工具可能吞掉 BOM，改完必须复核前 3 字节 = EF BB BF 且 CR 计数 = 0。
param(
  [string]$InstallDir = 'D:\AI\LMS-Launcher',
  [switch]$Snapshot,
  [switch]$Watch,
  [int]$Seconds = 240,
  [int]$IntervalMs = 150
)

function Get-ConhostIds {
  $con = Get-Process -Name 'conhost' -ErrorAction SilentlyContinue
  if ($null -eq $con) { return @() }
  return @($con | ForEach-Object { $_.Id })
}

# 可见控制台窗口检测（2026-10-08，C3 重定义的配套）。
# 本机默认控制台宿主是 Windows Terminal：窗口类名 CASCADIA_HOSTING_WINDOW_CLASS，不是
# ConsoleWindowClass；conhost 的 MainWindowHandle 恒为 0，不能当可见性信号。
# 判定 = EnumWindows + 类名白名单 + IsWindowVisible + 排除有属主的窗口（GetWindow GW_OWNER）。
$script:ProbeReady = $false
function Get-VisibleConsoleWindows {
  if (-not $script:ProbeReady) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class LmsConsoleWindowProbe {
  public class WinInfo { public long Hwnd; public string Class; public string Title; public long Pid; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  public static List<WinInfo> VisibleWindows() {
    var outp = new List<WinInfo>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true; // GW_OWNER
      var sb = new StringBuilder(256);
      GetClassName(h, sb, 256);
      string cls = sb.ToString();
      if (cls != "ConsoleWindowClass" && cls != "CASCADIA_HOSTING_WINDOW_CLASS") return true;
      int len = GetWindowTextLength(h);
      string title = "";
      if (len > 0) { var tb = new StringBuilder(len + 2); GetWindowText(h, tb, tb.Capacity); title = tb.ToString(); }
      uint pid; GetWindowThreadProcessId(h, out pid);
      WinInfo w = new WinInfo();
      w.Hwnd = h.ToInt64(); w.Class = cls; w.Pid = pid;
      w.Title = title.Replace('\r', ' ').Replace('\n', ' ');
      outp.Add(w);
      return true;
    }, IntPtr.Zero);
    return outp;
  }
}
'@
    # Add-Type 失败在默认 $ErrorActionPreference=Continue 下只是语句级错误：循环照常跑完并打 hits 0，
    # 「探针根本没工作」与「更新期间没有新窗口」输出完全一样（假绿），所以这里显式断言类型可解析。
    if ($null -eq ('LmsConsoleWindowProbe' -as [type])) {
      Write-Host '[FAIL] window probe type unavailable (Add-Type failed; ConstrainedLanguage?)'
      exit 1
    }
    $script:ProbeReady = $true
  }
  return [LmsConsoleWindowProbe]::VisibleWindows()
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

$WatchPath = Join-Path $InstallDir 'console-watch.txt'

# ---------- -Watch 模式：更新前启动，记录更新期间新增的可见控制台窗口 ----------
# 窗口是瞬态的（cmd 启动→退出只有几秒），更新结束后再枚举必然抓不到，所以必须在更新前开始采样。
# 基线 = 采样器启动时已存在的窗口句柄：用户自己的终端窗口因此不会被记为命中（只对启动时已存在的窗口成立；
# 采样期间用户自己新开的终端同样会被记为 HIT，见头部 C3 的「已知局限」）。
# 已知局限：窗口销毁后句柄可能被复用；采样间隔内复用概率极低，视为可接受。
if ($Watch) {
  if (-not (Test-Path $InstallDir)) {
    Write-Host ('[FAIL] Install directory not found: ' + $InstallDir)
    exit 1
  }
  $seen = @{}
  foreach ($w in Get-VisibleConsoleWindows) { $seen[[int64]$w.Hwnd] = $true }
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Set-Content -LiteralPath $WatchPath -Value ('watch start ' + $ts + ' seconds=' + $Seconds + ' intervalMs=' + $IntervalMs + ' baseline=' + $seen.Count) -Encoding UTF8
  $end = (Get-Date).AddSeconds($Seconds)
  $samples = 0; $hits = 0
  while ((Get-Date) -lt $end) {
    $samples++
    foreach ($w in Get-VisibleConsoleWindows) {
      if (-not $seen.ContainsKey([int64]$w.Hwnd)) {
        $seen[[int64]$w.Hwnd] = $true
        $hits++
        Add-Content -LiteralPath $WatchPath -Value ('HIT ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' hwnd=' + $w.Hwnd + ' class=' + $w.Class + ' pid=' + $w.Pid + ' title=' + $w.Title) -Encoding UTF8
      }
    }
    Start-Sleep -Milliseconds $IntervalMs
  }
  Add-Content -LiteralPath $WatchPath -Value ('watch end ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' samples=' + $samples + ' hits=' + $hits) -Encoding UTF8
  Write-Host ('[OK] console window watch finished: ' + $WatchPath + ' (samples ' + $samples + ', hits ' + $hits + ')')
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
      Write-Host ('[PASS] C2 independent: parent PID ' + $ppid + ' no longer exists; not attached to the update script''s process tree')
      $pass++
    } else {
      Write-Host ('[FAIL] C2 independent: parent PID ' + $ppid + ' (' + $parent.ProcessName + ') still exists; in the DETACHED form the update script''s powershell should have exited')
      $fail++
    }
  }
}

# C3 更新期间无新增可见控制台窗口（2026-10-08 重定义）。
# 旧口径「无新增 conhost 进程」是错的：隐藏启动（wscript + sh.Run style 0）之后仍会存在不可见的
# cmd/conhost/OpenConsole 进程（.temp/hide-console/probe3.ps1 实测），而用户要的是「看不到窗口」。
# 窗口是瞬态的 → 由更新前启动的 -Watch 采样器记录，这里只读它的结果。
if (-not (Test-Path $WatchPath)) {
  Write-Host ('[INFO] C3 no visible console window: no watch log (' + $WatchPath + '); run -Watch before the update, skipping (not a failure)')
  $skip++
} else {
  $wl = @(Get-Content -LiteralPath $WatchPath -Encoding UTF8)
  $started = @($wl | Where-Object { $_ -match '^watch start ' }).Count -gt 0
  $ended = @($wl | Where-Object { $_ -match '^watch end ' }).Count -gt 0
  $hitLines = @($wl | Where-Object { $_ -match '^HIT ' })
  # 陈旧性判定（假绿防护）：-Watch 只在启动时覆盖结果文件，更新脚本既不生成也不清理它，因此上一轮遗留的
  # hits=0 文件会让「忘跑 -Watch」这一轮被当成「已验证且通过」。判定条件：安装目录内的 lms_launcher.exe
  # 存在，且采样文件比它更早 —— 即这份采样在当次构建落地之前就结束了，没有覆盖到更新。
  # 锚点是 exe（复用 C1 算好的 $targetExe）而不是更新日志：更新成功后应用会在启动时读取并删除
  # lms_launcher_update.log（src-main/main.ts:669 的 unlinkSync，由 :1001 的 replayUpdateLog 调用），
  # 「更新后跑本脚本」的正常时序里日志根本不存在，判定恒为假 → 假绿照旧。
  # exe 的 LastWriteTime 是【构建产物落地时间】，不是本次更新完成时刻：Copy-Item 保留源文件的 LastWriteTime，
  # 打包链 scripts/package-zip.ps1:19/:22 → ZipFile::ExtractToDirectory（scripts/lms-launcher-update.ps1:116）
  # → Copy-Item -Force（:163）把它原样带进安装目录，所以它 ≤ 更新时刻、可能比本次更新早任意久。
  # 因此这条判定是保守下界、不是精确时刻：早于它 → 必然没覆盖本次更新；不早于它 → 只是没被下界排除。
  # 前提：exe 不存在时不做这条判定（没有「构建产物落地」的时间基准），退回按内容形态判定。
  # 位置：放在 HIT 判定之后，不改变既有顺序（HIT 优先于「未跑完」），只把本来要打 PASS 的情况降级为 [INFO]。
  $stale = $false
  $watchStamp = ''
  $exeStamp = ''
  # 元数据访问防护（对齐 C1 取 $proc.Path 的 try/catch；与 C4 不同，这里的 catch 不输出提示也不计数，
  # 代价是运行时无法区分「判定被元数据异常跳过」与「判定为不陈旧」——两者在 SUMMARY 里都是同一个 PASS）：
  # Test-Path 与 Get-Item 之间存在竞态——采样文件此刻被清理，或 exe 正被更新覆盖，两个 Get-Item 都会抛错。
  # 整块（两个 Get-Item 与比较）进 try 并 -ErrorAction Stop，异常时保持 $stale = $false → 落到下面的 PASS
  # 分支（不安全侧）。加防护前「采样文件被清理」那一侧是 $null -lt <DateTime> = True → 判陈旧、以空时间戳
  # 打 [INFO]（安全侧但文案畸形）；加防护后这一侧也变成 PASS。
  try {
    if (Test-Path -LiteralPath $targetExe) {
      $watchItem = Get-Item -LiteralPath $WatchPath -ErrorAction Stop
      $exeItem = Get-Item -LiteralPath $targetExe -ErrorAction Stop
      $watchStamp = $watchItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
      $exeStamp = $exeItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
      if ($watchItem.LastWriteTime -lt $exeItem.LastWriteTime) { $stale = $true }
    }
  } catch { }
  if (-not $started) {
    Write-Host ('[INFO] C3 no visible console window: watch log has no "watch start" header (' + $WatchPath + '); skipping (not a failure)')
    $skip++
  } elseif ($hitLines.Count -gt 0) {
    Write-Host ('[FAIL] C3 no visible console window: the watch recorded ' + $hitLines.Count + ' newly visible console window(s) during the update:')
    foreach ($h in $hitLines) { Write-Host ('    ' + $h.Trim()) }
    # 可诊断性：HIT 优先于陈旧判定（判定与计数都不变），但这份文件比当前构建更早时要点明，
    # 否则读者会把上一轮遗留的 HIT 当成本轮更新的失败证据。
    if ($stale) {
      Write-Host ('    (note: this watch log predates the installed build: watch ' + $watchStamp + ' vs exe ' + $exeStamp + ')')
    }
    $fail++
  } elseif (-not $ended) {
    Write-Host ('[INFO] C3 no visible console window: watch did not reach its end marker (stopped early?); skipping (not a failure)')
    $skip++
  } elseif ($stale) {
    Write-Host ('[INFO] C3 no visible console window: the watch log predates the installed build (sampling ended before this build landed), treated as unverified (' + $WatchPath + ' written ' + $watchStamp + ' is earlier than ' + $targetExe + ' written ' + $exeStamp + '); run -Watch before the update, skipping (not a failure)')
    $skip++
  } else {
    Write-Host ('[PASS] C3 no visible console window: the watch log has no HIT lines (' + $wl.Count + ' lines, no newly visible console window)')
    $pass++
  }
}

# C3b（仅信息，不计入 PASS/FAIL）conhost 进程差值：保留旧实现作为诊断线索。
# 隐藏启动仍会创建不可见的 conhost/cmd，因此它只能说明「有没有多进程」，不能说明「有没有窗口」。
if (-not (Test-Path $SnapPath)) {
  Write-Host ('[INFO] C3b conhost process delta (informational): no baseline snapshot (' + $SnapPath + ')')
} else {
  $snapLines = @(Get-Content -LiteralPath $SnapPath -Encoding UTF8 | Where-Object { $_ -match '^\s*\d+\s+\d+\s*$' })
  $snapIds = @($snapLines | ForEach-Object { [int]($_ -split '\s+')[0] })
  $current = @(Get-ConhostIds)
  $newOnes = @($current | Where-Object { $snapIds -notcontains $_ })
  Write-Host ('[INFO] C3b conhost process delta (informational, not a failure): ' + $newOnes.Count + ' new conhost process(es) outside the baseline of ' + $snapIds.Count + '; hidden launch still creates invisible conhost/cmd')
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