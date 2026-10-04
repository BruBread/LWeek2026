# NEXUS: The Core Protocol — Full Context

## Event
- For: Lweek 2026
- Organizer: Institute of Computer Engineers of the Philippines Student Edition (ICpEP.se), university chapter / computer engineering club
- Dates: October 5-9
- Format: Escape room booth, open to the whole university (not just technical/engineering students)
- Continues a multi-year "Aurora" story the club has been running

## Booth Description (official)
NEXUS: The Core Protocol is an immersive, engineering-driven escape room designed to translate the vision and mission of ICpEP.se into a dynamic, experiential learning experience. The booth's activities are rooted in ICpEP.se's commitment to academic excellence, innovative problem-solving, and technical synergy.

NEXUS challenges participants to step into the role of computer engineers tasked with restoring a compromised next-generation Artificial Intelligence named Aurora before more damage is caused. As participants move through the different stages, Aurora tries to stop them by increasing the difficulty of each stage.

Winners are determined by whether they complete all tasks within a set time limit.

## Objectives
- Promote computer engineering and the ICpEP.se club through an escape room challenge that tests participants' basic computer engineering skills.
- Demonstrate real-world skills and immerse students in practical engineering competencies: hands-on circuit troubleshooting, binary/algorithmic logic, and collaborative problem-solving.

## This Year's Theme
Players "upload their heads" into Aurora in order to stop her from within.

## Difficulty Design Philosophy
- Puzzle 1 (opener): easy, low-stakes, teaches the room's visual language.
- Later puzzles: increasingly difficult, but difficulty should come from lateral thinking, observation, teamwork, and multi-step deduction — NOT from requiring technical/engineering knowledge, since the booth is open to the entire university.
- Mix quiet/thinking puzzles with loud/physical ones to vary pacing.
- Keep at least a couple of puzzles fully non-electronic, so a tech failure (e.g. dead router) can't stall the whole room.

## General Equipment (shared across games)
- Laptop(s)
- Projector
- HDMI cable
- Wired USB mouse
- 2.4GHz Wi-Fi router (local network only, no internet needed)
- Power strip and extension cords
- Masking tape for position marks
- Multimeter
- Hot glue gun, heat shrink/electrical tape
- Spare ESP32s and spare batteries

## Core Tech Decisions Made So Far
- All IoT devices (ESP32s) join one local 2.4GHz Wi-Fi router with no internet — avoids cloud-dependent smart devices, keeps latency low, allows static/reserved IPs per device.
  - One exception: Puzzle 2's hallway light is a Tuya RGB smart bulb. The bulb is controlled locally with TinyTuya, so it needs no cloud during a game. It needs internet only once, to pair it to the booth router (see PUZZLE 2).
- Laptop/game page = the "brain" for each puzzle; ESP32s are dumb executors that just receive on/off or animation commands.
- Every ESP32-driven effect (and the Puzzle 2 bulb bridge) needs a fail-safe default (e.g., lights default ON if it loses contact with the laptop) so a network hiccup doesn't break the game or create a safety issue.
- Prefer wall power over battery where possible; battery (18650 + protection circuit) only where there's no nearby outlet or wireless mobility is needed.
- Breadboards are acceptable for final builds at this current low load, provided they're secured (glued/taped down, strain relief on wires, positioned in a hidden box) — soldering to perfboard is a nice-to-have upgrade, not required.
- Aurora has no spoken (TTS) voice. She "talks" Undertale-style: a pitched blip plays for each letter as her text types out (`VOICES` / `blip()` / `type(..., voice)` in every game page), and a fast, low babble (`say()`) plays under scare lines. To use a recorded blip, drop `sounds/aurora-voice.mp3` next to the page. Every new game (4, 5) copies the same block.

## Booth Network (router)
- Router: **COMFAST**, Wi-Fi name **NexusV** (2.4 GHz). Admin page: `http://192.168.0.1` (it opens on `/computer/wifi.html`). No WAN cable: the booth runs with no internet. The Wi-Fi password lives only in the sketches' `secrets.h` (in the public repo), not in this file.
- Address map (network 192.168.0.x, `NET=192.168.0` in `booth.bat`):

| Address | Device |
|---|---|
| 192.168.0.1 | the router |
| 192.168.0.50 | P1 mask ESP32 (static, set in `secrets.h`) |
| 192.168.0.51 | P3 hidden IR board (static) |
| 192.168.0.52 | P4 controller ESP32: knobs, fire wires, screen (static, `controller_esp32/secrets.h`) |
| DHCP (was .142) | P2 Tuya bulb. No reservation: this router has none, so `bulb_bridge.py` finds the bulb by Tuya port 6668. See `puzzle2-system-power/SETUP.md` |
| DHCP (was .125) | P2 hallway camera, Tapo C200 "NexusCam", MAC C0-06-C3-AF-97-F5. No reservation: this router has none, so `signup/camera.js` finds the camera by its ONVIF port 2020. See "Hallway camera" in `puzzle2-system-power/SETUP.md` |
| 192.168.0.100-249 | everything else, from the router's DHCP: the 7 laptops, the phones. The hub's laptop has no fixed IP; every page finds it by searching the network |

- The ESP32s only know NexusV (the walawifi/secretwifi backups were removed 2026-10-04, when the secrets went into the public repo). The laptops must be on NexusV.
- **Network → LAN** (checked 2026-10-02, leave as is): IP 192.168.0.1, mask 255.255.255.0, DHCP Server, start 100, 150 addresses (so .100-.249, clear of .50-.53), lease 1440 min.
- **Network → Wireless, Advanced Setting** (checked 2026-10-02): bandwidth 20 MHz, channel 6, Tx power 100%, Maxassoc 256, FRAG 2346, RTS 2347, Rekey off, **Isolate off** (must stay off, or nothing can reach anything), WMM on, Shortgi on.
  - To do: **turn WDS off** (only for linking to another router or extender). Set Country to Philippines if it's listed (China also allows channels 1-13).
  - On setup day, at the venue: `netsh wlan show networks mode=bssid` on a laptop, then set the channel to whichever of **1, 6, 11** has the fewest networks.
- **Network → Wireless, basic section** (not checked yet): 2.4 GHz on, SSID `NexusV` visible, security **WPA2-PSK AES** (not WPA3-only, not open), password exactly as in `secrets.h`.
- **System** (to do): change the admin password from the default, turn off any scheduled reboot, back up the configuration to a file.
- **Every laptop:** join NexusV and set it to **Private network** (Settings → Network & internet → Wi-Fi → NexusV). On a Public network Windows blocks incoming connections, so nothing reaches the hub or the signup PC. On the hub laptop, allow Node.js through Windows Firewall for Private networks when asked.
- Quick check: power the router, then the boards (their red LEDs go off). `curl.exe "http://192.168.0.50/level?v=255"` lights the mask's eyes, `http://192.168.0.51/code?v=555` makes the beacon blink.

---

## PUZZLE 1: BRAIN UPLOAD
No AIs (staff) involved.

**Flow**
1. Players open a video: a man says "THE PASSWORD IS BINARY" as Aurora catches him.
2. Players open a binary translation sheet (digits 0-9 in 4 bits).
3. Players notice the desktop wallpaper ("Think outside the box") and drag the cursor off the right edge of the screen.
4. The cursor appears on the projected wall (laptop is in extended display mode, projector positioned to the right).
5. Hovering the cursor over a physical mask mounted on the wall makes its LED eyes glow dim blue.
6. Clicking the mask makes the eyes go full brightness and plays an "UPLOADING..." animation on the projection.
7. Four random 4-bit binary groups appear (e.g., 0101 0011 1000 0010).
8. Players decode each group using the sheet (e.g., 5, 3, 8, 2).
9. Players enter the resulting 4-digit code.
10. Correct code triggers "UPLOAD COMPLETE" and advances the team to Puzzle 2.

**Materials (during the game)**
- Physical mask prop
- Printed binary sheet (backup for the digital file)
- Files on laptop: Aurora video, binary translation sheet, "Think outside the box" wallpaper
- Projected HTML page: hover detection, click detection, upload animation, code check, reset function, hidden calibration mode for repositioning the hotspot over the mask
- Mask electronics (hidden behind/inside the mask):
  - ESP32 DevKit with sketch (Wi-Fi client, PWM control on GPIO 25)
  - Protected 18650 Li-ion cell in holder
  - TP4056 charger module (with DW01+8205A protection)
  - MT3608 boost converter, set to exactly 5.0V (verify with multimeter before connecting ESP32)
  - Slide switch
  - 2x blue LEDs + 2x 120Ω resistors
  - 2N2222/PN2222/2N3904 NPN transistor + 1kΩ (base) and 10kΩ (pulldown) resistors
  - Breadboard, jumper wires, small hidden enclosure
  - Diffusers (ping pong balls or translucent plastic) behind the eyeholes

**Setup notes**
- Laptop: sleep/lock disabled, no taskbar blocking the right screen edge.
- Mask ESP32 joins the same local router as the rest of the room.
- Binary code is generated once per session (not re-randomized per click) so it stays in sync with the answer check.
- Manual fallback key on laptop to force the glow+reveal sequence if click/Wi-Fi fails.
- Reset key/routine to clear state between teams.

**Hint ladder**
1. "Aurora's reach goes beyond the screen."
2. "Try moving the mouse past the edge of the desktop."
3. "Look to the right of the laptop."
4. "Click the mask."
5. "Use the sheet to translate each group of 4 bits."

**Still open / undecided**
- Exact input method for the 4-digit code (on-screen box vs. physical keypad).
- What the correct code physically triggers to move the team into Puzzle 2's hallway.

---

## PUZZLE 2: SYSTEM POWER
3 AIs (staff members in masks/costumes), takes place in a long hallway.

**Flow**
1. Players enter the hallway and head to a laptop at the far end. The 3 AI staff wait at the opposite end.
2. The laptop shows a draining energy meter and a word-typing challenge.
3. Players type displayed words to add energy; words auto-complete on correct entry (no need to press Enter to submit, to avoid conflicting with the light-control key).
4. Word difficulty adapts based on the player's last 3-5 words: fast/accurate typing brings harder (higher-reward) words; slow/inaccurate typing brings easier words. Difficulty change is gradual, not a hard swing off one word.
5. Players hold down a large plush "Enter" key (USB keyboard `VID_1C4F&PID_0002`; it sends Numpad Enter, which the game tells apart from the laptop's Enter) to keep the hallway light (a Tuya RGB bulb) ON. Releasing it turns the light off (leaving only a dim red glow).
6. AIs freeze in place while the light is on; they slowly advance toward the players while it's off.
7. Energy meter drains slowly when the light is off, and faster while the light is held on — this is the core resource-management tension.
8. At low energy: meter pulses, the bulb flickers red as a warning.
9. At zero energy: the key stops working, the bulb fades down to the dim red glow, and the main light stays off for that team.
10. If an AI reaches a player (tap on shoulder = "caught"), the team is sent to the next room with a penalty (specifics TBD).
11. On reaching the (TBD) win condition, "SYSTEM POWERED" plays, light stays on, AIs stop, team advances to the next puzzle.

**Materials (during the game)**
- Laptop with game logic: adaptive word-difficulty engine, energy meter, key-hold detection (down/up events, not just a tap), low-energy audio/visual warnings, GM-adjustable settings (drain rates, difficulty curve), reset function
- Big plush "Enter" key (USB) — needs testing for reliable detection when held for 10-20+ seconds; taped/weighted so it doesn't slide when hit
- 3x AI masks/costumes for staff
- Light system: a Tuya RGB smart bulb in a plug-in lamp holder, mounted high in the hallway (replaces the old ESP32 + WS2812B strip plan; no soldering). **Full setup, bulb data points, light states, bridge spec and status: [puzzle2-system-power/SETUP.md](puzzle2-system-power/SETUP.md).**
  - Status 2026-10-02: the bulb is paired to NexusV, its local key fetched, and the bridge built and tested live (light on = **green**, off = dim red glow). The router can't reserve addresses, so the bridge now finds the bulb by itself (port 6668); this hasn't been tested with the lamp on yet. Still to do: that test, set the power-on behaviour, run the offline test.
  - `puzzle2-system-power/bulb_bridge.py` runs on the hub laptop. It joins the hub as device `strip`, so the GM status dot and the SAFE / FINALE RED scenes work unchanged, and it drives the bulb with TinyTuya over the local Wi-Fi.
  - `lights(state)` in `game.html` sends `{t:'cmd', to:'strip', a:'p2', v:state}` through the hub.
  - The bulb's ID and local key live in `puzzle2-system-power/devices.json` (in the repo). The dev copy and test scripts are in `C:\Users\user\PycharmProjects\Lights`.
- Tape/cable covers to keep the hallway floor clear and safe
- Floor marks for AI start line and player start line
- Spare: a second bulb of the same model is optional. It needs its own pairing and its own local key

**Design decisions locked in**
- Hold-to-light (not toggle, not timed burst): simpler logic, gives one player a clear "light holder" role.
- Laptop is the single source of truth/logic. The bulb bridge only executes light commands and has a fail-safe default.
- The bulb reacts in a fraction of a second, slower than an LED strip, so `on` is a straight switch with no fade-in. Test the delay between the key press and the light on site.
- The bridge sends only the newest state, at no more than 5 commands per second (the bulb drops the connection above 10 per second).
- Fail-safe: if the bridge hears nothing from the hub for 3 s, it sets the bulb to full white. If the bridge itself dies, the bulb keeps its last state, which at worst is the dim red glow, never total dark. Staff then switch the lamp off and on: the bulb's power-on behaviour brings it back white.

**Safety requirements (important, non-negotiable)**
- Floor must stay clear, all cables taped down.
- A dim safety/emergency light should remain on at all times, even during "dark" phases — true blackout is a trip hazard.
- Staff AIs must follow a strict no-grabbing rule; a light tap only.
- Players are told to walk, not run.
- Start distance between AIs and players must be set so no team can be caught in the first few seconds.

**Still open / undecided**
- Exact win condition (e.g., total words typed, survival time, or reaching a marked point in the hallway).
- ~~Specific penalty for getting caught.~~ Decided: the team still advances, but loses 15 POWER (see CARRIED RESOURCES).
- Hallway length: is one bulb bright enough for the whole hallway? If not, add a second Tuya bulb. The bridge would send every command to both bulbs. The 10-per-second limit applies to each bulb separately.

---

## CARRIED RESOURCES (what games 1-4 hand to the finale)
Replaces the old single Core Integrity % (decided 2026-09-28). Each game leaves behind one named resource (0-100), and the finale must use each one for a different mechanic that players can see. A single % felt like a score. Three named things feel like consequences.

| Resource | From | How it's computed (knobs in that game's CFG) | Players see it during the game |
|---|---|---|---|
| **SYNC** (higher = better) | P1 Brain Upload | 100 - 8 per wrong code - 12 per attack not mashed through in time, min 20 | `SYNC xx%` in the finale HUD drops each time a mash times out. The end line reads `SYNC xx%` |
| **POWER** (higher = better) | P2 System Power | energy left at 30 s. Caught: energy - 15. Grid lost: 0. Every ending now advances the team | a tutorial line: "whatever power is left comes with you." The end line reads `POWER RESERVE xx%` |
| **TRACE** (lower = better) | P3 Hidden Signal | the trace bar % at the win (bar fills over the 5:00 hunt; time-up = 100). Wrong code +5% | the AURORA TRACING YOU bar jumps on each mistake. The end line reads `TRACE xx%` |
| **HUMAN** (lower = better) | P4 Orbit Lock | 10 + 10 per missed shot + 0.4 per second past 30 s in each layer, max 100 | the HUMAN ERROR DETECTED meter jumps on every miss, and Aurora says "Machines don't miss." The end line reads `HUMAN xx% ▸ n MISSED` |

- The hub (`hub/server.js`) keeps `{sync, power, trace, facts}` for the one team in the room. `null` = sector not played (staff skipped it).
  - Games send `{t:'result', k, v, facts}` when they end. Staff replays (Ctrl+Alt+W) don't send it.
  - GM sends `{t:'adj', k, d}` and `{t:'newteam'}`.
  - Pages receive `{t:'run', ...}` on connect and after every change.
- Facts (for the dossier): `breached` "3/4", `p1wrong`, `note` (P1); `grid` HELD/LOST/CAUGHT, `wpm`, `acc`, `best` (P2); `p3wrong`, `time` "m:ss" (P3); `misses`, `shots` (P4).
- **GM panel** (`hub/public/gm.html`, at `http://<hub>:3000/`, one laptop screen, calm version of the game HUD; simplified 2026-09-29, re-laid out for readability 2026-10-04: no scanlines, one colour per state everywhere: grey = locked/waiting, white = ready, amber = playing now, green = done, red = needs you; it only rewrites text that changed):
  - Top: team name, run clock, NEW TEAM, FINISH RUN, RESET ALL ROOMS, LIGHTS ON (the SAFE scene). Under it a **progress strip**, one step per game (01-04 + 05 FINALE): green ✓ with its time when done, amber with the running time where the team is now.
  - Details: NEW TEAM (clears the resources, starts the clock), run clock (amber at 75% of `LIMIT_MIN`, red past it), FINISH RUN (stops the clock, saves the run, ends the finale), RESET ALL ROOMS (the current run starts over: every room reloads to its start, scores, splits and the finale are wiped, and mid-run the clock restarts from 0 with the same team; after FINISH RUN it just clears the team). The hub only restores a saved finale after a restart if a team is mid-run, so a staff test (Ctrl+Alt+E with no team) never comes back on boot.
  - One card per room (coloured left edge = its state): OFFLINE / LOCKED / READY / PLAYING / CLEARED with a plain line under it (WAITS FOR ROOM 02, TIME IN THIS ROOM, DONE IN 3:12), the live stat bar, the ANSWER (P1, P3), TO THE FINALE (the carried resource) with one HINT button that names its cost (-5 SYNC/POWER, +5 TRACE/HUMAN), and the remote staff keys: P1 FORCE CAPTURE, RESET; P2 UNLOCK, CAUGHT, RESET; P3/P4 UNLOCK, FORCE WIN, RESET. During game 5 each room's F key skips that room's finale step. Every other staff key stays on the room's own laptop.
  - **Game 5 card** (bottom left): the finale's step in plain words (SHE'S TALKING, GO TO THE MAP, HER TASKS, BACK TO THE MAP, BRIEFING, KILL SWITCH, SHE'S DEAD) with what staff should expect, the kill window, each task's room and progress with a DONE button, the kill switch's ready lights and misses, and one SKIP button for the current step (SKIP HER DIALOGUE, START HER TASKS, START THE BRIEFING, SKIP THE BRIEFING, FORCE THE KILL). SKIP and DONE go through the hub (`{t:'finskip', task?}`), so they work even when that room's laptop is down; the room screens follow.
  - Bottom middle: the LINE box. Bottom right: run history (✓ = under the limit, FINALE ✓ = game 5 finished) and the beacon phone URL.
  - **Device lights** (added 2026-10-02): green = answering, red = not (beeps once and flashes its room card), grey = can't tell right now (e.g. the room laptop that reports it is offline). Click one for what to check. Whatever already talks to a device reports it:
    - Header: HUB, SIGNUP (the GM reaches the signup server), KIOSK↔HUB (the kiosk page is in the hub roster as `signup`) and TV BOARD (optional, grey when closed). (DOSSIER is gone with room 5.)
    - P1 card: MASK. P1's 2 s eye resend reports whether the mask answered in the last 5 s (`status.mask`).
    - P2 card: BULB and CAMERA. The bulb bridge (device `strip`) probes the bulb with a read-only `status()` every 10 s when idle, and answers the hub's 1 s ping with `{t:'status', v:{bulb, ip}}`. The signup server runs `camera.js url` (it finds the camera) and pings go2rtc every 15 s, and adds `camera: {ip} | {ip: null} | {error}` to `/api/state`.
    - P3 card: IR BEACON. P3's 3 s code push reports the board (`status.boards`: true / false / 'none'). A phone stand-in in the roster (`beacon-sim`) also counts as green.
    - P4 card: CONTROLLER. The GM page pings the board itself every 2 s (`http://192.168.0.52/`, `?ctrl=` overrides), so the light works with the P4 game closed. Green = it answers on NexusV (and, if the P4 laptop is online, the game gets its readings: `status.ctrl`, over `status.ctrlVia` Wi-Fi/USB). Red = not answering (the hint says if the game is limping on the USB backup), or answering while the game gets no readings (reload the game).
  - **LINE box** (from the signup kiosk, `SIGNUP` in gm.html = `http://<hub host>:4000` by default; set the signup PC's IP if it runs elsewhere). It polls `GET /api/state` every 2 s and shows SOLD x/400, the groups left today, the group IN BOOTH with its player photos, the CALLING groups with the grace countdown, and the next 3 booked groups.
    - Buttons: CALL, SEND IN, NO-SHOW (POST `/api/status` with a text/plain body, so there's no CORS preflight; no PIN is needed).
    - **SEND IN** marks the group `in` on signup and starts the hub run with its team name, so nobody retypes it. FINISH RUN also marks that group `done`.
    - If signup is down, type the team name + NEW TEAM instead. No server changes were needed.
  - Sounds (click the page once to turn on): a low beep and a flashing card when a room is silent for 3 s, a chime when a room is cleared.
- GM protocol:
  - Game pages send `{t:'status', v:{mode, unlocked, stat, code, mask, boards, rings}}` every second (each page sends only its own fields). The hub relays it to the GM panel only (pages whose id starts with `gm`; the room laptops don't need each other's), without logging, and sends the latest to a GM panel on hello. The hub's log lines stay in its own window. Every finale change (`{t:'fin', ...}`) also goes to the pages, for the GM's game 5 card.
  - `{t:'cmd', to:'puzzle3', a:'key', v:'KeyU'}` makes that page act as if Ctrl+Alt+U was pressed (every game dispatches it to its own key handler). Keys are never stored or replayed.
  - `{t:'newteam', team}` sets `run.team/t0`. The first `pNdone` evt of a run stores `run.splits.pNdone` (ms from t0). `{t:'finish'}` sets `run.end`, appends the run to `hub/runs.jsonl` (`RUNS` env var overrides) and broadcasts `{t:'history', runs}` (last 30, also sent on hello). `run` messages carry the hub's `now` so the GM clock ignores its own device's clock.
  - Puzzle 1 now keeps a persistent hub connection (id `puzzle1`) and queues its result/`p1done` until the hub is reachable.
- **Intruder dossier** (`hub/public/dossier.html`, at `http://<hub>:3000/dossier`, Space to play). The opener of the finale: puzzle 1's PROFILE ▸ INTRUDER box comes back, filled with this run's facts. Points Aurora scored show in green. The three bars follow, then Aurora taunts with the worst two facts (caught > grid lost > attacks she held > trace 70+ > guessing). A clean run gets "...who are you?". Self-check: `dossier?test`.

**Rules for the finale (whatever it becomes):**
- Each resource drives one mechanic the players can see. For example: POWER = the starting charge of the main bar, SYNC = how forgiving the controls or timing are, TRACE = how early and how often Aurora attacks.
- Show where each effect comes from on screen ("POWER 36% ▸ FROM SECTOR 02").
- `null` counts as 50. Floor the effective values at 10 so every team can still finish.
- Don't make earlier-game details the *answer* to a puzzle. Players panic and won't remember them. Use carried facts only for display and difficulty.

Story thread: intercepting Aurora's hidden carrier signal (P3) exposes her heartbeat. Shooting a laser through her shield rings into that heart (P4) breaks her core open, and she gets out through the crack. The team thinks she's dead (P4's fake win), then she crashes back into every computer in the booth (P5), and the team purges her room by room.

---

## PUZZLE 3: HIDDEN SIGNAL (replaces Signal Tuning)
Quiet and observational. **5:00 hunt.** No AIs. The lateral jump: IR light is invisible to eyes but shows on phone cameras. Staff setup + wiring: `puzzle3-hidden-signal/SETUP.md`.

**Flow** (`puzzle3-hidden-signal/game.html`, started with its `start.bat` on port 8002, same look as Puzzles 1-2)
1. Standby "CARRIER OFFLINE ▸ AWAITING UPLINK" until Puzzle 2 sends `p2done` through the hub, then "PRESS SPACE TO START SEQUENCE".
2. The CRT boots red. An intro terminal explains: Aurora broadcasts from inside this room; find the transmitter, 3 lights numbered 1 to 3; each light blinks its digit, one after another; 5 minutes.
3. Aurora (green): "You'll never see it. Human eyes are so... limited." The hunt screen shows a live carrier scope, 3 code cells and an "AURORA TRACING YOU ▸ m:ss LEFT" bar that fills over 300 s.
4. The board (3 IR LEDs in a row, labelled 1-3) is hidden. Players find it through their phone cameras. There is no decoy (dropped 2026-10-03: no spare ESP32).
5. Pattern loop: light 1 blinks digit 1 times (250 ms on / 350 ms off), 1 s pause, light 2 blinks digit 2 times, light 3 blinks digit 3 times, then 3 s dark, repeat. Digits 1-5 only.
6. A wrong code pushes the trace bar +5% and locks input for 2.5 s. During the hunt the screen fades much darker (`CFG.DIM` = 0.65, a black overlay) so its glow doesn't wash out the IR. Hints **glitch onto the screen** (text tears in with jitter, scrambled letters and RGB split, then vanishes, and repeats every 8-13 s): 100 s "THE DARKER IT IS, THE EASIER YOU'LL SEE", 190 s "USE YOUR FRONT CAMS".
7. A correct code corrupts Aurora's voice, the scope turns into her green heartbeat (the lead-in to Puzzle 4), then "SIGNAL INTERCEPTED".
8. At 5:00 time is up: "TRACE COMPLETE", TRACE = 100, and the team still moves on. Both endings send `p3done`.
9. A new code is rolled on every reset (Ctrl+Alt+R reloads), so finished teams can't leak the answer.

**Staff keys** (Ctrl+Alt+): H help (shows code, board + hub status), U unlock, S start, K skip intro, I next hint now, F force the correct code, R reset, W replay win, M mute.

**Before the parts arrive**: open `http://<hub IP>:3000/beacon` on a phone (3 white lights). It gets the current code from game.html through the hub and blinks the same pattern as the ESP32. This uses visible light, so it tests the counting, not the camera trick.

**Materials**
- 1 ESP32 (`puzzle3-hidden-signal/beacon_esp32/beacon_esp32.ino`): static IP 192.168.0.51, same network as the mask: NexusV). 3 IR LEDs (940 nm) on D32/D33/D25 sharing ONE 120R (or 2 x 120R = 60R) from their joined short legs to GND (safe because only one IR LED is ever lit), plus a red "not on Wi-Fi" LED on D27 with its own 120R, as on the mask. USB power bank.
- game.html sends `GET /code?v=<code>` every 3 s. Without Wi-Fi the board keeps blinking its last code.
- Before the board exists, a phone on `/beacon` stands in.
- Camera caveat: many iPhone rear cameras filter IR; the selfie camera usually sees it. Test staff phones and keep a known-good loaner.

**Hint ladder** (auto: glitched onto the screen; GM can say them too)
1. "The darker it is, the easier you'll see."
2. "Use your front cams."

---

## PUZZLE 4: ORBIT LOCK (replaces the Reverse Turing Test, 2026-10-02)
Screen plus **two ring controllers** (an ESP32 + one B100k pot each, each on its own USB cable); the keyboard does the same job as a backup. About 2-4 minutes, the whole team at once. Puzzle 3 ended on Aurora's heartbeat ("...that's my heart. don't you dare."). Here the team shoots it. Her heart sits in the middle of the screen behind **two concentric shield rings**, and each ring has one gap. A laser emitter sits on a rail at the bottom. The team turns both rings until **both gaps line up with the laser**, then fires. A hit that reaches her heart breaks one layer. **4 layers.**

**Flow** (`puzzle4-orbit-lock/game.html`, started with its `start.bat` on port 8003, same CRT look as Puzzles 1-3)
1. Standby "CORE GATE LOCKED ▸ AWAITING UPLINK" until Puzzle 3 sends `p3done`, then PRESS SPACE.
2. The red CRT boots over her beating green heart. Intro terminal: her heart is behind two shield rings; turn the rings and line both gaps up with the laser; outer ring A / D, inner ring ◄ / ►; hold SPACE to charge, it fires when full.
3. Each layer opens with a ctOS-style banner (`LAYER 2 / 4 ▸ DRIFT`, "NEW HANDS ON THE CONTROLS" from layer 2 on, so roles rotate), then Aurora's line at the top.
4. Controls: the controller's two knobs (keyboard backup: **A / D** turn the outer ring, **◄ / ►** the inner ring) (a tap is fine-grained, holding speeds up). **Each ring behaves like a potentiometer** (decided 2026-10-02, so the keyboard plays the same as the knobs will): it follows its knob degree for degree over `POT_DEG` (300°, B100k pots) and stops dead at both ends with a clunk, and it stays where it was left between layers. Each layer rolls a new ring offset, so the gap lines up at a new knob position, at least a quarter turn from where the knob sits and never within 8% of an end stop. Aurora's drift and the moved emitter are kept inside that range too, so every target can always be reached. A small pot gauge per ring (bottom right) shows where its knob sits. **Hold the two fire wires together** (or hold SPACE) for 0.9 s to fire (letting go early drains the charge). After a shot the emitter vents for 1.3 s. A ring whose gap covers the beam path clicks and shows `● LOCKED` (bottom right). **The laser** (redesigned 2026-10-03, the old small emitter was hard to find): an iris eye riding a neon rail, with two prongs aimed at her heart, profiler brackets and a `YOUR LASER` tag. It glows, sends a sonar ping every 1.5 s while idle, and its iris opens as it charges. A **laser sight** shows what a shot would hit right now: a live line to the first thing in the way with a hot dot where it lands, white when the path to her heart is clear and red when blocked. The tag says `● CLEAR: HOLD SPACE` or `✕ BLOCKED: OUTER RING / INNER RING / WATCHDOG`, then `CHARGING n%` and `VENTING...`. When she moves it (layer 4), it slides along the rail with a white streak.
5. Layers (`CFG.ROUNDS`):
   | Layer | Gap | Twist |
   |---|---|---|
   | ALIGN | 50° | static rings |
   | DRIFT | 42° | Aurora turns the rings herself (20°/s, changing direction) |
   | WATCHDOGS | 38° | + 2 watchdog drones patrol (one outside the outer ring, one between the rings); a watchdog in the path eats the shot |
   | OVERRIDE | 34° | + drift 22°/s; she moves the emitter along its rail at the start and after every miss |
6. A miss: the beam sparks off the ring wall (the struck spot glows white-hot and cools) or a watchdog flares `▲ INTERCEPT`. +10 HUMAN, Aurora quips ("Machines don't miss.").
7. A hit: her heart flares, a shockwave goes out, one of her 4 integrity arcs goes dark, cracks spread, and her heartbeat speeds up (60 → 115 bpm).
8. No team gets stuck: at 25 s into a layer its hint glitches onto the screen (Puzzle 3's tearing hint, repeats every 8-13 s); at 55 s her shields slip (gaps widen 14°, drift halves, "...my shields are slipping.").
9. Last hit: the beam doesn't stop, her heart cracks open, both rings and the watchdogs shatter, white flash, CRT off → CORE BREACHED / "HER HEART IS EXPOSED" / Aurora: "that didn't kill me. it let me out." (the lead-in to the finale) → `result` (HUMAN, misses, shots) and `p4done` to the hub.

**HUMAN** (lower is better) = 10 + 10 per missed shot + 0.4 per second past 30 s in each layer, max 100. Live on the HUMAN ERROR DETECTED meter (bottom left).

**Staff keys** (Ctrl+Alt+): H help (layer, misses, hub status, each controller's status + live mV), P pair one more ring controller, U unlock, S start, K skip intro, I this layer's hint now, N clear this layer (lines up a clean shot and fires), F force the win (jumps to the last layer's hit), R reset, W replay win, M mute. N and F work while a layer is being played. The GM panel keeps UNLOCK / FORCE WIN / RESET.

**Tuning knobs** (`CFG` in the page): ROUNDS (gap, drift, dogs, move, line, hint per layer), POT_DEG (match the real pots), POT_MV (pot calibration), TURN (keyboard knob speed), CHARGE_MS, COOLDOWN_MS, START, MISS_D, PAR_S, SLOW_PER_S, HINT_AT, ASSIST_AT, ASSIST_DEG, BEAT_VOL.

**Look:** all canvas. Glow comes from pre-blurred sprites drawn with `lighter` (no `shadowBlur`, no CSS filters), and the rings are pre-rendered once per layer and only rotated, so the projector laptop keeps 60 fps. Performance pass on 2026-10-03 (the user found it laggy), measured in headless Edge: GPU work −58%, raster −70%, style recalc −64%. The fixes: the CRT flicker is a thin black veil (`#flick`) instead of blinking the whole screen's opacity; the grain slides with `transform` instead of `background-position`; no dashed lines are drawn per frame (the heart's two spinning dashed rings are pre-drawn images, the rail is in the static backdrop); sparks are stroked in about 20 batches instead of one stroke each; HUD text is only rewritten when it changes; and the canvas resolution is capped by `CFG.CANVAS_DPR` (1) on 125%/150% scaled screens. This page's CRT edge shadow is lighter (7vw, .8) than puzzles 1-3 so the laser at the bottom still shines. The beam is 4 stacked strokes plus 2 coiling strands and energy pulses racing down it; impacts spray sparks. Aurora's side (heart, watchdogs, radar sweep, data packets) is green; the players' side (rings, emitter, laser) is red.

**Sound slots:** `sounds/core.mp3` (loops until her heart breaks), `sounds/win.mp3`, `sounds/aurora-voice.mp3` (optional blip). One-shots that replace the synthesized laser sounds when present: `fire.mp3` (on release, ~0.4 s), `deflect.mp3` (70 ms later, a ricochet), `doghit.mp3` (70 ms later), `hit.mp3` (70 ms later, ~1.3 s), `shatter.mp3` (final hit +1.4 s, ~1.5 s). The heartbeat thump is synthesized (`BEAT_VOL`).

**The controller** (one board since 2026-10-04; it replaced the two separate ring controllers of 2026-10-02. Staff guide + wiring: `puzzle4-orbit-lock/SETUP.md`): **one ESP32 DevKit on a breadboard** wired on **one side only** (the VIN side, decided 2026-10-04, since the board covers the other side's holes): both **B100k** linear pots (outer wiper on **D34**, inner on **D35**, + ends on **D32** switched HIGH as a 3.3 V supply, − ends on GND), **two loose fire wires** (D13 and GND, each through a 1 kΩ resistor so a stray touch is harmless; players touch the free ends together and **hold** = hold Space, decided 2026-10-04), and a **1.3" I2C OLED** (blue board, "1.30' IIC V2.2" on the back = **SH1106**; pins in the order **VCC, GND, SCK, SDA**: VCC from **D25** (switched HIGH at full drive strength), SCK **D27**, SDA **D26**; FIRE shows with a blinking frame, never an all-white flash, to keep the pin's current low; U8g2 library, an SSD1306 is a one-line swap) that shows a spinning circle while waiting (faster while the wires touch) and **FIRE** for 1.2 s on every shot, plus a **red LED on D33** (120 Ω): like the mask and the beacon, **on = not on NexusV**, off once connected. On **NexusV at 192.168.0.52** (static, `secrets.h`, same pattern as the mask and the beacon; decided 2026-10-04), USB kept as a backup. Sketch `controller_esp32/controller_esp32.ino`: averages 32 readings per knob, smooths, ignores changes under 3 mV, bridges wire flicker shorter than 120 ms, and sends `ORBIT <outer mV> <inner mV> <wires 1/0>` every 20 ms: as a Server-Sent Events stream on `http://192.168.0.52:81/` (up to 3 listeners, CORS open) and on USB at 115200 baud. The screen runs on the ESP32's other core so drawing never delays the readings. game.html reads the stream with `EventSource` (`CFG.CTRL_IP`, `?ctrl=` overrides; reconnects by itself) and, as a backup, **Web Serial** (pair once per laptop with **Ctrl+Alt+P** in the start.bat kiosk window). On every shot it really fires it calls `http://192.168.0.52/fire` and writes `FIRE` over USB, so the screen never shows FIRE for a shot the game didn't take. `CFG.POT_MV` = the mV at each knob's [left stop, right stop] (swap them to reverse a ring). While it talks, the knobs and wires drive the game and the on-screen legend says KNOB / KNOB / WIRES; 0.6 s of silence and the keys take over (A/D, ◄/►, Space) and the legend and intro switch back to the keys. The GM panel shows one CONTROLLER light (`status.ctrl`, plus `status.ctrlVia` = Wi-Fi or USB). Compiles against ESP32 core 3.3.11 + U8g2 2.37.1; driven in headless Edge with a simulated controller (hold the wires = charge + fire + `FIRE` sent back; a 60 ms brush doesn't fire). Not yet tried on the real breadboard or screen.

**Laser strip** (built 2026-10-03, staff guide: `puzzle4-orbit-lock/SETUP.md`): a **Govee H6143** (5 m RGBIC, 15 segments, 12 V) along the wall behind the screen.
- **Bluetooth, not Wi-Fi.** Its firmware 1.08.06 has no LAN Control. While it was being set up it had joined the upstream 192.168.1.x network instead of NexusV. `laser_bridge.py` (Python + `bleak`) runs on the **P4 laptop** (started by `start.bat`), finds the strip by its name `ihoment_H6143_*` (BLE A4:C1:38:26:71:49), keeps it alive (ping every 1 s), and reconnects forever.
- **The game calls it directly**, with no hub: `GET http://localhost:8013/fx?v=idle|charge|cancel|hit|miss|dog|win|off` (fire and forget), plus `/status` for the Ctrl+Alt+H panel (`CFG.LASER`).
- **Protocol** (community reverse-engineered): 20-byte packets, `33` + command + payload, XOR checksum last. Power `33 01 01`, brightness `33 04 ff`, keepalive `aa 00`.
- **Colour only works through the segment command** `33 05 15 01 r g b 00 00 00 00 <mask lo> <mask hi>` (bit n = segment n+1). The plain `33 05 02 r g b` loses green on this strip.
- **Speed, tested on the strip:** confirmed writes take ~90 ms each; unconfirmed writes are faster but skip under ~40 ms. So the beam is a bar that extends from the emitter end in 5 groups of 3 segments, 50 ms apart.
- **Damaged LEDs:** some lose green/blue (pink or red where white should be), so every effect stays in reds and white.
- **Effects:** charge = dim to bright red over 0.9 s; hit = full beam, white burst, cool down; miss/dog = half beam, red sputter; win = full beam, strobe, white burn.
- Driven end to end with the real strip on 2026-10-03; the user watched only the stand-alone `test` run.

**Later:** more rings for more players.

**Self-check:** `game.html?test` (gap/wall/watchdog hit order, emitter rail, layers never start lined up, every target reachable between the end stops under drift and emitter moves). Driven end to end in headless Edge on 2026-10-02: all 4 layers, a ring miss, a watchdog intercept, and the hub got `human` + `p4done`. Not yet played by real people: the gaps, drift and 55 s assist need a dry run.

---

## PUZZLE 5 (FINALE): EVERYWHERE AT ONCE (built 2026-10-04)
Room 5 is cut. Game 5 starts on the **room 4 laptop, right after game 4**, then takes over every room's laptop. One team in the booth at a time. All of it is `hub/public/boss.js`: every room page loads it from the hub when it connects (`bossLoad()`), and it sleeps until the hub starts the finale. The hub owns the state (`FIN` and `fin()` in `hub/server.js`), so a reloaded laptop rejoins where the finale is.

Booth layout (the user's floor plan): room 1 bottom right (entrance, projector), game 2 = the hallway along the bottom (its laptop and the plush key at the left end), room 3 top middle, room 4 on the left with the EXIT, HQ top right. Rooms are divided by tarps, so shouting carries.

**Flow**
1. **Fake win (room 4).** Game 4's last hit plays `AURORA TERMINATED ▸ NEXUS RESTORED`, "...it's so... quiet.", then `SAVING RESULTS TO NEXUS` stalls at **97%** (`CFG.BOSS` in game 4; `false` = game 4's own CORE BREACHED ending).
2. **Crash (room 4).** Silence, the frame stutters, static, black. Aurora talks in an **Undertale box** (black, thick white border, pixel font, `* ` lines, her portrait): "did you really think that was it? ... i live in ALL of them." The box tears apart.
3. **Takeover (every room at one hub time).** Every screen flips green with AURORA, the hallway bulb goes green. Room 3 blares a siren: `TRACE HER ▸ PRESS SPACE`. Room 4 locks: `LOCKED ▸ GO BACK TO SECTOR 03`. Rooms 1 and 2 show `INFECTED`.
4. **The map (room 3).** Space: a sweep crosses the floor plan and pins her in rooms 1, 2, 4. Those laptops blare `SHE'S HERE ▸ PRESS SPACE WHEN YOU'RE HERE` (the siren stops when someone arrives). The map shows each room's progress live.
5. **Tasks** (screen + keyboard; the room 4 one uses game 4's knobs):
   | Task | Room | Play | Score sets |
   |---|---|---|---|
   | BINARY | 1 | decode each 4-bit group into its digit; the table is on screen; a wrong digit re-rolls that group | SYNC: 2 / 3 / 4 groups (70+ / 40+ / less) |
   | WORDS | 2 | 5 rounds of one really difficult word; a wrong letter is refused | POWER below 50: game 2's hardest tier, else the one below |
   | CROSSHAIR | 4 (never moves) | outer knob = left/right, inner knob = up/down (A/D, W/S stand in); hold the crosshair on her green dot 0.9 s, 5 catches; she dodges, stalls now and then, tires after 20 s | HUMAN: her speed |
   The first task finished makes her jump: **rooms 1 and 2 trade tasks** once, progress kept (`SHE'S MOVING`). A finished room goes red: `PURGED`, then `STAY HERE ▸ SHE'S STILL IN SECTOR ...`.
6. **Regroup.** All three done: every room says `BACK TO THE MAP`. At the map: `SHE'S CORNERED ▸ EVERYONE BACK HERE ▸ THEN PRESS SPACE`.
7. **Briefing (room 3).** Undertale box: "you can't kill me from one room." Then the players' red terminal: one person in rooms 1, 2 and 4, everyone else counts down out loud at the map, on zero SPACE (rooms 1, 4) / the big ENTER key (room 2).
8. **Kill switch (rooms 1, 2, 4).** Each room's first press = ready (the map shows `01 02 04`). When all three are ready the map says `COUNT IT DOWN ▸ 3 · 2 · 1 · NOW`. The three presses must land within the window: **TRACE** sets it, 1.0 s at TRACE 0 down to 0.4 s at TRACE 100, +0.3 s per miss after the 2nd. Each laptop stamps its press with a clock synced to the hub, so Wi-Fi delay doesn't count. Too far apart: `OUT OF SYNC ▸ 0.84 s APART` (or `SECTOR 02 NEVER PRESSED`) on every screen, and they go again.
9. **End.** Every screen goes black at the same hub instant. Her last words type out on every screen together (soft voice): "...ah.", then the worst thing she saw this run (the dossier's facts) or "...who ARE you?" for a clean run, then "see you... next year." Her face crumbles into pixels, then `TERMINATED ▸ AURORA V OFFLINE ▸ EXIT THROUGH SECTOR 04`. The bulb turns white, the strip burns white. Staff hand out the keychains. The hub stores the `p5done` split.

**Staff:** Ctrl+Alt+F (the GM panel's FORCE / FORCE CAPTURE / SKIP (FINALE) keys) skips the current step on that laptop: the dialogue, the trace, a task, the briefing, or the kill switch itself. Ctrl+Alt+H shows the finale panel (phase, hub, clock). Ctrl+Alt+R reloads a laptop; it rejoins the finale. **FINISH RUN or NEW TEAM on the GM panel ends the finale** on every laptop (they reload into their own games). If the hub is down when game 4 ends, the save bar just finishes and the fake win stays the ending.

**Assets (all optional, in `hub/public/`, served to every room):** `img/aurora.png` her portrait (pixel art, roughly square; a placeholder face is drawn until it exists) and `img/aurora-smug.png`, `-angry.png`, `-soft.png` moods; `sounds/crash.mp3`, `takeover.mp3`, `purged.mp3`, `fail.mp3`, `end.mp3`, `siren.mp3` + `fight.mp3` (loops), `aurora-voice.mp3` (blip). Missing files fall back to the synth. `fonts/dialogue.ttf` = Pixel Operator Mono (CC0). Her lines are the `SAY` block at the top of `boss.js`; tuning is its `C` block (and `FIN` in `server.js`).

**Performance:** the page underneath is hidden (`display: none`) and its animation loop frozen. One effects canvas draws at 1/3 resolution and is scaled up with hard pixels; the rest is DOM text that only changes when the game does; CSS animates only transform and opacity. `boss.js` stays asleep (no audio, no drawing) until the finale reaches that room.

**Tested:** `npm test` in hub (finale phases, swap, kill switch judging, hub restart). Driven end to end in headless Edge across the 4 real room pages at 1280×720 and 1024×768: fake win, crash, dialogue, takeover, trace, tasks played by key presses, swap, regroup, briefing, a failed and a good kill switch, last words, end. Not yet played on the real laptops, knobs, strip or bulb.

---

## Other Game Ideas Discussed (not yet built out into full Flow/Materials)

Proposed as candidates for Puzzles 3+, roughly ordered easy → hard, meant to keep mixing quiet/thinking games with loud/physical ones and to keep some fully non-electronic as a tech-failure hedge:

1. **Memory Fragments** — Simon-style sequence game using projected flashes or physical arcade buttons/LEDs; sequences get longer each round.
2. **Corrupted Files** — Shredded/torn printed documents that players physically reassemble to reveal a clue or code. No electronics.
3. **Two Worlds** — "Keep Talking and Nobody Explodes"-style asymmetric info game: one player sees a laptop screen with symbols/diagrams "inside Aurora," the rest have a paper manual; they must communicate without seeing each other's material.
4. **The Firewall** — Taped floor grid representing a firewall with one hidden safe path (decoded from an earlier clue); wrong steps trigger an alarm/red flash. Can be as simple as a staff member manually watching and triggering a buzzer, or sensor-based with an ESP32.
5. **Hidden Layer** — UV flashlights reveal invisible-ink messages on posters/props (could even retroactively apply to the Puzzle 1 mask). Cheap, no complex electronics.
6. **Aurora's Voice** — Audio-based puzzle: recorded lines from Aurora contain buried clues (spoken numbers, reversed phrases) that players must catch and interpret together.
7. **The Finale: Shutdown** — Capstone puzzle combining pieces (digits, words, symbols) collected across all previous puzzles; requires synchronized action from the whole team (e.g., everyone pressing a button/turning a key at once).
8. **Color Filter** — Posters printed with overlapping colored inks that only reveal specific messages under certain light colors (red/blue), tying into the hallway's addressable strip or colored-gel flashlights.
9. **Shadow Alignment** — Hanging or rotating objects cast a shadow that only reads as a word/symbol from a specific angle/light position; players must reposition objects/light to align it.
10. **Prove You're Human** — A giant physical CAPTCHA (e.g., "select all cards with a traffic light" from picture cards), rules escalate each round, wrong answers show an "ACCESS DENIED" message. Comedic and on-theme.
11. **The Turing Test** — Social deduction: players chat via laptop with two hidden respondents behind a divider (one staff member, one scripted "bot"); must determine which is human to unlock a clue.
12. **Blind Navigation** — One blindfolded player is guided verbally by teammates (using a printed map of a taped floor layout) to retrieve an object while avoiding marked hazard zones. Needs a safety spotter.
13. **Glitch Hunt** — Players compare a staged room corner against a reference photo to spot deliberate "glitches" (backwards clock, altered poster, moved furniture); each found error yields part of a code.
14. **Heartbeat** — Rhythm/coordination game: Aurora plays a pulsing rhythm via speaker+light, and players split across drum pads/arcade buttons must each reproduce their assigned beat in sync.
15. **Patch Panel** — A labeled socket/cable board; clues indicate which "systems" should connect to which; correct connections light an LED, full correct set opens the next stage.
16. **Cipher Wheel** — Simple paper cipher disc (two concentric circles + paper fastener); a clue gives a shift amount, players align the wheel to decode a hidden message. No electronics.
17. **Sorting Protocol** — Logic-puzzle style: cards with names/dates/objects plus a set of exclusion/ordering rules from Aurora; correct final arrangement spells out a code. No electronics.

Rough difficulty groupings suggested:
- Easy: Prove You're Human, Color Filter, Cipher Wheel
- Medium: Glitch Hunt, Patch Panel, Shadow Alignment, The Turing Test
- Hard: Heartbeat, Sorting Protocol, Blind Navigation (coordination-hard, not solve-hard)

None of these have been finalized into full Flow/Materials writeups yet — that's the next step once the club picks which ones to build.

## Reference image
An image of a plush oversized USB "Enter" key was shared as the physical prop candidate for Puzzle 2 (the key players hold down to keep the hallway light on). It has a USB connector and, per the user, sends Numpad Enter (Enter with the "extended" flag, `NumpadEnter` in the browser), checked 2026-10-02, so the game listens to it alone (`CFG.LIGHT_KEY`).
