// TIME LEFT: how long the team has left in its whole run, at the top of a room's screen. A room page loads this from
// the hub (with data-room = its number) and keeps the hub's latest {t:'run'} message in window.RUN. It appears when the team
// reaches the room (room 1: its first click; room N: room N-1 cleared or this room started) and stays through the
// finale. At 0:00 a team still short of game 4's end loses (the hub ends the run: TIME'S UP); a team past it sees a red
// OVERTIME +m:ss that keeps counting, and staff decide when to end. No team = hidden.
(() => {
  const RUN_MIN = 23;   // the run's time limit (the GM panel's LIMIT_MIN and server.js's RUN_MIN should match)
  const room = +document.currentScript?.dataset.room || 1;
  const bottom = document.currentScript?.dataset.clock === 'bottom';   // data-clock="bottom": where the top centre is taken (game 4)
  const css = document.createElement('style');
  css.textContent = `
#rclk { position: fixed; top: 1.6vh; left: 50%; translate: -50% 0; z-index: 2147483100; pointer-events: none; user-select: none;
  padding: .6vh 1.1vw .8vh; border: 2px solid #ff3344; background: rgba(10,0,2,.85); text-align: center;
  font-family: Consolas, "Cascadia Mono", monospace; color: #fff; box-shadow: 0 0 18px rgba(255,51,68,.35); }
#rclk[hidden] { display: none; }
#rclk small { display: block; font-size: max(11px, .8vw); letter-spacing: .35em; color: #ff3344; }
#rclk b { display: block; font-size: max(26px, 2.6vw); line-height: 1.05; font-variant-numeric: tabular-nums; }
#rclk.in { animation: rcIn .5s steps(6); }
#rclk.warn { border-color: #ffb020; } #rclk.warn small { color: #ffb020; }
#rclk.last b { color: #ff3344; animation: rcBlink 1s steps(1) infinite; }
#rclk.over { background: #ff3344; border-color: #ff3344; } #rclk.over small, #rclk.over b { color: #fff; }
@keyframes rcIn { 0% { clip-path: inset(0 0 100% 0); filter: invert(1); } 50% { clip-path: inset(30% 0 20% 0); transform: translateX(-8px); } }
@keyframes rcBlink { 50% { opacity: .35; } }
/* html.rclk-big: the page's end screen (room 1's MIND UPLOADED) shows it big, under its text */
html.rclk-big #rclk { top: 72vh; scale: 1.8; animation: rcBig .6s steps(6); }
@keyframes rcBig { 0% { clip-path: inset(0 0 100% 0); filter: invert(1); } 50% { clip-path: inset(30% 0 20% 0); transform: translateX(-8px); } }
html.boss-on #rclk { top: auto; bottom: 1.6vh; left: auto; right: 1.4vw; translate: none; scale: none; }   /* the finale: its lives sit top centre */`;
  document.head.append(css);
  const el = document.createElement('div');
  el.id = 'rclk'; el.hidden = true; el.innerHTML = '<small>TIME LEFT</small><b></b>';
  if (bottom) Object.assign(el.style, { top: 'auto', bottom: '1.6vh' });
  document.documentElement.append(el);         // outside <body>, like boss.js: the finale hides the page

  let run, skew = 0;
  const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function draw() {
    if (window.RUN !== run) { run = window.RUN; skew = run ? run.now - Date.now() : 0; }   // run.now = hub time: this laptop's clock doesn't matter
    const s = run?.splits || {}, done = run?.end != null || s.p5done != null || s.p5lost != null;
    const here = room === 1 || s[`p${room}start`] != null || s[`p${room - 1}done`] != null;
    const show = !!run?.t0 && !done && here;
    if (show && el.hidden) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }   // glitches in
    el.hidden = !show;
    if (!show) return;
    const left = (RUN_MIN + (run.extra || 0)) * 60000 - (Date.now() + skew - run.t0), over = left <= 0;
    el.className = `in${over ? ' over' : left < 60000 ? ' last' : left < 5 * 60000 ? ' warn' : ''}`;
    el.firstChild.textContent = over ? 'OVERTIME' : 'TIME LEFT';
    el.lastChild.textContent = over ? '+' + mmss(-left) : mmss(left + 999);   // rounds up: 0:00 only when it's really over
  }
  draw(); setInterval(draw, 250);
})();
