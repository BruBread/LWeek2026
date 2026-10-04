// NEXUS game 5, the finale ("Everywhere At Once"). Every room page loads this file from the hub as soon as it
// connects (bossLoad() in each page), tagged with its room number. It sleeps until the hub starts the finale, then
// takes over that laptop's screen. The hub owns the state (server.js, "Game 5"); this file draws it and sends what
// the players do.
//
//   room 4 (game 4's laptop)  game 4's fake win breaks > Aurora talks (Undertale box) > LOCKED: back to room 3 > MIRRORS
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
  CRASH_HOLD_MS: 1500,       // her lines right after game 4 move on by themselves after this long (no SPACE there)
  BIN_GROUPS: [[70, 2], [40, 3], [0, 4]],   // BINARY: SYNC (game 1) at least the first number = that many groups
  WORDS: 5, WORDS_HARD_BELOW: 50,           // WORDS: 5 rounds. POWER (game 2) below 50 = the hardest list
  // MIRRORS (room 4): hits to win; her core's radius and each mirror's half-length in arena heights, [at HUMAN 0, at HUMAN
  // 100]; the keyboard stand-in's turning speed (knob travel per s); ms to charge a shot (as in game 4) and to vent after
  MIRROR: { hits: 5, core: [.09, .055], mirror: [.12, .085], keySpeed: .35, chargeMs: 900, coolMs: 1300 },
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
  rings: [["YOU DON'T NEED THIS ANYMORE.", 'angry']],   // room 4: the first try to fire, before she breaks game 4's rings
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
const NAME = { binary: 'BINARY', words: 'WORDS', cross: 'MIRRORS' };

// ===== Helpers =====
const $ = s => document.getElementById(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a), any = a => a[Math.random() * a.length | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SEC = r => 'SECTOR 0' + r, TAU = Math.PI * 2;
const res = k => S?.run?.[k] ?? 50;                     // a game staff skipped counts as 50
const need = name => name === 'binary' ? C.BIN_GROUPS.find(([min]) => res('sync') >= min)[1] : name === 'words' ? C.WORDS : C.MIRROR.hits;
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
const say = text => window.auroraVoice?.(text, master) || 0;   // her recorded line (voice.js): its length in s, 0 = none (blip)
const taunt = () => { const t = any(SAY.fail); say(t); return t; };
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

/* while she talks, her face hangs big above the box like an Undertale boss: it breathes, bobs while she types, shakes
   when she's angry, and slices of it tear sideways now and then. Her heartbeat pulses the green glow behind it.
   Only transform and opacity move (three copies of one image), so the GPU does it all */
#bstage { position: absolute; z-index: 30; left: 0; right: 0; top: 3vh; height: 62vh; display: none; pointer-events: none; }
#bstage.on { display: block; animation: bstIn .5s steps(5) both; }
@keyframes bstIn { 0% { opacity: 0 } 40% { opacity: .9 } 60% { opacity: .15 } 100% { opacity: 1 } }
#bstage .glow { position: absolute; left: 50%; top: 45%; width: 110vh; height: 110vh; margin: -55vh 0 0 -55vh; border-radius: 50%;
  background: radial-gradient(circle, rgba(77,255,136,.2) 0, rgba(77,255,136,.07) 30%, transparent 62%); animation: bglow 1.05s ease-out infinite; }
@keyframes bglow { 0% { opacity: 1; transform: scale(1.05) } 25% { opacity: .5; transform: scale(1) } 100% { opacity: .6; transform: scale(1) } }
#bstage.dying .glow { animation-duration: 2.4s; }
#bstage img { position: absolute; left: 50%; top: 0; width: 62vh; height: 62vh; margin-left: -31vh; image-rendering: pixelated; }
#bstage .f0 { animation: bbreathe 3.2s ease-in-out infinite alternate; }
@keyframes bbreathe { to { transform: scale(1.025) } }
#bstage.talk .f0 { animation: bbreathe 3.2s ease-in-out infinite alternate, bbob .18s steps(2) infinite; }
@keyframes bbob { from { translate: 0 0 } to { translate: 0 -.45vh } }
#bstage.angry .f0 { animation: bbreathe 3.2s ease-in-out infinite alternate, bmad .09s steps(2) infinite; }
@keyframes bmad { from { translate: -.7vh .35vh } to { translate: .7vh -.35vh } }
#bstage .f1, #bstage .f2 { opacity: 0; }
#bstage .f1 { clip-path: inset(24% 0 64% 0); animation: btear 2.9s steps(1) infinite; }
#bstage .f2 { clip-path: inset(57% 0 31% 0); animation: btear 4.1s steps(1) 1.3s infinite; }
#bstage.angry .f1 { animation-duration: .9s; }
@keyframes btear { 0%, 88% { opacity: 0; transform: none } 90% { opacity: 1; transform: translateX(4vh) }
  93% { opacity: 1; transform: translateX(-3vh) } 96% { opacity: 1; transform: translateX(1.5vh) } 100% { opacity: 0; transform: none } }
#bstage.break { animation: bbreak .08s steps(2) infinite; }

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
    '<div id="bstage"><i class="glow"></i><img class="f0" alt="" crossorigin="anonymous"><img class="f1" alt=""><img class="f2" alt=""></div>' +
    '<div id="bdlg"><div class="pf"><img alt=""></div><div class="tx"></div></div>' +
    '<div id="bfocus"><div class="big">CLICK HERE</div><div class="sub">MOVE THE MOUSE OFF THE BOTTOM EDGE OF THE LAPTOP, ONTO THIS WALL, AND CLICK</div></div>' +
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
async function talk(lines, o = {}) {           // o: voice, auto (no SPACE), hold (ms), keep (box stays), rain (0-1 behind her), dying
  const box = $('bdlg'), tx = box.querySelector('.tx'), img = box.querySelector('img'), stage = $('bstage'), big = [...stage.querySelectorAll('img')];
  dlgCut = false; box.classList.add('on'); stage.classList.add('on'); stage.classList.toggle('dying', !!o.dying);
  if (o.rain != null) setRain(o.rain);
  for (const [text, mood] of lines) {
    if (dlgCut || o.cancel?.()) break;
    const src = face(mood || 'base'), angry = mood === 'angry';
    img.src = src; big.forEach(b => b.src = src);
    box.classList.toggle('angry', angry); stage.classList.toggle('angry', angry); stage.classList.add('talk');
    if (angry && o.rain != null) { setRain(.95); flash(.3, 220, '#4dff88'); shake(B, 10, 400); }
    await line(tx, text, VOICES[angry ? 'angry' : o.voice || 'aurora'], o);
    if (angry && o.rain != null) setRain(o.rain);
  }
  if (!o.keep) { box.classList.remove('on', 'angry'); stage.classList.remove('on', 'angry', 'talk', 'dying'); tx.textContent = ''; }
}
async function line(tx, text, v, o) {
  const t0 = performance.now();
  let typing = true, skip = false, next = false, n = 0;
  dlgKey = () => { if (o.auto || performance.now() - t0 < C.SKIP_GUARD) return; if (typing) skip = true; else next = true; };
  const sec = say(text);                     // her recorded line: no blips, the text keeps pace with it
  tx.textContent = '* ';
  for (const ch of text) {
    if (skip || dlgCut || o.cancel?.()) { tx.textContent = '* ' + text; break; }
    tx.textContent += ch;
    if (!sec && /\w/.test(ch) && n++ % v.every === 0) blip(v);
    await wait(sec ? sec * 1000 / text.length : /[.,?!]/.test(ch) ? C.TYPE_MS * 4 : C.TYPE_MS);
  }
  typing = false; $('bstage').classList.remove('talk');
  const end = performance.now() + (o.hold ?? C.HOLD_MS);
  while (!next && !dlgCut && performance.now() < end && !o.cancel?.()) await wait(40);
  dlgKey = null;
}
async function dlgBreak() {                   // the box tears apart and she spills out of it
  const box = $('bdlg'), stage = $('bstage');
  box.classList.add('break'); stage.classList.add('break'); for (let i = 0; i < 6; i++) { sfx.glitch(); blip(VOICES.angry); await wait(60); }
  box.classList.remove('on', 'break', 'angry'); stage.classList.remove('on', 'break', 'angry', 'talk'); box.querySelector('.tx').textContent = '';
  flash(.8, 300, '#4dff88');
}
async function dissolve() {                   // her face crumbles into pixels, top to bottom, and blows away
  const big = $('bstage').querySelector('.f0'), small = $('bdlg').querySelector('img');
  const img = big.getBoundingClientRect().width ? big : small, r = img.getBoundingClientRect(), N = img === big ? 56 : 24;
  const hide = () => { $('bdlg').classList.remove('on', 'angry'); $('bstage').classList.remove('on', 'talk', 'angry', 'dying'); };
  if (!r.width) return hide();
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  let d; try { x.drawImage(img, 0, 0, N, N); d = x.getImageData(0, 0, N, N).data; } catch { return hide(); }
  hide(); clearFx();
  const groups = new Map(), s = r.width / N / C.PIX, q = v => v & 0xf0;   // one fillStyle per colour, not per pixel
  for (let i = 0; i < N * N; i++) {
    if (d[i * 4 + 3] < 100) continue;
    const row = i / N | 0, col = `rgb(${q(d[i * 4])},${q(d[i * 4 + 1])},${q(d[i * 4 + 2])})`;
    (groups.get(col) || groups.set(col, []).get(col)).push({ x: r.left / C.PIX + (i % N) * s, y: r.top / C.PIX + row * s,
      vx: rand(-6, 30), vy: rand(-34, -6), t: row / N * 1.3 + rand(0, .3) });
  }
  const t0 = performance.now(), w = Math.ceil(s);
  scene = (now, dt) => {
    const k = (now - t0) / 1000; clearFx();
    groups.forEach((ps, col) => {
      fx.fillStyle = col;
      for (const p of ps) {
        if (k > p.t) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 8 * dt; }
        fx.globalAlpha = clamp(1 - (k - p.t) / 1.5, 0, 1); fx.fillRect(p.x, p.y, w, w);
      }
    });
    fx.globalAlpha = 1;
  };
  await wait(3300); scene = null; clearFx();
}

// ===== Following the hub =====
let phase = null, gen = 0, evAt, armed = false, task = null, cur = null, pressed = false, view = '', jump = false;   // jump: Ctrl+Alt+B   // view: arm | task | purge | swap | clean
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
  if (phase !== 'crash') { hidePage(); B.classList.remove('see', 'black'); hideDlg(); }   // a skipped scene leaves no box behind
  ({ crash: () => crash(restore || jump), takeover: () => takeover(g, restore || jump), fight: () => fight(g, from), regroup: () => regroup(g, restore),
     brief: () => brief(g), kill: () => kill(g), end: () => theEnd(g, restore) })[phase]?.();
}
function changed() {
  if (phase === 'fight' && ROOM === 3) drawMap();
  if (phase === 'fight' && ROOM !== 3) {
    if (cur && S.tasks[cur.name]?.clear && S.tasks[cur.name].room === ROOM) return purge();   // done from elsewhere (the GM's SKIP)
    if (view === 'arm' && !mine()) return cleanScreen();
    if (view === 'clean') cleanScreen();
  }
  if (phase === 'kill') drawKill();
}
function hideDlg() {
  dlgCut = true; dlgKey = null;               // ends any line still typing
  $('bdlg').classList.remove('on', 'angry', 'break'); $('bdlg').querySelector('.tx').textContent = '';
  $('bstage').classList.remove('on', 'talk', 'angry', 'dying', 'break');
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
  await talk(SAY.crash, { cancel: () => phase !== 'crash', keep: true, auto: true, hold: C.CRASH_HOLD_MS, rain: .3 });
  if (phase !== 'crash') return;
  await dlgBreak();
  send({ t: 'fin', a: 'takeover' });
}

// Ctrl+Alt+B on game 4's laptop (staff, for testing): straight to room 4's MIRRORS, its rings still. It starts the finale
// for real on every laptop (FINISH RUN or NEW TEAM on the GM panel ends it) and fast-forwards this room past the crash
// scene, the map and its PRESS SPACE
async function jumpToMirrors() {
  if (ROOM !== 4 || cur?.name === 'cross') return;
  jump = armed = true; wake();
  if (S?.phase === 'fight') { if (mine()) startTask(mine()); return; }
  for (const a of ['crash', 'takeover', 'trace']) { send({ t: 'fin', a }); await wait(300); }
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
  if (from === 'takeover' && !jump) { await until(S.at); if (g !== gen) return; }   // her rooms light up as the trace reaches them
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
  send({ t: 'fin', a: 'step', task: name, done: cur.done, need: cur.need });   // the GM panel learns how many steps this task has
  task = ({ binary: binaryTask, words: wordsTask, cross: crossTask })[name]();
}
function step(done) {
  if (!cur) return;
  cur.done = done; send({ t: 'fin', a: 'step', task: cur.name, done, need: cur.need });
  const p = $('bpips'); if (p) [...p.children].forEach((e, i) => e.classList.toggle('on', i < done));
  if (done >= cur.need) { send({ t: 'fin', a: 'clear', task: cur.name }); purge(); }
}
const pips = () => `<div class="pips" id="bpips">${Array.from({ length: cur.need }, (_, i) => `<i class="${i < cur.done ? 'on' : ''}"></i>`).join('')}</div>`;
const source = (k, from, what) => `<div class="src bt">${k.toUpperCase()} <span>${res(k)}%</span> ▸ FROM ${SEC(from)}<br>${what}</div>`;
async function purge() {                      // this room's task is done: it goes back to red
  const g = gen, scream = any(SAY.purged); say(scream);
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
// --- MIRRORS (room 4): it opens as game 4, still: her heart, the two rings, the laser. The first try to fire and she
// breaks the rings ("YOU DON'T NEED THIS ANYMORE"). Then a mirror slides in on each side: the outer knob turns the left
// one, the inner knob the right one, each like game 4's rings (the knob's travel = half a turn of the mirror). The laser
// always fires at the left mirror; bounce it off the right mirror into her core. Her shield faces left, so a shot
// straight from the left mirror is blocked. A live laser sight shows the whole bounce path. Hold the two wires together
// (or SPACE) to charge and fire, as in game 4. Each hit moves her core and both mirrors. HUMAN shrinks the core and mirrors.
let grid = null;
function crossTask() {
  const K = C.MIRROR, h = res('human') / 100, keys = {}, parts = [], n = cur.need, lerp = ([x0, x1]) => x0 + (x1 - x0) * h;
  const rC = lerp(K.core), rS = rC * 1.7, half = lerp(K.mirror), sizeNo = Math.round(5 - h * 4);
  let hits = cur.done, stage = hits ? 'play' : 'still', t0 = performance.now(), charge = 0, coolUntil = 0, shot = null;
  let spaceOk = false, charging = false, hint = '', kk = [.5, .5], core = { x: 0, y: .42 }, from = null, M = [{ x: .07, y: .5 }, { x: 0, y: .5 }];
  main(hd('SECTOR 04 ▸ MIRRORS') + source('human', 4, `HER CORE <span>${sizeNo}</span> / 5`) +
    `<div class="foot"><div class="note" id="bxk"></div><div class="aur" id="bxa"></div>${pips()}</div>`);
  const A = () => ({ x: fw * .04, y: fh * .15, w: fw * .92, h: fh * .64 });   // the arena, in canvas pixels; inside it, y 0-1 and x 0-ar()
  const ar = () => { const a = A(); return a.w / a.h; };
  const E = () => ({ x: ar() / 2, y: .985 });                // the laser, bottom centre
  core.x = ar() / 2;                                          // her heart starts in the middle, inside game 4's rings
  const live = () => page(() => potLive(), false);
  // knob i, 0-1: game 4's latest reading (its page is frozen now, so not its smoothed knobs[]), else null = use the keys
  const reading = i => live() ? page(() => (typeof knobTo === 'object' ? knobTo : knobs)[i], null) : null;
  const segDist = (q, p1, p2) => { const dx = p2.x - p1.x, dy = p2.y - p1.y, t = clamp(((q.x - p1.x) * dx + (q.y - p1.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(q.x - p1.x - t * dx, q.y - p1.y - t * dy); };
  const place = () => {                         // her core and both mirrors somewhere new, always with a clean two-bounce path
    const R = ar();
    for (let k = 0; k < 500; k++) {
      const m0 = { x: .07, y: rand(.2, .8) }, m1 = { x: R - .07, y: rand(.2, .8) }, c = { x: rand(.36, .62) * R, y: rand(.2, .62) };
      if (!(segDist(c, E(), m0) > rS + .05 && segDist(c, m0, m1) > rS + .07 && Math.hypot(c.x - m1.x, c.y - m1.y) > .4 &&
          Math.abs(m0.y - M[0].y) + Math.abs(m1.y - M[1].y) > .15)) continue;
      const was = { M, core }; M = [m0, m1]; core = c;
      if (solve()) { from = { M: was.M.map(m => ({ ...m })), core: { ...was.core } }; return; }
      M = was.M; core = was.core;                // no way in from here: try another layout
    }
  };
  // where a shot would go right now: from the laser at the left mirror, bouncing, until it ends somewhere
  const trace = (kv = kk) => {
    const R = ar(), pts = [E()], seq = [], mir = M.map((m, i) => ({ ...m, ux: Math.cos(kv[i] * Math.PI), uy: Math.sin(kv[i] * Math.PI) }));
    let p = E(), dx = M[0].x - p.x, dy = M[0].y - p.y, l = Math.hypot(dx, dy), last = -1;
    dx /= l; dy /= l;
    for (let b = 0; b < 6; b++) {
      let t = Infinity, what = 'wall', idx = -1;
      mir.forEach((m, i) => {                   // p + t·d = m + s·u, with |s| <= half
        if (i === last) return;
        const det = m.ux * dy - dx * m.uy; if (Math.abs(det) < 1e-9) return;
        const wx = m.x - p.x, wy = m.y - p.y, tt = (m.ux * wy - wx * m.uy) / det, ss = (dx * wy - dy * wx) / det;
        if (tt > 1e-6 && Math.abs(ss) <= half && tt < t) { t = tt; what = 'mirror'; idx = i; }
      });
      const circle = r => { const ox = p.x - core.x, oy = p.y - core.y, bb = ox * dx + oy * dy, cc = ox * ox + oy * oy - r * r, D = bb * bb - cc;
        if (D < 0) return Infinity; const t1 = -bb - Math.sqrt(D); return t1 > 1e-6 ? t1 : Infinity; };
      const ts = circle(rS);                    // her shield: the left half of a ring around her core, stops what comes from the left
      if (ts < t && dx > 0 && p.x + dx * ts <= core.x) { t = ts; what = 'shield'; }
      const tc = circle(rC); if (tc < t) { t = tc; what = 'core'; }
      if (what === 'wall') t = Math.min(dx > 0 ? (R - p.x) / dx : dx < 0 ? -p.x / dx : Infinity, dy > 0 ? (1 - p.y) / dy : dy < 0 ? -p.y / dy : Infinity);
      p = { x: p.x + dx * t, y: p.y + dy * t }; pts.push(p);
      if (what !== 'mirror') return { pts, end: what, seq };
      const m = mir[idx], nx = -m.uy, ny = m.ux, dn = dx * nx + dy * ny;   // bounce
      dx -= 2 * dn * nx; dy -= 2 * dn * ny; last = idx; seq.push(idx);
    }
    return { pts, end: 'wall', seq };
  };
  // knob settings that land a shot in her core (left mirror, right mirror, core), or null. Every placement must have one
  const solve = () => {
    for (let j = 0; j <= 720; j++) {
      const kv = [j / 720, .5];
      for (let it = 0; it < 5; it++) {
        const tr = trace(kv);
        if (tr.end === 'core' && tr.seq.join() === '0,1') return kv;
        if (tr.seq[0] !== 0 || tr.seq[1] !== 1) break;
        const P = tr.pts[2], Q = tr.pts[1], il = Math.hypot(P.x - Q.x, P.y - Q.y), ol = Math.hypot(core.x - P.x, core.y - P.y);
        const nx = (core.x - P.x) / ol - (P.x - Q.x) / il, ny = (core.y - P.y) / ol - (P.y - Q.y) / il;   // the normal bisects out and in
        kv[1] = ((Math.atan2(nx, -ny) % Math.PI + Math.PI) % Math.PI) / Math.PI;                       // the mirror runs across it
      }
    }
    return null;
  };
  async function breakRings() {                 // the first try to fire: she breaks game 4's rings
    stage = 'break'; charge = 0; strip('cancel');
    await talk(SAY.rings, { auto: true, hold: 900 });
    if (task !== me) return;
    const a = A(), cx = a.x + core.x * a.h, cy = a.y + core.y * a.h;
    for (const r of [.3, .2]) for (let k = 0; k < 70; k++) {
      const an = rand(0, TAU), x = cx + Math.cos(an) * r * a.h, y = cy + Math.sin(an) * r * a.h, sp = rand(30, 140);
      parts.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: rand(.5, 1.4), c: any(['#ff3344', '#fff', '#ff8a96']) });
    }
    sfx.crash(); flash(.7, 400); shake(B, 18, 700); strip('miss');
    await wait(900); if (task !== me) return;
    place(); from.M = from.M.map(m => ({ ...m, x: m.x < ar() / 2 ? -.3 : ar() + .3 }));   // the mirrors slide in from off screen
    stage = 'enter'; t0 = performance.now(); sfx.glitch();
  }
  function fire(now) {
    const tr = trace(), end = tr.pts[tr.pts.length - 1], a = A(), ex = a.x + end.x * a.h, ey = a.y + end.y * a.h, hit = tr.end === 'core';
    shot = { t0: now, pts: tr.pts, hit }; coolUntil = now + K.coolMs; charging = false;
    page(() => ctrlFire());                     // the controller's little screen flashes FIRE
    strip(hit ? 'hit' : 'miss'); flash(.25, 150, hit ? '#4dff88' : '#ff3344');
    for (let k = 0; k < (hit ? 70 : 30); k++) { const an = rand(0, TAU), sp = rand(20, hit ? 130 : 80);
      parts.push({ x: ex, y: ey, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t: rand(.3, .9), c: hit ? any(['#fff', '#4dff88', '#b8ffd0']) : any(['#fff', '#ff3344', '#ff8a96']) }); }
    if (!hit) { sfx.bad(); $('bxa').textContent = taunt(); return; }
    hits++; sfx.catch(); $('bxa').textContent = ''; step(hits);
    if (hits < n) setTimeout(() => { if (task === me && stage === 'play') { place(); stage = 'enter'; t0 = performance.now(); sfx.glitch(); } }, 900);
  }
  if (stage === 'play') place();                // reloaded mid-task: straight to the mirrors
  if (location.search.includes('test')) window.BOSS_MIRRORS = { solve, state: () => ({ stage, hits, kk: [...kk] }) };   // for test runs only
  const me = {
    key(e) { keys[e.code] = true; },
    up(e) { delete keys[e.code]; if (e.code === 'Space') spaceOk = true; },   // the SPACE that armed this room must come up first
    blur() { for (const k in keys) delete keys[k]; },
    stop() { scene = null; clearFx(); if (charging) strip('cancel'); },
  };
  setTimeout(() => spaceOk = true, 1500);
  scene = (now, dt) => {
    const a = A(), R = ar(), c = live(), X = x => a.x + x * a.h, Y = y => a.y + y * a.h;
    for (const i of [0, 1]) {                   // the knobs turn the mirrors, gliding like game 4's rings; else the keys
      const t = reading(i);
      if (t != null) kk[i] += (t - kk[i]) * (1 - Math.exp(-dt / .06));
      else if (stage === 'play') kk[i] = clamp(kk[i] + ((keys[i ? 'ArrowRight' : 'KeyD'] ? 1 : 0) - (keys[i ? 'ArrowLeft' : 'KeyA'] ? 1 : 0)) * K.keySpeed * dt, 0, 1);
    }
    const trying = (c && page(() => wires, false)) || (keys.Space && spaceOk);
    const hn = stage === 'still' || stage === 'break' ? (c ? 'TOUCH THE TWO WIRES TOGETHER TO FIRE' : 'HOLD SPACE TO FIRE')
      : `${c ? 'OUTER KNOB' : 'A / D'} ▸ LEFT MIRROR  ·  ${c ? 'INNER KNOB' : '◄ / ►'} ▸ RIGHT MIRROR  ·  BOUNCE OFF BOTH INTO HER`;
    if (hn !== hint) $('bxk').textContent = hint = hn;   // DOM only when it changes
    if (stage === 'still' && trying) breakRings();
    let k = 1;
    if (stage === 'enter') { k = Math.min(1, (now - t0) / 800); if (k >= 1) stage = 'play'; }
    const ease = 1 - Math.pow(1 - k, 3), lp = (p, q) => ({ x: p.x + (q.x - p.x) * ease, y: p.y + (q.y - p.y) * ease });
    const cc = stage === 'enter' && from ? lp(from.core, core) : core, MM = stage === 'enter' && from ? M.map((m, i) => lp(from.M[i], m)) : M;
    if (stage === 'play') {                     // charge while they hold; letting go drains it
      if (trying && now > coolUntil && !shot) {
        if (!charging) { charging = true; strip('charge'); }
        charge += dt * 1000 / K.chargeMs; if (charge >= 1) { charge = 0; fire(now); }
      } else { charge = Math.max(0, charge - dt * 3); if (charging && !charge) { charging = false; strip('cancel'); } }
    }
    if (shot && now - shot.t0 > 700) shot = null;
    // draw (low resolution: every line is a fat pixel)
    if (!grid || grid.width !== fw) {           // the arena, drawn once
      grid = document.createElement('canvas'); grid.width = fw; grid.height = fh;
      const g = grid.getContext('2d'); g.strokeStyle = 'rgba(77,255,136,.1)'; g.lineWidth = 1;
      for (let x = a.x; x <= a.x + a.w + .1; x += a.w / 16) { g.beginPath(); g.moveTo((x | 0) + .5, a.y); g.lineTo((x | 0) + .5, a.y + a.h); g.stroke(); }
      for (let y = a.y; y <= a.y + a.h + .1; y += a.h / 8) { g.beginPath(); g.moveTo(a.x, (y | 0) + .5); g.lineTo(a.x + a.w, (y | 0) + .5); g.stroke(); }
      g.strokeStyle = 'rgba(77,255,136,.45)'; g.strokeRect((a.x | 0) + .5, (a.y | 0) + .5, a.w | 0, a.h | 0);
    }
    fx.globalAlpha = 1; fx.fillStyle = 'rgba(0,0,0,.4)'; fx.fillRect(0, 0, fw, fh);   // what moves leaves a short trail
    fx.drawImage(grid, 0, 0);
    const ex = X(E().x), ey = Y(E().y), pulse = .5 + .5 * Math.sin(now / 160);
    // her core: green, beating; her shield on its left once the rings are gone
    const hx = X(cc.x), hy = Y(cc.y), rr = rC * a.h;
    fx.fillStyle = '#4dff88'; fx.globalAlpha = .15 + .1 * pulse; fx.beginPath(); fx.arc(hx, hy, rr * 2.2, 0, TAU); fx.fill();
    fx.globalAlpha = 1; fx.fillStyle = '#062'; fx.beginPath(); fx.arc(hx, hy, rr, 0, TAU); fx.fill();
    fx.strokeStyle = '#4dff88'; fx.lineWidth = 1; fx.stroke();
    fx.fillStyle = '#dcffe8'; fx.beginPath(); fx.arc(hx, hy, rr * (.35 + .15 * pulse), 0, TAU); fx.fill();
    if (stage === 'still' || stage === 'break') {   // game 4's two rings around her heart, gaps down at the laser, not moving
      const shake = stage === 'break' ? 2 : 0;
      [[.3, 3], [.2, 3]].forEach(([r, w]) => {
        fx.strokeStyle = '#ff3344'; fx.lineWidth = w; fx.beginPath();
        fx.arc(hx + rand(-shake, shake), hy + rand(-shake, shake), r * a.h, Math.PI / 2 + .45, Math.PI / 2 - .45 + TAU); fx.stroke();
      });
      fx.strokeStyle = 'rgba(255,51,68,.6)'; fx.lineWidth = 1; fx.beginPath(); fx.moveTo(ex, ey); fx.lineTo(hx, hy + rr); fx.stroke();   // the sight
    } else {
      fx.strokeStyle = '#4dff88'; fx.lineWidth = 2; fx.globalAlpha = .8;
      fx.beginPath(); fx.arc(hx, hy, rS * a.h, Math.PI / 2 + .15, Math.PI * 1.5 - .15); fx.stroke(); fx.globalAlpha = 1;
      fx.font = 'bold 7px monospace'; fx.textAlign = 'right'; fx.fillStyle = '#4dff88';   // says why a shot from the left bounces off
      fx.fillText('SHIELD', hx - rS * a.h - 3, hy + 2); fx.textAlign = 'left';
      // the mirrors: silver bars that turn with their knob, a label under each
      MM.forEach((m, i) => {
        const mx = X(m.x), my = Y(m.y), ux = Math.cos(kk[i] * Math.PI) * half * a.h, uy = Math.sin(kk[i] * Math.PI) * half * a.h;
        fx.strokeStyle = 'rgba(255,255,255,.25)'; fx.lineWidth = 5; fx.beginPath(); fx.moveTo(mx - ux, my - uy); fx.lineTo(mx + ux, my + uy); fx.stroke();
        fx.strokeStyle = '#e8f6ff'; fx.lineWidth = 2; fx.beginPath(); fx.moveTo(mx - ux, my - uy); fx.lineTo(mx + ux, my + uy); fx.stroke();
        fx.fillStyle = '#ff3344'; fx.fillRect(mx - 1.5, my - 1.5, 3, 3);
        fx.font = 'bold 7px monospace'; fx.textAlign = 'center'; fx.fillStyle = 'rgba(255,255,255,.75)';
        fx.fillText(i ? 'INNER' : 'OUTER', mx, my + half * a.h + 9);
      });
      fx.textAlign = 'left';
      if (stage === 'play' && !shot) {          // the laser sight: the whole bounce path, white once it ends in her core
        const tr = trace(), good = tr.end === 'core';
        fx.strokeStyle = good ? '#fff' : 'rgba(255,51,68,.85)'; fx.lineWidth = good || charge > 0 ? 2 : 1;
        fx.beginPath(); tr.pts.forEach((q, j) => fx[j ? 'lineTo' : 'moveTo'](X(q.x), Y(q.y))); fx.stroke();
        const q = tr.pts[tr.pts.length - 1]; fx.fillStyle = good ? '#fff' : '#ff3344'; fx.fillRect(X(q.x) - 2, Y(q.y) - 2, 4, 4);
      }
    }
    if (shot) {                                 // the shot: a fat beam along the path, fading
      const f = 1 - (now - shot.t0) / 700;
      [[5, shot.hit ? 'rgba(77,255,136,.35)' : 'rgba(255,51,68,.35)'], [2, '#fff']].forEach(([w, col]) => {
        fx.globalAlpha = Math.max(0, f); fx.strokeStyle = col; fx.lineWidth = w;
        fx.beginPath(); shot.pts.forEach((q, j) => fx[j ? 'lineTo' : 'moveTo'](X(q.x), Y(q.y))); fx.stroke();
      });
      fx.globalAlpha = 1;
    }
    // the laser itself, bottom centre: charging glows white
    fx.fillStyle = '#ff3344'; fx.fillRect(ex - 6, ey - 3, 12, 6); fx.fillRect(ex - 2, ey - 7, 4, 4);
    if (charge > 0) { fx.globalAlpha = charge; fx.fillStyle = '#fff'; fx.beginPath(); fx.arc(ex, ey - 7, 2 + 5 * charge, 0, TAU); fx.fill(); fx.globalAlpha = 1; }
    for (let j = parts.length - 1; j >= 0; j--) {
      const q = parts[j]; q.t -= dt; if (q.t <= 0) { parts.splice(j, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; fx.fillStyle = q.c; fx.globalAlpha = Math.min(1, q.t * 2); fx.fillRect(q.x | 0, q.y | 0, 2, 2);
    }
    fx.globalAlpha = 1;
  };
  return me;
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
  await talk(SAY.brief, { cancel: () => g !== gen, rain: .25 });
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
  if ($('bka')) $('bka').textContent = taunt();
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
    await talk(lastWords(S.run), { voice: 'soft', auto: true, keep: true, dying: true });
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
  if (code === 'KeyB') return jumpToMirrors();
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
    (ROOM === 4 ? 'Ctrl+Alt+B  jump to MIRRORS (testing)\n' : '') +
    'Ctrl+Alt+M  mute / unmute\nCtrl+Alt+H  hide this\n\nFINISH RUN or NEW TEAM on the GM panel ends the finale on every laptop.';
}

window.BOSS = { crash: () => crash(false), state: () => S, mirrors: jumpToMirrors };   // game 4's fake win calls crash() at 97%; Ctrl+Alt+B mirrors()
connect();
})();
