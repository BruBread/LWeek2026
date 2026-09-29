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
  fs.readFile(f, (e, d) => e ? res.writeHead(404).end('nope') : res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }).end(d));
});

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const broadcast = (o, pred = () => true) => wss.clients.forEach(c => pred(c) && send(c, o));
const toPages = o => broadcast(o, c => c.role === 'page');
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
// facts = details for the finale's intruder dossier (decoy taken, caught, ...).
// team/t0 = set by NEW TEAM; splits = ms from t0 to each pNdone; end = ms from t0 at FINISH.
const KEYS = ['sync', 'power', 'trace', 'human'];
const fresh = (team = '') => ({ sync: null, power: null, trace: null, human: null, facts: {},
  team, t0: team ? Date.now() : null, splits: {}, end: null });
let run = fresh();
try { run = { ...run, ...JSON.parse(fs.readFileSync(RUN, 'utf8')) }; } catch {}
const save = () => { try { fs.writeFileSync(RUN, JSON.stringify(run)); } catch (e) { log('could not save run: ' + e.message); } };
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const runMsg = () => ({ t: 'run', ...run, now: Date.now() });   // now: lets the GM clock ignore its own device's clock
function changed(why) { save(); log(`${why} ▸ ` + KEYS.map(k => `${k} ${run[k]}`).join(' ')); toPages(runMsg()); }
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
      if (ws.role === 'page') { send(ws, runMsg()); send(ws, historyMsg()); Object.entries(status).forEach(([id, v]) => send(ws, { t: 'status', id, v })); }
      if (/^puzzle\d$/.test(ws.id)) unlocks().forEach(e => send(ws, { t: 'evt', id: 'hub', e }));
      if (ws.id === 'signup') { const a = req.socket.remoteAddress.replace(/^::ffff:/, ''); signupIP = /^(127\.|::1$)/.test(a) ? null : a; toPages(addrMsg()); }
      else if (ws.role === 'page') send(ws, addrMsg());
      toPages(roster());
    } else if (m.t === 'status' && ws.id) { status[ws.id] = m.v; toPages({ t: 'status', id: ws.id, v: m.v }); }   // every 1 s: no log line
    else if (m.t === 'cmd') cmd(m.to, m.a, m.v);            // from GM/pages
    else if (m.t === 'result' && KEYS.includes(m.k)) { run[m.k] = clamp(+m.v || 0); Object.assign(run.facts, m.facts); changed(`${m.k} from ${ws.id}`); }
    else if (m.t === 'adj' && KEYS.includes(m.k)) { run[m.k] = clamp((run[m.k] ?? 50) + (+m.d || 0)); changed(`${m.k} ${m.d > 0 ? '+' : ''}${m.d} (${m.why || ws.id})`); }
    else if (m.t === 'newteam') { run = fresh(String(m.team || '').slice(0, 40)); changed(`new team ${run.team}`); }
    else if (m.t === 'finish' && run.t0 && run.end == null) {
      run.end = Date.now() - run.t0;
      const line = { ...run, at: new Date().toISOString() };
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
