@echo off
rem NEXUS Puzzle 3 - serves game.html and opens it fullscreen on the laptop screen.
rem Needs the hub running on the GM laptop (hub\start.bat) for the unlock, the TRACE result and the phone beacon stand-in.
call "%~dp0..\booth.bat"
set URL=http://localhost:8002/game.html?net=%NET%
set FLAGS=--kiosk "%URL%" --window-position=0,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk-3" --autoplay-policy=no-user-gesture-required --no-first-run

cd /d "%~dp0"
start "nexus-server-3" /min python -m http.server 8002
timeout /t 1 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS%
) else (
  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen
)
