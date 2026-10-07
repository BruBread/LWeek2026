@echo off
rem NEXUS Puzzle 1 - serves the pages, opens desktop.html (the fake Windows desktop) fullscreen on the laptop screen
rem and projector.html fullscreen on the projector, which sits BELOW the laptop in Windows display settings.
rem PRIMARY_HEIGHT = height of the laptop screen in Windows display settings (after scaling), so the window lands on the projector.
set PRIMARY_HEIGHT=1080
call "%~dp0..\booth.bat"
rem each window needs its own --user-data-dir, or the second one opens on top of the first
rem the backgrounding flags: nobody clicks the wall any more, so Chrome must keep animating it even when it thinks the
rem window is hidden (covered by the laptop window, or behind it) - without them the upload froze at 97%
set COMMON=--autoplay-policy=no-user-gesture-required --no-first-run --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
set PROJ=--kiosk "http://localhost:8000/projector.html?net=%NET%" --window-position=0,%PRIMARY_HEIGHT% --user-data-dir="%LOCALAPPDATA%\nexus-kiosk" %COMMON%
set DESK=--kiosk "http://localhost:8000/desktop.html?net=%NET%" --window-position=0,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk-desk" %COMMON%

cd /d "%~dp0"
rem server.js serves the pages AND links the two windows (Mind Upload, keys), so game 1 runs even with the hub down.
rem An old server window (this one, or the python one before day 3) would hold port 8000: close it first
taskkill /FI "WINDOWTITLE eq nexus-server*" /T /F >nul 2>&1
start "nexus-server" /min node server.js
timeout /t 1 /nobreak >nul

rem the desktop opens last so it has the keyboard when the team walks in
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %PROJ%
  timeout /t 2 /nobreak >nul
  start "" "%CHROME%" %DESK%
) else (
  start "" msedge %PROJ% --edge-kiosk-type=fullscreen
  timeout /t 2 /nobreak >nul
  start "" msedge %DESK% --edge-kiosk-type=fullscreen
)
