@echo off
rem NEXUS Puzzle 1 - serves projector.html and opens it fullscreen on the projector (right-hand display).
rem PRIMARY_WIDTH = width of the laptop screen in Windows display settings (after scaling), so the window lands on the projector.
set PRIMARY_WIDTH=1920
call "%~dp0..\booth.bat"
set URL=http://localhost:8000/projector.html?net=%NET%
set FLAGS=--kiosk "%URL%" --window-position=%PRIMARY_WIDTH%,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk" --autoplay-policy=no-user-gesture-required --no-first-run

cd /d "%~dp0"
start "nexus-server" /min python -m http.server 8000
timeout /t 1 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS%
) else (
  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen
)
