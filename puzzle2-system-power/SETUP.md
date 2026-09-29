# Puzzle 2: System Power (booth setup)

The hallway game. Players type words on the laptop to keep the power up, while one player holds the big plush Enter key to keep the hallway light on. The staff "AIs" can only move while the light is off.

The hallway light is a **Tuya RGB smart bulb** on the booth Wi-Fi (NexusV). The game never talks to the bulb directly. It sends the light state through the hub, and a small Python script on the hub laptop, the **bulb bridge**, turns each state into a bulb command.

```
game.html (P2 laptop)                 hub (GM laptop)                 bulb_bridge.py (GM laptop)            bulb
lights('on') ──WebSocket──▶ {t:'cmd', to:'strip', a:'p2', v:'on'} ──▶ device "strip" ──TinyTuya, local Wi-Fi──▶ bulb (found by port 6668)
```

## Status (2026-10-02)
Done:
- The bulb is paired to **NexusV**. Its name in the app is "Room lights". It currently has the DHCP address **192.168.0.142**.
- The local key has been fetched. The old Tuya developer account's IoT Core trial had expired, so a new developer account was used. The key is in `C:\Users\user\PycharmProjects\Lights\devices.json`.
- Local control works from the dev laptop: the red command and `rainbow.py` (both in the Lights folder).
- The plush key was identified: it sends **Numpad Enter** (`NumpadEnter`), so the game listens to it and ignores the laptop's own Enter.
- `bulb_bridge.py` is built, `lights()` in `game.html` sends to it, and `hub\start.bat` starts it. Tested live through the hub: on/off, rapid key mashing, low, boost, down, the GM scenes and the fail-safe.
- `devices.json` is copied into this folder on the dev laptop.
- The booth router has no address reservation (checked 2026-10-02), so the bridge finds the bulb by itself: on every (re)connect it knocks on Tuya's port 6668 at every address on NexusV, which takes about 1.5 s. The `"ip"` in `devices.json` is ignored. Only the "not found" path has been tested so far; the lamp was off.

To do, in this order:
1. With the lamp on, run `hub\start.bat`. The "nexus-bulb" window should print `bulb found at 192.168.0.x`.
2. Set the bulb's power-on behaviour to on / white (step 5).
3. Test with the router's internet unplugged (step 7).
4. Run the whole game with the plush key and the bulb (Test, below).
5. In the real hallway: check how long the light takes to react to the key, and whether one bulb is bright enough.

## Parts
| Part | How many | Notes |
|---|---|---|
| Tuya RGB bulb (E27) | 1 | Already owned and paired. A second bulb is optional; each one needs its own pairing and key |
| Lamp holder with a cord and plug | 1 | E27 socket with a plug, or a clamp lamp. Mount it high in the hallway |
| Extension cord, tape / cable covers | | Every cable taped flat. The hallway floor must stay clear |
| Plush Enter key (USB) | 1 | Plugged into the P2 laptop. Shows up as a USB keyboard (`VID_1C4F&PID_0002`) and sends Numpad Enter. Tape or weigh it down so it doesn't slide |

## Files
| File | What it is |
|---|---|
| `game.html` | The game. `lights(state)` sends every light change to the hub. `CFG.LIGHT_KEY` = the key that holds the light on |
| `bulb_bridge.py` | The bulb bridge. Runs on the hub laptop; `hub\start.bat` starts it when `devices.json` is present |
| `devices.json` | A copy of `PycharmProjects\Lights\devices.json`: the bulb's ID, **local key** and version (its IP is ignored). Git ignores it. Never commit it, and never copy `tinytuya.json` or `snapshot.json` here (they hold the cloud secret and the key) |

## One-time bulb setup
Steps 1-3 are done. Repeat them only if the bulb is ever removed from the app or reset.

1. **Pair to NexusV** (done).
   - The router needs internet for this step only: plug its **WAN** port into a **LAN** port on a router that has internet.
   - Switch the lamp off and on 3 times until it blinks fast, then add it in the Smart Life app with **Add Device**.
   - Unplug the internet cable afterwards.
2. **Get the local key** (done). Pairing again **changes the key**.
   - On the dev laptop, in `PycharmProjects\Lights`: `.\.venv\Scripts\python.exe -m tinytuya wizard`. Plain `python` there is the system Python, which doesn't have tinytuya.
   - It needs the Access ID and Access Secret from iot.tuya.com (Cloud → Development → your project → Overview), device ID `a377d237cb31b847b5x4jv`, region `sg`.
   - Error `Code 28841002: 'IoT Core service subscription has expired.'`: the free trial has run out. Either extend it (Cloud → Cloud Services → IoT Core → Extend Trial Period; it can take a day) or, faster, make a new developer account:
     1. Create a new project: Smart Home, data center Singapore.
     2. Keep IoT Core in the API list.
     3. Link the Smart Life account: Devices → Link App Account, then scan the QR code in the app (Me → scan icon).
     4. Run the wizard again and answer **N** to reusing the old settings.
3. **Find the IP** (done): `.\.venv\Scripts\python.exe -m tinytuya scan` with the laptop on NexusV.
4. **No fixed IP needed.** The router can't reserve one, and the bridge finds the bulb by itself.
5. **Power-on behaviour.**
   1. In Smart Life, open the bulb's settings. Find the power-on behaviour setting (it may be called Power-off memory or Relay status).
   2. Set it to **on / white**.
   3. Now switching the lamp off and on always gives a white light. That is the staff's manual fail-safe.
6. **Copy the key file.**
   - Copy `PycharmProjects\Lights\devices.json` into this folder. Leave its `"ip"` as it is; the bridge ignores it.
   - `test.py` / `rainbow.py` in the Lights folder still use a typed IP: check it with `tinytuya scan` before using them.
7. **Offline test.**
   1. With the router's internet unplugged, switch the lamp off and on and wait about 20 s.
   2. In the Lights folder, run `.\.venv\Scripts\python.exe test.py`.
   3. If the colours still cycle, the bulb works without the cloud.

## Hub laptop setup
Any laptop can be the hub, so do this on **every laptop that might run `hub\start.bat`**, while it still has internet (before the event):

```
python -m pip install tinytuya websocket-client
```

Check it with `python -c "import tinytuya, websocket"`. No output means it's installed.

## Bulb facts
- Library: TinyTuya `BulbDevice`, protocol version **3.5**, `set_socketPersistent(True)` for long-running scripts.
- Data points the bulb reports: 20, 21, 22, 23, 24, 25, 26, 41. Only 20-24 are used:

| DP | Meaning | Values |
|---|---|---|
| 20 | on / off | `True` / `False` |
| 21 | mode | `'white'`, `'colour'`, `'scene'`, `'music'` |
| 22 | white brightness | 10-1000 |
| 23 | white colour temperature | 0-1000 (warm to cool) |
| 24 | colour | hex string `HHHHSSSSVVVV`: h 0-360, s 0-1000, v 0-1000, 4 hex digits each |

- Send several DPs in **one** command: `b.set_multiple_values({'20': True, '21': 'colour', '24': '000003e803e8'})`. In colour mode, DP 21 must be `'colour'` before DP 24 does anything.
- **At most 10 commands per second**, or the bulb drops the connection. The bridge stays at 5.
- Wrap every send in try/except and reconnect on failure (`rainbow.py` and `Music.py` in the Lights folder do this).
- Colour examples: red `000003e803e8`, dim red `000003e80064`, green `007803e803e8`, blue `00f003e803e8`. White: `{'20': True, '21': 'white', '22': 1000}`.

## The bridge (`bulb_bridge.py`)
1. Read `id`, `key` and `version` from the first entry in `devices.json` next to it. Find the bulb: the address on `NET` (from `booth.bat`) that answers on port 6668. It searches again on every reconnect, so a new IP after a power cut is fine.
2. Connect to `ws://localhost:3000/ws` and send `{"t":"hello","id":"strip","role":"device"}`.
   - The id is `strip` (left over from the old LED strip plan). Keeping it means the GM panel's status dot, the SAFE / FINALE RED scenes in `hub/scenes.js` and `hub/test.js` all work unchanged.
   - Don't open `hub/public/sim.html?id=strip` while the bridge runs: it uses the same id and takes over its place in the hub.
3. Messages from the hub:
   - `{"t":"ping"}` every 1 s;
   - `{"t":"cmd","a":"p2","v":"<state>"}` from the game;
   - `{"t":"cmd","a":"solid","v":"#rrggbb"}` from the GM scenes.
   - The hub also replays the last command when the bridge reconnects.
4. If the WebSocket closes, retry every 1 s.
5. **Fail-safe:** if no message arrives for **3 s** (hub closed, Wi-Fi down), set the bulb to white, brightness 1000. Do the same when the script exits normally. At start-up it sends nothing until the hub or the game says what to show.
6. **Newest state wins:**
   - A new state cancels whatever effect is running.
   - Commands are paced to **no more than 5 per second**. When the key is pressed rapidly, the middle states are dropped, not queued.
7. One persistent `BulbDevice`. On a send error, wait 1 s, reconnect and send the current state again.

The light states (`LOOKS` at the top of `bulb_bridge.py`). The values are starting points; tune them in the real hallway.

| State | When the game sends it | Bulb |
|---|---|---|
| `idle` | locked (puzzle 1 still playing), page load, Ctrl+Alt+R | **off** |
| `ready` | unlocked: Ctrl+Alt+U or puzzle 1's `p1done` | the dimmest cyan (h 180, v 10) |
| `on` | light key held | **green**, full. A straight switch with no fade: the bulb is already a little slow |
| `off` | light key not held (also Space / start of the tutorial) | **off**. The hallway goes fully dark, so keep a separate small night light there |
| `low` | energy warning | red flicker (red / off), about 2 s, then back to the current state |
| `boost` | rescue word typed | one white flash (about 0.3 s), then back to the previous state |
| `down` | zero energy / the jumpscare cut | red fading down (about 1 s), then off |
| `scare` | LOOK BEHIND YOU | the brightest white (white mode, brightness 1000, coolest). The game sends `off` when it vanishes |
| `win` | SYSTEM POWERED | green, full |
| `solid` `#ffffff` | GM SAFE | white, 1000 |
| `solid` other colour | GM FINALE RED (`#ff0000`) | that colour in colour mode, converted to h/s/v |

During the fake start's "dread", the game flips the light on and off quickly. The 5-per-second pacing turns this into a stutter, which is the intended effect.

**Game side:**
- `lights()` sends straight to the hub: `hubWs?.readyState === 1 && hubWs.send(JSON.stringify({ t: 'cmd', to: 'strip', a: 'p2', v: state }))`.
- Don't route it through `hubSend()`: that queue would replay old light changes after a hub hiccup.

**Start-up:** `hub\start.bat` starts `python ..\puzzle2-system-power\bulb_bridge.py` in its own minimized window ("nexus-bulb"), in a restart loop like the hub's. The window prints every command it gets, and `bulb not answering` if it can't reach the bulb.

**The plush key:** it sends Enter with the keyboard's "extended" flag, which browsers report as `NumpadEnter`. Holding it repeats about 30 times a second, and letting go always sends a release. If the plush key dies mid-event, add `'Enter'` to `CFG.LIGHT_KEY` so the laptop's Enter works instead.

## Test
1. Run `hub\start.bat`. A second minimized window, "nexus-bulb", opens. The GM panel shows **● strip** as online. Once the P2 page is open and locked, the bulb is off.
2. On the GM panel, press **FINALE RED**: the bulb turns red. Press **SAFE**: it turns white.
3. Run this folder's `start.bat`: the bulb stays off. Press Ctrl+Alt+U: dim cyan. Press Space. Hold the plush key during the tutorial: the bulb goes green. Let go: it goes dim red. The laptop's own Enter does nothing.
4. Close the hub's window. Within 3 s, the bulb goes white.
5. Switch the lamp off and on: the bulb comes back white (the power-on behaviour from step 5).

## Hallway camera (the kiosk pop-up)
The Tapo C200 ("NexusCam") sits **behind** the players. When the fake start begins, the game sends `p2cam`, and the signup kiosk outside shows a forced pop-up: INCOMING TRANSMISSION over static. At LOOK BEHIND YOU, the game sends `p2scare` and the live feed cuts in.

The pop-up closes 4 s after game 2 ends (`p2done`), or after 90 s at most. No key closes it. Any signup in progress waits underneath, and its idle timer pauses. The pop-up never opens on the staff screen or on the `/queue` TV. Nothing is recorded.

How it works: the camera streams all the time, and the pop-up is what "turns it on". go2rtc, on the signup PC, turns the camera's RTSP stream into something the browser can play. The booth router can't reserve addresses, so the camera has no fixed IP. Each time the pop-up opens the stream, go2rtc runs `signup/camera.js`, which finds the camera on the network in about 0.3 s (it's the device that answers on port 2020). go2rtc only answers the signup PC itself, because its API can run programs.

One-time setup (done 2026-10-02 on the dev laptop):
1. In the Tapo app, add the camera to the **NexusV** Wi-Fi.
2. In the camera's settings, go to **Advanced Settings → Camera Account** and create a username and password.
3. Set **Night Vision** to always on, not Auto. Otherwise the picture flips between colour and black-and-white, with a click, every time the bulb changes. Keep **Motion Tracking** and **Patrol** off, or the camera turns away by itself.
4. Download `go2rtc_win64.zip` from github.com/AlexxIT/go2rtc/releases. Put `go2rtc.exe` in the `signup` folder.
5. Create `signup/camera.json` with the Camera Account: `{"user": "...", "pass": "..."}`.

Git ignores `go2rtc.exe` and `camera.json`. Copy both by hand to whichever laptops run the signup or the camera setup.

**Aiming: `hub\camerasetup.bat`** (any laptop on NexusV). It opens the live view in the browser and finds the camera. Keys:
- **Arrows** move it.
- **+ / -** change the step (1°, 5°, 15° or 45°).
- **S** saves the aim to `camera.json`.
- **H** goes back to the saved aim, for example after a power cut.
- **Q** quits.

Sound is off (`#media=video` in `camera.js`). Delete `#media=video` to hear the hallway on the kiosk.

Test: run `signup/start.bat` (a minimized "nexus-camera" window starts next to the server). On the kiosk, hold **Ctrl+Alt** and type **CAMERA**: the pop-up opens with static, the live feed cuts in 4 s later, and it closes after 20 s. For the real thing, play game 2 until LOOK BEHIND YOU and watch the kiosk. Without `go2rtc.exe`, the pop-up still opens, with static and SIGNAL LOST.

## Troubleshooting
| Problem | Fix |
|---|---|
| Kiosk pop-up shows SIGNAL LOST | go2rtc isn't running on the signup PC. Check the "nexus-camera" window, and that `go2rtc.exe` is in `signup` |
| Pop-up shows no picture | Run `hub\camerasetup.bat`. If it says "Camera not found", the camera is off or not on NexusV. If it says "camera said no", the password in `signup\camera.json` is wrong |
| `No module named tinytuya` | Wrong Python. On the dev laptop, use `.\.venv\Scripts\python.exe` in the Lights folder. On the hub laptop, run the pip install above |
| Plush key stops working after a while, works again after replugging | Windows put the idle USB key to sleep. `booth.bat` (run by every `start.bat`) turns USB selective suspend off. If it still happens: Device Manager → Human Interface Devices → each "USB Input Device" → Power Management → untick "Allow the computer to turn off this device" (needs admin) |
| "nexus-bulb" window says `not found on 192.168.0.x` | The lamp is off, or the bulb isn't on NexusV, or this laptop isn't. The router's **Isolate** setting must be off |
| Bulb stops answering after rapid changes | Too many commands per second. Wait a few seconds or switch the lamp off and on |
| It worked, then the key stopped working | Someone removed or re-paired the bulb in the app. Redo one-time steps 2, 4 and 6 |
| Bridge dead in the middle of a game | Switch the lamp off and on. It comes back white, and the game continues with the light always on |

## Staff keys (on the P2 laptop)
| Key | What it does |
|---|---|
| Ctrl+Alt+H | Help panel |
| Ctrl+Alt+U | Unlock by hand (if puzzle 1's signal never came) |
| Ctrl+Alt+S | Start now |
| Ctrl+Alt+K | Skip the tutorial, straight to the game |
| Ctrl+Alt+X | Caught (a staff AI tagged a player) |
| Ctrl+Alt+R | Reset for the next team (sends `idle` to the bulb) |
| Ctrl+Alt+W | Replay only the win screen |
| Ctrl+Alt+M | Mute / unmute |

The GM panel also has UNLOCK, CAUGHT and RESET for this room.
