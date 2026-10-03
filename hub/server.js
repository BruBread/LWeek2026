// NEXUS hub: static pages + WebSocket relay. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { WebSocketServer } = require('ws');
const scenes = require('./scenes');

const PORT = 3000, PUB = path.join(__dirname, 'public');
const RUNS = process.env.RUNS || path.join(__dirname, 'runs.jsonl');   // finished teams, one JSON line each
const RUN = process.env.RUN || path.join(__dirname, 'run.json');        // the team in the booth now, so a hub restart mid-run loses nothing
const state = {};            // deviceId -> last cmd {a,v}; replayed on reconnect
const status = {};           // game page id -> its last status (mode, live stat, ...), for the GM room cards
const conns = new Map();     // id -> ws (devices and pages)

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  // the room pages search the network for this answer to find the hub (findHub() in each page)
  if (p === '/ping') return res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('nexus-hub');
  p = p === '/'? '/gm.html' : /\.\w+$/.test(p) ? p : p + '.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) return res.writeHead(403).end();
  // CORS: boss.js runs inside the room pages (other origins) and fetches its sounds and font from here
  fs.readFile(f, (e, d) => e ? res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('nope') : res.writeHead(200, { 'Access-Control-Allow-Origin': '*',
    'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }).end(d));
});
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const broadcast = (o, pred = () => true) => wss.clients.forEach(c => pred(c) && send(c, o));
const toPages = o => broadcast(o, c => c.role === 'page');
const toFin = o => broadcast(o, c => c.role === 'fin');   // boss.js on the room laptops (game 5)
const ids = role => [...conns].filter(([, w]) => w.role === role).map(([id]) => id);
const roster = () => ({ t: 'roster', devices: ids('device'), pages: ids('page') });
const log = (m) => { console.log(m); toPages({ t: 'log', m }); };

function cmd(to, a, v) {
  if (a === 'scene') {
    const s = scenes[v]; if (!s) return log('unknown scene ' + v);
    log('scene ' + v);
    return Object.entries(s).forEach(([id, c]) => cmd(id, c.a, c.v));
  }
  if (a === 'key') log(`key ${v} ▸ ${to}`);   // a staff key pressed from the GM panel; never replayed (a replayed reset would loop)
  else state[to] = { a, v };                  // remember even if offline -> replayed on connect
  const w = conns.get(to); if (w) send(w, { t: 'cmd', a, v });
}

// What the team carries into the finale, one team in the room at a time. Each game leaves one resource (0-100):
// sync = P1 upload depth, power = P2 reserve, trace = how far P3's trace got, human = P4's human error (missed shots, slow layers)
// (trace and human: lower is better). null = not played.
// facts = details for the finale's intruder dossier (caught, wrong codes, ...).
// team/t0 = set by NEW TEAM; splits = ms from t0 to each pNdone; end = ms from t0 at FINISH.
const KEYS = ['sync', 'power', 'trace', 'human'];
const fresh = (team = '') => ({ sync: null, power: null, trace: null, human: null, facts: {},
  team, t0: team ? Date.now() : null, splits: {}, end: null, fin: finFresh() });

// ===== Game 5, the finale: hub/public/boss.js on every room laptop. The hub owns its state, so the 4 screens agree,
// a reloaded laptop rejoins, and the synced moments (takeover, blackout) land at one hub time on every screen.
// Room 3 = the map. Rooms 1, 2, 4 = her tasks. Phases: crash (room 4's fake win breaks, Aurora talks) > takeover (every
// screen goes green) > fight (the tasks) > regroup (back to the map) > brief > kill (rooms 1, 2, 4 press together) > end
const FIN = {
  LEAD: 600,             // ms from a synced event to the moment every screen shows it (covers Wi-Fi delay)
  SCAN: 4200,            // the map's trace sweep: the task rooms light up when it ends
  REGROUP: 2600,         // after the last task: its PURGED stamp plays before RETURN TO THE MAP
  WIN: [1.0, 0.4],       // kill switch: how far apart (s) the 3 presses may land, at TRACE 0 and at TRACE 100
  WIDEN: 0.3,            // + this per miss after the 2nd
  WAIT: 1500,            // after a try's first press, the other rooms get the window + this long
  BULB: { takeover: '#4dff88', end: '#ffffff' },   // the hallway bulb: her green while she's loose, white when she dies
};
const TASK_ROOMS = { binary: 1, words: 2, cross: 4 }, KILL_ROOMS = [1, 2, 4];
function finFresh() {
  return { phase: null, at: 0, seq: 0, swapped: false, ready: {}, fails: 0, ev: null,
    tasks: Object.fromEntries(Object.entries(TASK_ROOMS).map(([k, room]) => [k, { room, done: 0, clear: false }])) };
}
const killWin = () => +(FIN.WIN[0] + (FIN.WIN[1] - FIN.WIN[0]) * (run.trace ?? 50) / 100 + FIN.WIDEN * Math.max(0, run.fin.fails - 1)).toFixed(2);
const finMsg = () => ({ t: 'fin', ...run.fin, win: killWin(), now: Date.now(),
  run: { sync: run.sync, power: run.power, trace: run.trace, human: run.human, facts: run.facts } });
let presses = {}, judgeT = null;          // the kill switch's current try (not saved: after a hub restart they just press again)
function fin(ws, m) {
  const f = run.fin, room = +String(ws.id).replace(/\D/g, ''), now = Date.now();
  const go = (phase, lead = 0) => { f.phase = phase; f.at = now + lead; log('finale ' + phase); if (FIN.BULB[phase]) cmd('strip', 'solid', FIN.BULB[phase]); };
  const task = f.tasks[m.task];
  switch (m.a) {
    case 'sync': return send(ws, { t: 'sync', c: m.c, now });   // boss.js measures its clock against the hub's
    case 'crash': if (f.phase) return; go('crash'); break;
    case 'takeover': if (f.phase !== 'crash') return; go('takeover', FIN.LEAD); break;
    case 'trace': if (f.phase !== 'takeover') return; go('fight', FIN.SCAN); break;
    case 'step': if (f.phase !== 'fight' || task?.room !== room || task.clear) return; task.done = Math.max(0, +m.done || 0); break;
    case 'clear': {
      if (f.phase !== 'fight' || task?.room !== room || task.clear) return;
      task.clear = true; f.ev = { k: 'clear', task: m.task, room, at: now };
      // the first task down: she jumps. Rooms 1 and 2 trade whatever they still have (a lone task moves across)
      if (!f.swapped) { f.swapped = true; Object.values(f.tasks).forEach(t => { if (!t.clear && t.room !== 4) t.room = 3 - t.room; }); f.ev.swap = true; }
      if (Object.values(f.tasks).every(t => t.clear)) go('regroup', FIN.REGROUP);
      break;
    }
    case 'brief': if (f.phase !== 'regroup') return; go('brief'); break;
    case 'kill': if (f.phase !== 'brief') return; go('kill'); f.ready = {}; presses = {}; break;
    case 'force': if (f.phase !== 'kill') return; return judge(true);
    case 'press': {
      if (f.phase !== 'kill' || !KILL_ROOMS.includes(room)) return;
      if (!KILL_ROOMS.every(r => f.ready[r])) {                 // the first press in a room only says "I'm here"
        if (f.ready[room]) return;
        f.ready[room] = true; f.ev = { k: 'ready', room, at: now }; break;
      }
      if (presses[room] != null) return;
      presses[room] = Math.abs(m.ts - now) < 3000 ? +m.ts : now;   // its own (hub-corrected) clock, so Wi-Fi delay doesn't count
      if (Object.keys(presses).length === 1) judgeT = setTimeout(judge, killWin() * 1000 + FIN.WAIT);
      if (KILL_ROOMS.every(r => presses[r] != null)) return judge();
      return;
    }
    default: return;
  }
  finChanged();
}
function judge(forced) {
  clearTimeout(judgeT);
  const f = run.fin, ts = KILL_ROOMS.map(r => presses[r]).filter(t => t != null), now = Date.now();
  const missing = KILL_ROOMS.filter(r => presses[r] == null), spread = (Math.max(...ts) - Math.min(...ts)) / 1000;
  presses = {};
  if (forced || (!missing.length && spread <= killWin())) {
    f.phase = 'end'; f.at = now + FIN.LEAD; f.ev = { k: 'kill', spread: forced ? null : +spread.toFixed(2), at: now };
    if (run.t0 && run.end == null && run.splits.p5done == null) run.splits.p5done = now - run.t0;
    log('finale end'); cmd('strip', 'solid', FIN.BULB.end);
  } else { f.fails++; f.ev = { k: 'fail', spread: missing.length ? null : +spread.toFixed(2), missing, at: now }; }
  finChanged();
  if (f.phase === 'end') toPages(runMsg());   // the GM's run card gets the p5done split
}
function finChanged() { run.fin.seq++; save(); toFin(finMsg()); }
let run = fresh();
try { run = { ...run, ...JSON.parse(fs.readFileSync(RUN, 'utf8')) }; } catch {}
const save = () => { try { fs.writeFileSync(RUN, JSON.stringify(run)); } catch (e) { log('could not save run: ' + e.message); } };
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const runMsg = () => { const { fin: _, ...r } = run; return { t: 'run', ...r, now: Date.now() }; };   // now: lets the GM clock ignore its own device's clock; fin goes to boss.js only
function changed(why) { save(); log(`${why} ▸ ` + KEYS.map(k => `${k} ${run[k]}`).join(' ')); toPages(runMsg()); toFin(finMsg()); }
// the rooms this run already unlocked. Sent to a game page on hello, so a room that reloaded or missed the event
// (its laptop rebooted, the hub restarted) unlocks again. Only mid-run: after FINISH RUN, reset rooms stay locked.
const unlocks = () => run.t0 && run.end == null ? Object.keys(run.splits) : [];

let history = [];
try { history = fs.readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(-30); } catch {}
const historyMsg = () => ({ t: 'history', runs: history });

// Addresses for the GM panel: this laptop's IPs (the URLs staff open on the phones) and the signup PC's, learned when
// the signup page connects (null = same laptop as the hub, or not seen yet). No IP is ever typed in.
let signupIP = null;
const myIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => (i.family === 'IPv4' || i.family === 4) && !i.internal).map(i => i.address)
  .sort((a, b) => b.startsWith(process.env.NET + '.') - a.startsWith(process.env.NET + '.'));   // the booth network first
const addrMsg = () => ({ t: 'addr', hub: myIPs(), signup: signupIP });

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  ws.alive = true; ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      ws.id = m.id; ws.role = m.role || 'device'; conns.set(ws.id, ws);
      log(`+ ${ws.role} ${ws.id}`);
      if (ws.role === 'device' && state[ws.id]) send(ws, { t: 'cmd', ...state[ws.id] });
      if (ws.role === 'fin') send(ws, finMsg());
      if (ws.role === 'page') { send(ws, runMsg()); send(ws, historyMsg()); Object.entries(status).forEach(([id, v]) => send(ws, { t: 'status', id, v })); }
      if (/^puzzle\d$/.test(ws.id)) unlocks().forEach(e => send(ws, { t: 'evt', id: 'hub', e }));
      if (ws.id === 'signup') { const a = req.socket.remoteAddress.replace(/^::ffff:/, ''); signupIP = /^(127\.|::1$)/.test(a) ? null : a; toPages(addrMsg()); }
      else if (ws.role === 'page') send(ws, addrMsg());
      toPages(roster());
    } else if (m.t === 'status' && ws.id) { status[ws.id] = m.v; toPages({ t: 'status', id: ws.id, v: m.v }); }   // every 1 s: no log line
    else if (m.t === 'cmd') cmd(m.to, m.a, m.v);            // from GM/pages
    else if (m.t === 'fin' && ws.role === 'fin') fin(ws, m);
    else if (m.t === 'result' && KEYS.includes(m.k)) { run[m.k] = clamp(+m.v || 0); Object.assign(run.facts, m.facts); changed(`${m.k} from ${ws.id}`); }
    else if (m.t === 'adj' && KEYS.includes(m.k)) { run[m.k] = clamp((run[m.k] ?? 50) + (+m.d || 0)); changed(`${m.k} ${m.d > 0 ? '+' : ''}${m.d} (${m.why || ws.id})`); }
    else if (m.t === 'newteam') { clearTimeout(judgeT); presses = {}; run = fresh(String(m.team || '').slice(0, 40)); changed(`new team ${run.team}`); }
    else if (m.t === 'finish' && run.t0 && run.end == null) {
      run.end = Date.now() - run.t0;
      const { fin: _, ...done } = run, line = { ...done, at: new Date().toISOString() };
      run.fin = finFresh(); clearTimeout(judgeT); presses = {};   // the finale screens go back to their own games
      fs.appendFile(RUNS, JSON.stringify(line) + '\n', e => e && log('could not save run: ' + e.message));
      history = [...history, line].slice(-30);
      changed(`finish ${run.team}`); toPages(historyMsg());
    }
    else if (m.t === 'evt') {
      if (/^p\ddone$/.test(m.e) && run.t0 && run.end == null && run.splits[m.e] == null) { run.splits[m.e] = Date.now() - run.t0; save(); toPages(runMsg()); }
      log(`evt ${ws.id}: ${m.e}`); toPages({ t: 'evt', id: ws.id, e: m.e, v: m.v });
    }
  });
  ws.on('close', () => {
    if (ws.id && conns.get(ws.id) === ws) {
      conns.delete(ws.id); log(`- ${ws.id}`); toPages(roster());
      delete status[ws.id];   // no broadcast: the GM marks a room offline after 3 s of silence, so a reset's reload doesn't alarm
    }
  });
});

// heartbeat: app-level ping to devices (their watchdog), TCP-level ping to drop dead sockets
setInterval(() => wss.clients.forEach(c => {
  if (!c.alive) return c.terminate();
  c.alive = false; c.ping(); send(c, { t: 'ping' });
}), 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`NEXUS hub on :${PORT}  (gm: /gm)`));
