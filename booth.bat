@echo off
rem NEXUS booth settings. Every start.bat runs this first. Copy the whole folder to every laptop.
rem Any laptop can be any station: the one that runs hub\start.bat becomes the hub, and every page finds it by itself.

rem The booth router's network (the first three numbers of any laptop's IP on it). Pages search it for the hub.
set NET=192.168.0

rem Keep every booth laptop awake while plugged in or on battery: a sleeping laptop drops out of the game.
for %%s in (standby-timeout-ac standby-timeout-dc monitor-timeout-ac monitor-timeout-dc) do powercfg /change %%s 0 >nul 2>&1

rem USB selective suspend off: Windows puts idle USB devices to sleep, and the plush Enter key (puzzle 2) never wakes up
rem again until it's replugged.
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
