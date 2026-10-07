@echo off
rem Aim the hallway camera (Tapo C200) for game 1 and game 2. The live view opens in the browser; this window moves it.
rem ARROWS move it, + / - change the step, 1 / 2 save the aim for game 1 / game 2, A / B go back to them, Q quits.
rem The hub turns the camera to game 1's aim when room 1 starts and at RESET ALL ROOMS, and to game 2's when room 1 is
rem cleared. It reads the aims from signup\camera.json ON THE HUB LAPTOP: run this there, or commit camera.json.
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
