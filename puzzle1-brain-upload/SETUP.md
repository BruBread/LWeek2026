# Puzzle 1: Brain Upload (booth setup)

## Laptop (once)
Players never see the real Windows desktop. `start.bat` covers the laptop screen with `desktop.html`, a fake Windows desktop: the "Think outside the box" wallpaper with a mouse pointer pointing down, and one app, **Binary Key** (the 0-9 binary table, revealed with a short animation each time it opens). The projector shows `projector.html`.
1. Create a local Windows account named **AURORA**, so no personal pop-ups appear.
2. Display settings: **Extend** these displays, and drag the projector **below** the laptop, left edges lined up. Players reach the wall by moving the mouse off the **bottom** of the laptop screen. Taskbar settings → turn off "Show my taskbar on all displays".
3. Power settings: sleep = Never, screen off = Never. Turn off notifications (Do not disturb), and disable the lock screen timeout.
4. Put the real laptop height into `PRIMARY_HEIGHT` in `start.bat` (Settings → Display → resolution ÷ scale, e.g. 1920×1080 at 125% = 864).

## Mask
### Flash the ESP32 (once)
1. Install the Arduino IDE. In Boards Manager, install **esp32 by Espressif (3.x)**. Select board **ESP32 Dev Module** and the COM port.
2. In `mask_esp32/`, `secrets.h` holds the `NETS` list: **NexusV** only (the puzzle 3 beacon uses the same list). With more than one network, the mask tries each for 10 s until one works.
   - Each network's `ip` must be listed in `CFG.MASK_IPS` at the top of `projector.html`.
   - **The laptop must be on the same Wi-Fi as the mask.** If the laptop joins the other network, the mask stays red.
   - Pick an IP outside the router's DHCP range, or reserve it in the router.
   - Check that each network's `gateway` matches that router's own address.
3. Upload. Serial Monitor (115200) prints `trying <network>` for each attempt, then `mask ready on <network> at http://…`.

### Wiring (3 × 120 Ω; every GND is shared)
All pins used (GND, D25, D27) are on the same side of the ESP32 DevKit. Only the − rail is needed.

| What | Connection |
|---|---|
| Blue eye 1 | D25 → 120 Ω → blue LED long leg; short leg → − rail |
| Blue eye 2 | D25 → 120 Ω → blue LED long leg; short leg → − rail (its own resistor) |
| Red status | D27 → 120 Ω → red LED long leg; short leg → − rail |
| Ground | ESP32 GND → − rail |

### LEDs
| LED | Meaning |
|---|---|
| Red on | Not on Wi-Fi yet (router off, or wrong name/password in `NETS`) |
| Red off | On Wi-Fi and ready |
| Blue eyes | On while the cursor hovers the mask area and through the click sequence (they glitch at 97%); off from the binary screen until the right code; on again after the win. They flicker while Aurora talks (not during code entry). In the finale's attacks they drop to dim, and mashing brightens them back up |

The DevKit's own small blue LED (GPIO 2) is switched off by the sketch. Its red power LED is wired straight to power and can't be turned off in code: cover it with black tape.

### Test
1. Power the mask: red lights, then goes off once it's on Wi-Fi.
2. `curl.exe "http://192.168.0.50/level?v=255"` lights the eyes, `v=0` turns them off.
3. Run `start.bat` and hover the mask area on the projector: the eyes light up.

## Each day
1. Power the router, then the mask, and wait for its red LED to go off. Log into AURORA and run `start.bat`. The laptop shows the fake desktop, the projector stays black.
2. Press **Ctrl+Alt+H** to open the control panel. Drag the green box over the mask on the wall (drag its corner to resize), then press Ctrl+Alt+H again. Calibration is saved. The panel itself can be dragged out of the way.
3. Do one full test run, then press Ctrl+Alt+R.

## Staff keys (on the projector page; click the projector once so it has focus)
The keyboard types into whichever screen was clicked last. When the projector needs the keys (code entry, mashing) and the laptop screen has them, the projector says **CLICK HERE, THEN TYPE THE KEY** (or **...MASH ANY KEY**).

| Key | What it does |
|---|---|
| Ctrl+Alt+H | Control panel: mask box, corner brackets, current code and this list (drag the panel to move it) |
| Ctrl+Alt+F | Force capture (use if the click or mask fails) |
| Ctrl+Alt+B | Blink the mask eyes 3 times (hint for a team that hasn't found the mask). Also **BLINK MASK** on the GM panel |
| Ctrl+Alt+R | Reset for the next team (new code, eyes off). The laptop's fake desktop resets too, through the hub (Ctrl+Alt+R on the laptop screen resets only the desktop) |
| Ctrl+Alt+P | Replay the sequence (for tuning timings) |
| Ctrl+Alt+W | Replay only the win / mind-upload finale |
| Ctrl+Alt+M | Mute / unmute |

During the finale Aurora attacks four times. Tell players to **mash any key** on the laptop to push her back (they have a 5-second timer; each attack clears on its own when it hits zero). Her lines are recorded clips from the hub (`hub/public/voice/`, see `aurora-voice/cut.py`); with the hub down she falls back to Undertale-style text blips (drop `sounds/aurora-voice.mp3` to use your own blip).

Timings, particle count and volume are in `CFG` / `T` at the top of `projector.html`.

## Hint ladder
1. "Aurora's reach goes beyond the screen."
2. "Try moving the mouse off the bottom of the screen."
3. "Look at the wall: the mouse is on it now."
4. "Click the mask."
5. "Open Binary Key on the laptop and match each group of 4 bits."

## Sound files
Drop these into `sounds/` (mp3). Any file that's missing is skipped, so the page still runs without them. Overall level: `CFG.MUSIC_VOLUME`.

| File | When it plays |
|---|---|
| `upload1.mp3` | First brain upload: from the mask click until the screen collapses (fades out) |
| `detected.mp3` | One-shot the moment "UNAUTHORIZED CONSCIOUSNESS DETECTED" appears (~7–8 s after the click) |
| `crt-music.mp3` | **In `hub/public/sounds/`, plays on the hub laptop.** Loops from the green CRT boot until the players crack the code (fades out) |
| `finale-music.mp3` | **In `hub/public/sounds/`, plays on the hub laptop.** Loops from the instant the red CRT line appears. Ducks during Aurora's attacks, then fades out over 2.5 s when Aurora says "fine, come in then." The built-in synth beat only plays while the hub is down. |
| `mash-in.mp3` | One-shot when the MASH ANY KEY banner appears (each attack) |
| `mash-out.mp3` | One-shot when the banner goes away, whether it shatters or the timer runs out |

To use other names or formats, edit `SOUNDS` near the top of the script in `projector.html`.

Background music (every loop, in every room) plays on the hub laptop: the GM panel plays it, so plug the booth speaker into that laptop and click the GM panel once after opening it (browsers block sound until a click).
