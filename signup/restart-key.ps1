# Ctrl+Alt+R on the signup PC: closes the kiosk browser and opens it again, even when the screen is black or frozen
# (the page's own Ctrl+Alt+R can't help then). This laptop owns the key now, so the page never sees Ctrl+Alt+R.
# start.bat runs this hidden and hands over BROWSER, FLAGS and KIOSK_DIR. A newer copy (start.bat run again) replaces this one.
# Every press also saves what was on screen in signup\restarts\ (a screenshot + one log line), to find out what the black is.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hwnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
}
'@
[void][Win]::SetProcessDPIAware()   # full-size screenshots on a scaled display

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*restart-key.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# Ctrl+Alt+R (0x4003 = Ctrl + Alt + no auto-repeat, 0x52 = R). The old copy's key frees up a moment after it exits
for ($i = 0; -not [Win]::RegisterHotKey([IntPtr]::Zero, 1, 0x4003, 0x52); $i++) { if ($i -ge 30) { exit }; Start-Sleep -Milliseconds 100 }

$log = Join-Path $PSScriptRoot 'restarts'
New-Item -ItemType Directory -Force $log | Out-Null
$msg = New-Object Win+MSG
while ([Win]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0) -gt 0) {
  if ($msg.message -ne 0x312) { continue }   # WM_HOTKEY
  $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
  $kiosk = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:KIOSK_DIR) })
  $ids = $kiosk.ProcessId

  # what was on screen: the screenshot, the window in front, and whether the browser still answered Windows
  try {
    $b = [Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
    [Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
    $bmp.Save("$log\$stamp.png"); $bmp.Dispose()
  } catch {}
  $fg = [Win]::GetForegroundWindow(); $fgPid = 0; [void][Win]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  $title = New-Object Text.StringBuilder 200; [void][Win]::GetWindowText($fg, $title, 200)
  $main = $kiosk | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
  $answers = if ($main) { (Get-Process -Id $main.ProcessId -ErrorAction SilentlyContinue).Responding } else { 'no browser' }
  "$stamp  in front: $((Get-Process -Id $fgPid -ErrorAction SilentlyContinue).Name) ""$title""  kiosk processes: $($ids.Count)  browser answering: $answers" |
    Add-Content "$log\restarts.log"

  # close it like Alt+F4 does; anything still there after 3 s is killed. Then open it again
  foreach ($id in $ids) { try { [void](Get-Process -Id $id -ErrorAction Stop).CloseMainWindow() } catch {} }
  if ($ids) { Wait-Process -Id $ids -Timeout 3 -ErrorAction SilentlyContinue; Stop-Process -Id $ids -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }
  Start-Process $env:BROWSER $env:FLAGS
}
