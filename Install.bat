@echo off
rem NEXUS installer: run once on each booth laptop, from the flash drive, with internet. Click Yes when Windows asks.
rem Installs Git, Node.js and Python (+ the bulb bridge's packages), downloads the game into Downloads\LWeek2026,
rem copies the secrets from the LWeek2026 folder next to this file, and lets Node and Python through Windows Firewall.
rem Safe to run again: it skips what's already installed, then does what Update.bat does.
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" & exit /b)
set "DEST=%USERPROFILE%\Downloads\LWeek2026"

where winget >nul 2>&1 || (echo winget is missing: install "App Installer" from the Microsoft Store, then run this again. & pause & exit /b 1)
set "WG=winget install -e --silent --accept-package-agreements --accept-source-agreements --source winget --id"
where git >nul 2>&1 || %WG% Git.Git
where node >nul 2>&1 || %WG% OpenJS.NodeJS.LTS
python --version >nul 2>&1 || %WG% Python.Python.3.12 --override "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0"

rem This window still has the old PATH: reload it so the new programs are found.
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%p"
git --version && node --version && python --version || (echo Something above did not install. Run Install.bat again. & pause & exit /b 1)

python -m pip install --disable-pip-version-check tinytuya websocket-client

rem Other laptops must reach the hub (Node) on any network type. "Node.js JavaScript Runtime" is the rule Windows makes
rem when someone clicks the firewall pop-up; if they clicked Cancel it blocks Node, so it goes.
for %%r in ("NEXUS node" "NEXUS python" "Node.js JavaScript Runtime") do netsh advfirewall firewall delete rule name=%%r >nul 2>&1
for /f "delims=" %%e in ('node -p process.execPath') do netsh advfirewall firewall add rule name="NEXUS node" dir=in action=allow program="%%e" >nul
for /f "delims=" %%e in ('python -c "import sys; print(sys.executable)"') do netsh advfirewall firewall add rule name="NEXUS python" dir=in action=allow program="%%e" >nul

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
