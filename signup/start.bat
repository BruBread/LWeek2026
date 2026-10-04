@echo off
rem Nexus: Aurora V signup - the ticket/line kiosk on the computer OUTSIDE the booth. Needs Node.js, and the USB camera plugged in.
rem Runs on localhost so the browser allows the camera; the camera permission is auto-accepted.
rem Staff: hold Ctrl+Alt and type ICPEP = line screen. Ctrl+Alt+R = reload. Alt+F4 = quit the kiosk.
rem Hold Ctrl+Alt and type NEXUS = assist signup (no party limit, free, not counted). TEST = practice signup, nothing saved.
rem CAMERA = game 2's camera pop-up on its own, to check the hallway camera.
rem Back up sales.jsonl and the photos folder to a USB stick at the end of every day.
rem booth.bat sets NET: the page searches it for the hub (for "how far is the current team").
call "%~dp0..\booth.bat"
set URL=http://localhost:4000/?net=%NET%
rem --disable-gpu: after hours of idling, a display driver hiccup can leave the kiosk lit but black until the browser restarts.
rem Drawing without the GPU avoids that. Remove it if the animations stutter on a slow laptop.
set FLAGS=--kiosk %URL% --window-position=0,0 --user-data-dir="%LOCALAPPDATA%\nexus-kiosk-signup" --autoplay-policy=no-user-gesture-required --no-first-run --use-fake-ui-for-media-stream --disable-gpu

cd /d "%~dp0"
start "nexus-signup" /min node server.js
rem Game 2's hallway camera pop-up: needs go2rtc.exe and camera.json in this folder (puzzle2-system-power\SETUP.md). Without them: static, SIGNAL LOST.
if exist go2rtc.exe start "nexus-camera" /min go2rtc.exe
timeout /t 1 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS%
) else (
  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen
)
