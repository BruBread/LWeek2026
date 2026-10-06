# NEXUS escape-room booth (Lweek 2026)

## File map
- `hub/` — Node server (`server.js`), tests (`npm test` = `test.js`), `public/`: `gm.html` (GM panel), `boss.js` (game 5 finale), `dossier.html`, `runclock.js`, `voice.js`, `transmission.js`
- `puzzle1-brain-upload/` — `projector.html`, `desktop.html`, `mask_esp32/`
- `puzzle2-system-power/` — `game.html`, `bulb_bridge.py`, `devices.json`
- `puzzle3-hidden-signal/` — `game.html`, `beacon_esp32/`
- `puzzle4-orbit-lock/` — `game.html`, `controller_esp32/`, `laser_bridge.py`
- `signup/` — kiosk `index.html`, `server.js`, `test.js`
- `aurora-voice/cut.py` — cuts the voice clips into `hub/public/voice/`
- Each puzzle has a `SETUP.md` (hardware wiring). Read it only for hardware tasks.

## Token rules
- Big files (60-100 KB, about 20-25k tokens): every `game.html`, `projector.html`, `signup/index.html`, `gm.html`, `boss.js`. Never Read them whole. Grep for the function or ID first, then Read with `offset`/`limit`.
- `nexus-core-protocol-context.md` is the 74 KB design doc. Do not read it by default; memory covers the decisions. If you need it, grep `^## ` and read one section only.
- Screenshots: take them only for visual changes. Use a viewport of 1280x720 or smaller, and crop to the area that changed. Never Read full-resolution camera photos; downscale them first.
- Check behavior with `npm test` or a grep before you take a screenshot.
- One task per session. After a commit, the user may `/clear`.
