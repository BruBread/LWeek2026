// NEXUS hub: static pages + WebSocket relay. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile, spawn } = require('child_process'), { promisify } = require('util');
const { WebSocketServer } = require('ws');
const scenes = require('./scenes');

const PORT = +process.env.PORT || 3000, PUB = path.join(__dirname, 'public');   // PORT: only the tests change it
const RUNS = process.env.RUNS || path.join(__dirname, 'runs.jsonl');   // finished teams, one JSON line each
const RUN = process.env.RUN || path.join(__dirname, 'run.json');        // the team in the booth now, so a hub restart mid-run loses nothing
const state = {};            // deviceId -> last cmd {a,v}; replayed on reconnect
const status = {};           // game page id -> its last status (mode, live stat, ...), for the GM room cards
const conns = new Map();     // id -> ws (devices and pages)

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  // the room pages search the network for this answer to find the hub (findHub() in each page)
  if (p === '/ping') return res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('nexus-hub');
  if (p === '/sfx' || p === '/sfx/push') return sfx(req, res, p);
  if (p === '/update' && req.method === 'POST') return updateAll(res);
  if (p === '/update/bundle') return bundle(res, new URL(req.url, 'http://x').searchParams.get('have'));
  p = p === '/'? '/gm.html' : /\.\w+$/.test(p) ? p : p + '.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) return res.writeHead(403).end();
  // CORS: boss.js runs inside the room pages (other origins) and fetches its sounds and font from here
  fs.readFile(f, (e, d) => e ? res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('nope') : res.writeHead(200, { 'Access-Control-Allow-Origin': '*',
    'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }).end(d));
});
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

// ===== The GM panel's sound effect pads: audio files in public/sfx/. GET lists them, POST ?f=name uploads one (the body
// is the file), DELETE ?f=name removes one, POST /sfx/push saves the folder to GitHub =====
const SFX = process.env.SFX || path.join(PUB, 'sfx'), SFX_MAX = 25e6;   // SFX: only the tests change it. 25 MB a file keeps the repo small
fs.mkdirSync(SFX, { recursive: true });
const sfxName = q => { const f = path.basename(String(q || '')).replace(/[^\w.-]+/g, '-'); return /\.(mp3|wav|ogg|m4a)$/i.test(f) ? f : null; };
const sfxList = () => fs.readdirSync(SFX).filter(sfxName).sort((a, b) => a.localeCompare(b));
const json = (res, code, o) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
let pushing = false;
function sfx(req, res, p) {
  const f = sfxName(new URL(req.url, 'http://x').searchParams.get('f'));
  if (p === '/sfx/push') {
    if (req.method !== 'POST') return res.writeHead(405).end();
    if (pushing) return json(res, 409, { msg: 'Already saving to GitHub.' });
    pushing = true;
    return sfxPush().then(msg => json(res, 200, { msg }), e => json(res, 500, { msg: String(e.stderr?.trim().split('\n').pop() || e.message || e) }))
      .finally(() => pushing = false);
  }
  if (req.method === 'GET') return json(res, 200, sfxList());
  if (!f) return json(res, 400, { msg: 'Only .mp3, .wav, .ogg or .m4a files.' });
  if (req.method === 'DELETE') return fs.rm(path.join(SFX, f), { force: true }, () => { log('sfx deleted ' + f); json(res, 200, sfxList()); });
  if (req.method !== 'POST') return res.writeHead(405).end();
  if (!(+req.headers['content-length'] <= SFX_MAX)) return json(res, 413, { msg: `${f} is over ${SFX_MAX / 1e6} MB.` });
  req.pipe(fs.createWriteStream(path.join(SFX, f))).on('finish', () => { log('sfx added ' + f); json(res, 200, sfxList()); })
    .on('error', e => json(res, 500, { msg: e.message }));
}
// Commits only public/sfx on top of GitHub's newest main and pushes it. A temporary index, so nothing else on this laptop
// (other edits, half-done work) goes up. The booth router NexusV has no internet: the hub laptop must be on another Wi-Fi
const sh = (cmd, args, env) => promisify(execFile)(cmd, args, { cwd: __dirname, timeout: 180000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env } })
  .then(r => r.stdout.trim());
async function sfxPush() {
  const wifi = await sh('netsh', ['wlan', 'show', 'interfaces']).catch(() => '');
  if (/^\s*SSID\s*:\s*NexusV\s*$/mi.test(wifi)) throw 'This laptop is on NexusV, which has no internet. Join a Wi-Fi with internet, then try again.';
  await fetch('https://github.com', { method: 'HEAD', signal: AbortSignal.timeout(8000) }).catch(() => { throw 'No internet on this laptop.'; });
  const idx = path.join(os.tmpdir(), 'nexus-sfx-index'), git = (...a) => sh('git', a, { GIT_INDEX_FILE: idx });
  await git('fetch', 'origin', 'main');
  const base = await git('rev-parse', 'origin/main');
  await git('read-tree', base); await git('add', '-A', '--', 'public/sfx');
  const tree = await git('write-tree'); fs.rm(idx, { force: true }, () => {});
  if (tree === await git('rev-parse', base + '^{tree}')) return 'GitHub already has these sounds.';
  const who = await git('config', 'user.email').catch(() => '') ? [] : ['-c', 'user.name=NEXUS GM', '-c', 'user.email=nexus-gm@users.noreply.github.com'];
  const c = await git(...who, 'commit-tree', tree, '-p', base, '-m', 'Update the GM sound effects');
  await git('push', 'origin', c + ':refs/heads/main');
  // this laptop was on GitHub's newest: move it onto the new commit too, or its next pull trips over the (untracked) sounds
  if (await sh('git', ['rev-parse', 'HEAD']) === base) { await sh('git', ['reset', '--soft', c]); await sh('git', ['reset', '-q', '--', 'public/sfx']); }
  log(`sfx saved to GitHub (${c.slice(0, 7)})`);
  return `Saved to GitHub (${sfxList().length} sounds).`;
}

// ===== UPDATE ALL LAPTOPS: every laptop with a page on this hub copies this laptop's version of the game (its last
// commit) through hub/updater.js, which booth.bat runs on each one. Over the booth Wi-Fi, so NexusV's lack of internet
// doesn't matter. The updater asks /update/bundle?have=<its commit> for only the commits it lacks =====
const UPD = +process.env.UPDATER_PORT || 3001;   // only the tests change it
let updating = false;
async function updateAll(res) {
  if (updating) return json(res, 409, { msg: 'Already updating.' });
  updating = true;
  try {
    const head = await sh('git', ['log', '-1', '--format=%h %s']).catch(() => { throw "This laptop's copy has no git history (a ZIP?): it can't send updates."; });
    const at = {};
    wss.clients.forEach(c => c.id && c.role !== 'device' && (at[c.ip] ||= []).push(c.id));   // devices = ESP32s and bridges
    const laptops = await Promise.all(Object.entries(at).map(([ip, ids]) =>
      fetch(`http://${ip}:${UPD}/update`, { method: 'POST', body: String(PORT) }).then(async r => [r.ok, await r.text()],
        e => [false, `no updater answering (${e.cause?.code || e.message}): run any start.bat on it once`])
        .then(([ok, msg]) => ({ ip, ids, ok, msg }))));
    log(`update all: ${laptops.map(l => `${l.ip} ${l.msg}`).join('; ')}`);
    json(res, 200, { head, laptops });
  } catch (e) { json(res, 500, { msg: String(e) }); } finally { updating = false; }
}
async function bundle(res, have) {
  const known = /^[0-9a-f]{40}$/.test(have) && await sh('git', ['cat-file', '-e', have + '^{commit}']).then(() => true, () => false);
  if (known && await sh('git', ['merge-base', '--is-ancestor', 'HEAD', have]).then(() => true, () => false)) return res.writeHead(204).end();
  const g = spawn('git', ['bundle', 'create', '-', 'HEAD', ...(known ? ['^' + have] : [])], { cwd: __dirname });
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); g.stdout.pipe(res);   // a failed bundle = an empty body, which the updater's fetch reports
}

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const broadcast = (o, pred = () => true) => { const s = JSON.stringify(o); wss.clients.forEach(c => pred(c) && c.readyState === 1 && c.send(s)); };
const toPages = o => broadcast(o, c => c.role === 'page');
const toFin = o => broadcast(o, c => c.role === 'fin');   // boss.js on the room laptops (game 5)
const toGM = o => broadcast(o, c => c.role === 'page' && /^gm/.test(c.id));   // only the GM panel reads room statuses
const ids = role => [...conns].filter(([, w]) => w.role === role).map(([id]) => id);
const roster = () => ({ t: 'roster', devices: ids('device'), pages: ids('page') });
const log = m => console.log(m);   // the hub window only (no page shows a log)

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
// adj = the GM's HINT costs per resource, hints = how many. A hint before the room's result is kept and added to it.
// team/code = set by NEW TEAM or SEND IN (code = the signup ticket, for the photos). t0 = the clock's start: room 1's
// first click (p1start) or the GM's START, not SEND IN. splits = ms from t0 to each pNstart (rooms 2-4: the team pressed
// start) and pNdone; end = ms from t0 when the run closes (FINISH RUN or RESET ALL ROOMS; the kill switch's time if they got there).
const KEYS = ['sync', 'power', 'trace', 'human'];
const fresh = (team = '', code = '') => ({ sync: null, power: null, trace: null, human: null, facts: {}, adj: {}, hints: {},
  team, code, t0: null, splits: {}, end: null, fin: finFresh() });

// ===== Game 5, the finale: hub/public/boss.js on every room laptop. The hub owns its state, so the 4 screens agree,
// a reloaded laptop rejoins, and the synced moments (takeover, blackout) land at one hub time on every screen.
// Room 3 = the map. Rooms 1, 2, 4 = her tasks. Phases: crash (room 4's fake win breaks, Aurora talks) > takeover (every
// screen goes green) > fight (the tasks) > regroup (back to the map) > brief > kill (rooms 1, 2, 4 press together) > end.
// The team shares LIVES through all of it: a failed kill switch or a task mistake (boss.js C.LIFE) costs one; none left = lost
const FIN = {
  LEAD: 600,             // ms from a synced event to the moment every screen shows it (covers Wi-Fi delay)
  SCAN: 4200,            // the map's trace sweep: the task rooms light up when it ends
  REGROUP: 2600,         // after the last task: its PURGED stamp plays before RETURN TO THE MAP
  WIN: [1.0, 0.4],       // kill switch: how far apart (s) the 3 presses may land, at TRACE 0 and at TRACE 100
  WIDEN: 0.3,            // + this per miss after the 2nd
  WAIT: 1500,            // after a try's first press, the other rooms get the window + this long
  LIVES: 5,              // shared by the whole team for the whole finale
  GRACE: +process.env.FIN_GRACE || 2500,   // ms after a lost life: mistakes are free and kill presses don't count (only the tests change it)
  LOST: 2600,            // ms from the last life to her win on every screen (the -1 LIFE banner plays first)
  BULB: { takeover: '#4dff88', end: '#ffffff' },   // the hallway bulb: her green while she's loose, white when she dies
};
const TASK_ROOMS = { binary: 1, words: 2, cross: 4 }, KILL_ROOMS = [1, 2, 4];
function finFresh() {
  return { phase: null, at: 0, seq: 0, swapped: false, ready: {}, fails: 0, ev: null, lives: FIN.LIVES, safe: 0,
    tasks: Object.fromEntries(Object.entries(TASK_ROOMS).map(([k, room]) => [k, { room, done: 0, clear: false }])) };
}
const killWin = () => +(FIN.WIN[0] + (FIN.WIN[1] - FIN.WIN[0]) * (run.trace ?? 50) / 100 + FIN.WIDEN * Math.max(0, run.fin.fails - 1)).toFixed(2);
const finMsg = () => ({ t: 'fin', ...run.fin, win: killWin(), maxLives: FIN.LIVES, now: Date.now(),
  run: { sync: run.sync, power: run.power, trace: run.trace, human: run.human, facts: run.facts } });
let presses = {}, judgeT = null;          // the kill switch's current try (not saved: after a hub restart they just press again)
function fin(ws, m, room = +String(ws.id).replace(/\D/g, '')) {   // room: fin1..fin4 = room 1..4
  const f = run.fin, now = Date.now();
  const go = (phase, lead = 0) => { f.phase = phase; f.at = now + lead; log('finale ' + phase); if (FIN.BULB[phase]) cmd('strip', 'solid', FIN.BULB[phase]); };
  const task = f.tasks[m.task];
  switch (m.a) {
    case 'sync': return ws && send(ws, { t: 'sync', c: m.c, now });   // boss.js measures its clock against the hub's
    case 'crash': if (f.phase) return; go('crash'); break;
    case 'takeover': if (f.phase !== 'crash') return; go('takeover', FIN.LEAD); break;
    case 'trace': if (f.phase !== 'takeover') return; go('fight', FIN.SCAN); break;
    case 'step': if (f.phase !== 'fight' || task?.room !== room || task.clear) return; task.done = Math.max(0, +m.done || 0); if (m.need) task.need = +m.need; break;   // need: for the GM's progress bars
    case 'clear': {
      if (f.phase !== 'fight' || task?.room !== room || task.clear) return;
      task.clear = true; f.ev = { k: 'clear', task: m.task, room, at: now };
      // the first task down: she jumps. Rooms 1 and 2 trade whatever they still have (a lone task moves across)
      if (!f.swapped) { f.swapped = true; Object.values(f.tasks).forEach(t => { if (!t.clear && t.room !== 4) t.room = 3 - t.room; }); f.ev.swap = true; }
      if (Object.values(f.tasks).every(t => t.clear)) go('regroup', FIN.REGROUP);
      break;
    }
    case 'mistake': if (f.phase !== 'fight' || task?.room !== room || task.clear || now < f.safe) return; loseLife({ k: 'life', task: m.task, room }); break;
    case 'brief': if (f.phase !== 'regroup') return; go('brief'); break;
    case 'kill': if (f.phase !== 'brief') return; go('kill'); f.ready = {}; presses = {}; break;
    case 'force': if (f.phase !== 'kill') return; return judge(true);
    case 'press': {
      if (f.phase !== 'kill' || !KILL_ROOMS.includes(room)) return;
      if (!KILL_ROOMS.every(r => f.ready[r])) {                 // the first press in a room only says "I'm here"
        if (f.ready[room]) return;
        f.ready[room] = true; f.ev = { k: 'ready', room, at: now }; break;
      }
      if (presses[room] != null || now < f.safe) return;   // just lost a life: the map counts again first
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
  } else { f.fails++; loseLife({ k: 'fail', spread: missing.length ? null : +spread.toFixed(2), missing }); }
  finChanged();
  if (f.phase === 'end') toPages(runMsg());   // the GM's run card gets the p5done split
}
function loseLife(ev) {        // one of the team's lives gone; the last one and she wins
  const f = run.fin, now = Date.now();
  f.lives--; f.safe = now + FIN.GRACE; f.ev = { ...ev, lives: f.lives, at: now };
  log(`finale life lost (${ev.task || 'kill switch'}) ▸ ${f.lives} left`);
  if (f.lives > 0) return;
  f.phase = 'lost'; f.at = now + FIN.LOST; log('finale lost');
  if (run.t0 && run.end == null && run.splits.p5lost == null) { run.splits.p5lost = now - run.t0; toPages(runMsg()); }   // the GM's clock stops
}
function finChanged() { run.fin.seq++; save(); finOut(); }
const finOut = () => { const m = finMsg(); toFin(m); toPages(m); };   // boss.js on the room laptops, and the GM panel's game 5 card
// the GM panel's SKIP: the finale's next step, from whichever room it belongs to, even if that room's laptop is down
function finSkip(task) {
  const f = run.fin;
  if (f.phase === 'fight') { const t = f.tasks[task]; if (t && !t.clear) fin(null, { a: 'clear', task }, t.room); return; }
  const a = { crash: 'takeover', takeover: 'trace', regroup: 'brief', brief: 'kill', kill: 'force' }[f.phase];
  if (a) fin(null, { a }, 3);
}
let run = fresh();
try { run = { ...run, ...JSON.parse(fs.readFileSync(RUN, 'utf8')) }; } catch {}
run.fin = !run.t0 || run.end != null ? finFresh() : { ...finFresh(), ...run.fin };   // a saved finale only comes back mid-run (not a staff test's leftover)
const save = () => { try { fs.writeFileSync(RUN, JSON.stringify(run)); } catch (e) { log('could not save run: ' + e.message); } };
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const runMsg = () => { const { fin: _, ...r } = run; return { t: 'run', ...r, now: Date.now() }; };   // now: lets the GM clock ignore its own device's clock; fin goes to boss.js only
function changed(why) { save(); log(`${why} ▸ ` + KEYS.map(k => `${k} ${run[k]}`).join(' ')); toPages(runMsg()); finOut(); }
// the rooms this run already unlocked. Sent to a game page on hello, so a room that reloaded or missed the event
// (its laptop rebooted, the hub restarted) unlocks again. Only mid-run: after FINISH RUN, reset rooms stay locked.
const unlocks = () => run.t0 && run.end == null ? Object.keys(run.splits).filter(k => k.endsWith('done')) : [];
function startClock(why) {   // the team is in room 1 and touched something: the run clock starts now
  if (!run.team || run.t0 || run.end != null) return;
  run.t0 = Date.now(); changed(`clock starts (${why}) for ${run.team}`);
}
function closeRun() {        // stop the clock and add the run to the history, once (FINISH RUN, or RESET ALL ROOMS mid-run)
  clearTimeout(judgeT); presses = {};
  if (!run.t0 || run.end != null) return;
  run.end = run.splits.p5done ?? run.splits.p5lost ?? Date.now() - run.t0;   // a team that killed her (or ran out of lives): that moment, not when staff got to the button
  const { fin: _, ...done } = run, line = { ...done, at: new Date().toISOString() };
  fs.appendFile(RUNS, JSON.stringify(line) + '\n', e => e && log('could not save run: ' + e.message));
  history = [...history, line].slice(-30);
  toPages(historyMsg());
}
const ROOM_PAGES = ['puzzle1', 'puzzle2', 'puzzle3', 'puzzle4', 'desk1'];

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
  ws.ip = req.socket.remoteAddress.replace(/^::ffff:/, '');
  if (/^(127\.|::1$)/.test(ws.ip) || myIPs().includes(ws.ip)) ws.ip = '127.0.0.1';   // this laptop, however it connected
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      ws.id = m.id; ws.role = m.role || 'device'; conns.set(ws.id, ws);
      log(`+ ${ws.role} ${ws.id}`);
      if (ws.role === 'device' && state[ws.id]) send(ws, { t: 'cmd', ...state[ws.id] });
      if (ws.role === 'fin') send(ws, finMsg());
      if (ws.role === 'page') { send(ws, runMsg()); send(ws, finMsg()); send(ws, historyMsg()); if (/^gm/.test(ws.id)) Object.entries(status).forEach(([id, v]) => send(ws, { t: 'status', id, v })); }
      if (/^puzzle\d$/.test(ws.id)) unlocks().forEach(e => send(ws, { t: 'evt', id: 'hub', e }));
      if (ws.id === 'signup') { signupIP = ws.ip === '127.0.0.1' ? null : ws.ip; toPages(addrMsg()); }
      else if (ws.role === 'page') send(ws, addrMsg());
      toPages(roster());
    } else if (m.t === 'status' && ws.id) { status[ws.id] = m.v; toGM({ t: 'status', id: ws.id, v: m.v }); }   // every 1 s from each room: GM only, no log line
    else if (m.t === 'cmd') cmd(m.to, m.a, m.v);            // from GM/pages
    else if (m.t === 'fin' && ws.role === 'fin') fin(ws, m);
    else if (m.t === 'finskip') finSkip(m.task);
    else if (m.t === 'result' && KEYS.includes(m.k)) { run[m.k] = clamp((+m.v || 0) + (run.adj[m.k] || 0)); Object.assign(run.facts, m.facts); changed(`${m.k} from ${ws.id}`); }
    else if (m.t === 'adj' && KEYS.includes(m.k)) {
      const d = +m.d || 0;
      run.adj[m.k] = (run.adj[m.k] || 0) + d; run.hints[m.k] = (run.hints[m.k] || 0) + 1;
      if (run[m.k] != null) run[m.k] = clamp(run[m.k] + d);   // not played yet: the room's result picks it up
      changed(`${m.k} ${d > 0 ? '+' : ''}${d} (${m.why || ws.id})`);
    }
    // RESET ALL ROOMS = ready for the next group: the run so far is saved, the team cleared, every room back to its start,
    // the hallway light off. (The GM panel also marks the group done on the kiosk and calls the next one.)
    else if (m.t === 'reset') {
      closeRun(); const was = run.team; run = fresh();
      cmd(null, 'scene', 'dark'); ROOM_PAGES.forEach(id => cmd(id, 'key', 'KeyR'));
      changed(`reset all rooms${was ? ' after ' + was : ''}`);
    }
    else if (m.t === 'newteam') { clearTimeout(judgeT); presses = {}; run = fresh(String(m.team || '').slice(0, 40), String(m.code || '').slice(0, 8)); changed(`new team ${run.team}`); }
    else if (m.t === 'start') startClock('GM');
    else if (m.t === 'finish' && run.t0 && run.end == null) { closeRun(); run.fin = finFresh(); changed(`finish ${run.team}`); }   // the finale screens go back to their own games
    else if (m.t === 'evt') {
      if (m.e === 'p1start') startClock(ws.id);
      if (/^p\d(start|done)$/.test(m.e) && run.t0 && run.end == null && run.splits[m.e] == null) { run.splits[m.e] = Date.now() - run.t0; save(); toPages(runMsg()); }
      if (m.e !== 'music') log(`evt ${ws.id}: ${m.e}`);   // music: room pages asking the GM laptop to play their background loops
      toPages({ t: 'evt', id: ws.id, e: m.e, v: m.v });
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
const PING = JSON.stringify({ t: 'ping' });
setInterval(() => wss.clients.forEach(c => {
  if (!c.alive) return c.terminate();
  c.alive = false; c.ping(); if (c.readyState === 1) c.send(PING);
}), 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`NEXUS hub on :${PORT}  (gm: /gm)`));
