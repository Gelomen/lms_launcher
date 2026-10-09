@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo [clean] About to clean: empty .superpowers\, .temp\ and docs\,
echo [clean] followed by "git add -A -- docs", "git commit" and "git push".
echo.
echo [clean] WARNING: .superpowers\ and .temp\ are gitignored, so deleting
echo [clean] them is NOT recoverable from git. docs\ is tracked and stays
echo [clean] in git history after the commit and push.
echo.
set "answer="
set /p answer="[clean] Proceed? [y/N]: "
if /i not "%answer%"=="y" (
  echo [clean] Cancelled - no changes were made.
  exit /b 0
)

echo.
echo [clean] Step 1: Emptying .superpowers\, .temp\ and docs\ ...
rem For each folder: delete everything inside (files + subfolders), then
rem recreate the folder itself so it still exists afterwards.
for %%D in (.superpowers .temp docs) do (
  if exist "%%D" (
    del /f /s /q "%%D\*" >NUL 2>&1
    rmdir /s /q "%%D" >NUL 2>&1
    echo [clean]   Emptied "%%D".
  ) else (
    echo [clean]   "%%D" does not exist - skipping.
  )
  mkdir "%%D" >NUL 2>&1
)

echo.
echo [clean] Step 2: git add -A -- docs ...
git add -A -- docs
if errorlevel 1 (
  echo [clean] FAILED: git add exited with an error.
  exit /b 1
)

echo [clean] Committing with message: chore - clean docs and temp working files
git commit -m "chore: clean docs and temp working files"
if errorlevel 1 (
  rem git commit exits non-zero when there is nothing to commit; treat that as
  rem a skip, not a failure, and still try to push pending local commits.
  echo [clean]   Nothing staged to commit ^(or commit failed^) - continuing to push.
)

echo.
echo [clean] Step 3: git push ...
git push
if errorlevel 1 (
  echo [clean] FAILED: git push exited with an error.
  exit /b 1
)

echo.
echo [clean] Done.
exit /b 0
