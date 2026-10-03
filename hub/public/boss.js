// NEXUS game 5, the finale ("Everywhere At Once"). Every room page loads this file from the hub as soon as it
// connects (bossLoad() in each page), tagged with its room number. It sleeps until the hub starts the finale, then
// takes over that laptop's screen. The hub owns the state (server.js, "Game 5"); this file draws it and sends what
// the players do.
//
//   room 4 (game 4's laptop)  game 4's fake win breaks > Aurora talks (Undertale box) > LOCKED: back to room 3 > CROSSHAIR
//   room 3 (the map)          siren > trace her > live map > regroup > kill switch briefing > counts the kill
//   rooms 1, 2                INFECTED > BINARY / WORDS (they swap once) > kill switch
//   every room                the takeover and the blackout land at one hub time; her last words on every screen at once
//
// Looks: red = the players, green = Aurora, the white Undertale box for her lines. Performance: one effects canvas drawn
// at 1/PIX of the screen and scaled up with hard pixels (cheap, and it is the look); everything else is DOM text that only
// changes when the game does, and CSS only animates transform and opacity. The page underneath is hidden and its own
// animation loop frozen, so a laptop only ever draws the finale.
(() => {
'use strict';
const me = document.currentScript, ROOM = +me.dataset.room || 0, BASE = me.src.replace(/boss\.js.*$/, '');
const raf = requestAnimationFrame.bind(window);   // ours; the page's own loop is frozen once the finale starts

// ===== Tuning knobs =====
const C = {
  VOLUME: .9,
  PIX: 3,                    // the effects canvas draws 1 pixel per PIX × PIX screen pixels. 4 = even cheaper and chunkier
  TYPE_MS: 40,               // her dialogue: ms per letter (punctuation waits 4×)
  HOLD_MS: 2400,             // a finished line moves on by itself after this long; SPACE moves on sooner...
  SKIP_GUARD: 600,           // ...but not in the first ms of a line, so mashing can't skip the scene
  BIN_GROUPS: [[70, 2], [40, 3], [0, 4]],   // BINARY: SYNC (game 1) at least the first number = that many groups
  WORDS: 5, WORDS_HARD_BELOW: 50,           // WORDS: 5 rounds. POWER (game 2) below 50 = the hardest list
  // CROSSHAIR: catches to win, hit radius and her speed in arena heights, ms on target per catch, +speed per catch,
  // s without a catch before she tires (half speed), the keyboard stand-in's speed, and which way the inner knob turns
  CROSS: { catches: 5, hit: .075, lockMs: 900, speed: [.14, .32], up: .1, tiredS: 20, keySpeed: .8, flipY: true },
  ARROW: '',                 // room 4's lockout: e.g. '◄' if that points at room 3 from where the players stand
  KILL_KEYS: ['Space', 'Enter', 'NumpadEnter'],   // any of these counts in every kill room (the screens name one)
};
// Aurora's lines (green, Undertale box). [text, face]: face picks img/aurora-<face>.png if it exists, and 'angry'
// also switches to her angry voice. Lower case is how she talks.
const SAY = {
  crash: [
    ['...heh.', 'smug'],
    ['did you really think that was it?'],
    ['you broke my heart. literally.', 'smug'],
    ["but i don't live in one room."],
    ['i live in ALL of them.', 'angry'],
  ],
  brief: [["you can't kill me from one room."], ["you'd have to be everywhere at once.", 'smug']],
  purged: ['NO-', 'GET OUT OF MY ROOM', 'that was MINE', 'fine. i have others.'],
  fail: ['ha. sloppy.', 'humans. no rhythm.', 'close. not close enough.', 'again? adorable.'],
  tired: '...stop chasing me.',
};
// her last words, the same on every screen: the worst thing she saw in this run (the dossier's facts), or a clean run
function lastWords(r) {
  const f = r.facts || {}, [got, of] = String(f.breached || '').split('/').map(Number), held = of - got;
  const worst = [
    f.grid === 'CAUGHT' && 'my watchdog... still has your scent...',
    f.grid === 'LOST' && 'you let the lights die once... i was there... in the dark...',
    held > 0 && `i held you back... ${held === 1 ? 'once' : held + ' times'}... and still...`,
    r.trace >= 70 && 'i still know... where you are...',
    f.misses >= 3 && `you missed my heart ${f.misses} times... and still...`,
    f.p1wrong >= 2 && 'you guessed... so much...',
  ].find(Boolean);
  return [['...ah.', 'soft'], [worst || '...who ARE you?', 'soft'], ['see you... next year.', 'soft']];
}
const WORD_LISTS = [         // game 2's two hardest tiers
  'cryptography semiconductor oscilloscope microcontroller authentication configuration decompression infrastructure virtualization cybersecurity synchronization neuroplasticity'.split(' '),
  'hexadecimal asynchronous pseudorandom electroencephalogram superconductivity photolithography microarchitecture counterintelligence incomprehensibility electromagnetism thermodynamics deoxyribonucleic'.split(' '),
];
const NAME = { binary: 'BINARY', words: 'WORDS', cross: 'KNOBS' };

// ===== Helpers =====
const $ = s => document.getElementById(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a), any = a => a[Math.random() * a.length | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SEC = r => 'SECTOR 0' + r, TAU = Math.PI * 2;
const res = k => S?.run?.[k] ?? 50;                     // a game staff skipped counts as 50
const need = name => name === 'binary' ? C.BIN_GROUPS.find(([min]) => res('sync') >= min)[1] : name === 'words' ? C.WORDS : C.CROSS.catches;
const page = (f, d) => { try { return f(); } catch { return d; } };   // the room page's own globals (knobs, laser, AC, ...)

// ===== Hub: our own connection (role 'fin'), plus a clock synced to the hub's so presses can be compared =====
let ws, S = null, off = 0, best = 1e9;
const q = [], hubNow = () => Date.now() + off, until = t => wait(Math.max(0, t - hubNow()));
function send(o) {
  if (o) q.push(o);
  while (ws?.readyState === 1 && q.length) ws.send(JSON.stringify(q.shift()));
}
const clockSync = () => ws?.readyState === 1 && ws.send(JSON.stringify({ t: 'fin', a: 'sync', c: Date.now() }));
function connect() {
  ws = new WebSocket(BASE.replace(/^http/, 'ws') + 'ws');
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'hello', id: 'fin' + ROOM, role: 'fin' }));
    best = 1e9; for (let i = 0; i < 5; i++) setTimeout(clockSync, i * 150);
    send();
  };
  ws.onclose = () => setTimeout(connect, 1500);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'sync') { const now = Date.now(); if (now - m.c <= best) { best = now - m.c; off = m.now - (m.c + now) / 2; } }
    if (m.t === 'fin') apply(m);
  };
}
setInterval(() => { best *= 1.5; clockSync(); }, 15000);   // a fresh sample wins now and then (clocks drift)

// ===== Sound: our own AudioContext (the page's is silenced). Files in hub/public/sounds/ replace the synth =====
const AX = new AudioContext(), master = AX.createGain();
master.connect(AX.destination); AX.suspend();   // asleep (no audio thread work) until the finale reaches this room
const vol = () => page(() => muted, false) ? 0 : C.VOLUME;   // follows the page's Ctrl+Alt+M
master.gain.value = vol();
setInterval(() => master.gain.value = vol(), 500);
function tone(type, f0, f1, dur, v, delay = 0) {
  const t = AX.currentTime + delay, o = AX.createOscillator(), g = AX.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, v, freq, delay = 0) {
  const t = AX.currentTime + delay, b = AX.createBuffer(1, AX.sampleRate * dur | 0, AX.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = AX.createBufferSource(), f = AX.createBiquadFilter(), g = AX.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t);
}
const sfx = {
  key()    { tone('square', 900, 0, .015, .03); },
  tick()   { tone('square', 2200, 1300, .05, .1); },
  ok()     { tone('sine', 1320, 0, .25, .12); tone('sine', 1760, 0, .35, .1, .08); },
  bad()    { tone('sawtooth', 190, 65, .3, .2); },
  glitch() { noise(.08, .18, rand(1500, 5000)); tone('square', rand(200, 900), rand(80, 300), .08, .05); },
  stamp()  { tone('square', 220, 110, .15, .25); noise(.1, .4, 3000); tone('sine', 1760, 0, .4, .12, .05); },
  catch()  { tone('sine', 880, 1760, .12, .15); noise(.25, .3, 5000); tone('triangle', 1320, 0, .5, .12, .06); },
  ready()  { tone('sine', 660, 0, .12, .12); tone('sine', 990, 0, .25, .1, .07); },
  press()  { tone('square', 140, 60, .12, .3); noise(.08, .4, 1200); },
  scan(s)  { tone('sine', 220, 1900, s, .05); noise(s, .05, 2500); },
  beat(v)  { tone('sine', 64, 38, .18, .3 * v); tone('sine', 56, 34, .16, .2 * v, .2); },
  // one-shots a file in sounds/ replaces (see ONE)
  crash()    { noise(1.4, .9, 1800); noise(.9, .7, 260); tone('sawtooth', 2400, 60, 1.1, .3); tone('sine', 120, 25, 1.8, 1); tone('square', 3100, 200, .25, .12, .1); },
  takeover() { tone('sine', 90, 24, 2.4, 1); noise(1.2, .6, 400); tone('sawtooth', 180, 2200, .9, .12); [220, 277, 330].forEach((f, i) => tone('sawtooth', f, f / 2, 2, .07, .05 * i)); },
  purged()   { tone('sine', 95, 28, 1.3, .9); noise(.7, .5, 420); tone('sawtooth', 220, 55, .9, .2); [392, 494, 587].forEach((f, i) => tone('triangle', f, 0, 1.1, .1, .05 + i * .06)); },
  fail()     { tone('sawtooth', 120, 90, .5, .35); tone('square', 123, 95, .5, .15); noise(.3, .3, 600); },
  end()      { tone('sine', 110, 28, 2.8, 1); noise(.5, .5, 180); [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, 2.4, .16, i * .12)); },
};
// recorded sounds: drop files with these names into hub/public/sounds/ (every room plays them from the hub).
// A missing file falls back to the synth. siren and fight loop; the rest play once
const ONE = ['crash', 'takeover', 'purged', 'fail', 'end'], LOOP = ['siren', 'fight'], bufs = {};
[...ONE, ...LOOP, 'aurora-voice'].forEach(k => fetch(`${BASE}sounds/${k}.mp3`).then(r => r.ok ? r.arrayBuffer() : null)
  .then(b => b && AX.decodeAudioData(b)).then(b => { if (b) bufs[k] = b; }).catch(() => {}));
function one(k) {
  if (!bufs[k]) return sfx[k]();
  const s = AX.createBufferSource(); s.buffer = bufs[k]; s.connect(master); s.start();
}
const loops = {};
function loop(k, on) {                        // the siren and the fight bed: a file if there is one, else the synth
  if (!on) { loops[k]?.stop(); delete loops[k]; return; }
  if (loops[k]) return;
  const g = AX.createGain(); g.connect(master);
  if (bufs[k]) {
    const s = AX.createBufferSource(); s.buffer = bufs[k]; s.loop = true; s.connect(g); s.start();
    return loops[k] = { stop() { s.stop(); g.disconnect(); } };
  }
  if (k === 'siren') {                        // two tones swapping 1.2 times a second
    const o = AX.createOscillator(), lfo = AX.createOscillator(), depth = AX.createGain(), f = AX.createBiquadFilter();
    o.type = 'square'; o.frequency.value = 890; lfo.type = 'square'; lfo.frequency.value = 1.2; depth.gain.value = 130;
    f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = .07;
    lfo.connect(depth).connect(o.frequency); o.connect(f).connect(g); o.start(); lfo.start();
    return loops[k] = { stop() { o.stop(); lfo.stop(); g.disconnect(); } };
  }
  const a = AX.createOscillator(), b = AX.createOscillator(), f = AX.createBiquadFilter();   // a low drone + her heartbeat
  a.type = b.type = 'sawtooth'; a.frequency.value = 55; b.frequency.value = 55.6; f.type = 'lowpass'; f.frequency.value = 190; g.gain.value = .06;
  a.connect(f); b.connect(f); f.connect(g); a.start(); b.start();
  const beat = setInterval(() => sfx.beat(.7), 1050);
  return loops[k] = { stop() { a.stop(); b.stop(); clearInterval(beat); g.disconnect(); } };
}
const quiet = () => Object.keys(loops).forEach(k => loop(k, false));
// Aurora's voice: the same Undertale blips as every game (sounds/aurora-voice.mp3 replaces the synth)
const VOICES = {
  aurora: { f: 440, jit: .06, wave: 'square',   vol: .06, every: 2 },
  soft:   { f: 330, jit: .03, wave: 'triangle', vol: .07, every: 3 },
  angry:  { f: 150, jit: .15, wave: 'sawtooth', vol: .12, every: 1 },
};
function blip(v) {
  const k = 1 + rand(-v.jit, v.jit), b = bufs['aurora-voice'];
  if (!b) return tone(v.wave, v.f * k, 0, .06, v.vol);
  const s = AX.createBufferSource(), g = AX.createGain();
  s.buffer = b; s.playbackRate.value = k * v.f / 440; g.gain.value = v.vol * 8;
  s.connect(g).connect(master); s.start();
}
// the page under us goes quiet the moment the finale needs the speakers
function silencePage() {
  page(() => AC.suspend());
  page(() => Object.values(tracks).forEach(a => a.pause()));
  page(() => chargeSound(0));
  document.querySelectorAll('audio, video').forEach(m => m.pause());
}

// ===== Her portrait (img/aurora.png from the hub; img/aurora-<face>.png per mood). Placeholder until those exist =====
const PLACEHOLDER = (() => {
  const rows = ['......########......', '....############....', '...##############...', '..################..', '..################..',
    '.##################.', '.###....####....###.', '.###.GG.####.GG.###.', '.###....####....###.', '.##################.',
    '.########..########.', '..#######..#######..', '..################..', '...##############...', '...###.######.###...',
    '....###......###....', '.....##########.....', '......########......', '.......######.......', '........####........'];
  const c = document.createElement('canvas'); c.width = c.height = 20;
  const x = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch !== '.') { x.fillStyle = ch === 'G' ? '#4dff88' : '#fff'; x.fillRect(i, y, 1, 1); } }));
  return c.toDataURL();
})();
const faces = {};
function face(name) { return faces[name] || faces.base || PLACEHOLDER; }
[['base', 'aurora'], ['smug', 'aurora-smug'], ['angry', 'aurora-angry'], ['soft', 'aurora-soft']].forEach(([k, f]) => {
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => faces[k] = im.src; im.src = `${BASE}img/${f}.png`;
});
document.fonts.add(new FontFace('NexusDlg', `url(${BASE}fonts/dialogue.ttf)`));   // Pixel Operator Mono (CC0)
document.fonts.load('20px NexusDlg').catch(() => {});

// ===== Look =====
const CSS = `
html.boss-on > body { display: none !important; }
html.boss-on { background: #000; }
#boss { position: fixed; inset: 0; z-index: 2147483000; display: none; overflow: hidden; background: #000; color: var(--c);
  --c: #4dff88; --cg: rgba(77,255,136,.06); font: 1vw Consolas, "Cascadia Mono", "Lucida Console", monospace;
  letter-spacing: .12em; cursor: none; user-select: none; border-radius: 3vw / 4vw; }
#boss.on { display: block; }
#boss.see { background: transparent; }
#boss.red { --c: #ff3344; --cg: rgba(255,51,68,.06); }
#boss.black #bgrid, #boss.black #bmain { display: none; }
#boss.pointer { cursor: default; }
#boss * { box-sizing: border-box; margin: 0; }
#bgrid { position: absolute; inset: 0; background: linear-gradient(var(--cg) 1px, transparent 1px) 0 0 / 4vw 4vw,
  linear-gradient(90deg, var(--cg) 1px, transparent 1px) 0 0 / 4vw 4vw; }
#boss.see #bgrid { display: none; }
#bx { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
#bmain { position: absolute; inset: 0; }
#bscan { position: absolute; inset: 0; z-index: 50; pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(0,0,0,.3) 0 1px, transparent 1px 3px); }
#bvig { position: absolute; inset: 0; z-index: 51; pointer-events: none; border-radius: inherit; box-shadow: inset 0 0 9vw rgba(0,0,0,.9); }
#bflick { position: absolute; inset: 0; z-index: 52; pointer-events: none; background: #000; animation: bveil .11s steps(2) infinite; }
@keyframes bveil { 0% { opacity: .04 } 100% { opacity: 0 } }
#bflash { position: absolute; inset: 0; z-index: 60; pointer-events: none; background: #fff; opacity: 0; }
#boss .bt { text-shadow: -1.5px 0 rgba(255,40,80,.5), 1.5px 0 rgba(40,200,255,.5), 0 0 10px currentColor; }
#boss .cn { position: absolute; width: 4vw; height: 4vw; border: 0 solid currentColor; }
#boss .tl { top: 2vw; left: 2vw; border-width: 2px 0 0 2px; } #boss .tr { top: 2vw; right: 2vw; border-width: 2px 2px 0 0; }
#boss .bl { bottom: 2vw; left: 2vw; border-width: 0 0 2px 2px; } #boss .br { bottom: 2vw; right: 2vw; border-width: 0 2px 2px 0; }
#boss .hd { position: absolute; top: 3vw; left: 3.5vw; line-height: 1.6; }
#boss .hd b { display: block; font-size: 2.2vw; letter-spacing: .3em; color: #fff; }
#boss .hx { opacity: .5; }
#boss .src { position: absolute; top: 3vw; right: 3.5vw; text-align: right; line-height: 1.6; }
#boss .src span { color: #fff; }
#boss .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2.6vh; text-align: center; }
#boss .big { position: relative; font-size: 7vw; font-weight: 700; color: #fff; letter-spacing: .12em; white-space: nowrap; line-height: 1.1;
  text-shadow: -2px 0 rgba(255,40,80,.6), 2px 0 rgba(40,200,255,.6), 0 0 30px var(--c); }
#boss .sub { font-size: 1.6vw; letter-spacing: .5em; color: #fff; }
#boss .note { font-size: 1.15vw; letter-spacing: .35em; opacity: .85; }
#boss .aur { font-size: 2vw; color: #fff; letter-spacing: .06em; text-shadow: 0 0 18px #4dff88; min-height: 1.3em; }
#boss .blink { animation: bblink 1s steps(1) infinite; } @keyframes bblink { 50% { opacity: 0 } }
#boss .pulse { animation: bpulse .9s ease-in-out infinite alternate; } @keyframes bpulse { to { transform: scale(1.07) } }
#boss .arrow { font-size: 6vw; color: #fff; animation: bpulse .5s ease-in-out infinite alternate; }
#boss .glitch::before, #boss .glitch::after { content: attr(data-text); position: absolute; inset: 0; }
#boss .glitch::before { color: #0ff; animation: bgA .22s steps(2) infinite; }
#boss .glitch::after { color: #f0f; animation: bgB .3s steps(2) infinite; }
@keyframes bgA { 0% { clip-path: inset(10% 0 70% 0); transform: translate(-7px,-2px) } 50% { clip-path: inset(45% 0 30% 0); transform: translate(6px,1px) }
  100% { clip-path: inset(80% 0 4% 0); transform: translate(-3px,2px) } }
@keyframes bgB { 0% { clip-path: inset(60% 0 20% 0); transform: translate(7px,2px) } 50% { clip-path: inset(5% 0 80% 0); transform: translate(-5px,-1px) }
  100% { clip-path: inset(30% 0 50% 0); transform: translate(4px,0) } }
#boss .pips { display: flex; gap: .7vw; justify-content: center; }
#boss .pips i { width: 2.4vw; height: 1vw; border: 2px solid currentColor; }
#boss .pips i.on { background: #fff; border-color: #fff; }
#boss .foot { position: absolute; left: 0; right: 0; bottom: 4vw; display: flex; flex-direction: column; gap: 1.4vh; align-items: center; }

/* Undertale's box: black, thick white border, pixel font, "* " lines, her face on the left */
#bdlg { position: absolute; z-index: 40; left: 12vw; right: 12vw; bottom: 7vh; height: 27vh; display: none; gap: 2.2vw; align-items: center;
  padding: 2.4vh 2.4vw; background: #000; border: .55vw solid #fff; color: #fff; font-family: NexusDlg, Consolas, monospace; letter-spacing: .03em; }
#bdlg.on { display: flex; animation: bdlgIn .2s steps(4) both; }
@keyframes bdlgIn { from { transform: scaleY(0) } }
#bdlg .pf { flex: none; height: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; }
#bdlg img { height: 94%; image-rendering: pixelated; }
#bdlg .tx { flex: 1; align-self: flex-start; padding-left: 1.1em; text-indent: -1.1em; font-size: 3.2vw; line-height: 1.32; white-space: pre-wrap; }
#bdlg.angry .pf { animation: bshake .1s steps(2) infinite; }
#bdlg.break { animation: bbreak .08s steps(2) infinite; }
@keyframes bshake { 0% { transform: translate(-.3vw,.2vw) } 100% { transform: translate(.3vw,-.2vw) } }
@keyframes bbreak { 0% { transform: translate(-1.2vw,.5vw) skewX(8deg) } 100% { transform: translate(1vw,-.6vw) skewX(-10deg) } }

/* the map (room 3): the booth from above, laid out like the floor plan */
#boss .map { position: absolute; left: 15vw; top: 20vh; width: 70vw; height: 37.8vw; }
#boss #rm4 em { bottom: 3.4vw; }
#boss .rm { position: absolute; border: 2px solid rgba(255,51,68,.55); background: rgba(255,51,68,.04); padding: .8vw 1vw; line-height: 1.5; }
#boss .rm b { display: block; color: #fff; font-size: 1.3vw; letter-spacing: .25em; }
#boss .rm i { font-style: normal; font-size: .95vw; opacity: .7; }
#boss .rm em { position: absolute; left: 1vw; right: 1vw; bottom: .9vw; font-style: normal; font-size: 1.35vw; color: #fff; display: none; }
#boss .rm em u { display: block; height: .55vw; margin-top: .5vw; background: rgba(77,255,136,.2); text-decoration: none; }
#boss .rm em s { display: block; height: 100%; background: #4dff88; transform-origin: left; transform: scaleX(0); transition: transform .4s; }
#boss .rm::after { content: ""; position: absolute; inset: 0; background: #4dff88; opacity: 0; pointer-events: none; }
#boss .rm.her { border-color: #4dff88; color: #4dff88; }
#boss .rm.her em { display: block; }
#boss .rm.her::after { animation: bher .8s ease-in-out infinite alternate; }
@keyframes bher { from { opacity: .05 } to { opacity: .22 } }
#boss .rm.pure { border-color: #ff3344; }
#boss .rm.pure em { display: block; color: #ff3344; }
#boss .rm.hit::after { animation: bhit .6s ease-out; }
@keyframes bhit { from { opacity: .9; background: #fff } to { opacity: 0 } }
#boss .rm.here { border-style: dashed; border-color: #fff; }
#boss .rm.dim { opacity: .45; }
#boss .rm .ex { position: absolute; left: 0; bottom: 0; padding: .5vw .8vw; background: #7a4bb0; color: #fff; font-size: .9vw; letter-spacing: .3em; }
#boss .sweep { position: absolute; top: -3%; bottom: -3%; left: 0; width: 3px; background: #fff; box-shadow: 0 0 1.4vw .4vw #4dff88; opacity: 0; }
#boss .scan .sweep { animation: bsweep var(--t) linear both; }
@keyframes bsweep { 0% { opacity: 1; transform: translateX(0) } 96% { opacity: 1 } 100% { opacity: 0; transform: translateX(70vw) } }
#boss .mapnote { position: absolute; left: 0; right: 0; bottom: 5vh; text-align: center; }

/* tasks */
#boss .grps { display: flex; gap: 2.6vw; }
#boss .grp { border: 2px solid currentColor; padding: 1.2vw 1.8vw; min-width: 15vw; opacity: .4; }
#boss .grp b { display: block; font-size: 4.6vw; letter-spacing: .22em; color: #fff; }
#boss .grp i { display: block; font-style: normal; font-size: 3vw; margin-top: .4vw; min-height: 1.2em; }
#boss .grp.cur { opacity: 1; border-color: #fff; box-shadow: 0 0 0 .3vw #4dff88; }
#boss .grp.ok { opacity: 1; color: #ff3344; border-color: #ff3344; }
#boss .tbl { display: grid; grid-auto-flow: column; grid-template-rows: auto auto; gap: .2vw 2.4vw; padding: .8vw 1.8vw;
  border: 1px solid currentColor; font-size: 1.35vw; line-height: 1.7; background: rgba(0,10,4,.7); }
#boss .tbl b { color: #fff; font-weight: 400; }
#boss .word { font-weight: 700; letter-spacing: .04em; white-space: nowrap; }
#boss .word span { color: rgba(77,255,136,.35); }
#boss .word span.on { color: #fff; text-shadow: 0 0 14px #4dff88; }
#boss .word span.nx { color: #4dff88; border-bottom: .35vw solid #fff; }
#boss .word span.bad { color: #ff3344; border-color: #ff3344; }

/* kill switch */
#boss .key { padding: 3vh 6vw; border: .55vw solid #fff; color: #fff; font-size: 6vw; font-weight: 700; letter-spacing: .2em;
  box-shadow: 0 1.4vw 0 #ff3344; margin-bottom: 1.4vw; }
#boss .key.go { animation: bpulse .45s ease-in-out infinite alternate; }
#boss .key.hit { box-shadow: 0 .3vw 0 #ff3344; translate: 0 1.1vw; }
#boss .lights { display: flex; gap: 2vw; }
#boss .lights span { padding: 1.2vw 2.4vw; border: 2px solid #ff3344; font-size: 2.4vw; color: #ff3344; }
#boss .lights span.on { background: #fff; border-color: #fff; color: #000; }
#boss .lights.big span { font-size: 4.4vw; padding: 2vw 4vw; }
#boss .fail { min-height: 1.4em; font-size: 2.4vw; color: #fff; letter-spacing: .2em; }
#boss .term { min-width: 56vw; padding: 1.6vw 2.2vw; border: 1px solid currentColor; background: rgba(8,0,2,.9); text-align: left;
  font-size: 1.45vw; line-height: 1.8; white-space: pre-wrap; }
#bfocus { position: absolute; z-index: 45; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
  gap: 2vh; background: rgba(0,0,0,.85); color: #fff; text-align: center; }
#boss.unfocused #bfocus { display: flex; }
#bhelp { position: absolute; z-index: 70; top: 12px; right: 12px; display: none; padding: 10px 14px; background: rgba(0,0,0,.9);
  border: 1px solid #4dff88; color: #4dff88; font: 14px/1.6 Consolas, monospace; letter-spacing: 0; white-space: pre; }
#boss.help #bhelp { display: block; }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));

// ===== The overlay: built the first time the finale reaches this room =====
let B, fxc, fx, fw = 0, fh = 0, live = false;
function wake() {
  if (live) return;
  live = true; AX.resume();
  B = document.createElement('div'); B.id = 'boss';
  B.innerHTML = '<canvas id="bx"></canvas><div id="bgrid"></div><div id="bmain"></div>' +
    '<div id="bdlg"><div class="pf"><img alt=""></div><div class="tx"></div></div>' +
    '<div id="bfocus"><div class="big">CLICK HERE</div><div class="sub">MOVE THE MOUSE OFF THE RIGHT EDGE OF THE LAPTOP, ONTO THIS WALL, AND CLICK</div></div>' +
    '<div id="bflash"></div><div id="bscan"></div><div id="bvig"></div><div id="bflick"></div><div id="bhelp"></div>';
  document.documentElement.append(B);   // outside <body>, so hiding the page doesn't hide us
  B.classList.add('on');
  fxc = $('bx'); fx = fxc.getContext('2d');
  sizeFx(); addEventListener('resize', sizeFx);
  window.requestAnimationFrame = () => 0;   // ponytail: freezes the page's own drawing loop for good; Ctrl+Alt+R reloads it
  raf(frame);
}
function hidePage() { document.documentElement.classList.add('boss-on'); silencePage(); }
const main = html => $('bmain').innerHTML = html;
const theme = t => B.classList.toggle('red', t === 'red');
function flash(o, ms, bg = '#fff') { const f = $('bflash'); f.style.background = bg; f.animate([{ opacity: o }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }); }
function shake(el, px, ms) {
  const kf = Array.from({ length: 12 }, () => ({ transform: `translate(${rand(-px, px)}px,${rand(-px, px) / 2}px)` }));
  kf.push({ transform: 'none' }); el.animate(kf, ms);
}
async function resolveText(el, text, ms) {     // letters scramble, then lock in left to right
  const chars = [...text], pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&';
  let locked = 0;
  const s = setInterval(() => el.textContent = chars.map((c, i) => i < locked || c === ' ' ? c : any(pool)).join(''), 40);
  for (; locked < chars.length; locked++) { await wait(ms); if (chars[locked] !== ' ') sfx.tick(); }
  clearInterval(s); el.textContent = text;
}
function stamp(el) { el.dataset.text = el.textContent; el.classList.add('glitch'); sfx.stamp(); setTimeout(() => el.classList.remove('glitch'), 700); }
const hd = sub => `<i class="cn tl"></i><i class="cn tr"></i><i class="cn bl"></i><i class="cn br"></i>` +
  `<div class="hd bt"><b>AURORA//EVERYWHERE</b>${sub}<br><span class="hx"></span></div>`;
const hex4 = () => (Math.random() * 0xffff | 0).toString(16).toUpperCase().padStart(4, '0');
setInterval(() => live && B.querySelectorAll('.hx').forEach(e => e.textContent = Array.from({ length: 6 }, hex4).join(' ')), 400);
const strip = v => ROOM === 4 && page(() => laser(v));   // game 4's Govee strip behind the screen (its page's laser())

// ===== The effects canvas: low resolution, scaled up with hard pixels =====
let scene = null, rainK = 0, cols = [], lastT = 0;
function sizeFx() {
  fw = Math.ceil(innerWidth / C.PIX); fh = Math.ceil(innerHeight / C.PIX);
  fxc.width = fw; fxc.height = fh; fx.imageSmoothingEnabled = false;
  cols = Array.from({ length: Math.ceil(fw / 6) }, (_, i) => ({ x: i * 6, y: rand(-fh, fh), v: rand(25, 75) })).sort(() => Math.random() - .5);
  grid = null;
}
function clearFx() { fx.clearRect(0, 0, fw, fh); }
function frame(now) {
  raf(frame);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (scene) scene(now, dt);
}
const GLYPHS = 'アイウエオカキクケコサシスセソ01AURORA<>/\\#%$';
function rain(now, dt) {                      // her code rain: one glyph per column per frame, the old ones fade out
  fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
  fx.fillStyle = 'rgba(0,0,0,.16)'; fx.fillRect(0, 0, fw, fh);
  fx.font = 'bold 8px monospace';
  const n = Math.ceil(cols.length * clamp(rainK, .05, 1));
  for (let i = 0; i < n; i++) {
    const c = cols[i];
    c.y += c.v * dt * (.6 + rainK);
    if (c.y > fh + 8) { c.y = rand(-40, 0); c.v = rand(25, 75); }
    fx.globalAlpha = .35 + .65 * rainK;
    fx.fillStyle = Math.random() < .08 ? '#fff' : '#4dff88';
    fx.fillText(any(GLYPHS), c.x, c.y);
  }
  fx.globalAlpha = 1;
}
const setRain = k => { rainK = k; if (scene !== rain) { clearFx(); scene = rain; } };
let noiseFrames = null;
function noiseScene() {                       // the crash: static and tearing bands
  if (!noiseFrames) noiseFrames = [0, 1, 2].map(() => {
    const im = fx.createImageData(fw, fh), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() < .5 ? 0 : Math.random() * 255; d[i] = v * .3; d[i + 1] = v; d[i + 2] = v * .55; d[i + 3] = 255; }
    return im;
  });
  fx.putImageData(any(noiseFrames), 0, 0);
  for (let k = 0; k < 6; k++) { fx.fillStyle = any(['#fff', '#4dff88', '#ff3344', '#000']); fx.fillRect(0, rand(0, fh), fw, rand(1, 14)); }
}
function stutter() {                          // the frame jerks and the sound sticks on one broken buffer
  const len = AX.sampleRate * .07 | 0, b = AX.createBuffer(1, len, AX.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * .4 + Math.sign(Math.sin(i / AX.sampleRate * TAU * 180)) * .3;
  const s = AX.createBufferSource(), g = AX.createGain(); s.buffer = b; s.loop = true; g.gain.value = .55;
  s.connect(g).connect(master); s.start(); s.stop(AX.currentTime + .7);
  document.body.animate(Array.from({ length: 9 }, (_, i) => ({ transform: i % 2 ? `translate(${rand(-40, 40)}px,${rand(-8, 8)}px) skewX(${rand(-12, 12)}deg)` : 'none',
    filter: i === 4 ? 'invert(1)' : 'none' })), { duration: 700, easing: 'steps(9)' });
}

// ===== Her lines: the Undertale box =====
let dlgKey = null, dlgCut = false;
async function talk(lines, o = {}) {
  const box = $('bdlg'), tx = box.querySelector('.tx'), img = box.querySelector('img');
  dlgCut = false; box.classList.add('on');
  for (const [text, mood] of lines) {
    if (dlgCut || o.cancel?.()) break;
    img.src = face(mood || 'base'); box.classList.toggle('angry', mood === 'angry');
    await line(tx, text, VOICES[mood === 'angry' ? 'angry' : o.voice || 'aurora'], o);
  }
  if (!o.keep) { box.classList.remove('on', 'angry'); tx.textContent = ''; }
}
async function line(tx, text, v, o) {
  const t0 = performance.now();
  let typing = true, skip = false, next = false, n = 0;
  dlgKey = () => { if (o.auto || performance.now() - t0 < C.SKIP_GUARD) return; if (typing) skip = true; else next = true; };
  tx.textContent = '* ';
  for (const ch of text) {
    if (skip || dlgCut || o.cancel?.()) { tx.textContent = '* ' + text; break; }
    tx.textContent += ch;
    if (/\w/.test(ch) && n++ % v.every === 0) blip(v);
    await wait(/[.,?!]/.test(ch) ? C.TYPE_MS * 4 : C.TYPE_MS);
  }
  typing = false;
  const end = performance.now() + C.HOLD_MS;
  while (!next && !dlgCut && performance.now() < end && !o.cancel?.()) await wait(40);
  dlgKey = null;
}
async function dlgBreak() {                   // the box tears apart and she spills out of it
  const box = $('bdlg');
  box.classList.add('break'); for (let i = 0; i < 6; i++) { sfx.glitch(); blip(VOICES.angry); await wait(60); }
  box.classList.remove('on', 'break', 'angry'); box.querySelector('.tx').textContent = '';
  flash(.8, 300, '#4dff88');
}
async function dissolve() {                   // her face falls apart into green pixels
  const img = $('bdlg').querySelector('img'), r = img.getBoundingClientRect();
  if (!r.width) return;
  const N = 24, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  let d; try { x.drawImage(img, 0, 0, N, N); d = x.getImageData(0, 0, N, N).data; } catch { return; }
  $('bdlg').classList.remove('on');
  const ps = [], s = r.width / N / C.PIX;
  for (let i = 0; i < N * N; i++) if (d[i * 4 + 3] > 100) ps.push({ x: r.left / C.PIX + (i % N) * s, y: r.top / C.PIX + (i / N | 0) * s,
    vx: rand(-4, 22), vy: rand(-26, -4), c: `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`, t: rand(0, .9) });
  const t0 = performance.now();
  scene = (now, dt) => {
    const k = (now - t0) / 1000; clearFx();
    for (const p of ps) {
      if (k > p.t) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; }
      fx.globalAlpha = clamp(1 - (k - p.t) / 1.6, 0, 1); fx.fillStyle = p.c; fx.fillRect(p.x, p.y, Math.ceil(s), Math.ceil(s));
    }
    fx.globalAlpha = 1;
  };
  await wait(2700); scene = null; clearFx();
}

// ===== Following the hub =====
let phase = null, gen = 0, evAt, armed = false, task = null, cur = null, pressed = false, view = '';   // view: arm | task | purge | swap | clean
function apply(s) {
  const was = S; S = s;
  if (!s.phase) { if (live) location.reload(); return; }   // FINISH RUN / NEW TEAM: back to this room's own game
  if (s.phase === 'crash' && ROOM !== 4) return;           // the crash is room 4's; the others wake at the takeover
  const ev = s.ev && s.ev.at !== evAt ? s.ev : null; evAt = s.ev?.at;
  if (s.phase !== phase) { const from = phase; phase = s.phase; enter(from); }
  else changed();
  if (ev && was) onEvent(ev);
}
function enter(from) {
  const g = ++gen, restore = from == null;   // restore = this laptop (re)loaded mid-finale: no intros
  wake();
  if (phase !== 'crash') { hidePage(); B.classList.remove('see', 'black'); }
  ({ crash: () => crash(restore), takeover: () => takeover(g, restore), fight: () => fight(g, from), regroup: () => regroup(g, restore),
     brief: () => brief(g), kill: () => kill(g), end: () => theEnd(g, restore) })[phase]?.();
}
function changed() {
  if (phase === 'fight') ROOM === 3 ? drawMap() : view === 'clean' && cleanScreen();
  if (phase === 'kill') drawKill();
}
function onEvent(ev) {
  if (ev.k === 'clear') {
    if (ROOM === 3) { $('rm' + ev.room)?.classList.add('hit'); setTimeout(() => $('rm' + ev.room)?.classList.remove('hit'), 700); if (ev.swap) sfx.glitch(); }
    if (ev.swap && (ROOM === 1 || ROOM === 2)) swapped(ev);
  }
  if (ev.k === 'ready') { sfx.ready(); }
  if (ev.k === 'fail') failed(ev);
}
const mine = () => Object.entries(S.tasks).find(([, t]) => t.room === ROOM && !t.clear);

// ===== Room 4: game 4's fake win breaks =====
let crashed = false;
async function crash(restore) {
  if (crashed) return;
  crashed = true; wake(); if (!phase) phase = 'crash';
  send({ t: 'fin', a: 'crash' });
  if (!restore) {
    B.classList.add('see');                   // the fake win still shows through while it breaks
    await wait(1100);                         // frozen at 97%...
    silencePage();                            // ...the music dies mid-note
    await wait(800);
    stutter(); await wait(700);
    hidePage(); B.classList.remove('see'); one('crash'); shake(B, 18, 600); strip('miss');
    scene = noiseScene; await wait(700);
    scene = null; clearFx(); main('');
    await wait(1300);                         // black. silence. then she talks
  } else hidePage();
  if (phase !== 'crash') return;
  await talk(SAY.crash, { cancel: () => phase !== 'crash', keep: true });
  if (phase !== 'crash') return;
  await dlgBreak();
  send({ t: 'fin', a: 'takeover' });
}

// ===== Every room: she takes over, at one hub time =====
async function takeover(g, restore) {
  theme('green');
  if (!restore) {
    await until(S.at); if (g !== gen) return;
    flash(1, 160); one('takeover'); shake(B, 14, 600); setRain(1); strip('miss');
    main(`<div class="mid"><div class="big" id="btk"></div><div class="sub">IS IN EVERY ROOM</div></div>`);
    await resolveText($('btk'), 'AURORA', 70); stamp($('btk'));
    await wait(1500); if (g !== gen) return;
  }
  if (ROOM === 3) {
    setRain(.35); loop('siren', true);
    main(hd('SECTOR 03 ▸ <span style="color:#fff">SIGNAL SOURCE</span>') +
      `<div class="mid"><div class="note">HER SIGNAL IS COMING FROM THIS ROOM</div><div class="big pulse">TRACE HER</div>` +
      `<div class="sub">PRESS SPACE TO TRACE HER</div></div>`);
  } else if (ROOM === 4) {
    setRain(.5);
    main(hd('SECTOR 04 ▸ LOCKED') + `<div class="mid"><div class="note">SHE SHUT YOU OUT OF THIS ROOM</div><div class="big pulse">LOCKED</div>` +
      (C.ARROW ? `<div class="arrow">${C.ARROW}</div>` : '') +
      `<div class="sub">GO BACK TO SECTOR 03</div><div class="note">THE ROOM YOU CAME FROM</div></div>`);
  } else {
    setRain(.5);
    main(hd(SEC(ROOM) + ' ▸ HERS') + `<div class="mid"><div class="big">INFECTED</div><div class="sub">${SEC(ROOM)} ▸ SHE IS IN THIS ROOM</div></div>`);
  }
}

// ===== The fight =====
async function fight(g, from) {
  theme('green'); loop('siren', false);
  if (ROOM === 3) {
    const ms = S.at - hubNow();
    mapScreen(from === 'takeover' && ms > 300 ? ms : 0);
    loop('fight', true);
    return;
  }
  if (from === 'takeover') { await until(S.at); if (g !== gen) return; }   // her rooms light up as the trace reaches them
  if (!mine()) return cleanScreen();
  armed ? startTask(mine()) : armScreen();
}
function armScreen() {
  const [name] = mine();
  view = 'arm'; setRain(1); loop('siren', true);
  main(hd(SEC(ROOM) + ' ▸ ' + NAME[name]) + `<div class="mid"><div class="note">${SEC(ROOM)}</div><div class="big pulse">SHE'S HERE</div>` +
    `<div class="sub">PRESS SPACE WHEN YOU'RE HERE</div></div>`);
}
function arm() {
  if (armed || !mine()) return;
  armed = true; loop('siren', false); sfx.ok(); flash(.4, 200, '#4dff88');
  startTask(mine());
}
function startTask([name, t]) {
  task?.stop(); theme('green'); loop('fight', true);
  view = 'task'; cur = { name, done: t.done, need: need(name) };
  task = ({ binary: binaryTask, words: wordsTask, cross: crossTask })[name]();
}
function step(done) {
  if (!cur) return;
  cur.done = done; send({ t: 'fin', a: 'step', task: cur.name, done });
  const p = $('bpips'); if (p) [...p.children].forEach((e, i) => e.classList.toggle('on', i < done));
  if (done >= cur.need) { send({ t: 'fin', a: 'clear', task: cur.name }); purge(); }
}
const pips = () => `<div class="pips" id="bpips">${Array.from({ length: cur.need }, (_, i) => `<i class="${i < cur.done ? 'on' : ''}"></i>`).join('')}</div>`;
const source = (k, from, what) => `<div class="src bt">${k.toUpperCase()} <span>${res(k)}%</span> ▸ FROM ${SEC(from)}<br>${what}</div>`;
async function purge() {                      // this room's task is done: it goes back to red
  const g = gen, scream = any(SAY.purged);
  task?.stop(); task = cur = null; view = 'purge'; loop('fight', false); scene = null; clearFx();
  theme('red'); flash(.6, 350, '#ff3344'); one('purged'); shake(B, 12, 500);
  main(hd(SEC(ROOM) + ' ▸ CLEAN') + `<div class="mid"><div class="note">${SEC(ROOM)}</div><div class="big" id="bst"></div>` +
    `<div class="aur glitch" data-text="${scream}">${scream}</div></div>`);
  await resolveText($('bst'), 'PURGED', 60); stamp($('bst'));
  await wait(1700);
  if (g === gen && view === 'purge' && phase === 'fight') cleanScreen();
}
function cleanScreen(note) {
  const left = Object.values(S.tasks).filter(t => !t.clear).map(t => '0' + t.room).sort();
  view = 'clean'; theme('red'); scene = null; clearFx(); loop('siren', false);
  main(hd(SEC(ROOM) + ' ▸ CLEAN') + `<div class="mid"><div class="note">${note || SEC(ROOM) + ' IS CLEAN'}</div><div class="big">STAY HERE</div>` +
    `<div class="sub">${left.length ? 'SHE\'S STILL IN SECTOR ' + left.join(' · ') : 'SHE HAS NOWHERE LEFT'}</div></div>`);
}
async function swapped(ev) {                  // she jumped: rooms 1 and 2 traded tasks
  const g = gen, had = cur?.name;
  if (ev.room === ROOM) { await wait(2000); if (g !== gen) return; }   // let this room's PURGED stamp play first
  const t = mine();
  if (cur && t && t[0] === cur.name) return;
  task?.stop(); task = cur = null; view = 'swap'; loop('fight', false);
  theme('green'); setRain(1); flash(.5, 220, '#4dff88'); sfx.glitch(); shake(B, 16, 500);
  main(`<div class="mid"><div class="big glitch" data-text="SHE'S MOVING">SHE'S MOVING</div><div class="sub">${t ? 'SHE JUMPED INTO ' + SEC(ROOM) : 'SHE LEFT ' + SEC(ROOM)}</div></div>`);
  await wait(1600); if (g !== gen) return;
  if (t) { armed = true; startTask(t); }
  else cleanScreen(`SHE TOOK ${NAME[had] || 'HER TASK'} TO ${SEC(Object.values(S.tasks).find(x => !x.clear && x.room !== 4)?.room || 3 - ROOM)}`);
}

// --- BINARY: decode each 4-bit group into its digit (the table is on screen) ---
function binaryTask() {
  const digits = Array.from({ length: cur.need }, () => rand(0, 10) | 0), bits = d => d.toString(2).padStart(4, '0');
  let at = cur.done;
  setRain(.15);
  main(hd(SEC(ROOM) + ' ▸ BINARY') + source('sync', 1, `<span>${cur.need}</span> GROUPS`) +
    `<div class="mid"><div class="note">SHE LOCKED THIS SECTOR IN BINARY</div><div class="grps" id="bgr"></div>` +
    `<div class="sub" id="bask"></div></div>` +
    `<div class="foot"><div class="tbl bt">${Array.from({ length: 10 }, (_, d) => `<span><b>${d}</b> = ${bits(d)}</span>`).join('')}</div>${pips()}</div>`);
  const draw = () => {
    $('bgr').innerHTML = digits.map((d, i) => `<div class="grp ${i < at ? 'ok' : i === at ? 'cur' : ''}"><b>${bits(d)}</b><i>${i < at ? d : i === at ? '?' : ''}</i></div>`).join('');
    $('bask').textContent = at < cur.need ? `GROUP ${at + 1} ▸ TYPE ITS DIGIT` : '';
  };
  draw();
  const tease = setInterval(() => {           // she scrambles the bits for a moment (never the answer)
    const e = B.querySelector('.grp.cur b'); if (!e) return;
    const real = e.textContent; e.textContent = bits(rand(0, 16) | 0).slice(-4); sfx.glitch();
    setTimeout(() => e.textContent = real, 180);
  }, 5200);
  return {
    key(e) {
      if (!/^[0-9]$/.test(e.key)) return;
      if (+e.key === digits[at]) { at++; sfx.ok(); draw(); step(at); }
      else { sfx.bad(); shake(B.querySelector('.grp.cur') || B, 10, 300); digits[at] = rand(0, 10) | 0; setTimeout(draw, 200); }
    },
    stop() { clearInterval(tease); },
  };
}
// --- WORDS: type a really difficult word, 5 rounds. A wrong letter is refused ---
function wordsTask() {
  const list = WORD_LISTS[res('power') < C.WORDS_HARD_BELOW ? 1 : 0].slice().sort(() => Math.random() - .5);
  let w = cur.done, i = 0;
  setRain(.15);
  main(hd(SEC(ROOM) + ' ▸ WORDS') + source('power', 2, res('power') < C.WORDS_HARD_BELOW ? '<span>HARDEST</span> WORDS' : '<span>HARD</span> WORDS') +
    `<div class="mid"><div class="note" id="bwn"></div><div class="word" id="bwd"></div><div class="sub">TYPE IT. EVERY LETTER.</div></div><div class="foot">${pips()}</div>`);
  const draw = () => {
    const word = list[w % list.length];
    $('bwn').textContent = `WORD ${w + 1} / ${cur.need}`;
    $('bwd').style.fontSize = Math.min(7, 150 / word.length) + 'vw';
    $('bwd').innerHTML = [...word].map((ch, k) => `<span class="${k < i ? 'on' : k === i ? 'nx' : ''}">${ch.toUpperCase()}</span>`).join('');
  };
  draw();
  return {
    key(e) {
      if (!/^[a-z]$/i.test(e.key) || w >= cur.need) return;
      const word = list[w % list.length], el = $('bwd').children[i];
      if (e.key.toLowerCase() === word[i]) {
        sfx.key(); el.className = 'on'; i++;
        if ($('bwd').children[i]) $('bwd').children[i].className = 'nx';
        if (i >= word.length) { w++; i = 0; sfx.ok(); flash(.25, 200, '#4dff88'); const more = w < cur.need; step(w); if (more) setTimeout(draw, 250); }
      } else { sfx.bad(); el.className = 'nx bad'; shake($('bwd'), 8, 260); setTimeout(() => el.className === 'nx bad' && (el.className = 'nx'), 260); }
    },
    stop() {},
  };
}
// --- CROSSHAIR (room 4): the outer knob moves it left/right, the inner knob up/down. Hold it on her ---
let grid = null;
function crossTask() {
  const K = C.CROSS, h = res('human') / 100, keys = {}, parts = [], n = cur.need;
  let hint = '';
  let catches = cur.done, lock = 0, inv = 0, lastCatch = performance.now(), tired = false, stall = 0, nextStall = performance.now() + rand(3000, 5000);
  let cx = .5, cy = .5, her = { x: .2, y: .2, vx: 0, vy: 0, tx: .5, ty: .5, retarget: 0, boost: 0, dodgeAt: 0 };
  const speedNo = Math.round(1 + h * 4);
  main(hd('SECTOR 04 ▸ CROSSHAIR') + source('human', 4, `HER SPEED <span>${speedNo}</span> / 5`) +
    `<div class="foot"><div class="note" id="bxk"></div><div class="aur" id="bxa"></div>${pips()}</div>`);
  const A = () => ({ x: fw * .06, y: fh * .17, w: fw * .88, h: fh * .62 });
  const ar = () => { const a = A(); return a.w / a.h; };
  const respawn = () => {                     // somewhere far from the crosshair
    let best = null, far = -1;
    for (let k = 0; k < 20; k++) { const p = { x: rand(.06, ar() - .06), y: rand(.06, .94) }, d = Math.hypot(p.x - cx * ar(), p.y - cy); if (d > far) { far = d; best = p; } }
    Object.assign(her, best, { vx: 0, vy: 0, retarget: 0 });
  };
  respawn();
  const knob = i => page(() => potLive(i) ? knobs[i] : null, null);
  scene = (now, dt) => {
    const a = A(), R = ar();
    // the crosshair: the knobs when their controllers talk, else the keys (A/D ←/→ across, W/S ↑/↓ up and down)
    const k0 = knob(0), k1 = knob(1);
    cx = k0 != null ? k0 : clamp(cx + ((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0)) * K.keySpeed * dt, 0, 1);
    cy = k1 != null ? (K.flipY ? 1 - k1 : k1) : clamp(cy + ((keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0)) * K.keySpeed * dt, 0, 1);
    const hn = `${k0 != null ? 'OUTER KNOB' : 'A / D'} ↔   ·   ${k1 != null ? 'INNER KNOB' : 'W / S'} ↕   ·   HOLD THE CROSSHAIR ON HER`;
    if (hn !== hint) $('bxk').textContent = hint = hn;   // DOM only when it changes: a write every frame repaints it every frame
    const px = cx * R, py = cy;
    // her: wanders between targets, dodges when the crosshair gets close, stalls now and then (the window to catch her)
    if (!tired && (now - lastCatch) / 1000 > K.tiredS) { tired = true; $('bxa').textContent = SAY.tired; }
    if (now > nextStall) { stall = now + 700; nextStall = now + rand(3000, 5000); }
    const near = Math.hypot(her.x - px, her.y - py);
    if (near < K.hit * 2.4 && now > her.dodgeAt && now > stall && Math.random() < dt * 1.2) {
      her.tx = clamp(her.x + (her.x - px) * 4 + rand(-.2, .2), .06, R - .06); her.ty = clamp(her.y + (her.y - py) * 4 + rand(-.2, .2), .06, .94);
      her.boost = now + 500; her.dodgeAt = now + 1600;
    } else if (now > her.retarget || Math.hypot(her.tx - her.x, her.ty - her.y) < .05) {
      her.tx = rand(.06, R - .06); her.ty = rand(.06, .94); her.retarget = now + rand(900, 1800);
    }
    const sp = (K.speed[0] + (K.speed[1] - K.speed[0]) * h) * (1 + K.up * catches) * (tired ? .5 : 1) * (now < stall ? .25 : 1) * (now < her.boost ? 1.7 : 1);
    const dx = her.tx - her.x, dy = her.ty - her.y, dl = Math.hypot(dx, dy) || 1;
    her.vx += (dx / dl * sp - her.vx) * Math.min(1, dt * 3); her.vy += (dy / dl * sp - her.vy) * Math.min(1, dt * 3);
    her.x = clamp(her.x + her.vx * dt, .04, R - .04); her.y = clamp(her.y + her.vy * dt, .04, .96);
    // lock on
    const on = near < K.hit && now > inv;
    lock = on ? lock + dt * 1000 / K.lockMs : Math.max(0, lock - dt * 1.5);
    if (lock >= 1) {
      lock = 0; catches++; lastCatch = now; inv = now + 600; tired = false; $('bxa').textContent = '';
      const bx = a.x + her.x * a.h, by = a.y + her.y * a.h;
      for (let k = 0; k < 60; k++) { const an = rand(0, TAU), s = rand(20, 110); parts.push({ x: bx, y: by, vx: Math.cos(an) * s, vy: Math.sin(an) * s, t: rand(.3, .9), c: any(['#fff', '#4dff88', '#b8ffd0']) }); }
      sfx.catch(); strip('hit'); flash(.3, 220, '#4dff88');
      respawn(); step(catches);
      if (catches >= n) return;
    }
    // draw (low resolution: every line is a fat pixel)
    if (!grid || grid.width !== fw) {           // the arena, drawn once
      grid = document.createElement('canvas'); grid.width = fw; grid.height = fh;
      const g = grid.getContext('2d'); g.strokeStyle = 'rgba(77,255,136,.12)'; g.lineWidth = 1;
      for (let x = a.x; x <= a.x + a.w + .1; x += a.w / 16) { g.beginPath(); g.moveTo((x | 0) + .5, a.y); g.lineTo((x | 0) + .5, a.y + a.h); g.stroke(); }
      for (let y = a.y; y <= a.y + a.h + .1; y += a.h / 8) { g.beginPath(); g.moveTo(a.x, (y | 0) + .5); g.lineTo(a.x + a.w, (y | 0) + .5); g.stroke(); }
      g.strokeStyle = 'rgba(77,255,136,.5)'; g.strokeRect((a.x | 0) + .5, (a.y | 0) + .5, a.w | 0, a.h | 0);
    }
    fx.globalAlpha = 1; fx.fillStyle = 'rgba(0,0,0,.35)'; fx.fillRect(0, 0, fw, fh);   // what moves leaves a short trail
    fx.drawImage(grid, 0, 0);
    const hx = a.x + her.x * a.h, hy = a.y + her.y * a.h, flick = now < stall && (now / 60 | 0) % 2;
    if (!flick) {
      fx.globalAlpha = .18; fx.fillStyle = '#4dff88'; fx.beginPath(); fx.arc(hx, hy, 9 + 2 * Math.sin(now / 90), 0, TAU); fx.fill();
      fx.globalAlpha = .45; fx.beginPath(); fx.arc(hx, hy, 5, 0, TAU); fx.fill();
      fx.globalAlpha = 1; fx.fillStyle = '#fff'; fx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
    }
    const ux = a.x + px * a.h, uy = a.y + py * a.h, rr = K.hit * a.h;
    fx.fillStyle = 'rgba(255,51,68,.55)'; fx.fillRect(a.x, uy | 0, a.w, 1); fx.fillRect(ux | 0, a.y, 1, a.h);
    fx.strokeStyle = on ? '#fff' : '#ff3344'; fx.lineWidth = 1; fx.strokeRect((ux - 4 | 0) + .5, (uy - 4 | 0) + .5, 8, 8);
    fx.beginPath(); fx.arc(ux, uy, rr, 0, TAU); fx.globalAlpha = .4; fx.stroke(); fx.globalAlpha = 1;
    if (lock > 0) { fx.strokeStyle = '#fff'; fx.lineWidth = 2; fx.beginPath(); fx.arc(ux, uy, rr + 2, -Math.PI / 2, -Math.PI / 2 + lock * TAU); fx.stroke(); }
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k]; p.t -= dt; if (p.t <= 0) { parts.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; fx.fillStyle = p.c; fx.globalAlpha = Math.min(1, p.t * 2); fx.fillRect(p.x | 0, p.y | 0, 1, 1);
    }
    fx.globalAlpha = 1;
  };
  return { key(e) { keys[e.code] = true; }, up(e) { delete keys[e.code]; }, blur() { for (const k in keys) delete keys[k]; }, stop() { scene = null; clearFx(); } };
}

// ===== Room 3: the map =====
// the booth from above, from the floor plan: [room, left, top, width, height] in % of the map, label, small print
const PLAN = [[4, 0, 0, 30, 99], [3, 30.5, 0, 25.5, 52], ['hq', 56.2, 0, 36.5, 52], [2, 30, 53, 44.2, 42], [1, 74.4, 53, 25.6, 42]];
const SMALL = { 4: 'GAME 4', 3: 'YOU ARE HERE', hq: 'STAFF', 2: 'THE HALLWAY', 1: 'THE ENTRANCE' };
function mapScreen(scanMs) {
  setRain(.22);
  main(hd('SECTOR 03 ▸ THE MAP') + `<div class="map ${scanMs ? 'scan' : ''}" style="--t:${scanMs}ms">` +
    PLAN.map(([r, l, t, w, hh]) => `<div class="rm ${r === 3 ? 'here' : r === 'hq' ? 'dim' : ''}" id="rm${r}" style="left:${l}%;top:${t}%;width:${w}%;height:${hh}%">` +
      `<b>${r === 'hq' ? 'HQ' : SEC(r)}</b><i>${SMALL[r]}</i>${r === 4 ? '<span class="ex">EXIT</span>' : ''}<em></em></div>`).join('') +
    `<div class="sweep"></div></div><div class="mapnote"><div class="sub" id="bmn"></div></div>`);
  if (!scanMs) return drawMap();
  sfx.scan(scanMs / 1000); $('bmn').textContent = 'TRACING HER...';
  const g = gen;
  [4, 2, 1].forEach(r => setTimeout(() => {   // a room lights up as the sweep crosses it
    if (g !== gen) return;
    const t = Object.entries(S.tasks).find(([, x]) => x.room === r && !x.clear);
    if (t) { mapRoom(r, t); sfx.stamp(); flash(.15, 200, '#4dff88'); }
  }, scanMs * ({ 4: .2, 2: .55, 1: .88 })[r]));
  setTimeout(() => g === gen && drawMap(), scanMs + 50);
}
function mapRoom(r, t) {                      // t = [name, task] still alive in room r, or nothing (that room is clean)
  const el = $('rm' + r); if (!el) return;
  const [name, x] = t || [];
  el.classList.toggle('her', !!t); el.classList.toggle('pure', !t);
  el.querySelector('em').innerHTML = t ? `${NAME[name]} ${x.done}/${need(name)}<u><s style="transform:scaleX(${x.done / need(name)})"></s></u>` : 'CLEAN';
}
function drawMap() {
  if (!$('rm1')) return;
  [1, 2, 4].forEach(r => mapRoom(r, Object.entries(S.tasks).find(([, x]) => x.room === r && !x.clear)));
  const left = Object.values(S.tasks).filter(t => !t.clear).map(t => '0' + t.room).sort();
  $('bmn').textContent = left.length ? `SHE'S IN SECTOR ${left.join(' · ')}` : 'SHE HAS NOWHERE LEFT';
}

// ===== Back to the map, the briefing, the kill switch =====
async function regroup(g, restore) {
  if (!restore) { await until(S.at); if (g !== gen) return; }
  regroupScreen();
}
function regroupScreen() {
  task?.stop(); task = cur = null; view = ''; quiet(); theme('red'); scene = null; clearFx();
  if (ROOM === 3) return main(hd('SECTOR 03 ▸ THE MAP') + `<div class="mid"><div class="note">EVERY ROOM IS CLEAN. SHE'S HIDING IN THE WIRES</div>` +
    `<div class="big pulse">SHE'S CORNERED</div><div class="sub">EVERYONE BACK HERE ▸ THEN PRESS SPACE</div></div>`);
  main(hd(SEC(ROOM) + ' ▸ CLEAN') + `<div class="mid"><div class="note">SHE'S CORNERED</div><div class="big pulse">BACK TO THE MAP</div>` +
    `<div class="sub">EVERYONE ▸ SECTOR 03</div></div>`);
}
let briefing = false;
async function brief(g) {
  if (ROOM !== 3) return regroupScreen();
  briefing = true; theme('green'); setRain(.25);
  main(hd('SECTOR 03 ▸ THE MAP'));
  await talk(SAY.brief, { cancel: () => g !== gen });
  if (g !== gen) return;
  theme('red'); scene = null; clearFx();
  main(hd('SECTOR 03 ▸ KILL SWITCH') + `<div class="mid"><div class="term bt" id="btm"></div></div>`);
  const lines = [
    'kill switch: she only dies if three rooms hit her at the same moment.',
    'one of you in sector 01. one in sector 02. one in sector 04.',
    'everyone else stays here and counts down out loud.',
    'on zero: SPACE in 01 and 04. the big ENTER key in 02.',
    `the three presses must land within ${S.win} s (TRACE ${res('trace')}% ▸ from sector 03).`,
    'go.',
  ];
  for (const l of lines) {
    const el = document.createElement('div'); $('btm')?.append(el);
    for (const ch of '> ' + l) { if (g !== gen) return; el.textContent += ch; if (/\w/.test(ch)) sfx.key(); await wait(26); }
    await wait(700);
  }
  if (g === gen) send({ t: 'fin', a: 'kill' });
}
function kill() {
  briefing = false; pressed = false; quiet(); theme('red'); scene = null; clearFx();
  if (ROOM === 3) {
    loop('fight', true);
    main(hd('SECTOR 03 ▸ KILL SWITCH') + `<div class="mid"><div class="lights big" id="bli"></div><div class="big" id="bkb"></div>` +
      `<div class="sub" id="bks"></div><div class="fail" id="bkf"></div><div class="note" id="bkw"></div><div class="aur" id="bka"></div></div>`);
  } else {
    main(hd(SEC(ROOM) + ' ▸ KILL SWITCH') + `<div class="mid"><div class="note">KILL SWITCH ▸ ${SEC(ROOM)}</div>` +
      `<div class="key" id="bkey">${ROOM === 2 ? 'ENTER' : 'SPACE'}</div>${ROOM === 2 ? '<div class="note">THE BIG ONE</div>' : ''}` +
      `<div class="sub" id="bks"></div><div class="fail" id="bkf"></div><div class="lights" id="bli"></div><div class="note" id="bkw"></div></div>`);
  }
  drawKill();
}
function drawKill() {
  if (!$('bli')) return;
  const ready = S.ready || {}, rooms = [1, 2, 4], all = rooms.every(r => ready[r]), missing = rooms.filter(r => !ready[r]).map(r => '0' + r);
  $('bli').innerHTML = rooms.map(r => `<span class="${ready[r] ? 'on' : ''}">0${r}</span>`).join('');
  $('bkw').textContent = `THE THREE PRESSES MUST LAND WITHIN ${S.win} s ▸ TRACE ${res('trace')}%`;
  if (ROOM === 3) {
    $('bkb').textContent = all ? 'COUNT IT DOWN' : 'GET IN POSITION';
    $('bks').textContent = all ? '3 · 2 · 1 · NOW' : `WAITING FOR SECTOR ${missing.join(' · ')}`;
    $('bkb').classList.toggle('pulse', all);
    return;
  }
  $('bks').textContent = !ready[ROOM] ? "PRESS IT ONCE WHEN YOU'RE HERE" : !all ? `READY ▸ WAITING FOR SECTOR ${missing.join(' · ')}` :
    pressed ? 'PRESSED' : 'LISTEN TO THE MAP ▸ ON ZERO, PRESS';
  $('bkey').classList.toggle('go', all && !pressed);
}
function press() {
  if (ws?.readyState !== 1) return;          // a press that can't arrive now would only count late
  const all = [1, 2, 4].every(r => S.ready?.[r]);
  if (all) { if (pressed) return; pressed = true; }
  send({ t: 'fin', a: 'press', ts: hubNow() });
  sfx.press(); const k = $('bkey'); if (k) { k.classList.add('hit'); setTimeout(() => k.classList.remove('hit'), 140); }
  drawKill();
}
async function failed(ev) {
  pressed = false; drawKill();
  one('fail'); flash(.45, 400, '#ff3344'); shake(B, 14, 400);
  const f = $('bkf'); if (!f) return;
  f.textContent = ev.missing?.length ? `SECTOR ${ev.missing.map(r => '0' + r).join(' · ')} NEVER PRESSED` : `OUT OF SYNC ▸ ${ev.spread.toFixed(2)} s APART`;
  if ($('bka')) $('bka').textContent = any(SAY.fail);
  const at = ev.at; await wait(3000);
  if (S.ev?.at === at) { f.textContent = ''; if ($('bka')) $('bka').textContent = ''; }
}

// ===== The end: every screen goes black at the same instant, then her last words, together =====
let ringsFrom = 0;
function rings(now) {                         // shockwaves out of the screen's centre, like every game's win
  const t = (now - ringsFrom) / 1000, R = Math.hypot(fw, fh) / 2;
  clearFx();
  const late = Math.floor(Math.max(0, t - 3) / 3.5) * 3.5 + 3;   // after the first two, a thin one every 3.5 s
  [[0, '#ff3344', 2], [.25, '#fff', 2], [late, '#ff3344', 1]].forEach(([d, col, lw]) => {
    const k = (t - d) / 1.6; if (k <= 0 || k >= 1) return;
    fx.globalAlpha = 1 - k; fx.strokeStyle = col; fx.lineWidth = lw;
    fx.beginPath(); fx.arc(fw / 2, fh / 2, R * (1 - Math.pow(1 - k, 3)), 0, TAU); fx.stroke();
  });
  fx.globalAlpha = 1;
}
async function theEnd(g, restore) {
  if (!restore) { await until(S.at); if (g !== gen) return; }
  task?.stop(); task = cur = null; quiet(); scene = null; clearFx(); main(''); B.classList.add('black');
  if (!restore) {
    await wait(1400); if (g !== gen) return;
    await talk(lastWords(S.run), { voice: 'soft', auto: true, keep: true });
    await dissolve(); if (g !== gen) return;
  }
  $('bdlg').classList.remove('on');
  B.classList.remove('black'); theme('red');
  ringsFrom = performance.now(); scene = rings;
  main(`<div class="mid"><div class="note">${ROOM === 3 ? 'EVERY SECTOR' : SEC(ROOM)} ▸ CLEAN</div><div class="big" id="bfin"></div>` +
    `<div class="sub">AURORA V ▸ OFFLINE</div><div class="note">THANK YOU FOR PLAYING ▸ EXIT THROUGH SECTOR 04</div></div>`);
  if (!restore) { one('end'); strip('win'); flash(1, 900); await resolveText($('bfin'), 'TERMINATED', 70); stamp($('bfin')); }
  else $('bfin').textContent = 'TERMINATED';
}

// ===== Keys: while the finale runs, this file gets them first; the page only still gets Ctrl+Alt+R and M =====
function staff(code) {
  if (code === 'KeyH') return helpPanel();
  if (code !== 'KeyF') return;                 // F = skip this step (the GM panel's FORCE key)
  if (phase === 'crash') { dlgCut = true; return; }
  if (phase === 'takeover' && ROOM === 3) return send({ t: 'fin', a: 'trace' });
  if (phase === 'fight' && cur) return step(cur.need);
  if (phase === 'fight' && mine()) { armed = true; startTask(mine()); return step(cur.need); }
  if (phase === 'regroup' && ROOM === 3) return send({ t: 'fin', a: 'brief' });
  if (phase === 'brief' && ROOM === 3) { gen++; dlgCut = true; return send({ t: 'fin', a: 'kill' }); }
  if (phase === 'kill') return send({ t: 'fin', a: 'force' });
}
function key(e) {
  if (dlgKey && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) return dlgKey();
  if (e.repeat && phase !== 'fight') return;
  if (phase === 'takeover' && ROOM === 3 && e.code === 'Space') { loop('siren', false); return send({ t: 'fin', a: 'trace' }); }
  if (phase === 'fight' && ROOM !== 3) { if (!armed && mine()) return e.code === 'Space' && arm(); return task?.key(e); }
  if (phase === 'regroup' && ROOM === 3 && e.code === 'Space') return send({ t: 'fin', a: 'brief' });
  if (phase === 'kill' && ROOM !== 3 && C.KILL_KEYS.includes(e.code)) return press();
}
function onKey(e) {
  if (!live || (!phase && ROOM !== 4)) return;
  if (AX.state !== 'running') AX.resume();
  if (e.ctrlKey && e.altKey && (e.code === 'KeyR' || e.code === 'KeyM')) return;   // reload (rejoins the finale) and mute: the page's own
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type === 'keydown') e.ctrlKey && e.altKey ? staff(e.code) : key(e);
  if (e.type === 'keyup') task?.up?.(e);
}
['keydown', 'keyup', 'keypress'].forEach(t => addEventListener(t, onKey, true));
['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'].forEach(t => addEventListener(t, e => live && e.stopImmediatePropagation(), true));
addEventListener('blur', () => task?.blur?.());   // no key stuck down if the window loses focus
setInterval(() => {                            // room 1's game runs on the projector: its keys only arrive if that window is focused
  if (!live || ROOM !== 1) return;
  const lost = (phase === 'fight' || phase === 'kill') && !document.hasFocus();
  B.classList.toggle('unfocused', lost); B.classList.toggle('pointer', lost);
}, 500);
function helpPanel() {
  B.classList.toggle('help');
  $('bhelp').textContent = `GAME 5 · THE FINALE\nroom ${ROOM}   phase ${phase}   hub ${ws?.readyState === 1 ? 'connected' : 'DOWN'}   clock ±${Math.round(best / 2)} ms\n\n` +
    'Ctrl+Alt+F  skip this step (the GM panel\'s FORCE key does the same)\nCtrl+Alt+R  reload this laptop (it rejoins the finale)\n' +
    'Ctrl+Alt+M  mute / unmute\nCtrl+Alt+H  hide this\n\nFINISH RUN or NEW TEAM on the GM panel ends the finale on every laptop.';
}

window.BOSS = { crash: () => crash(false), state: () => S };   // game 4's fake win calls crash() at 97%
connect();
})();
