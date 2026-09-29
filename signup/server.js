// Nexus: Aurora V signup: ticket sales + the line, on the computer outside the booth. Run: node server.js (no npm install needed)
// Every sale and every status change is appended to sales.jsonl the moment it happens. That file IS the sales record:
// back it up (copy it to a USB stick) at the end of every day. Photos land in photos/<ticket code>/<n>.jpg.
const http = require('http'), fs = require('fs'), path = require('path'), { execFile } = require('child_process');

// price, tickets, party limits and booth hours: config.js
const CFG = { ...require('./config'), PORT: +process.env.PORT || 4000 };
if (process.env.TICKETS) CFG.TICKETS = +process.env.TICKETS;
if (process.env.MIN_PARTY) CFG.MIN_PARTY = +process.env.MIN_PARTY;   // tests only

const DIR = process.env.DATA || __dirname, PUB = __dirname;
const LOG = path.join(DIR, 'sales.jsonl'), PHOTOS = path.join(DIR, 'photos');
fs.mkdirSync(PHOTOS, { recursive: true });

// ===== The sales log: rebuilt into memory on start =====
// status: booked -> called -> in -> done, or noshow / void. A no-show can be put back in line (booked again, new slot).
const sales = new Map();
function apply(e) {
  if (e.t === 'sale') sales.set(e.code, { ...e, t: undefined, history: [] });
  else if (e.t === 'status' && sales.has(e.code)) {
    const s = sales.get(e.code);
    s.history.push({ from: s.status, to: e.status, at: e.at, reason: e.reason });
    s.status = e.status; if (e.slot) s.slot = e.slot;
  }
}
try { fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).forEach(l => apply(JSON.parse(l))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
function record(e) {           // write first, then apply: a sale that isn't on disk never happened
  e.at = new Date().toISOString();
  fs.appendFileSync(LOG, JSON.stringify(e) + '\n');
  apply(e);
}

const live = s => s.status !== 'void';
const sold = () => [...sales.values()].filter(s => live(s) && !s.assist).reduce((n, s) => n + s.size, 0);
const slotKey = sl => sl && sl.date + ' ' + sl.time;
const taken = (sl, except) => [...sales.values()].some(s => s.code !== except && live(s) && s.status !== 'noshow' && s.status !== 'done' && slotKey(s.slot) === slotKey(sl));
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const pad = n => String(n).padStart(2, '0');
function validSlot(sl) {       // a real slot start inside the booth hours
  const d = sl && CFG.DAYS.find(x => x.date === sl.date);
  if (!d || !/^\d\d:\d\d$/.test(sl.time)) return false;
  const m = toMin(sl.time), o = toMin(d.open);
  return m >= o && m + CFG.SLOT_MIN <= toMin(d.close) && (m - o) % CFG.SLOT_MIN === 0;
}
function newCode() {
  const A = 'ACDEFHJKLMNPRTUVWXY2345679';
  let c; do c = Array.from({ length: 4 }, () => A[Math.random() * A.length | 0]).join(''); while (sales.has(c));
  return c;
}
const pub = s => ({ ...s, photos: Array.from({ length: s.photos }, (_, i) => `/photos/${s.code}/${i + 1}.jpg`) });

// game 2's hallway camera, for the GM panel's CAMERA light: is go2rtc up, and can camera.js still find the camera?
// (camera.js knocks across the booth network, about 1.5 s.) {ip} = found, {ip: null} = not found, {error} = not set up
let camera = null;
function checkCamera() {
  execFile(process.execPath, [path.join(__dirname, 'camera.js'), 'url'], { timeout: 8000 }, async (err, out) => {
    const go2rtc = await fetch('http://127.0.0.1:1984/api', { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
    camera = err ? { error: 'camera.json missing or broken on the signup PC (puzzle2 SETUP.md, "Hallway camera")' }
      : !go2rtc ? { error: 'go2rtc is not running on the signup PC (is go2rtc.exe in signup/? restart signup/start.bat)' }
      : { ip: (/@([\d.]+):554/.exec(out) || [])[1] || null };
  });
}
checkCamera(); setInterval(checkCamera, 15000);

// ===== HTTP =====
const json = (res, code, o) => res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(JSON.stringify(o));
const body = req => new Promise((ok, bad) => {
  let b = ''; req.on('data', d => { b += d; if (b.length > 20e6) { bad(new Error('too big')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { bad(e); } });
});
const csvCell = v => /[",\n]/.test(v = String(v ?? '')) ? `"${v.replace(/"/g, '""')}"` : v;

const routes = {
  'GET /api/state': () => [200, { cfg: CFG, sold: sold(), sales: [...sales.values()].map(pub), now: Date.now(), camera }],
  // the group inside the booth right now, with photo URLs (for the finale's intruder dossier on the hub)
  'GET /api/current': () => [200, [...sales.values()].filter(s => s.status === 'in').map(pub)[0] || null],
  // b.test (Ctrl+Alt+T-E-S-T on the kiosk): checked like a real sale, then nothing is written
  'POST /api/sale': b => {
    const size = +b.size, max = b.assist ? CFG.ASSIST_MAX : CFG.MAX_PARTY, min = b.assist || b.test ? 1 : CFG.MIN_PARTY;
    const team = String(b.team || '').trim().slice(0, 24);
    if (!Number.isInteger(size) || size < min || size > max) return [400, { error: `PARTY MUST BE ${min}-${max}` }];
    if (!team) return [400, { error: 'NO TEAM NAME' }];
    if (!Array.isArray(b.photos) || b.photos.length !== size) return [400, { error: 'ONE PHOTO PER PLAYER' }];
    // test sales skip "sold out" (tickets and full slots): they never take either
    if (!b.assist && !b.test && sold() + size > CFG.TICKETS) return [409, { error: `ONLY ${CFG.TICKETS - sold()} TICKETS LEFT` }];
    if (!validSlot(b.slot)) return [400, { error: 'NOT A BOOTH SLOT' }];
    if (!b.test && taken(b.slot)) return [409, { error: 'THAT SLOT WAS JUST TAKEN. PICK ANOTHER' }];
    const sale = { code: b.test ? 'TEST' : newCode(), team, size, slot: { date: b.slot.date, time: b.slot.time }, walkin: !!b.walkin, assist: !!b.assist,
      amount: b.assist ? 0 : size * CFG.PRICE, photos: size, status: 'booked' };
    if (b.test) return [200, { ...pub(sale), test: true }];
    const dir = path.join(PHOTOS, sale.code);
    fs.mkdirSync(dir);
    b.photos.forEach((p, i) => fs.writeFileSync(path.join(dir, `${i + 1}.jpg`), Buffer.from(String(p).split(',')[1] || '', 'base64')));
    record({ t: 'sale', ...sale });
    const code = sale.code;
    return [200, pub(sales.get(code))];
  },
  'POST /api/status': b => {
    const s = sales.get(b.code);
    if (!s) return [404, { error: 'NO SUCH TICKET' }];
    if (!['booked', 'called', 'in', 'done', 'noshow', 'void'].includes(b.status)) return [400, { error: 'BAD STATUS' }];
    if (b.status === 'void' && !String(b.reason || '').trim()) return [400, { error: 'VOID NEEDS A REASON' }];
    if (s.status === 'void') return [409, { error: 'ALREADY VOID' }];
    if (b.slot && (!validSlot(b.slot) || taken(b.slot, s.code))) return [409, { error: 'THAT SLOT IS NOT FREE' }];
    // only one group inside at a time: sending a group in finishes the one before
    if (b.status === 'in') [...sales.values()].filter(x => x.status === 'in' && x.code !== s.code).forEach(x => record({ t: 'status', code: x.code, status: 'done' }));
    record({ t: 'status', code: s.code, status: b.status, reason: b.reason, slot: b.slot });
    return [200, pub(s)];
  },
};

http.createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const r = routes[req.method + ' ' + p];
  if (r) {
    try { const [code, o] = r(req.method === 'POST' ? await body(req) : {}); json(res, code, o); }
    catch (e) { console.error(e); json(res, 500, { error: 'SERVER ERROR: ' + e.message }); }
    return;
  }
  if (p === '/sales.csv') {    // open http://localhost:4000/sales.csv to export
    const cols = ['code', 'team', 'size', 'amount', 'status', 'walkin', 'assist', 'at'];
    const rows = [...sales.values()].map(s => [...cols.map(c => s[c]), slotKey(s.slot)].map(csvCell).join(','));
    return res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="nexus-sales.csv"' })
      .end([[...cols, 'slot'].join(','), ...rows].join('\n'));
  }
  // / = the signup kiosk, /queue = the same page as a read-only queue board for a TV
  const f = p.startsWith('/photos/') ? path.join(PHOTOS, path.normalize(p.slice(8))) : path.join(PUB, path.normalize(p === '/' || p === '/queue' ? '/index.html' : p));
  if (!f.startsWith(p.startsWith('/photos/') ? PHOTOS : PUB) || /sales\.jsonl$|server\.js$/.test(f)) return res.writeHead(403).end();
  fs.readFile(f, (e, d) => e ? res.writeHead(404).end('nope') : res.writeHead(200, { 'Access-Control-Allow-Origin': '*',
    'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' }[path.extname(f)] || 'application/octet-stream' }).end(d));
}).listen(CFG.PORT, '0.0.0.0', () => console.log(`NEXUS signup on :${CFG.PORT}  (sold ${sold()}/${CFG.TICKETS})`));
