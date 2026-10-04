@echo off
rem NEXUS installer: run once on each booth laptop, from the flash drive, with internet. Click Yes when Windows asks.
rem Runs FreshStart.bat (next to this file: Git, Node.js, Python, packages, firewall) and downloads the game into
rem Downloads\LWeek2026.
rem Safe to run again: it skips what's already installed, then does what Update.bat does.
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" & exit /b)
set "DEST=%USERPROFILE%\Downloads\LWeek2026"

call "%~dp0FreshStart.bat" nopause || (echo FreshStart.bat failed or is missing: copy it next to Install.bat. & pause & exit /b 1)

if not exist "%DEST%\.git" git clone https://github.com/BruBread/LWeek2026.git "%DEST%" || (echo Could not download the game from GitHub. Check the internet and run this again. & pause & exit /b 1)

rem All in one block: if this file is the copy inside Downloads\LWeek2026, the update may replace it while it runs.
(
  call "%~dp0Update.bat" nopause || (echo Install did not finish. & pause & exit /b 1)
  rem Files made by this admin window can belong to "Administrators"; git then refuses the folder when Update.bat runs normally.
  icacls "%DEST%" /setowner "%USERNAME%" /T /C /Q >nul
  echo.
  echo All set. Run the start.bat for this laptop's job, inside %DEST%
  pause
  exit /b 0
)
