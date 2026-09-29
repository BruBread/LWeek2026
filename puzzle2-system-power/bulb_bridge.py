"""NEXUS Puzzle 2 bulb bridge: joins the hub as device "strip" and drives the hallway Tuya bulb.
Runs on the hub laptop (hub\\start.bat starts it). Needs, once: python -m pip install tinytuya websocket-client
The bulb's ID and local key come from devices.json next to this file (git ignores it). See SETUP.md."""
import colorsys, json, os, socket, threading, time
from concurrent.futures import ThreadPoolExecutor
import tinytuya, websocket

HUB = 'ws://localhost:3000/ws'
NET = os.environ.get('NET', '192.168.0')   # booth.bat sets it
WATCHDOG = 3      # s with no message from the hub (it pings every 1 s) -> fail-safe white
MIN_GAP = 0.2     # s between bulb commands: 5 per second; the bulb drops the connection above 10
PROBE = 10        # s: while nothing changes, check the bulb still answers (for the GM panel's BULB light)

def colour(h, s, v): return {'20': True, '21': 'colour', '24': f'{h:04x}{s:04x}{v:04x}'}   # h 0-360, s/v 0-1000
WHITE = {'20': True, '21': 'white', '22': 1000, '23': 1000}   # the brightest: full brightness, coolest white
OFF = {'20': False}
GREEN = colour(120, 1000, 1000)
CYAN = colour(180, 1000, 10)       # the dimmest cyan: puzzle 2 unlocked, waiting for the team
FLASH = colour(0, 1000, 600)

# game state -> steps of (bulb command, seconds to hold it). The last step stays.
LOOKS = {
    'idle':  [(OFF, 0)],           # locked: puzzle 1 still playing, page load, Ctrl+Alt+R
    'ready': [(CYAN, 0)],          # unlocked: Ctrl+Alt+U or puzzle 1's p1done
    'on':   [(GREEN, 0)],
    'off':  [(OFF, 0)],            # every moment the light key isn't held
    'win':  [(GREEN, 0)],
    'scare': [(WHITE, 0)],         # LOOK BEHIND YOU; the game sends 'off' when it's over
    'down': [(colour(0, 1000, v), MIN_GAP) for v in (1000, 750, 500, 300)] + [(OFF, 0)],
    'low':  [(FLASH, .35), (OFF, .35)] * 3,                   # then back to the current state
    'boost': [(WHITE, .3)],                                     # then back to the current state
}
FX = ('low', 'boost')

dev = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'devices.json')))[0]
want, wake = [], threading.Event()   # nothing until the hub or the game says what to show
base = 'idle'                      # the state that low/boost return to
heard = time.time()
seen = {'bulb': None, 'ip': None}  # did the bulb answer the last command or probe; sent to the GM panel (None = not tried yet)

def show(steps):
    global want
    want = steps; wake.set()

def handle(a, v):
    global base
    if a == 'solid':               # GM scenes: SAFE = #ffffff, FINALE RED = #ff0000
        r, g, b = (int(v[i:i + 2], 16) / 255 for i in (1, 3, 5))
        h, s, val = colorsys.rgb_to_hsv(r, g, b)
        return show([(WHITE if s == 0 else colour(round(h * 360), round(s * 1000), max(10, round(val * 1000))), 0)])
    if a != 'p2' or v not in LOOKS: return print('ignored', a, v)
    if v in FX: return show(LOOKS[v] + LOOKS[base])
    base = 'off' if v == 'down' else v
    show(LOOKS[v])

def knock(ip):
    try:
        with socket.create_connection((ip, 6668), timeout=1.5): return ip
    except OSError: return None

def find():
    # The booth router can't reserve addresses, so the bulb's IP can change. Knock on Tuya's port 6668 at every address
    # on the booth network at once: the bulb is the one that answers. About 1.5 s; runs again on every reconnect.
    # ponytail: the first Tuya device on NexusV wins; match dev['id'] with tinytuya.find_device if a second one ever joins
    with ThreadPoolExecutor(254) as ex:
        return next(filter(None, ex.map(knock, (f'{NET}.{i}' for i in range(1, 255)))), None)

def connect():
    ip = find()
    if not ip: raise IOError(f'not found on {NET}.x (lamp switched off?)')
    print('bulb found at', ip)
    b = tinytuya.BulbDevice(dev['id'], ip, dev['key'], version=float(dev.get('version', 3.5)), connection_timeout=3)
    b.set_socketPersistent(True)
    return b

def send(bulb, dps):
    r = bulb.set_multiple_values(dps)
    if r and 'Error' in r: raise IOError(r['Error'])

def bulb_loop():
    # newest state wins: a new state cancels the running steps, and commands never go faster than MIN_GAP
    bulb, last = None, 0
    while True:
        if not wake.wait(0 if seen['bulb'] is None else PROBE):
            # quiet: ask the bulb for its state (changes nothing it shows). Also finds it once the lamp is switched on
            try:
                bulb = bulb or connect()
                r = bulb.status()
                if not r or 'Error' in r: raise IOError(r and r['Error'])
                seen.update(bulb=True, ip=bulb.address)
            except Exception as e:
                if seen['bulb'] is not False: print('bulb not answering:', e)
                bulb = None; seen.update(bulb=False, ip=None)
            last = time.time()
            continue
        wake.clear()
        for dps, hold in want:
            time.sleep(max(0, last + MIN_GAP - time.time()))
            if wake.is_set(): break
            try:
                bulb = bulb or connect()
                send(bulb, dps)
                seen.update(bulb=True, ip=bulb.address)
            except Exception as e:
                print('bulb not answering:', e, '- retrying')
                seen.update(bulb=False, ip=None)
                bulb = None; time.sleep(1); wake.set(); break   # replays the current state
            last = time.time()
            if hold and wake.wait(hold): break

def watchdog():
    lost = False
    while True:
        time.sleep(.5)
        if time.time() - heard > WATCHDOG and not lost:
            lost = True; print('no hub for', WATCHDOG, 's: fail-safe white'); show([(WHITE, 0)])
        elif time.time() - heard <= WATCHDOG: lost = False

def on_message(ws, raw):
    global heard
    heard = time.time()
    m = json.loads(raw)
    if m.get('t') == 'ping':       # the hub pings every 1 s: answer with the bulb's state for the GM panel
        ws.send(json.dumps({'t': 'status', 'v': seen}))
    if m.get('t') == 'cmd':
        print('cmd', m.get('a'), m.get('v'))
        handle(m.get('a'), m.get('v'))

def on_open(ws):
    global heard
    heard = time.time()
    print('hub connected')
    ws.send(json.dumps({'t': 'hello', 'id': 'strip', 'role': 'device'}))

if __name__ == '__main__':
    print(f"bulb {dev.get('name', '')} on {NET}.x, hub {HUB}")
    threading.Thread(target=bulb_loop, daemon=True).start()
    threading.Thread(target=watchdog, daemon=True).start()
    try:
        websocket.WebSocketApp(HUB, on_open=on_open, on_message=on_message).run_forever(reconnect=1)
    except KeyboardInterrupt:
        pass
    print('stopping: bulb to white')
    try: send(connect(), WHITE)
    except Exception as e: print('could not reach the bulb:', e)
