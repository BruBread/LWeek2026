# Puzzle 3: Hidden Signal (booth setup)

Somewhere in the room, 3 blue lights sit in a row, numbered 1 to 3. The lights blink **one after another**: light 1 blinks its digit (for example 3 times), a short pause, then light 2 blinks its digit, then light 3. A long pause, then it repeats. The 3 counts are the code.

There are **3 layers** (rounds), each with a new code, and each one blinks faster:
1. **Layer 1:** slow. Easy to count once they find the board.
2. **Layer 2:** fast. They can count it if they focus.
3. **Layer 3:** so fast that each light looks like **one flash**, so the code looks like 111. It never is: codes only use digits 2-5. Players have to film the lights in a phone's **slow-motion** mode and count the blinks in the video.

Players have **5:00** for all 3 layers. Before the hunt, a short **training** on the screen teaches them to read the lights (the real board stays dark until then).

The board reacts to the game: it flickers on when the hunt starts, stutters on a wrong code, sweeps and fades when a layer is cracked, and beats with Aurora's heartbeat at the win. The 3 blue **lenses** on the game screen copy those effects (never the code).

During the hunt the game screen goes a little darker (`CFG.DIM`) so its glow doesn't wash out the lights. Also turn the laptop's own screen brightness down and keep the room lights low.

## No board yet? Rehearse with a phone
1. Start the hub on the GM laptop (`hub\start.bat`), then run this folder's `start.bat`.
2. On a phone on the booth Wi-Fi, open `http://<hub laptop IP>:3000/beacon` (3 blue lights) and hide it.
3. Tap the phone once for fullscreen and turn its auto-lock off.

The phone plays exactly what the game sends the board (the code and the effects), through the hub, so a reset (Ctrl+Alt+R) changes it too. A phone screen only redraws about every 17 ms, so layer 3 looks rougher on it than on the real LEDs.

## Parts
| Part | How many | Notes |
|---|---|---|
| ESP32 DevKit | 1 | |
| Blue LED, 5 mm | 3 (buy 5) | Clear or blue plastic |
| Red LED, 5 mm | 1 | Wi-Fi status, same as the mask |
| 120 Ω resistor | 2-3 | One shared by the 3 blue LEDs (two for brighter), one for the red LED. Same as the mask. Color bands: **brown, red, brown, gold** (4-band) or **brown, red, black, black, brown** (5-band) |
| Breadboard + jumper wires | 1 + 6 | Colors below |
| USB power bank + data USB cable | 1 | Some power banks switch off at tiny loads: leave it running 10 minutes to check |
| Masking tape, marker, small box | | Number labels and a hiding box with a hole |
| A phone with real slow-motion | 1 | A staff loaner. See "Phones" below |

## Flash the ESP32 (once)
1. Arduino IDE, board **ESP32 Dev Module**, the right COM port, same as the mask.
2. `beacon_esp32/secrets.h` has the same networks as game 4's controller:
   - **NexusV** first (router 192.168.0.1). There the board uses IP **192.168.0.51**. The mask is .50.
   - **walawifi** as a backup, if NexusV doesn't connect within 4 s. There the board uses **192.168.1.51**. It keeps switching between the two until one works.
   - The laptop must be on the same Wi-Fi as the board.
   - The game sends the lights to both IPs, so it works on either network.
   - The IPs are listed at the top of `game.html` (`CFG.BEACON_IPS`).
3. Open `beacon_esp32/beacon_esp32.ino` itself (not a pasted copy).
4. Upload. Serial Monitor (115200) prints `trying NexusV as 192.168.0.51` … `beacon ready on …`. During the hunt it prints `playing 352` (the code it blinks): the same code as Ctrl+Alt+H in the game.

You only flash it once, **but flashed before 5 October = upload again.** The older sketches (IR and the first blue one) ignore the game and blink their own built-in code (314 or 324) forever, so the lights never match the game. Tell-tale: the lights blink on their own right after power-on. Ctrl+Alt+H and the GM panel then say **OLD SKETCH**.

The board is a simple player: the game sends it every blink and every effect as a list of steps (see "Tuning the speeds"), so changing them never needs a new upload.

## Wiring (only 2 or 3 resistors)
This is the same wiring as the old IR board: only the 3 LEDs change. All the pins are next to each other on the **same edge** of the ESP32: D32, D33, D25, D27 (D26 is not used). Read the labels printed on your board. GND is a few pins further down that edge.

The 3 blue LEDs **share one resistor**. Each blue LED's long leg goes to its own pin; all three short legs meet on one rail, and one resistor connects that rail to GND. This is safe because the code only ever lights **one LED at a time**, so the shared resistor only carries one LED's current.

You use both rails on the right edge of the breadboard:
- the **− rail** (blue line) = GND, as on the mask;
- the **+ rail** (red line) = the shared **LED rail**. Nothing from the ESP32's 3V3 or 5V goes here. Put a strip of tape on it that says "LED RAIL".

| What | ESP32 pin | Jumper color | Connection |
|---|---|---|---|
| Light 1 | D32 | yellow | D32 → blue LED long leg; short leg → LED rail |
| Light 2 | D33 | green  | D33 → blue LED long leg; short leg → LED rail |
| Light 3 | D25 | blue   | D25 → blue LED long leg; short leg → LED rail |
| Shared resistor | | | LED rail → **120 Ω** → − rail. For brighter: **two** 120 Ω side by side, both from the LED rail to the − rail (60 Ω) |
| Red status | D27 | orange | D27 → 120 Ω → red LED long leg; short leg → − rail (its own resistor, not the shared one) |
| Ground     | GND | black  | GND → − rail |

```
                  right half of the breadboard            LED rail (+)   − rail
               f      g      h      i      j                 red line     blue line
row 40   D32 ──●                          ●LED 1 long  short ──●
row 44   D33 ──●                          ●LED 2 long  short ──●
row 48   D25 ──●                          ●LED 3 long  short ──●
row 56                                                         ●──[120Ω]──●   (2nd 120Ω here too = brighter)
row 60   D27 ──●  ●──┐
                     [120Ω]
row 63            ●──┘                    ●RED  long   short ──────────────●
                                                                GND (black)──●
```

- Blue LED rows: the colored jumper goes in column **f**, the LED's **long leg** in column **j** of the same row, and its **short leg** bent into the **LED rail**.
- Shared resistor: one leg in the LED rail, the other in the − rail. For extra brightness, add a second one right next to it, the same way.
- Red LED: jumper in row 60 column **f**. The 120 Ω goes from row 60 column **g** **down to row 63** column g. It must bridge two different rows: a resistor with both legs in one row does nothing. The red LED's long leg goes in row 63 column **j**, and its short leg goes straight into the **− rail**.
- The short leg is also on the side with the **flat edge** of the LED's rim.
- Label the blue LEDs **1 2 3** with masking tape, left to right, in the order D32, D33, D25.
- Put the red LED where staff can see it but players can't (the back of the hiding box). It's off during a game.
- An LED in backwards never lights. Flip it; nothing breaks.
- Never connect the LED rail to 3V3 or 5V.
- **Too dim?** Blue LEDs need almost all of the pin's 3.3 V, so they run gently.
  1. Check the resistor is 120 Ω (brown-red-**brown**), not 1 kΩ (brown-black-**red**).
  2. Add the second 120 Ω on the LED rail (60 Ω, brighter). Not lower than that: it's the ESP32 pin's limit.

## LEDs
| LED | Meaning |
|---|---|
| Red on | Not on Wi-Fi yet (router off, or the laptop's network isn't one in `secrets.h`) |
| Red off | On Wi-Fi and ready |
| Blue lights | At power-on: a sweep 1-2-3 twice (the wiring check), then dark. Dark through the standby and the training, then the code during the hunt. They keep blinking the last code even if Wi-Fi drops |

The DevKit's small blue LED is switched off by the sketch. Cover its red power LED with black tape.

## Test
1. Power it from the power bank. The blue lights sweep 1-2-3 twice, then go dark. Red lights up, then goes off once it's on Wi-Fi.
   - A light that never lights in the sweep is in backwards, or its jumper is in the wrong row.
2. Run `start.bat` and press **Ctrl+Alt+H**: `board: OK`. `OLD SKETCH` = upload `beacon_esp32.ino` again.
3. Press **Ctrl+Alt+K** (straight to the hunt). The lights flicker on, then blink layer 1's code. Ctrl+Alt+H shows the code to check against: light 1 blinks the first digit, and so on.
4. Press **Ctrl+Alt+N** twice to jump to layer 3.
   - With your eyes, each light should look like **one flash**.
   - Film it in slow motion: each light should show its digit's number of separate blinks.
5. Ctrl+Alt+R resets it for the first team.

## Phones
- Slow motion is in the normal camera app: **SLO-MO** on iPhones; on Android it's **Slow motion**, often under MORE.
- Try 3-4 different phones before the event. Some cheap phones fake slow motion by blending frames, which smears the blinks together.
- Keep one phone that you know works at the booth as a loaner.

## Tuning the speeds (do this on the real LEDs)
Every speed is in `CFG.ROUNDS` at the top of `game.html`, one line per layer, in ms:
- `on` = one blink;
- `off` = the dark gap between blinks of the same light;
- `gap` = the pause before the next light;
- `loop` = the long dark pause before it all repeats.
- `name` / `sub` = the layer's banner.

Blinks of 80 ms or more fade in and out; faster ones are a crisp full-on, so slow motion counts them cleanly. The game turns all this into steps for the board, so you only edit `game.html`. To try a change: save, Ctrl+Alt+R, Ctrl+Alt+K, then Ctrl+Alt+N to reach the layer. No new upload.

Layer 3 is the one to get right:
- **People can count it with their eyes?** Make it faster: lower `on` and `off` (for example 20 and 25).
- **The blinks merge together in slow motion?** Make it slower: raise them (for example 35 and 40).
- Don't go below about 15 ms.

The effects (power-on flicker, wrong-code stutter, layer sweep, heartbeat, time-up strobe) are in `FX` in `game.html`. The board takes up to 160 steps of 1-10000 ms each; the game's longest list is about 60.

## Placing it
- Hidden, with the LEDs facing out: a box with a hole, under a table edge, behind a poster with a slit.
- Players will need to film it from close up in layer 3, so leave room for a phone 30-50 cm in front of it.
- Check from 1-2 m with 3-4 different phones.

## How a round goes
1. Standby "CARRIER OFFLINE" until puzzle 2 finishes, then PRESS SPACE. The board is dark.
2. A short red terminal (3 lines), then the **training**: a panel on the left, the 3 lenses in the middle.
   1. **COUNT THE BLINKS:** the lenses blink a demo code (243) slowly. Each blink pips and adds a dot under its lens, and the count fills the box below. Then it says the code is 243.
   2. **FIND THE REAL ONE:** "count it, type it", and the blink-rate gauge steps through the 3 layers, ending past the **HUMAN EYE LIMIT** line. Then the hunt starts and they type the real code. There is no practice round.
3. The hunt: the **LAYER 1 / 3 ▸ CARRIER** banner, the board flickers on somewhere in the room, Aurora taunts, and the clock starts.
   - The hunt screen: the carrier scope (a pulse train that speeds up each layer), the **BLINK RATE** gauge, `LAYER n/3` with 3 pips, the 3 lenses with their code boxes, and the **AURORA TRACING YOU ▸ 5:00 LEFT** bar. The 4 corner brackets close in as the trace grows.
   - Typing a digit makes the lens above it blink that number back.
4. Right code in layers 1-2: the boxes and lenses turn green, the board sweeps and fades, Aurora speeds up ("Lucky. Faster, then." / "Now try counting."), then the next layer's banner. The board starts the new, faster code after a dark pause.
5. Wrong code: +5% trace, 2.5 s lock, the board and the lenses stutter red, and the board starts its code over from light 1.
6. Layer 3 has one hint, **MAYBE TRY A SLOW-MOTION CAMERA**. It glitches onto the screen 15 s into layer 3, or right after the first wrong code there, whichever comes first. The text tears in for a moment (jitter, scrambled letters, RGB split), then vanishes, and keeps flashing back every 8-13 s.
   - Typing **111** in layer 3 (what it looks like to the eye) also gets "One blink each? That's all I let you see." It still counts as a wrong code.
7. Right code in layer 3: her heartbeat comes through the scope, the lenses and the real board (5 beats), then the board goes dark and **SIGNAL INTERCEPTED**.
8. Time up at 5:00: the board strobes, **TRACE COMPLETE**, TRACE 100%. The team still moves on to puzzle 4.

## Staff keys (on the game laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel: current code and layer, board + hub status (stays bright while the screen is dimmed) |
| Ctrl+Alt+U | Unlock by hand (if puzzle 2's signal never came) |
| Ctrl+Alt+S | Start now, even if locked |
| Ctrl+Alt+K | Skip the intro and the training, straight to the hunt |
| Ctrl+Alt+N | Skip to the next layer (testing the speeds / team stuck) |
| Ctrl+Alt+I | Glitch the next hint onto the screen now |
| Ctrl+Alt+F | Force the win, all layers (board dead / team stuck / no slow-mo phone) |
| Ctrl+Alt+R | Reset for the next team (new codes, locks again) |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |

The GM panel also has UNLOCK, FORCE WIN and RESET for this room. Its ANSWER shows the current code and layer, for example `352 (2/3)`.

Timings are in `CFG` / `T` at the top of `game.html`:
- `ROUNDS` = each layer's blink speed and banner (above);
- `EYE_HZ` = where the gauge draws HUMAN EYE LIMIT (display only);
- `TUT_SPEED` = the training's demo speed (`T.goal` = how long its last card stays up);
- `TRACE_S` = the 5:00 clock;
- `DIM` = how dark the hunt screen gets;
- `HINTS` / `HINT_EVERY` = when the layer 3 hint glitches in and how often it comes back.

## Sound files
Drop these into `sounds/` (mp3). Any missing file is skipped. The background music (game3.mp3) is the GM panel's soundtrack, in `hub/public/sounds/`.

| File | When it plays |
|---|---|
| `win.mp3` | One-shot on SIGNAL INTERCEPTED |
| `aurora-voice.mp3` | Optional: one short blip for Aurora's text voice, used only when her recorded lines (from the hub) are missing |
