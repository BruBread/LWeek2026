@echo off
rem NEXUS hub + GM panel - run this on whichever laptop is the GM laptop today (only one!). Needs Node.js and, once, "npm install" in this folder.
rem The hub restarts itself within a second if it ever crashes, and picks the current run back up from run.json.
rem It also starts the Puzzle 2 bulb bridge if puzzle2-system-power\devices.json is on this laptop (see that folder's SETUP.md).
call "%~dp0..\booth.bat"
cd /d "%~dp0"
if "%1"=="loop" goto loop
if "%1"=="bulb" goto bulb
if not exist node_modules call npm install
start "nexus-hub" /min "%~f0" loop
if exist "%~dp0..\puzzle2-system-power\devices.json" start "nexus-bulb" /min "%~f0" bulb
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000/"
exit /b

:loop
node server.js
echo hub stopped. Restarting in 1 s (close this window to stop it for good)
timeout /t 1 /nobreak >nul
goto loop

:bulb
python "%~dp0..\puzzle2-system-power\bulb_bridge.py"
echo bulb bridge stopped. Restarting in 2 s (close this window to stop it for good)
timeout /t 2 /nobreak >nul
goto bulb
