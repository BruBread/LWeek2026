// smoke test for the signup server: party limits, assist, slot clash, ticket cap, void, restart rebuilds from the log.
// Run: node test.js   (starts its own server on a temp folder, so real sales.jsonl is never touched)
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-signup-')), PORT = 4099;
const url = p => `http://localhost:${PORT}${p}`;
const post = async (p, o) => { const r = await fetch(url(p), { method: 'POST', body: JSON.stringify(o) }); return [r.status, await r.json()]; };
const get = async p => (await fetch(url(p))).json();
const wait = ms => new Promise(r => setTimeout(r, ms));
const img = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');
const sale = (o = {}) => ({ team: 'Team A', size: 2, photos: [img, img], slot: { date: '2026-10-05', time: '09:00' }, ...o });
let srv;
const start = async () => { srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, DATA, PORT, TICKETS: 8, MIN_PARTY: 2 } }); await wait(400); };

(async () => {
  await start();
  let [c, b] = await post('/api/sale', sale());
  assert.strictEqual(c, 200, 'sale ok: ' + JSON.stringify(b));
  assert(/^[A-Z0-9]{4}$/.test(b.code) && b.amount === 100 && b.status === 'booked', 'code, amount, status');
  assert.deepStrictEqual(b.photos, [`/photos/${b.code}/1.jpg`, `/photos/${b.code}/2.jpg`], 'photo urls');
  assert.strictEqual(await (await fetch(url(b.photos[0]))).text(), 'fake jpeg', 'photo saved and served');
  const first = b.code;
  assert.strictEqual((await post('/api/sale', sale()))[0], 409, 'same slot twice refused');
  assert.strictEqual((await post('/api/sale', sale({ slot: { date: '2026-10-05', time: '09:10' } })))[0], 400, 'not a slot start');
  assert.strictEqual((await post('/api/sale', sale({ slot: { date: '2026-10-10', time: '09:00' } })))[0], 400, 'not a booth day');
  const eight = Array(8).fill(img), s2 = { date: '2026-10-05', time: '09:25' };
  assert.strictEqual((await post('/api/sale', sale({ size: 8, photos: eight, slot: s2 })))[0], 400, 'party of 8 refused');
  assert.strictEqual((await post('/api/sale', sale({ size: 3, photos: [img], slot: s2 })))[0], 400, 'one photo per player');
  assert.strictEqual((await post('/api/sale', sale({ size: 1, photos: [img], slot: s2 })))[0], 400, 'below the minimum group size refused');
  assert.strictEqual((await post('/api/sale', sale({ size: 1, photos: [img], slot: s2, test: true })))[0], 200, '...but test mode allows any size');
  [c, b] = await post('/api/sale', sale({ size: 8, photos: eight, slot: s2, assist: true }));
  assert.strictEqual(c, 200, 'assist allows 8');
  assert(b.amount === 0 && b.assist, 'assist is free');
  assert.strictEqual((await get('/api/state')).sold, 2, 'assist is not counted in the tickets');
  const tst = await post('/api/sale', sale({ test: true, slot: { date: '2026-10-05', time: '10:15' } }));
  assert(tst[0] === 200 && tst[1].test && tst[1].code === 'TEST', 'test sale answers like a real one');
  assert.strictEqual((await get('/api/state')).sales.length, 2, '...but is never recorded');
  assert.strictEqual((await post('/api/sale', sale({ test: true })))[0], 200, 'test sale ignores a full slot');
  assert.strictEqual((await post('/api/sale', sale({ size: 7, photos: Array(7).fill(img), slot: { date: '2026-10-05', time: '10:40' } })))[0], 409, 'over the ticket cap refused');
  assert.strictEqual((await post('/api/sale', sale({ test: true, size: 7, photos: Array(7).fill(img) })))[0], 200, '...but a test sale skips sold out');
  assert.strictEqual((await post('/api/sale', sale({ test: true, slot: { date: '2026-10-05', time: '09:10' } })))[0], 400, 'test sale still needs a real slot');
  assert.strictEqual((await post('/api/sale', sale({ size: 391, photos: Array(391).fill(img), slot: { date: '2026-10-05', time: '09:50' }, assist: true })))[0], 400, 'assist still has a max');

  assert.strictEqual((await post('/api/status', { code: first, status: 'void' }))[0], 400, 'void needs a reason');
  assert.strictEqual((await post('/api/status', { code: first, status: 'void', reason: 'double charged' }))[0], 200, 'void ok');
  assert.strictEqual((await post('/api/sale', sale()))[0], 200, 'a void frees its slot');
  let st = await get('/api/state');
  assert.strictEqual(st.sold, 2, 'void tickets are not counted');

  const [, x] = await post('/api/status', { code: b.code, status: 'called' });
  await post('/api/status', { code: b.code, status: 'in' });
  assert.strictEqual((await get('/api/current')).code, b.code, 'current = the group in the booth');
  const other = st.sales.find(s => s.status === 'booked' && s.code !== b.code).code;
  await post('/api/status', { code: other, status: 'in' });
  st = await get('/api/state');
  assert.strictEqual(st.sales.find(s => s.code === b.code).status, 'done', 'sending the next group in finishes the last one');
  assert(x.history.some(h => h.to === 'called'), 'status history kept');

  srv.kill(); await wait(200); await start();
  const again = await get('/api/state');
  assert.strictEqual(again.sold, 2, 'restart rebuilds the sales from the log');
  assert.strictEqual(again.sales.find(s => s.code === first).status, 'void', '...including voids');
  const csv = await (await fetch(url('/sales.csv'))).text();
  assert(csv.split('\n').length === 4 && /double|void/.test(csv), 'CSV export');
  assert.strictEqual((await fetch(url('/sales.jsonl'))).status, 403, 'the log is not served');
  assert(/<title>/.test(await (await fetch(url('/queue'))).text()), '/queue serves the page (queue board)');
  [c, b] = await post('/api/sale', sale({ size: 1, photos: [img], slot: { date: '2026-10-05', time: '11:05' }, bypass: true }));
  assert(c === 200 && b.amount === 50 && b.code !== 'TEST', 'bypass allows a group below the minimum, paid and recorded');
  assert.strictEqual((await get('/api/state')).sold, 3, '...and counted in the tickets');
  console.log('OK'); srv.kill(); process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); srv && srv.kill(); process.exit(1); });
