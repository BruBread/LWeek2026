// Aurora's recorded voice. aurora-voice/cut.py cuts the ElevenLabs take into voice/ and lists the clips in voice/index.json.
// Every page loads this file from the hub (the room pages next to boss.js, the kiosk once it reaches the hub).
// auroraVoice(text, out) plays her clip for that line through the page's audio node `out` (so the page's mute still works)
// and returns its length in s. 0 = no clip (hub down, still loading, or a line nobody recorded): the page blips as before.
// One voice at a time: a new line cuts off the one still playing.
(() => {
'use strict';
const BASE = document.currentScript.src.replace(/voice\.js.*$/, 'voice/');
const NUM = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
// exact = the script's text, where "-" and "—" at the end are the same cut-off. loose = letters only, numbers as words,
// so the games' "STOP" and "I held you back 2 times." find "STOP!" and "I held you back two times."
const exact = t => t.trim().replace(/[-—]+$/, '');
const loose = t => '~' + exact(t).toLowerCase().replace(/\d+/g, n => NUM[n] || n).replace(/[^a-z0-9]/g, '');
const clips = new Map(), files = {}, decoded = new WeakMap();
fetch(BASE + 'index.json').then(r => r.json()).then(list => list.forEach(([f, text, s]) => {
  const c = { f, s, ok: false };
  clips.set(exact(text), c);
  if (!clips.has(loose(text))) clips.set(loose(text), c);   // two lines with the same words ("...who ARE you?"): exact decides
  files[f] = fetch(BASE + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => (c.ok = true, b));
  files[f].catch(() => {});
})).catch(() => {});
const find = text => clips.get(exact(text)) || clips.get(loose(text));
let cur = null;
window.auroraVoice = (text, out) => {
  const c = find(text);
  if (!c?.ok || !out) return 0;
  const ctx = out.context;
  let m = decoded.get(ctx); if (!m) decoded.set(ctx, m = {});
  const buf = m[c.f] ||= files[c.f].then(b => ctx.decodeAudioData(b.slice(0)));
  cur?.stop();
  const me = cur = { stop() { this.dead = true; try { this.src?.stop(); } catch {} } };
  buf.then(b => { if (me.dead) return; me.src = ctx.createBufferSource(); me.src.buffer = b; me.src.connect(out); me.src.start(); })
    .catch(() => {});
  return c.s;
};
window.auroraVoice.find = find;   // for hub/test.js
})();
