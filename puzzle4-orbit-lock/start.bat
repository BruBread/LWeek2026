@echo off
rem NEXUS Puzzle 4 - serves game.html and opens it fullscreen on the laptop screen.
rem Needs the hub running on the GM laptop (hub\start.bat) for the unlock and the HUMAN result.
call "%~dp0..\booth.bat"
set URL=http://localhost:8003/game.html?net=%NET%
set FLAGS=--kiosk "%URL%" --window-position=0,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk-4" --autoplay-policy=no-user-gesture-required --no-first-run

cd /d "%~dp0"
start "nexus-server-4" /min python -m http.server 8003
timeout /t 1 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS%
) else (
  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen
)
