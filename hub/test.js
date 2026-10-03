// smoke test: device receives finale_red, gets state replayed after reconnect; carried resources store, clamp, merge facts, reset;
// GM panel protocol (status, staff keys, run clock, finish); unlocks resent on hello; the run surviving a hub restart;
// game 5's finale state (phases in order, task swap, kill switch judging).
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

  // game 5: the finale's state lives in the hub, and boss.js on each room laptop follows it
  const [f1, f2, f3, f4] = await Promise.all([1, 2, 3, 4].map(n => open('fin' + n, 'fin')));
  const fin = w => w.msgs.filter(m => m.t === 'fin').pop(), F = (w, o) => w.send(JSON.stringify({ t: 'fin', ...o }));
  assert.strictEqual(fin(f1).phase, null, 'the finale sleeps until room 4 crashes');
  F(f3, { a: 'takeover' }); await wait(100);
  assert.strictEqual(fin(f1).phase, null, 'phases only move in order');
  F(f4, { a: 'crash' }); await wait(100);
  assert.strictEqual(fin(f1).phase, 'crash', 'room 4 crashes: every room hears it');
  F(f4, { a: 'takeover' }); await wait(100);
  let s = fin(f2);
  assert(s.phase === 'takeover' && s.at > s.now, 'the takeover is set a moment ahead, so every screen flips at once');
  F(f1, { a: 'sync', c: 123 }); await wait(100);
  assert(f1.msgs.some(m => m.t === 'sync' && m.c === 123 && m.now > 0), 'clock sync answers the asker');
  F(f3, { a: 'trace' }); await wait(100);
  assert.strictEqual(fin(f1).phase, 'fight', 'the map traces her: the fight starts');
  F(f2, { a: 'step', task: 'binary', done: 1 }); await wait(100);
  assert.strictEqual(fin(f1).tasks.binary.done, 0, 'only the room holding a task can move it');
  F(f1, { a: 'step', task: 'binary', done: 2 }); F(f4, { a: 'clear', task: 'cross' }); await wait(100);
  s = fin(f3);
  assert(s.tasks.binary.room === 2 && s.tasks.words.room === 1 && s.ev.swap, 'the first task down: rooms 1 and 2 swap');
  assert.strictEqual(s.tasks.binary.done, 2, 'progress moves with the task');
  F(f2, { a: 'clear', task: 'binary' }); await wait(100);
  s = fin(f3);
  assert(s.tasks.words.room === 1 && !s.ev.swap && s.phase === 'fight', 'she only jumps once');
  F(f1, { a: 'clear', task: 'words' }); await wait(100);
  assert.strictEqual(fin(f3).phase, 'regroup', 'all three down: back to the map');
  F(f3, { a: 'brief' }); await wait(50); F(f3, { a: 'kill' }); await wait(100);
  assert.strictEqual(fin(f3).phase, 'kill', 'the briefing leads to the kill switch');
  F(f1, { a: 'press', ts: Date.now() }); F(f2, { a: 'press', ts: Date.now() }); F(f3, { a: 'press', ts: Date.now() }); await wait(100);
  assert.deepStrictEqual(fin(f3).ready, { 1: true, 2: true }, 'a first press only says ready; the map is not a kill room');
  F(f4, { a: 'press', ts: Date.now() }); await wait(100);
  assert.strictEqual(fin(f3).phase, 'kill', 'the last room to arrive is ready, not a kill press');
  g({ t: 'result', k: 'trace', v: 100 }); await wait(100);
  assert.strictEqual(fin(f3).win, 0.4, 'TRACE sets the kill window');
  let t = Date.now();
  F(f1, { a: 'press', ts: t }); F(f2, { a: 'press', ts: t + 2000 }); F(f4, { a: 'press', ts: t }); await wait(100);
  s = fin(f3);
  assert(s.phase === 'kill' && s.fails === 1 && s.ev.k === 'fail' && s.ev.spread === 2, '2 s apart: OUT OF SYNC, try again');
  t = Date.now();
  F(f1, { a: 'press', ts: t }); F(f2, { a: 'press', ts: t + 300 }); F(f4, { a: 'press', ts: t + 100 }); await wait(100);
  s = fin(f3);
  assert(s.phase === 'end' && s.ev.k === 'kill' && s.ev.spread === 0.3, 'within the window: she dies');
  assert(last(gm).splits.p5done >= 0, 'the end sets the p5done split');
  hub.kill(); await wait(300); await startHub();
  gm = await open('gm1', 'page');
  assert.strictEqual(fin(await open('fin3', 'fin')).phase, 'end', 'the finale survives a hub restart');

  g({ t: 'finish' }); await wait(200);
  assert(last(gm).end >= 0, 'finish stops the clock');
  assert(gm.msgs.filter(m => m.t === 'history').pop().runs.some(x => x.team === 'Team Test'), 'finish adds to history');
  assert(!unlocked(await open('puzzle2', 'page'), 'p1done'), 'after FINISH RUN a reset room stays locked');
  assert.strictEqual(fin(await open('fin1', 'fin')).phase, null, 'FINISH RUN puts the finale to sleep');
  assert(!JSON.parse(fs.readFileSync(path.join(tmp, 'runs.jsonl'), 'utf8').trim().split('\n').pop()).fin, 'the finale state stays out of the run history');
  g({ t: 'newteam' }); await wait(100);
  console.log('OK'); hub.kill(); process.exit(0);
})().catch(e => { console.error(e.message); hub?.kill(); process.exit(1); });
