# scripts/ps1-parse-check.ps1 —— 用【本机 Windows PowerShell 5.1 的解析器】检查一个 .ps1 能否解析。
# 供 src-main/ps1-encoding.test.ts 调用。本文件自身必须是 UTF-8 BOM + 纯 ASCII 代码：
# PS 5.1 读无 BOM 的脚本时按系统 ANSI 代码页解码，中文注释会破坏解析（见规格 F18）。
param([string]$Path = '')
if ($Path -eq '') { Write-Output 'errors=-1 no path'; exit 1 }
$errs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$errs)
Write-Output ('errors=' + $errs.Count)
foreach ($e in $errs) { Write-Output ($e.Extent.StartLineNumber + ": " + $e.Message) }
