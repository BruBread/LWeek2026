@echo off
rem Aim game 2's hallway camera (Tapo C200). The live view opens in the browser; this window moves the camera.
rem ARROWS move it, + / - change the step, S saves the aim, H goes back to the saved aim, Q quits.
rem Needs signup\go2rtc.exe and signup\camera.json on this laptop (see puzzle2-system-power\SETUP.md, "Hallway camera").
call "%~dp0..\booth.bat"
cd /d "%~dp0..\signup"
rem the live view's own go2rtc (if this is also the signup PC, the kiosk's go2rtc already serves it and this one just quits)
start "nexus-camera-view" /min go2rtc.exe
timeout /t 2 /nobreak >nul
start "" "http://localhost:1984/stream.html?src=hallway&mode=mse"
node camera.js
if errorlevel 1 pause
taskkill /fi "WINDOWTITLE eq nexus-camera-view*" >nul 2>&1
