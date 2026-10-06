@echo off
rem Stops Windows from putting this laptop's Wi-Fi to sleep. Run once on every laptop (it asks for admin by itself).
rem Day 2: a crowd slowed the Wi-Fi and every laptop dropped off the hub; a napping adapter makes those gaps longer.

net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)

echo Wi-Fi adapters: "Allow the computer to turn off this device" OFF
rem PnPCapabilities 24 = the unticked box (the Set-NetAdapterPowerManagement switch for it is missing on some Windows)
powershell -NoProfile -Command "$c = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}'; Get-NetAdapter -Physical | Where-Object NdisPhysicalMedium -eq 9 | ForEach-Object { $a = $_; $k = Get-ChildItem $c -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).NetCfgInstanceId -eq $a.InterfaceGuid }; if ($k) { Set-ItemProperty $k.PSPath PnPCapabilities 24 -Type DWord; '  ' + $a.Name + ': done (restart to apply)' } else { '  ' + $a.Name + ': FAILED - untick it by hand in Device Manager > Power Management' } }"

echo Power plan: Wireless Adapter Settings = Maximum Performance (plugged in and on battery)
powercfg /setacvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0
powercfg /setdcvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0
powercfg /setactive SCHEME_CURRENT
echo   done

echo.
echo Wi-Fi fix applied. Restart the laptop so the adapter setting takes effect.
pause
