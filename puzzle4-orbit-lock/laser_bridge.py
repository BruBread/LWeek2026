"""NEXUS Puzzle 4 laser bridge: drives the Govee H6143 strip behind the screen over Bluetooth for game.html.
Runs on the Puzzle 4 laptop (start.bat starts it; the strip must be within ~10 m). Needs once: python -m pip install bleak
The game asks for an effect with GET http://localhost:8013/fx?v=<name>; GET /status says whether the strip is connected.
Effects: idle, charge, cancel, hit, miss, dog, win, off.   Watch them all:  python laser_bridge.py test

Bluetooth only: the strip's firmware (1.08.06) has no LAN Control. One Bluetooth connection at a time, so close the
Govee Home app on every phone. Packets are community reverse-engineered: 20 bytes, 0x33 + command + payload, last
byte = XOR of the first 19. Colour only works through the segment command (33 05 15 01 r g b, mask in bytes 11-12).
Some of this strip's LEDs have lost green/blue, so every effect stays in reds and white: green would show gaps."""
import asyncio, json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from bleak import BleakClient, BleakScanner

PORT = 8013
NAME = 'H6143'                 # the strip advertises as ihoment_H6143_xxxx
WRITE = '00010203-0405-0607-0809-0a0b0c0d2b11'
SEGMENTS = 15
REVERSE = False                # True if segment 1 is the far end: the beam must start at the end next to the emitter
GROUP = 3                      # segments per beam step (15 / 3 = 5 steps)
STEP_S = 0.05                  # gap between beam steps. Lower = faster, but under ~0.04 the strip starts skipping
CHARGE_S = 0.9                 # match CFG.CHARGE_MS in game.html
KEEPALIVE_S = 1.0              # the strip drops a silent connection, so ping it when idle
DIM = (40, 0, 4)               # idle glow
HOT = (255, 40, 70)            # the beam's red
WHITE = (255, 255, 255)

ALL = (1 << SEGMENTS) - 1
STEPS = -(-SEGMENTS // GROUP)


def packet(head, cmd, payload=()):
    p = [head, cmd, *payload][:19]
    p += [0] * (19 - len(p))
    x = 0
    for v in p:
        x ^= v
    return bytes(p + [x])


def paint_packet(rgb, mask=ALL):
    return packet(0x33, 0x05, [0x15, 0x01, *rgb, 0, 0, 0, 0, mask & 0xFF, mask >> 8])


def group(g):                  # the segments lit by beam step g, counted from the emitter end
    m = 0
    for k in range(g * GROUP, min(SEGMENTS, (g + 1) * GROUP)):
        m |= 1 << (SEGMENTS - 1 - k if REVERSE else k)
    return m


class Strip:
    """Finds the strip, keeps the connection alive, reconnects forever. Writes never raise: a dropped
    connection is noticed by run() and the effects just go nowhere until it's back."""
    def __init__(self):
        self.client, self.status, self.last = None, 'starting', 0.0

    def say(self, status):
        if status != self.status:
            print(time.strftime('%H:%M:%S'), 'strip:', status, flush=True)
        self.status = status

    async def run(self):
        while True:
            try:
                self.say('searching')
                dev = await BleakScanner.find_device_by_filter(lambda d, a: NAME in (a.local_name or d.name or ''), timeout=10)
                if not dev:
                    self.say('not found (strip powered? Bluetooth on? Govee app closed on every phone?)')
                    await asyncio.sleep(3)
                    continue
                async with BleakClient(dev, timeout=15) as c:
                    self.client = c
                    self.say(f'connected ({dev.address})')
                    await self.send(packet(0x33, 0x01, [1]), True)    # power on
                    await self.send(packet(0x33, 0x04, [255]), True)  # full brightness
                    await self.send(paint_packet(DIM), True)
                    while c.is_connected:
                        await asyncio.sleep(.25)
                        if time.monotonic() - self.last > KEEPALIVE_S:
                            await self.send(packet(0xAA, 0x00), True)
            except Exception as e:
                self.say(f'error: {e}'[:100])
            self.client = None
            await asyncio.sleep(2)

    async def send(self, p, sure=False):      # sure = wait for the strip to confirm (slower, never dropped)
        c = self.client
        if not c or not c.is_connected:
            return
        self.last = time.monotonic()
        try:
            await c.write_gatt_char(WRITE, p, response=sure)
        except Exception:
            pass


strip = Strip()


async def paint(rgb, mask=ALL, sure=False):
    await strip.send(paint_packet(rgb, mask), sure)


async def beam(steps):         # the beam shoots out from the emitter end, one group of segments at a time
    for g in range(steps):
        await paint(WHITE, group(g))
        await asyncio.sleep(STEP_S)


async def idle():
    await paint(DIM, sure=True)


async def charge():            # the strip heats up red while space is held
    for i in range(1, 7):
        await paint((60 + 195 * i // 6, 0, 25 * i // 6))
        await asyncio.sleep(CHARGE_S / 6)


async def hit():               # full beam, then the whole strip blows white and cools down
    await beam(STEPS)
    await paint(WHITE)
    await asyncio.sleep(.15)
    for c in [(255, 120, 160), (220, 40, 70), (120, 10, 25)]:
        await paint(c)
        await asyncio.sleep(.12)
    await idle()


async def miss():              # the beam is blocked halfway, then sputters red
    await beam(STEPS // 2 + 1)
    for _ in range(3):
        await paint(HOT)
        await asyncio.sleep(.08)
        await paint((0, 0, 0))
        await asyncio.sleep(.08)
    await idle()


async def win():               # her heart breaks: full beam, white/red strobe, a long white burn, then dim
    await beam(STEPS)
    for _ in range(8):
        await paint(WHITE)
        await asyncio.sleep(.08)
        await paint(HOT)
        await asyncio.sleep(.08)
    await paint(WHITE, sure=True)
    await asyncio.sleep(.8)
    await idle()


async def off():
    await strip.send(packet(0x33, 0x01, [0]), True)


FX = {'idle': idle, 'cancel': idle, 'charge': charge, 'hit': hit, 'miss': miss, 'dog': miss, 'win': win, 'off': off}
current = None


def start(name):               # a new effect cuts off the one still playing
    global current
    if name not in FX:
        return
    if current and not current.done():
        current.cancel()
    current = asyncio.ensure_future(FX[name]())
    print(time.strftime('%H:%M:%S'), 'fx', name, flush=True)


class Http(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/fx':
            loop.call_soon_threadsafe(start, parse_qs(u.query).get('v', [''])[0])
            body = b'{}'
        elif u.path == '/status':
            body = json.dumps({'strip': strip.status}).encode()
        else:
            return self.send_error(404)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')   # game.html is on another port of this laptop
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


async def test():              # python laser_bridge.py test: every effect, with a label, while you watch
    while not strip.status.startswith('connected'):
        await asyncio.sleep(.2)
    print('\nSEGMENT 1 lights white for 2 s: it should be the end next to the emitter (else set REVERSE = True)')
    await paint(DIM, sure=True)
    await paint(WHITE, 1, sure=True)
    await asyncio.sleep(2)
    for name, hold in [('charge', 1.2), ('hit', 2.5), ('charge', 1.2), ('miss', 2.5), ('charge', 1.2), ('win', 4)]:
        print(name.upper(), flush=True)
        start(name)
        await asyncio.sleep(hold)
    print('done')


async def main():
    global loop
    loop = asyncio.get_running_loop()
    asyncio.ensure_future(strip.run())
    if 'test' in sys.argv:
        return await test()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Http)   # only this laptop's game page can reach it
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f'laser bridge on http://localhost:{PORT}  (effects: {", ".join(FX)})', flush=True)
    await asyncio.Event().wait()


if __name__ == '__main__':
    asyncio.run(main())
