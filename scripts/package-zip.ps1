# 发布打包：dist-release\win-unpacked → lms-launcher-v<version>-win64.zip
# 用法：pwsh -File scripts\package-zip.ps1 [-Version 0.2.0]（缺省读 package.json 的 version）
param([string]$Version = ((Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version))

$repo      = $env:PACKAGE_ZIP_ROOT | Where-Object { $_ } | Select-Object -First 1
if (-not $repo) { $repo = Split-Path -Parent $PSScriptRoot }
$mainDir   = Join-Path $repo 'dist-release\win-unpacked'
$stage     = Join-Path $repo ('.temp-build\release-v' + $Version)
$outZip    = Join-Path $repo ('lms-launcher-v' + $Version + '-win64.zip')

if (-not (Test-Path $mainDir)) { throw ('未找到 ' + $mainDir + '（先跑 build.bat）') }
if (-not (Test-Path (Join-Path $mainDir 'update.exe'))) {
  throw ('未在 ' + $mainDir + ' 找到 update.exe（先跑 build.bat 以生成 update.exe）')
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $mainDir '*') $stage -Recurse -Force

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip

Remove-Item $stage -Recurse -Force
Write-Host ('已生成: ' + $outZip)
