@echo off
rem NEXUS updater: gets the newest version from GitHub into Downloads\LWeek2026 and replaces every file that changed.
rem Files git ignores are kept (sales log, photos, run history). Edits made on this laptop to the game files are lost,
rem including a camera aim saved with hub\camerasetup.bat (it lives in signup\camera.json).
set "DEST=%USERPROFILE%\Downloads\LWeek2026"
if not exist "%DEST%\.git" (echo %DEST% is missing. Run Install.bat first. & pause & exit /b 1)

rem All in one block: git may replace this very file, and cmd reads a .bat line by line while it runs it.
(
  cd /d "%DEST%"
  git fetch origin || (echo Could not reach GitHub. Check the internet and run this again. & pause & exit /b 1)
  echo Changed since this laptop's last update:
  git --no-pager diff --stat HEAD origin/main
  git reset --hard origin/main
  pushd hub
  call npm install --no-audit --no-fund
  popd
  echo Updated: %DEST%
  if not "%~1"=="nopause" pause
  exit /b 0
)
