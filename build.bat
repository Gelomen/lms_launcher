@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo [build] Cleaning up stale lms_launcher.exe (the tray icon keeps it alive; window X only hides it)...
rem llama-server.exe is NOT force-killed by name: it also backs the local LLM and
rem may run independently of the launcher. Only a lms_launcher.exe that is still
rem running is terminated, together with its OWN child tree (taskkill /T), so a
rem standalone llama-server is left untouched.
rem Loop until lms_launcher.exe is gone, or give up after kill_max attempts.
rem Uses PowerShell for reliable process detection and kill.
set "kill_wait=0"
set "kill_max=30"
:kill_loop
powershell -NoProfile -Command "Get-Process -Name lms_launcher -ErrorAction SilentlyContinue" >NUL 2>&1
if errorlevel 1 goto kill_done
set /a kill_wait+=1
if %kill_wait% gtr %kill_max% goto kill_timeout
if %kill_wait% equ 1 (
  echo [build]   lms_launcher.exe found - terminating it and its child tree...
  powershell -NoProfile -Command "Get-Process -Name lms_launcher -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }"
) else (
  echo [build]   still running, retrying...
)
timeout /t 1 /nobreak >NUL
goto kill_loop
:kill_done
goto kill_after
:kill_timeout
echo [build]   WARNING: lms_launcher.exe could not be killed after %kill_max% attempts.
echo [build]   Please close it manually and re-run this script.
exit /b 1
:kill_after
echo.

echo [build] Installing dependencies...
call npm install
if errorlevel 1 (
  echo [build] FAILED: npm install exited with an error.
  exit /b 1
)

echo [build] Building renderer + main process...
call npm run build
if errorlevel 1 (
  echo [build] FAILED: npm run build exited with an error.
  exit /b 1
)

echo [build] Building win-unpacked only (no portable archive)...
rem Note: npm/npx are .cmd files, so they MUST be prefixed with call here, or control
rem would not return to this script after the build.
rem "--win dir" overrides win.target in electron-builder.yml: electron-builder stops
rem after the unpacked stage and writes only dist-release\win-unpacked\ (app asar +
rem extraFiles/extraResources + the icon/version-patched lms_launcher.exe). The 7za
rem archiving step that produced lms-launcher-<version>-portable.exe is skipped, so
rem packaging is faster and no self-extracting exe is written.
rem To go back to a single-file exe, change "dir" to "portable" in the two calls below.
rem "Fatal error: Unable to commit changes" (rcedit): a transient file lock, usually
rem Windows Defender scanning right after the 177 MB exe is copied into win-unpacked,
rem or a lms_launcher.exe that just quit from that folder. The auto-retry covers it;
rem add the workspace to Defender exclusions (admin) to eliminate it.
call npx electron-builder --config electron-builder.yml --win dir
if errorlevel 1 goto pack_retry
goto pack_done

:pack_retry
echo.
echo [build] Packaging failed. Retrying once (a transient file lock is the common cause)...
call npx electron-builder --config electron-builder.yml --win dir
if errorlevel 1 (
  echo.
  echo [build] FAILED: electron-builder packaging failed twice.
  echo         "Fatal error: Unable to commit changes" (rcedit): a transient file lock
  echo         (usually Defender scanning). Wait a few seconds and re-run .\build.bat;
  echo         to eliminate it, from an admin PowerShell: Add-MpPreference -ExclusionPath "%~dp0"
  exit /b 1
)

:pack_done
rem Drop leftovers from older portable runs so dist-release holds only the unpacked build.
if exist "dist-release\lms-launcher-*-portable.exe" (
  echo [build] Removing leftover portable exe from an earlier run...
  del /q "dist-release\lms-launcher-*-portable.exe"
)
echo.
echo [build] Done. Output folder: dist-release\win-unpacked\
echo [build] Start it with: dist-release\win-unpacked\lms_launcher.exe
exit /b 0
