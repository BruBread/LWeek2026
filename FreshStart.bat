@echo off
rem NEXUS FreshStart: installs everything the game needs on a computer that has nothing. Run it once, with internet.
rem Click Yes when Windows asks. Safe to run again: it skips what's already installed.
rem Installs Git, Node.js, Python + the bridges' packages, lets Node and Python through Windows Firewall, and, when this
rem file sits in the game folder, the hub's packages. Install.bat calls it too.
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" & exit /b)

where winget >nul 2>&1 || (echo winget is missing: install "App Installer" from the Microsoft Store, then run this again. & goto fail)
set "WG=winget install -e --silent --accept-package-agreements --accept-source-agreements --source winget --id"
where git >nul 2>&1 || %WG% Git.Git
where node >nul 2>&1 || %WG% OpenJS.NodeJS.LTS
python --version >nul 2>&1 || %WG% Python.Python.3.12 --override "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0"

rem This window still has the old PATH: reload it so the new programs are found.
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%p"
git --version && node --version && python --version || (echo Something above did not install. Run FreshStart.bat again. & goto fail)

rem tinytuya + websocket-client: puzzle 2 bulb bridge. bleak: puzzle 4 laser strip bridge.
python -m pip install --disable-pip-version-check tinytuya websocket-client bleak || (echo pip could not install the Python packages. & goto fail)

rem Other laptops must reach the hub (Node) on any network type. "Node.js JavaScript Runtime" is the rule Windows makes
rem when someone clicks the firewall pop-up; if they clicked Cancel it blocks Node, so it goes.
for %%r in ("NEXUS node" "NEXUS python" "Node.js JavaScript Runtime") do netsh advfirewall firewall delete rule name=%%r >nul 2>&1
for /f "delims=" %%e in ('node -p process.execPath') do netsh advfirewall firewall add rule name="NEXUS node" dir=in action=allow program="%%e" >nul
for /f "delims=" %%e in ('python -c "import sys; print(sys.executable)"') do netsh advfirewall firewall add rule name="NEXUS python" dir=in action=allow program="%%e" >nul

rem The booth has no internet, so get them now.
if exist "%~dp0hub\package.json" (
  pushd "%~dp0hub"
  call npm install --no-audit --no-fund || (popd & echo npm could not install the hub's packages. & goto fail)
  popd
)

echo.
echo FreshStart done.
if not "%~1"=="nopause" pause
exit /b 0

:fail
if not "%~1"=="nopause" pause
exit /b 1
