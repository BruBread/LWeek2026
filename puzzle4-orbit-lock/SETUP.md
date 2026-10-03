# Puzzle 4: Orbit Lock (booth setup)

Aurora's heart sits in the middle of the screen behind two shield rings. Each ring has one gap. The team turns the rings until **both gaps line up with the laser** at the bottom, then holds **Space** to fire. Four layers: ALIGN, DRIFT, WATCHDOGS, OVERRIDE.

Each ring has its **own controller**: an ESP32 with one big knob (a potentiometer) in its own box, with its own USB cable to the Puzzle 4 laptop. One is labelled **OUTER RING**, the other **INNER RING**. Put them apart (either side of the screen) so the two players have to talk. There's no Wi-Fi and no IP to set: the laptop powers each board and reads it through the cable.

Without the controllers, the keys do the same job: **A / D** turn the outer ring and **◄ / ►** turn the inner ring. They behave like knobs too: each ring stops dead at both ends. If a controller is unplugged mid-game, the keys for **that ring** take over within a second, and the other controller keeps working.

## Parts (for both controllers)
| Part | How many | Notes |
|---|---|---|
| ESP32 DevKit | 2 | One per controller |
| Potentiometer **B100k** | 2 | **B** = linear, which is what you want. An **A**100k (log) would make the ring speed up as you turn |
| Big knob caps | 2 | Big enough for a crowd to grab. Draw a white pointer line on each |
| Female-to-female jumper wires | 6 | 3 per controller: red, black, yellow. No breadboard needed |
| Data USB cable, 1-3 m | 2 | Must be **data** cables (like the one you flash with). A charge-only cable powers the board but sends nothing |
| Free USB ports on the P4 laptop | 2 | Or a USB hub |
| 100 nF ceramic capacitor, code **104** | 2 (optional) | Steadies the reading. Only needed if a ring shivers |
| Small box per controller | 2 | Cardboard is fine. One hole for the pot shaft, one notch for the cable |

## Flash the ESP32s (once per board)
1. Arduino IDE, board **ESP32 Dev Module**, the right COM port, same as the mask.
2. Open `pots_esp32/pots_esp32.ino`. There's no `secrets.h`: these boards never use Wi-Fi.
3. **Outer controller:** check `INNER_RING = false` near the top, upload. Serial Monitor (115200) prints `OUTER 1650` lines very fast. Turn the knob: the number moves between about 0 and 3150.
4. **Inner controller:** plug in the other ESP32, change it to `INNER_RING = true`, upload. It prints `INNER …`. Then **change it back to `false`** so the file stays the outer version.
5. **Close the Serial Monitor** before running the game. Only one program can use a COM port at a time.
6. Label each board with masking tape (OUTER / INNER) so they never get mixed up.

## Wiring (3 wires per controller, the same on both)
Hold the pot with the shaft pointing at you and the pins pointing down. The pins are then **left, middle, right**. The middle pin is the **wiper**, the reading. Push the female jumpers straight onto the pot pins and the ESP32 pins.

| Pot pin | Jumper color | ESP32 pin |
|---|---|---|
| right | red | **3V3** (**never 5V or VIN**: 5 V on D34 can kill that pin) |
| middle | yellow | **D34** |
| left | black | **GND** |

```
        pot (shaft toward you)
       left    middle    right
        │        │         │
      black    yellow     red
        │        │         │
       GND      D34       3V3        ← ESP32
```

- Both controllers are wired exactly the same. Only the `INNER_RING` line in the sketch tells them apart.
- Turning the knob **clockwise** then raises its number, and its ring turns clockwise on screen. If a ring goes the wrong way, you don't need to rewire: swap its two numbers in `CFG.POT_MV` (see Calibrate).
- D34 sits near the top of one edge on most DevKits, next to VP/VN. 3V3 is usually at the bottom corner of the other edge, with a GND next to it. Read the labels on your board.
- **Optional, if a ring shivers:** a 104 capacitor from D34 to GND on that board. It has no polarity, so either way round works.
- Mount the pot in its box with its nut. Glue or tape the board inside so a tug on the knob doesn't pull the jumpers off. A dab of hot glue on each jumper end helps too.

## Pair them with the game (once per laptop)
1. Plug both controllers into the Puzzle 4 laptop.
2. Run this folder's `start.bat`. Pairing must happen in that window: it remembers the boards in its own browser profile, not in your normal Edge.
3. Press **Ctrl+Alt+P**. The browser lists the boards as "USB-SERIAL CH340 (COM5)", "CP210x… (COM3)" or similar. Pick one (arrow keys + Enter, or click).
4. Press **Ctrl+Alt+P** again and pick the other one.
5. **Ctrl+Alt+H**: `2 paired, 2 plugged in`, then `outer: OK` and `inner: OK`.

From then on they connect by themselves every time the game starts, and again after a replug. It doesn't matter which USB port each one uses. A new board needs Ctrl+Alt+P once.

- **Nothing in the list:** check the cable is a data cable. Then look in Device Manager under *Ports (COM & LPT)*. No COM port there means the USB driver is missing: install the **CH340** or **CP210x** driver, whichever chip is on the board.
- **`not seen yet`** for one ring: that board isn't paired, isn't plugged in, or the Arduino Serial Monitor still has its port open.
- **`TWO CONTROLLERS SAY OUTER`**: both boards were flashed the same. Reflash one with `INNER_RING = true`.

## Calibrate (2 minutes, at the booth)
1. Start the game, press **Ctrl+Alt+H**. The panel shows each controller's live mV and its knob position (0 to 1).
2. Turn the **outer** knob fully left and note the mV, then fully right and note it. Do the same for the **inner** knob.
3. Open `game.html` and put the numbers in `CFG.POT_MV`, outer first:
   ```js
   POT_MV: [[0, 3142], [0, 3150]],   // [mV at the left stop, mV at the right stop]
   ```
4. Measure how far a knob turns from stop to stop and set `CFG.POT_DEG` (most B100k pots: about **300**). Then 1° on the knob is 1° on the ring.
5. Ctrl+Alt+R to reload. Check: knob fully left = gauge pointer at its left end, fully right = right end, and each ring turns **the same way** as its knob.
6. A ring turns the wrong way? Swap its two numbers, e.g. `[3142, 0]`.

## Test
1. Ctrl+Alt+S starts the game without waiting for puzzle 3. Ctrl+Alt+K skips the intro.
2. Turn each knob slowly. Only its own ring follows, smoothly, and its gauge in the bottom right follows the knob.
3. At each end the knob stops and so does the ring.
4. Line up both gaps: each ring shows `● LOCKED` and the aim line turns white. Hold Space: it charges and fires.
5. Let go of both knobs. The rings should sit still. If one shivers, add the 104 capacitor to that board or raise `STEP_MV` in the sketch (4-5).
6. Pull one USB cable mid-layer: within a second that ring's keys work, and the other knob still works. Plug it back in: the knob takes over again.

## Laser strip (Govee H6143, Bluetooth)
A **Govee H6143** (5 m, 15 segments, 12 V) taped along the wall behind the screen. It's driven over **Bluetooth** from the Puzzle 4 laptop by `laser_bridge.py`, which `start.bat` starts. There's no Wi-Fi, no IP and no hub involved: this strip's firmware (1.08.06) has no LAN Control, so its Wi-Fi isn't used.

| In the game | On the strip |
|---|---|
| Waiting / between shots | dim red glow |
| Holding Space | heats up from dim to bright red over 0.9 s (drops back if they let go) |
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
2. A red terminal explains: turn the rings, line both gaps up with the laser, hold Space to fire.
3. Each layer opens with a banner. From layer 2 it says **NEW HANDS ON THE CONTROLS**: let different players take the two controllers.
4. Each layer rolls new ring positions, so last layer's knob spot is wrong now. Every target is always between the stops: if a knob hits its end, turn it the other way.
5. A miss sparks off a ring or a watchdog: +10 HUMAN. A slow layer adds a little HUMAN too.
6. 25 s into a layer its hint glitches onto the screen. At 55 s the gaps widen.
7. The 4th hit cracks her heart open: **CORE BREACHED**, and the finale unlocks.

## Staff keys (on the game laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel: hub, each controller's status and live mV, layer, misses |
| Ctrl+Alt+P | Pair one more ring controller (needs a real key press on this laptop) |
| Ctrl+Alt+U | Unlock by hand (puzzle 3's signal never came) |
| Ctrl+Alt+S | Start now, even if locked |
| Ctrl+Alt+K | Skip the intro |
| Ctrl+Alt+I | Show this layer's hint now |
| Ctrl+Alt+N | Clear this layer (lines up a clean shot and fires) |
| Ctrl+Alt+F | Force the win (team stuck / running late) |
| Ctrl+Alt+R | Reset for the next team |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |

The GM panel can press UNLOCK, FORCE WIN and RESET remotely.
