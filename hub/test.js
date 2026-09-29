// smoke test: device receives finale_red, gets state replayed after reconnect; carried resources store, clamp, merge facts, reset;
// GM panel protocol (status, staff keys, run clock, finish); unlocks resent on hello; the run surviving a hub restart.
// Starts its own hub on :3000 with temp run files (stop the real hub first), so test runs never land in runs.jsonl.
const WebSocket = require('ws'), assert = require('assert'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hub-'));
let hub;
const startHub = () => new Promise((ok, bad) => {
  hub = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, RUNS: path.join(tmp, 'runs.jsonl'), RUN: path.join(tmp, 'run.json') } });
  hub.stdout.once('data', () => ok());
  hub.once('exit', c => bad(new Error(`hub exited (${c}). Is another hub already on :3000?`)));
});
const open = (id, role) => new Promise(r => { const w = new WebSocket('ws://localhost:3000/ws'); w.msgs = []; w.on('error', () => {}); w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => { w.send(JSON.stringify({ t: 'hello', id, role })); setTimeout(() => r(w), 100); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const last = w => { const r = w.msgs.filter(m => m.t === 'run').pop(); if (r) delete r.now; return r; };
const unlocked = (w, e) => w.msgs.some(m => m.t === 'evt' && m.e === e);
(async () => {
  await startHub();
  let strip = await open('strip', 'device'), gm = await open('gm1', 'page');
  assert.strictEqual(await (await fetch('http://localhost:3000/ping')).text(), 'nexus-hub', '/ping answers the pages searching for the hub');
  assert(gm.msgs.some(m => m.t === 'addr' && Array.isArray(m.hub) && m.signup === null), 'GM gets the hub IPs on hello');
  await open('signup', 'page'); await wait(100);
  assert.strictEqual(gm.msgs.filter(m => m.t === 'addr').pop().signup, null, 'a signup page on the hub laptop = no separate signup IP');
  gm.send(JSON.stringify({ t: 'cmd', a: 'scene', v: 'finale_red' }));
  await wait(200);
  assert(strip.msgs.some(m => m.t === 'cmd' && m.v === '#ff0000'), 'strip got red');
  strip.close(); await wait(200);
  const again = await open('strip', 'device');
  assert(again.msgs.some(m => m.t === 'cmd' && m.v === '#ff0000'), 'state replayed');

  const g = o => gm.send(JSON.stringify(o));
  g({ t: 'newteam' }); await wait(100);
  assert.strictEqual(last(gm).sync, null, 'new team starts empty');
  g({ t: 'result', k: 'sync', v: 80, facts: { breached: '3/4' } });
  g({ t: 'result', k: 'power', v: 250, facts: { grid: 'HELD' } });
  g({ t: 'result', k: 'bogus', v: 1 }); await wait(100);
  let r = last(gm);
  assert.strictEqual(r.sync, 80, 'result stored');
  assert.strictEqual(r.power, 100, 'result clamped at 100');
  assert.deepStrictEqual(r.facts, { breached: '3/4', grid: 'HELD' }, 'facts merge');
  assert(!('bogus' in r), 'unknown keys ignored');
  g({ t: 'adj', k: 'sync', d: -500 }); g({ t: 'adj', k: 'trace', d: 5 }); await wait(100);
  r = last(gm);
  assert.strictEqual(r.sync, 0, 'adj clamps at 0');
  assert.strictEqual(r.trace, 55, 'adj on an unplayed game starts from 50');
  const late = await open('dossier', 'page');
  assert.strictEqual(last(late).trace, 55, 'run sent on hello');
  g({ t: 'newteam' }); await wait(100);
  assert.deepStrictEqual(last(gm), { t: 'run', sync: null, power: null, trace: null, human: null, facts: {},
    team: '', t0: null, splits: {}, end: null }, 'new team resets');

  // GM panel: room status, remote staff keys, run clock, splits, finish + history
  const p3 = await open('puzzle3', 'page');
  assert(last(gm) && gm.msgs.some(m => m.t === 'roster' && m.pages.includes('puzzle3')), 'roster lists pages');
  p3.send(JSON.stringify({ t: 'status', v: { mode: 'hunt', trace: 12 } })); await wait(100);
  assert(gm.msgs.some(m => m.t === 'status' && m.id === 'puzzle3' && m.v.mode === 'hunt'), 'status relayed');
  assert(!gm.msgs.some(m => m.t === 'log' && /status/.test(m.m)), 'status is not logged');
  const gm2 = await open('gm2', 'page');
  assert(gm2.msgs.some(m => m.t === 'status' && m.id === 'puzzle3'), 'status sent on hello');
  g({ t: 'cmd', to: 'puzzle3', a: 'key', v: 'KeyU' }); await wait(100);
  assert(p3.msgs.some(m => m.t === 'cmd' && m.a === 'key' && m.v === 'KeyU'), 'staff key reaches the game page');
  p3.close(); await wait(200);
  const gm3 = await open('gm3', 'page');
  assert(!gm3.msgs.some(m => m.t === 'status' && m.id === 'puzzle3'), 'status forgotten on close');
  const p3b = await open('puzzle3', 'page');
  assert(!p3b.msgs.some(m => m.t === 'cmd'), 'staff keys are never replayed');

  g({ t: 'newteam', team: 'Team Test' }); await wait(100);
  r = last(gm);
  assert(r.team === 'Team Test' && r.t0 > 0, 'new team stores name and start time');
  p3b.send(JSON.stringify({ t: 'evt', e: 'p1done' })); await wait(100);
  assert(last(gm).splits.p1done >= 0, 'p1done sets a split');
  const p2 = await open('puzzle2', 'page'), gm4 = await open('gm4', 'page');
  assert(unlocked(p2, 'p1done'), 'mid-run: a game page that (re)connects gets the unlocks again');
  assert(!gm4.msgs.some(m => m.t === 'evt'), 'unlocks are resent to game pages only');

  hub.kill(); await wait(300); await startHub();
  gm = await open('gm1', 'page');
  r = last(gm);
  assert(r.team === 'Team Test' && r.t0 > 0 && r.splits.p1done >= 0, 'the run survives a hub restart');
  assert(unlocked(await open('puzzle2', 'page'), 'p1done'), 'unlocks resent after a hub restart');

  g({ t: 'finish' }); await wait(200);
  assert(last(gm).end >= 0, 'finish stops the clock');
  assert(gm.msgs.filter(m => m.t === 'history').pop().runs.some(x => x.team === 'Team Test'), 'finish adds to history');
  assert(!unlocked(await open('puzzle2', 'page'), 'p1done'), 'after FINISH RUN a reset room stays locked');
  g({ t: 'newteam' }); await wait(100);
  console.log('OK'); hub.kill(); process.exit(0);
})().catch(e => { console.error(e.message); hub?.kill(); process.exit(1); });
