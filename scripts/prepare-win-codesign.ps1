# prepare-win-codesign.ps1 —— 预置 electron-builder 的 winCodeSign 工具缓存（2026-10-10）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-win-codesign.ps1
#       build.bat 在打包前调用；已就绪时直接退出，不重复下载。
#
# 为什么需要这一步（本机 Windows 11 26300 实测，2026-10-10）：
#   1) app-builder.exe 与 7za.exe 都是未签名 exe。本机 Smart App Control 处于评估模式
#      （HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy 的 VerifiedAndReputablePolicyState=2），
#      未签名进程在 %LOCALAPPDATA% 下创建目录/文件被拒绝（Access is denied），而签名进程
#      （cmd / pwsh）在同一目录可以写，NTFS ACL 也正常 —— 所以不是权限位问题。
#      build.bat 已把 ELECTRON_BUILDER_CACHE 指到项目内 .cache\electron-builder，绕开用户目录。
#   2) winCodeSign-2.6.0.7z 内含两个 macOS 符号链接（darwin/10.12/lib/libcrypto.dylib、libssl.dylib）。
#      普通用户令牌没有 SeCreateSymbolicLinkPrivilege（未开「开发者模式」）时，app-builder 调用的
#      7za 解压会报「客户端没有所需的特权」而失败，electron-builder 重试 4 次、每次重新下载 5.6 MB。
#      这里自行解压并排除 darwin/（Windows 打包只用根目录的 rcedit-*.exe 与 windows-*/signtool.exe）。
#   3) 若将来 electron-builder 换用其它版本的 winCodeSign，本目录名不匹配 → 它会自行下载，
#      退回默认行为，不会因本脚本而失败。
param(
  [string]$CacheDir = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($CacheDir)) {
  if ([string]::IsNullOrWhiteSpace($env:ELECTRON_BUILDER_CACHE)) {
    $CacheDir = Join-Path $Root '.cache\electron-builder'
  } else {
    $CacheDir = $env:ELECTRON_BUILDER_CACHE
  }
}

$Version = '2.6.0'
$ArchiveName = "winCodeSign-$Version.7z"
$Parent = Join-Path $CacheDir 'winCodeSign'
$Target = Join-Path $Parent "winCodeSign-$Version"
$RcEdit = Join-Path $Target 'rcedit-x64.exe'

if (Test-Path $RcEdit) {
  Write-Output "[cache] winCodeSign $Version 已就绪，跳过准备：$Target"
  exit 0
}

$SevenZip = Join-Path $Root 'node_modules\7zip-bin\win\x64\7za.exe'
if (-not (Test-Path $SevenZip)) {
  Write-Output '[cache] [ERROR] 找不到 node_modules\7zip-bin\win\x64\7za.exe —— 请先执行 npm install'
  exit 1
}

$Mirror = $env:ELECTRON_BUILDER_BINARIES_MIRROR
if ([string]::IsNullOrWhiteSpace($Mirror)) {
  $Url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-$Version/$ArchiveName"
} else {
  $Url = ($Mirror.TrimEnd('/') + "/winCodeSign-$Version/$ArchiveName")
}

New-Item -ItemType Directory -Force -Path $Parent | Out-Null
$Tmp = Join-Path $Parent "$ArchiveName.prepare"
Write-Output "[cache] 下载 $Url"
try {
  Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing
} catch {
  Write-Output "[cache] [ERROR] 下载失败：$($_.Exception.Message)"
  Write-Output '[cache] 可设置 ELECTRON_BUILDER_BINARIES_MIRROR 指向镜像后重试'
  Remove-Item -Force $Tmp -ErrorAction SilentlyContinue
  exit 1
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null
& $SevenZip x -bd -y '-xr!darwin' $Tmp "-o$Target" | Out-Null
$UnpackExit = $LASTEXITCODE
Remove-Item -Force $Tmp -ErrorAction SilentlyContinue

if ($UnpackExit -ne 0 -or -not (Test-Path $RcEdit)) {
  Write-Output "[cache] [ERROR] 解压失败（7za exit=$UnpackExit），已清理半成品：$Target"
  Write-Output '[cache] 替代方案：开启「设置 → 系统 → 对于开发人员 → 使用适用于 Linux 的 Windows 子系统/开发人员模式」'
  Write-Output '[cache] 或以管理员身份运行 build.bat（管理员令牌可创建符号链接）'
  Remove-Item -Recurse -Force $Target -ErrorAction SilentlyContinue
  exit 1
}

Write-Output "[cache] winCodeSign $Version 就绪：$Target"
exit 0
