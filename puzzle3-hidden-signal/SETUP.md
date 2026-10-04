# Puzzle 3: Hidden Signal (booth setup)

Somewhere in the room, 3 blue lights sit in a row, numbered 1 to 3. The lights blink **one after another**: light 1 blinks its digit (for example 3 times), a short pause, then light 2 blinks its digit, then light 3. A long pause, then it repeats. The 3 counts are the code.

There are **3 layers** (rounds), each with a new code, and each one blinks faster:
1. **Layer 1:** slow. Easy to count once they find the board.
2. **Layer 2:** fast. They can count it if they focus.
3. **Layer 3:** so fast that each light looks like **one flash**, so the code looks like 111. It never is: codes only use digits 2-5. Players have to film the lights in a phone's **slow-motion** mode and count the blinks in the video.

Players have **5:00** for all 3 layers.

During the hunt the game screen goes **much darker** (`CFG.DIM`) so its glow doesn't wash out the lights. Also turn the laptop's own screen brightness down and keep the room lights low.

## No board yet? Rehearse with a phone
1. Start the hub on the GM laptop (`hub\start.bat`), then run this folder's `start.bat`.
2. On a phone on the booth Wi-Fi, open `http://<hub laptop IP>:3000/beacon` (3 blue lights, the code) and hide it.
3. Tap the phone once for fullscreen and turn its auto-lock off.

The phone gets the current code and the layer's speed from the game through the hub, so a reset (Ctrl+Alt+R) changes it too. A phone screen only redraws about every 17 ms, so layer 3 looks rougher on it than on the real LEDs.

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
   - The game sends codes to both IPs, so it works on either network.
   - The IPs are listed at the top of `game.html` (`CFG.BEACON_IPS`).
3. Open `beacon_esp32/beacon_esp32.ino` itself (not a pasted copy).
4. Upload. Serial Monitor (115200) prints `trying NexusV as 192.168.0.51` … `beacon ready on …`.

You only flash it once. The blink speeds come from the game (see "Tuning the speeds"), so changing them never needs a new upload.

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
| Blue lights | Blinking the code. They keep blinking the last code at the last speed even if Wi-Fi drops |

The DevKit's small blue LED is switched off by the sketch. Cover its red power LED with black tape.

## Test
1. Power it from the power bank. Red lights up, then goes off once it's on Wi-Fi.
2. The boot code 324 plays at layer 1 speed: light 1 blinks 3 times, light 2 twice, light 3 four times, then a long pause.
3. In a browser on the laptop, open `http://192.168.0.51/code?v=555&on=25&off=30&gap=1000&loop=2500`. That is layer 3's speed with 5 blinks per light.
   - With your eyes, each light should look like **one flash**.
   - Film it in slow motion: each light should show **5** separate blinks.
4. Run `start.bat` and press **Ctrl+Alt+H**: `board: OK`.

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

The game sends these to the board with every code, so you only edit `game.html` and reload (Ctrl+Alt+R). No new upload. To try a speed before editing, use the test URL from step 3 with your own numbers.

Layer 3 is the one to get right:
- **People can count it with their eyes?** Make it faster: lower `on` and `off` (for example 20 and 25).
- **The blinks merge together in slow motion?** Make it slower: raise them (for example 35 and 40).
- Don't go below about 15 ms.

The board accepts `on`/`off` from 10 to 2000, `gap` from 100 to 5000 and `loop` from 300 to 10000. Anything outside that is clamped.

## Placing it
- Hidden, with the LEDs facing out: a box with a hole, under a table edge, behind a poster with a slit.
- Players will need to film it from close up in layer 3, so leave room for a phone 30-50 cm in front of it.
- Check from 1-2 m with 3-4 different phones.

## How a round goes
1. Standby "CARRIER OFFLINE" until puzzle 2 finishes, then PRESS SPACE.
2. A red terminal explains: find the transmitter, 3 lights numbered 1 to 3, each blinks its digit in turn, 3 layers that each blink faster, 5 minutes for all 3.
3. Aurora taunts. The hunt screen shows the carrier scope, **LAYER 1/3** with 3 pips, 3 code boxes and the **AURORA TRACING YOU ▸ 5:00 LEFT** bar.
4. Right code in layers 1-2: the boxes flash green and Aurora speeds up ("Lucky. Faster, then." / "Now try counting."). The board goes dark for a moment, then starts the new, faster code. The scope scrolls faster each layer.
5. Wrong code: +5% trace, 2.5 s lock.
6. The screen fades much darker for the whole hunt.
7. Layer 3 hints glitch onto the screen: the text tears in for a moment (jitter, scrambled letters, RGB split), then vanishes, and keeps flashing back every 8-13 s.
   - 0:45 into layer 3: **TOO FAST FOR HUMAN EYES**
   - 1:30 into layer 3: **FILM IT IN SLOW-MO**
   - Typing **111** in layer 3 (what it looks like to the eye) gets "One blink each? That's all I let you see." and the first hint right away. It still counts as a wrong code.
8. Right code in layer 3: her heartbeat comes through the scope, then **SIGNAL INTERCEPTED**.
9. Time up at 5:00: **TRACE COMPLETE**, TRACE 100%. The team still moves on to puzzle 4.

## Staff keys (on the game laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel: current code and layer, board + hub status (stays bright while the screen is dimmed) |
| Ctrl+Alt+U | Unlock by hand (if puzzle 2's signal never came) |
| Ctrl+Alt+S | Start now, even if locked |
| Ctrl+Alt+K | Skip the intro, straight to the hunt |
| Ctrl+Alt+I | Glitch the next hint onto the screen now |
| Ctrl+Alt+F | Force the win, all layers (board dead / team stuck / no slow-mo phone) |
| Ctrl+Alt+R | Reset for the next team (new codes, locks again) |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |

The GM panel also has UNLOCK, FORCE WIN and RESET for this room. Its ANSWER shows the current code and layer, for example `352 (2/3)`.

Timings are in `CFG` / `T` at the top of `game.html`:
- `ROUNDS` = each layer's blink speed (above);
- `ROUND_MS` = the pause between layers;
- `TRACE_S` = the 5:00 clock;
- `DIM` = how dark the hunt screen gets;
- `HINTS` / `HINT_EVERY` = when each layer 3 hint glitches in and how often it comes back.

## Sound files
Drop these into `sounds/` (mp3). Any missing file is skipped.

| File | When it plays |
|---|---|
| `hunt.mp3` | Loops from the CRT boot until the code is cracked or time runs out |
| `win.mp3` | One-shot on SIGNAL INTERCEPTED |
| `aurora-voice.mp3` | Optional: one short blip for Aurora's text voice |
