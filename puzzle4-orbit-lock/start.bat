@echo off
rem NEXUS Puzzle 4 - serves game.html and opens it fullscreen on the laptop screen.
rem Needs the hub running on the GM laptop (hub\start.bat) for the unlock and the HUMAN result.
rem Also starts the laser strip bridge (laser_bridge.py, Bluetooth). Needs once, with internet: python -m pip install bleak
call "%~dp0..\booth.bat"
cd /d "%~dp0"
if "%1"=="laser" goto laser
set URL=http://localhost:8003/game.html?net=%NET%
set FLAGS=--kiosk "%URL%" --window-position=0,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk-4" --autoplay-policy=no-user-gesture-required --no-first-run

start "nexus-server-4" /min python -m http.server 8003
start "nexus-laser" /min "%~f0" laser
timeout /t 1 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS%
) else (
  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen
)
exit /b

:laser
python laser_bridge.py
echo laser bridge stopped. Restarting in 2 s (close this window to stop it for good)
timeout /t 2 /nobreak >nul
goto laser
