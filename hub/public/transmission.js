// INCOMING TRANSMISSION: the GM panel's room 1 message, flashed for SHOW_MS on top of everything, on the laptop screen
// (desktop.html) and on the wall (projector.html). Both load this file from the hub and call transmit(text).
// Clicks pass through it, so it never gets in the way. The GM laptop plays the booth's sound for it (gm.html txSound).
(() => {
  const SHOW_MS = 2000;   // how long a message stays up
  const css = document.createElement('style');
  css.textContent = `
#tx { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; pointer-events: none;
  background: rgba(0,6,3,.8); font-family: Consolas, "Cascadia Mono", monospace; user-select: none; }
#tx[hidden] { display: none; }
#tx::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(rgba(77,255,136,.07) 0 2px, transparent 2px 4px); }
#tx .bx { max-width: 86vw; padding: 3vw 4vw; border: 2px solid #4dff88; background: rgba(0,18,9,.92); text-align: center;
  box-shadow: 0 0 40px rgba(77,255,136,.35), inset 0 0 40px rgba(77,255,136,.12); }
#tx .hd { color: #4dff88; font-size: 1.6vw; letter-spacing: .5em; animation: txBlink .25s steps(1) infinite; }
#tx .msg { margin-top: 2vw; color: #fff; font-size: 5vw; font-weight: 700; line-height: 1.2; white-space: pre-wrap;
  text-shadow: -3px 0 rgba(255,42,74,.8), 3px 0 rgba(0,255,255,.8); }
#tx.burst .bx { animation: txTear .09s steps(2) infinite; }
@keyframes txBlink { 50% { opacity: .35; } }
@keyframes txTear { from { transform: translate(-1.2vw, 0) skewX(8deg); clip-path: inset(12% 0 30% 0); filter: hue-rotate(90deg) contrast(1.6); }
                    to { transform: translate(.8vw, .4vh); clip-path: inset(0); filter: invert(1) hue-rotate(180deg); } }`;
  document.head.append(css);
  const el = document.createElement('div');
  el.id = 'tx'; el.hidden = true;
  el.innerHTML = '<div class="bx"><div class="hd">&#9650; INCOMING TRANSMISSION &#9650;</div><div class="msg"></div></div>';
  document.documentElement.append(el);         // outside <body>, like boss.js: the finale hides the page

  // sound: static with a falling growl for the whole flash (the same as the laptop's stuck hint)
  const AC = new AudioContext(), out = AC.createGain();
  out.gain.value = .5; out.connect(AC.destination);
  function tone(type, f0, f1, dur, vol) {
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + .05);
  }
  function glitch(dur) {
    const n = AC.createBufferSource(), b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = b.getChannelData(0), g = AC.createGain();
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b; g.gain.setValueAtTime(.3, AC.currentTime); g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + dur);
    n.connect(g).connect(out); n.start();
    tone('sawtooth', 140, 35, dur, .2); tone('square', 2400, 180, dur / 4, .06);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  let tok = 0;
  function burst(ms) { el.classList.add('burst'); setTimeout(() => el.classList.remove('burst'), ms); }
  window.transmit = async text => {
    const me = ++tok;                              // a new message replaces the one on screen
    el.querySelector('.msg').textContent = text; el.hidden = false;
    AC.resume(); glitch(SHOW_MS / 1000); burst(350);
    const twitch = setInterval(() => burst(150), 600);
    await wait(SHOW_MS);
    clearInterval(twitch);
    if (me !== tok) return;
    burst(250); await wait(250);
    if (me === tok) el.hidden = true;
  };
})();
