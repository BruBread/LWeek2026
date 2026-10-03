# Puzzle 3: Hidden Signal (booth setup)

Somewhere in the room, 3 IR lights sit in a row, numbered 1 to 3. IR light is invisible to the eye but shows up on phone cameras as a purple-white flash. The lights blink **one after another**: light 1 blinks its digit (for example 3 times), a short pause, then light 2 blinks its digit, then light 3. A long pause, then it repeats. The 3 counts are the code. Players have **5:00**.

During the hunt the game screen goes **much darker** (`CFG.DIM`) so its glow doesn't wash out the IR on phone cameras. Also turn the laptop's own screen brightness down and keep the room lights low.

## No board yet? Rehearse with a phone
1. Start the hub on the GM laptop (`hub\start.bat`), then run this folder's `start.bat`.
2. On a phone on the booth Wi-Fi, open `http://<hub laptop IP>:3000/beacon` (3 white lights, the code) and hide it.
3. Tap the phone once for fullscreen and turn its auto-lock off.

The phone gets the current code from the game through the hub, so a reset (Ctrl+Alt+R) changes it too.

## Parts
| Part | How many | Notes |
|---|---|---|
| ESP32 DevKit | 1 | |
| IR LED, 5 mm, **940 nm** | 3 (buy 5) | Sold as "IR emitter" or "IR transmitter LED". Clear or light-blue plastic. **Not** the black one: that's the receiver and does nothing here. |
| Red LED, 5 mm | 1 | Wi-Fi status, same as the mask |
| 120 Ω resistor | 2-3 | One shared by the 3 IR LEDs (two for brighter), one for the red LED. Same as the mask. Color bands: **brown, red, brown, gold** (4-band) or **brown, red, black, black, brown** (5-band) |
| Breadboard + jumper wires | 1 + 6 | Colors below |
| USB power bank + data USB cable | 1 | Some power banks switch off at tiny loads: leave it running 10 minutes to check |
| Masking tape, marker, small box | | Number labels and a hiding box with a hole |

## Flash the ESP32 (once)
1. Arduino IDE, board **ESP32 Dev Module**, the right COM port, same as the mask.
2. `beacon_esp32/secrets.h` already has the same networks as the mask, in this order: **NexusV**, then **walawifi**, then secretwifi. On NexusV (router 192.168.0.1) the board uses IP **192.168.0.51**. The mask is .50. On the backup networks it uses 192.168.1.51.
   - The laptop must be on the same Wi-Fi as the board.
   - The IPs are listed at the top of `game.html` (`CFG.BEACON_IPS`).
3. Open `beacon_esp32/beacon_esp32.ino` itself (not a pasted copy).
4. Upload. Serial Monitor (115200) prints `trying NexusV as 192.168.0.51` … `beacon ready on …`.

## Wiring (only 2 or 3 resistors)
All the pins are next to each other on the **same edge** of the ESP32: D32, D33, D25, D27 (D26 is not used). Read the labels printed on your board. GND is a few pins further down that edge.

The 3 IR LEDs **share one resistor**. Each IR LED's long leg goes to its own pin; all three short legs meet on one rail, and one resistor connects that rail to GND. This is safe because the code only ever lights **one IR LED at a time**, so the shared resistor only carries one LED's current.

You use both rails on the right edge of the breadboard:
- the **− rail** (blue line) = GND, as on the mask;
- the **+ rail** (red line) = the shared **LED rail**. Nothing from the ESP32's 3V3 or 5V goes here. Put a strip of tape on it that says "LED RAIL".

| What | ESP32 pin | Jumper color | Connection |
|---|---|---|---|
| IR light 1 | D32 | yellow | D32 → IR LED long leg; short leg → LED rail |
| IR light 2 | D33 | green  | D33 → IR LED long leg; short leg → LED rail |
| IR light 3 | D25 | blue   | D25 → IR LED long leg; short leg → LED rail |
| Shared resistor | | | LED rail → **120 Ω** → − rail. For brighter: **two** 120 Ω side by side, both from the LED rail to the − rail (60 Ω) |
| Red status | D27 | orange | D27 → 120 Ω → red LED long leg; short leg → − rail (its own resistor, not the shared one) |
| Ground     | GND | black  | GND → − rail |

```
                  right half of the breadboard            LED rail (+)   − rail
               f      g      h      i      j                 red line     blue line
row 40   D32 ──●                          ●IR 1 long   short ──●
row 44   D33 ──●                          ●IR 2 long   short ──●
row 48   D25 ──●                          ●IR 3 long   short ──●
row 56                                                         ●──[120Ω]──●   (2nd 120Ω here too = brighter)
row 60   D27 ──●  ●──┐
                     [120Ω]
row 63            ●──┘                    ●RED  long   short ──────────────●
                                                                GND (black)──●
```

- IR rows: the colored jumper goes in column **f**, the IR LED's **long leg** in column **j** of the same row, and its **short leg** bent into the **LED rail**.
- Shared resistor: one leg in the LED rail, the other in the − rail. For extra brightness, add a second one right next to it, the same way.
- Red LED: jumper in row 60 column **f**. The 120 Ω goes from row 60 column **g** **down to row 63** column g. It must bridge two different rows: a resistor with both legs in one row does nothing. The red LED's long leg goes in row 63 column **j**, and its short leg goes straight into the **− rail**.
- The short leg is also on the side with the **flat edge** of the LED's rim.
- Label the IR LEDs **1 2 3** with masking tape, left to right, in the order D32, D33, D25.
- Put the red LED where staff can see it but players can't (the back of the hiding box). It's off during a game.
- An LED in backwards never lights. Flip it; nothing breaks.
- Never connect the LED rail to 3V3 or 5V.
- **Too dim on camera?**
  1. Check the resistor is 120 Ω (brown-red-**brown**), not 1 kΩ (brown-black-**red**).
  2. Add the second 120 Ω on the LED rail (60 Ω, about twice as bright). Not lower than that: it's the ESP32 pin's limit.
  3. If you're buying more, get **850 nm** IR LEDs: phone cameras see them several times brighter than 940 nm. In the dark they give a faint red glow to the eye, so keep them inside the box.

## LEDs
| LED | Meaning |
|---|---|
| Red on | Not on Wi-Fi yet (router off, or the laptop's network isn't one in `secrets.h`) |
| Red off | On Wi-Fi and ready |
| IR lights (camera only) | Blinking the code. They keep blinking the last code even if Wi-Fi drops |

The DevKit's small blue LED is switched off by the sketch. Cover its red power LED with black tape.

## Test
1. Power it from the power bank. Red lights up, then goes off once it's on Wi-Fi.
2. Look at the IR LEDs **through a phone camera**. The boot code 314 plays: light 1 flashes 3 times, light 2 once, light 3 four times, then a long pause. Your eyes see nothing, or at most a faint dull red dot.
   - Nothing on the rear camera? Try the **selfie camera**. Many iPhones block IR on the rear camera.
3. In a browser on the laptop, open `http://192.168.0.51/code?v=555`. All three lights should now blink 5 times each.
4. Run `start.bat` and press **Ctrl+Alt+H**: `IR board: OK`.

## Placing it
- Hidden, with the IR LEDs facing out where a phone can see them: a box with a hole, under a table edge, behind a poster with a slit. Darker spots show IR best.
- Check from 1-2 m with 3-4 different phones, including an iPhone.
- Keep one phone that you know sees IR at the booth as a loaner.

## How a round goes
1. Standby "CARRIER OFFLINE" until puzzle 2 finishes, then PRESS SPACE.
2. A red terminal explains: find the transmitter, 3 lights numbered 1 to 3, each blinks its digit in turn, 5 minutes.
3. Aurora taunts. The hunt screen shows the carrier scope, 3 code boxes and the **AURORA TRACING YOU ▸ 5:00 LEFT** bar.
4. Wrong code: +5% trace, 2.5 s lock.
5. The screen fades much darker for the whole hunt.
6. Hints glitch onto the screen: the text tears in for a moment (jitter, scrambled letters, RGB split), then vanishes, and keeps flashing back every 8-13 s.
   - 1:40: **THE DARKER IT IS, THE EASIER YOU'LL SEE**
   - 3:10: **USE YOUR FRONT CAMS**
7. Right code: her heartbeat comes through the scope, then **SIGNAL INTERCEPTED**.
8. Time up at 5:00: **TRACE COMPLETE**, TRACE 100%. The team still moves on to puzzle 4.

## Staff keys (on the game laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel: current code, board + hub status (stays bright while the screen is dimmed) |
| Ctrl+Alt+U | Unlock by hand (if puzzle 2's signal never came) |
| Ctrl+Alt+S | Start now, even if locked |
| Ctrl+Alt+K | Skip the intro, straight to the hunt |
| Ctrl+Alt+I | Glitch the next hint onto the screen now |
| Ctrl+Alt+F | Force the correct code (board dead / team stuck) |
| Ctrl+Alt+R | Reset for the next team (new code, locks again) |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |

The GM panel also has UNLOCK, FORCE WIN and RESET for this room.

Timings are in `CFG` / `T` at the top of `game.html` (`TRACE_S` = the 5:00 clock, `DIM` = how dark the hunt screen gets, `HINTS` / `HINT_EVERY` = when each hint glitches in and how often it comes back). Blink speed is at the top of the sketch (`ON_MS`, `OFF_MS`, `LED_GAP_MS`, `LOOP_GAP_MS`); change the same numbers in `hub/public/beacon.html` so the phones match.

## Sound files
Drop these into `sounds/` (mp3). Any missing file is skipped.

| File | When it plays |
|---|---|
| `hunt.mp3` | Loops from the CRT boot until the code is cracked or time runs out |
| `win.mp3` | One-shot on SIGNAL INTERCEPTED |
| `aurora-voice.mp3` | Optional: one short blip for Aurora's text voice |
