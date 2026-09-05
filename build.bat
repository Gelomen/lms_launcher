@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo [build] Cleaning up stale lms_launcher.exe (the tray icon keeps it alive; window X only hides it)...
rem llama-server.exe is NOT force-killed by name: it also backs the local LLM and
rem may run independently of the launcher. Only a lms_launcher.exe that is still
rem running is terminated, together with its OWN child tree (taskkill /T), so a
rem standalone llama-server is left untouched.
tasklist /FI "IMAGENAME eq lms_launcher.exe" 2>NUL ^| find /I "lms_launcher.exe" >NUL
if not errorlevel 1 (
  echo [build]   lms_launcher.exe is still running - terminating it and its child tree...
  for /f "tokens=2" %%L in ('tasklist /FI "IMAGENAME eq lms_launcher.exe" /FO CSV /NH') do (
    taskkill /F /T /PID %%L >NUL 2>&1
  )
)
echo.

echo [build] Building renderer + main process...
call npm run build
if errorlevel 1 (
  echo [build] FAILED: npm run build exited with an error.
  exit /b 1
)

echo [build] Packaging portable exe (this takes several minutes - do NOT touch this window)...
rem Note: npm/npx are .cmd files, so they MUST be prefixed with call here, or control
rem would not return to this script after the build.
rem "Break signaled" / exit code 255: 7za is a console program in THIS console group;
rem a second Ctrl+C or window close during archiving aborts it. Leave this window
rem open, do not press Ctrl+C during packaging. lms_launcher.exe (GUI, own session)
rem cannot cause it.
rem "Fatal error: Unable to commit changes" (rcedit): a transient file lock, usually
rem Windows Defender scanning right after the 177 MB exe is copied into win-unpacked,
rem or a lms_launcher.exe that just quit from that folder. The auto-retry covers it;
rem add the workspace to Defender exclusions (admin) to eliminate it.
call npx electron-builder --config electron-builder.yml --win portable
if errorlevel 1 goto pack_retry
goto pack_done

:pack_retry
echo.
echo [build] Packaging failed. Retrying once (transient lock / break event is the common cause)...
call npx electron-builder --config electron-builder.yml --win portable
if errorlevel 1 (
  echo.
  echo [build] FAILED: electron-builder packaging failed twice.
  echo         "Break signaled" / "Exit code: 255": a break event reached the build console
  echo         while 7za was archiving. Keep this window open, do not press Ctrl+C.
  echo         "Fatal error: Unable to commit changes" (rcedit): a transient file lock
  echo         (usually Defender scanning). Wait a few seconds and re-run .\build.bat;
  echo         to eliminate it, from an admin PowerShell: Add-MpPreference -ExclusionPath "%~dp0"
  exit /b 1
)

:pack_done
echo.
echo [build] Done. Artifact: dist-release\lms-launcher-*-portable.exe
exit /b 0
