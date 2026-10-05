# Puzzle 4: Orbit Lock (booth setup)

Aurora's heart sits in the middle of the screen behind two shield rings. Each ring has one gap, and **each ring is its knob**: the gap always points where its knob's mark points. The team points both gaps at the laser, then **touches two wires together and holds** to fire. Before layer 1 a short **training** (2 steps: aim, fire) teaches the controls by doing them. Three layers: ALIGN, WATCHDOGS, OVERRIDE. The laser never drifts: after day 1 (teams struggled most while Aurora dragged it around) it holds still in every layer.

Everything the players touch is on **one controller**: one ESP32 on a breadboard with **two knobs** (one per ring), **two loose fire wires**, and a **small screen** that shows a spinning circle while waiting and **FIRE** when the laser shoots. It's on the booth Wi-Fi, **NexusV**, at **192.168.0.52** (like the mask at .50 and the beacon at .51), and the game reads it over the network. If NexusV isn't there within 4 s of switching on, it joins the backup network **walawifi** instead, at **192.168.1.52** (then keeps trying both in turn until one works). Once it has been on a network, a drop only ever re-joins that same network. The laptops must be on the same network as the board. Power it from any USB port or charger. Best: plug it into the **Puzzle 4 laptop**, because then USB is a backup if the Wi-Fi drops.

Without the controller, the keys do the same job: **A / D** turn the outer ring, **◄ / ►** turn the inner ring, **hold Space** to fire. If the controller goes silent mid-game (Wi-Fi and USB both), the keys take over within a second, and the game screen's labels switch to the keys too.

## Parts
| Part | How many | Notes |
|---|---|---|
| ESP32 DevKit | 1 | The 30-pin "DOIT DevKit V1" style. Only its VIN side is wired |
| Breadboard | 1 | A DevKit is wide: on one breadboard it leaves free holes on one side only. That's why everything is wired to the VIN side |
| Potentiometer **B100k** | 2 | **B** = linear, which is what you want. An **A**100k (log) would make the ring speed up as you turn |
| Big knob caps | 2 | Big enough for a crowd to grab. Label them **OUTER** and **INNER** with tape, and draw the **gap mark** on each (see Calibrate, step 7) |
| 1.3" OLED screen, I2C, 4 pins | 1 | Ours: blue board, white screen, "1.30' IIC V2.2" on the back. Its chip is an **SH1106** (128×64), which is what the code is set for |
| Male-to-male jumper wires | about 12 | Plus 2 long ones (20-30 cm) for the fire wires |
| Resistors, 120 Ω (brown red brown) | 3 | One for the red LED, and one in each fire wire, so a fire wire that touches the wrong pin can't hurt anything |
| Red LED (5 mm) | 1 | The "not on Wi-Fi" light, same as the mask's and the beacon's |
| Data USB cable, 1-3 m | 1 | For power, and the USB backup. A **data** cable (like the one you flash with); a charge-only cable powers the board but the backup won't work |
| 100 nF ceramic capacitor, code **104** | 2 (optional) | Steadies a knob reading. Only needed if a ring shivers |

## Flash the ESP32 (once)
1. Arduino IDE, board **ESP32 Dev Module**, the right COM port, same as the mask.
2. Install the screen library: **Tools → Manage Libraries**, search **U8g2**, click **Install** (the one by oliver).
   - `U8g2lib.h: No such file or directory` when you upload = it isn't installed. If the Library Manager can't download (the booth network blocks arduino.cc), download `https://github.com/olikraus/U8g2_Arduino/archive/refs/heads/master.zip`, unzip it, rename the folder to `U8g2`, put it in `Documents\Arduino\libraries\`, and restart the Arduino IDE.
3. Open `controller_esp32/controller_esp32.ino`. `controller_esp32/secrets.h` already has **NexusV** (IP **192.168.0.52**, same password as the mask and the beacon) and the backup **walawifi** (IP **192.168.1.52**). Upload.
4. Serial Monitor (115200) prints `trying NexusV as 192.168.0.52`, then `NOTE controller ready on NexusV at http://192.168.0.52:81/`, and `ORBIT 1650 2210 0` lines very fast: outer knob mV, inner knob mV, and `1` while the fire wires touch. The small screen shows the spinning circle, and the red LED goes off once it's on NexusV.
   - **Red LED stays on:** neither network is there, or a password in `secrets.h` is wrong. The Serial Monitor shows which network it's trying (`trying walawifi as 192.168.1.52`).
   - **The screen stays black:** check the 4 screen wires against the table in Wiring. Most often SDA (D26) and SCK (D27) are swapped, or VCC (D25) and GND are (this screen has **VCC first**, unlike most).
   - **A different screen** (a 0.96" one, chip SSD1306) shows nothing or garbage: in the sketch, put `//` in front of the `U8G2_SH1106…` line, remove the `//` in front of the `U8G2_SSD1306…` line under it, and upload again.
5. **Close the Serial Monitor** before running the game: the USB backup can't open the port while it's open (Wi-Fi works either way).
6. Check from any laptop on the same network: `http://192.168.0.52/` (on walawifi: `http://192.168.1.52/`) says `orbit controller`, and the same address with `:81/` shows the `data: ORBIT …` lines scrolling.

## Wiring (breadboard)
**Everything uses one side of the ESP32**: the side with **VIN** next to the USB port. On a breadboard the DevKit covers the other side's holes, so nothing is wired there. That side has no 3V3 pin, so two data pins act as little 3.3 V supplies: **D32** powers the knobs, **D25** powers the screen.

The pins on that side, counting from the USB end:

| # | ESP32 pin | Plugs into |
|---|---|---|
| 1 | VIN | **nothing** (it's 5 V: it would kill the knob pins) |
| 2 | **GND** | the breadboard's **−** rail. Then from the − rail: both knobs' **left** pins, the screen's **GND**, and **fire wire B** (through a 120 Ω resistor) |
| 3 | **D13** | **fire wire A** (through a 120 Ω resistor) |
| 4 | D12 | nothing. Leave it empty: the board won't start if it's pulled high |
| 5 | D14 | nothing |
| 6 | **D27** | screen **SCK** |
| 7 | **D26** | screen **SDA** |
| 8 | **D25** | screen **VCC** |
| 9 | **D33** | the red LED, through a 120 Ω resistor (see below) |
| 10 | **D32** | both knobs' **right** pins (their 3.3 V) |
| 11 | **D35** | **inner** knob's **middle** pin |
| 12 | **D34** | **outer** knob's **middle** pin |
| 13-15 | VN, VP, EN | nothing (EN is the reset button) |

- **Red LED:** D33 → 120 Ω resistor → the LED's **long** leg. The LED's **short** leg (flat edge on its rim) → − rail. Backwards, it just stays dark: flip it.
  - Same as the mask and the beacon: **red on = not on Wi-Fi**, **off = connected**. On every shot it also **blinks along with the small screen's FIRE** (1.2 s), then goes back to that.
- **Knob pins:** hold a pot with its shaft pointing at you and its pins pointing down: **left, middle, right**.
- **Screen pins** (left to right, labels above them): **VCC, GND, SCK, SDA**. VCC comes first on this screen, unlike most. Leave the solder pads on its back alone.
- **Fire wires:** each goes through a 120 Ω resistor (brown red brown), so a stray touch can't hurt anything. A: D13 → resistor → long jumper with a free end. B: − rail → resistor → long jumper with a free end. Touch the free ends together and hold = fire. The game charges for 0.9 s while they touch; let go early and the charge drains, so a quick brush never fires.
- Every part pin and resistor leg goes in its **own row**, with nothing else in that row except its own wire.
- Turning a knob **clockwise** raises its number, and its ring turns clockwise on screen. If a ring goes the wrong way, don't rewire: swap its two numbers in `CFG.POT_MV` (see Calibrate).
- **Optional, if a ring shivers:** a 104 capacitor from D34 (or D35) to the − rail. It has no polarity, so either way round works.
- Players will tug on things. Tape the breadboard down, and put a dab of hot glue or tape over the jumper ends in the breadboard, so a yanked fire wire doesn't pull other wires out. Make the fire wires long enough to reach the players, and keep the breadboard itself out of their reach.

## Connect it to the game
**Over Wi-Fi there's nothing to do.** The game looks for the controller at both `192.168.0.52` (NexusV) and `192.168.1.52` (walawifi) (`CFG.CTRL_IPS` in `game.html`) as soon as it starts, and reconnects by itself if the board restarts or the Wi-Fi drops. The P4 laptop must be on the same network as the board.

1. Power the controller. Its red LED goes off when it's on NexusV (or walawifi).
2. Run this folder's `start.bat`.
3. **Ctrl+Alt+H**: `controller: OK over Wi-Fi (192.168.0.52)` (or `.1.52` on walawifi). Both knobs' mV move when you turn them, and `wires` shows `TOUCHING` while the fire wires touch. The bottom-right legend says **KNOB / KNOB / WIRES**.

**USB backup (optional, once per laptop).** If the controller is plugged into the P4 laptop with a data cable, it sends the same readings over USB too, so a Wi-Fi drop doesn't stop a game:
1. In the start.bat window, press **Ctrl+Alt+P**. The browser lists the board as "USB-SERIAL CH340 (COM5)", "CP210x… (COM3)" or similar. Pick it (arrow keys + Enter, or click). It remembers it in that window's browser profile.
2. Ctrl+Alt+H then shows `USB backup: 1 paired, 1 plugged in`. With Wi-Fi off, it says `OK over USB`.

- **`not seen yet` / `SILENT`:** the board has no power, or its red LED is on (not on Wi-Fi), or the P4 laptop is on a different network than the board. The keys work meanwhile.
- **It keeps dropping off NexusV** (fixed in the sketch on 2026-10-06; upload it again). Look at the controller's small screen:
  - **Spinning circle**: the board is on the Wi-Fi. A drop the GM panel saw was the old sketch freezing: one laptop that stopped reading the stream (asleep, or gone without hanging up) froze the whole board for up to 10 s per reading. The new sketch never waits for a page.
  - **NO WI-FI** with a reason underneath (the board's view of why it dropped):
    - `SIGNAL LOST (200)`: too far from the router, or too many phones on its channel. Move the board or the router closer, keep the ESP32 out of metal boxes, or change the router's 2.4 GHz channel (1, 6 or 11).
    - `NOT FOUND (201)`: the router is off or rebooting.
    - `PASSWORD/WEAK`: wrong password in `secrets.h`, or a very weak signal.
    - `ROUTER KICKED`: the router dropped it. Restart the router; check it isn't full.
    - `restarted: POWER DIP` underneath: the board rebooted because its power dipped. Use another USB port, a better cable, or a phone charger.
  - The board re-joins by itself every 10 s. It no longer hops to walawifi mid-day: that turned a 1 s blip into 14 s or more off NexusV.
  - The same reasons print over USB as `NOTE wifi lost: …` lines (Serial Monitor, 115200, between the fast `ORBIT` lines).
- **An IP is taken or changed:** set it in `secrets.h` and in `CFG.CTRL_IPS` (or add `?ctrl=<ip>` to the game's URL).
- **USB backup: nothing in the list:** check the cable is a data cable, then Device Manager under *Ports (COM & LPT)*. No COM port means the USB driver is missing: install **CH340** or **CP210x**, whichever chip is on the board.

## Calibrate (2 minutes, at the booth)
1. Start the game, press **Ctrl+Alt+H**. The panel shows each knob's live mV and position (0 to 1).
2. Turn the **outer** knob fully left and note the mV, then fully right and note it. Do the same for the **inner** knob.
3. Open `game.html` and put the numbers in `CFG.POT_MV`, outer first:
   ```js
   POT_MV: [[0, 3142], [0, 3150]],   // [mV at the left stop, mV at the right stop]
   ```
4. Measure how far a knob turns from stop to stop and set `CFG.POT_DEG` (most B100k pots: about **300**). Then 1° on the knob is 1° on the ring.
5. Ctrl+Alt+R to reload. Check: knob fully left = gauge pointer at its left end, fully right = right end, and each ring turns **the same way** as its knob.
6. A ring turns the wrong way? Swap its two numbers, e.g. `[3142, 0]`. The outer knob turns the inner ring? Swap the yellow wires on D34 and D35.
7. **Draw the gap mark on each knob cap.** Turn the knob to the middle of its travel: its ring's gap now sits at the **bottom** of the screen. Draw a bold white line on the cap pointing the way that gap points (toward the players / the bottom of the screen). From then on the mark and the gap move together: wherever the mark points, the gap points. Players just point both marks at the laser.

## Test
1. Ctrl+Alt+S starts the game without waiting for puzzle 3. Ctrl+Alt+K skips the intro.
2. Turn each knob slowly. Only its own ring follows, smoothly, and its gauge in the bottom right follows the knob.
3. At each end the knob stops and so does the ring.
4. Point both knob marks at the laser: each gap sits over the laser, each ring shows `● LOCKED`, the laser sight turns white, and the laser's tag says `● CLEAR: TOUCH THE WIRES`. Touch the fire wires and hold: the small screen's circle spins faster, the laser charges and fires, and the small screen flashes **FIRE**.
5. Brush the wires together for a moment: nothing fires.
6. Let go of both knobs. The rings should sit still. If one shivers, add a 104 capacitor to that knob's pin, or raise `STEP_MV` in the sketch (4-5).
7. Switch the controller off mid-layer (pull its power): within a second the keys work and the legend says A / D, ◄ / ►, SPACE. Power it back on: within a few seconds the knobs and wires take over again.

## Laser strip (Govee H6143, Bluetooth)
A **Govee H6143** (5 m, 15 segments, 12 V) taped along the wall behind the screen. It's driven over **Bluetooth** from the Puzzle 4 laptop by `laser_bridge.py`, which `start.bat` starts. There's no Wi-Fi, no IP and no hub involved: this strip's firmware (1.08.06) has no LAN Control, so its Wi-Fi isn't used.

| In the game | On the strip |
|---|---|
| Waiting / between shots | dim red glow |
| Holding the fire wires (or Space) | heats up from dim to bright red over 0.9 s (drops back if they let go) |
| Hit | a white beam shoots along the strip, the whole strip blows white, then cools to dim red |
| Miss (ring or watchdog) | the beam stops halfway, sputters red, back to dim |
| Last hit | full beam, white/red strobe, a long white burn |

**Some LEDs on this strip are damaged**: they lose green and blue, so they show pink or red where others are white. Every effect stays in reds and white so it doesn't show. Don't add green.

### One-time setup (each laptop that might be the Puzzle 4 laptop)
1. With internet: `python -m pip install bleak`.
2. Turn **Bluetooth on** (Settings → Bluetooth & devices). No pairing in Windows needed: the bridge finds the strip by its name, `ihoment_H6143_…`.
3. **Close the Govee Home app on every phone**, or turn the phone's Bluetooth off. The strip takes one Bluetooth connection at a time; a phone that grabs it locks the laptop out.
4. Test it: `python laser_bridge.py test` in this folder. It lights **segment 1** white for 2 s, then plays CHARGE → HIT, CHARGE → MISS, CHARGE → WIN.
5. Segment 1 must be the end **next to the emitter** (the bottom of the screen). If it's the far end, either turn the strip around or set `REVERSE = True` at the top of `laser_bridge.py`.

### At the booth
- Keep the strip within about 10 m of the P4 laptop. It's in the same room, so that's fine. Bodies absorb Bluetooth: don't put the laptop behind the crowd.
- `start.bat` opens a minimized **nexus-laser** window. It prints `strip: connected (A4:C1:38:26:71:49)` and one `fx …` line per effect. It restarts itself if it ever crashes and reconnects by itself if the strip drops.
- **Ctrl+Alt+H** in the game shows `laser strip: connected …`.
- If the bridge or the strip is down, the game plays on: the strip just stays on its last colour.

| Problem | Fix |
|---|---|
| `bridge not running` in Ctrl+Alt+H | `bleak` isn't installed on this laptop, or the nexus-laser window was closed. Install it, rerun `start.bat` |
| `not found (strip powered? …)` | Strip unplugged, Bluetooth off, or a phone has it: close the Govee app |
| The beam skips a step | Raise `STEP_S` in `laser_bridge.py` (0.05 → 0.07) |
| Wrong colours, pink spots | The damaged LEDs. Expected |

### Mounting
- Tape it along the wall behind the screen, in a straight line, **segment 1 next to where the emitter is** (the bottom of the screen).
- Wipe the wall first, press the tape down along the whole length. Use extra clear tape at the ends: the stock adhesive lets go on painted walls.
- Bend only gently: no sharp folds. Don't cut it.
- Keep the controller box and adapter where staff can reach them, not players.

## How a round goes
1. Standby "CORE GATE LOCKED" until puzzle 3 finishes, then PRESS SPACE.
2. The screen boots straight into the **training** (no intro text since 2026-10-06), 2 steps in a panel on the left, with the practice rings in view:
   1. **POINT BOTH KNOBS AT YOUR LASER**: the laser slides somewhere the gaps don't point, so both knobs must turn. Arrows rock beside each ring that isn't lined up yet. Done when both rings say `● LOCKED`.
   2. **TOUCH THE TWO WIRES TOGETHER** (and hold): an animation shows the two wire tips meeting, and it snaps together while the real wires touch. Done when the practice shot hits her heart. Practice shots cost no HUMAN and don't count as shots.
   - Without the controller, the steps say A / D ◄ / ►, HOLD SPACE instead. After 8 s on a step an extra help line shows; after 20 s it moves on by itself (`TUT_HELP_S`, `TUT_SKIP_S`). A quick team is in layer 1 about 10 s after SPACE. Ctrl+Alt+K skips the training.
3. Each layer opens with a banner. From layer 2 it says **NEW HANDS ON THE CONTROLS**: let different players take the knobs and the fire wires.
4. Each layer puts the **laser** somewhere new on its rail (never where the gaps already point), so both knobs have to turn to it. It holds still there. WATCHDOGS adds two drones that eat the beam. In OVERRIDE every miss also throws the laser somewhere else. Every laser spot is between the knobs' end stops.
5. A miss sparks off a ring or a watchdog: +10 HUMAN. A slow layer adds a little HUMAN too.
6. 25 s into a layer its hint glitches onto the screen by itself (free). At 55 s the gaps widen. Staff can also send a message from the GM panel's room 4 box: it flashes as INCOMING TRANSMISSION and costs +5 HUMAN.
7. The 3rd hit cracks her heart open: the fake win (**AURORA TERMINATED**), then game 5 starts.

## Staff keys (on the game laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel: hub, the controller's status, both knobs' live mV, the fire wires, layer, misses |
| Ctrl+Alt+P | Pair the controller (needs a real key press on this laptop) |
| Ctrl+Alt+U | Unlock by hand (puzzle 3's signal never came) |
| Ctrl+Alt+S | Start now, even if locked |
| Ctrl+Alt+K | Skip the training |
| Ctrl+Alt+I | Show this layer's hint now |
| Ctrl+Alt+N | Clear this layer (lines up a clean shot and fires) |
| Ctrl+Alt+F | Force the win (team stuck / running late), any time after SPACE: the fake win, then game 5. Does nothing on the locked start screen |
| Ctrl+Alt+R | Reset for the next team |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |
| Ctrl+Alt+B | Testing: jump straight to game 5's **MIRRORS** (rings still, then her line and the mirrors). Starts the finale on every laptop; NEW TEAM or FINISH RUN on the GM panel ends it. Needs the hub |

The GM panel can press UNLOCK, FORCE WIN and RESET remotely (point at a button to see what it does), and its message box replaces the old HINT button.
