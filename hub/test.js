// smoke test: device receives finale_red, gets state replayed after reconnect; carried resources store, clamp, merge facts, hints;
// GM panel protocol (status, staff keys, run clock from room 1's first click, room starts, finish, reset for the next group);
// unlocks resent on hello; the run surviving a hub restart;
// game 5's finale state (phases in order, task swap, kill switch judging, the team's lives).
// Starts its own hub on :3999 with temp run files, so it runs next to the real hub and never lands in runs.jsonl.
const WebSocket = require('ws'), assert = require('assert'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hub-'));
let hub;
// a stand-in for signup/camera.js: never moves the real camera, just notes which aim the hub asked for
const camLog = path.join(tmp, 'camera.log'), camJs = path.join(tmp, 'camera.js');
fs.writeFileSync(camJs, `require('fs').appendFileSync(${JSON.stringify(camLog)}, process.argv[3] + '\\n')`);
const aims = () => { try { return fs.readFileSync(camLog, 'utf8').trim().split('\n'); } catch { return []; } };
const startHub = (env = {}) => new Promise((ok, bad) => {
  hub = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: '3999', RUNS: path.join(tmp, 'runs.jsonl'), RUN: path.join(tmp, 'run.json'), LOG: path.join(tmp, 'hub.log'), SFX: path.join(tmp, 'sfx'), UPDATER_PORT: '3998', FIN_GRACE: '300', CAMERA: camJs, ...env } });
  hub.stdout.once('data', () => ok());
  hub.once('exit', c => bad(new Error(`hub exited (${c}). Is something already on :3999?`)));
});
const open = (id, role) => new Promise(r => { const w = new WebSocket('ws://localhost:3999/ws'); w.msgs = []; w.on('error', () => {}); w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => { w.send(JSON.stringify({ t: 'hello', id, role })); setTimeout(() => r(w), 100); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const last = w => { const r = w.msgs.filter(m => m.t === 'run').pop(); if (r) delete r.now; return r; };
const unlocked = (w, e) => w.msgs.some(m => m.t === 'evt' && m.e === e);
(async () => {
  await startHub();
  let strip = await open('strip', 'device'), gm = await open('gm1', 'page');
  assert.strictEqual(await (await fetch('http://localhost:3999/ping')).text(), 'nexus-hub', '/ping answers the pages searching for the hub');
  assert(gm.msgs.some(m => m.t === 'addr' && Array.isArray(m.hub) && m.signup === null), 'GM gets the hub IPs on hello');
  await open('signup', 'page'); await wait(100);
  assert.strictEqual(gm.msgs.filter(m => m.t === 'addr').pop().signup, null, 'a signup page on the hub laptop = no separate signup IP');
  gm.send(JSON.stringify({ t: 'cmd', a: 'scene', v: 'finale_red' }));
  await wait(200);
  assert(strip.msgs.some(m => m.t === 'cmd' && m.v === '#ff0000'), 'strip got red');
  strip.close(); await wait(200);
  const again = await open('strip', 'device');
  assert(again.msgs.some(m => m.t === 'cmd' && m.v === '#ff0000'), 'state replayed');
  // a broken frame (unmasked) used to crash the hub and drop every room at once
  const bad = require('net').connect(3999, 'localhost', () => bad.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'));
  bad.on('error', () => {}).once('data', () => bad.write(Buffer.from([0x81, 1, 0x41])));
  await wait(300);
  assert(hub.exitCode === null && gm.readyState === 1, 'a broken frame closes only its own socket');

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
  assert.strictEqual(r.trace, null, 'a hint on an unplayed game waits for its result');
  g({ t: 'result', k: 'trace', v: 20 }); await wait(100);
  assert.strictEqual(last(gm).trace, 25, "the hint is added to the room's result, not lost");
  assert.deepStrictEqual(last(gm).hints, { sync: 1, trace: 1 }, 'hints are counted');
  const late = await open('dossier', 'page');
  assert.strictEqual(last(late).trace, 25, 'run sent on hello');
  g({ t: 'newteam' }); await wait(100);
  assert.deepStrictEqual(last(gm), { t: 'run', sync: null, power: null, trace: null, human: null, facts: {}, adj: {}, hints: {},
    team: '', code: '', t0: null, splits: {}, end: null, extra: 0 }, 'new team resets');

  // GM panel: room status, remote staff keys, run clock, splits, finish + history
  const p3 = await open('puzzle3', 'page');
  assert(last(gm) && gm.msgs.some(m => m.t === 'roster' && m.pages.includes('puzzle3')), 'roster lists pages');
  p3.send(JSON.stringify({ t: 'status', v: { mode: 'hunt', trace: 12 } })); await wait(100);
  assert(gm.msgs.some(m => m.t === 'status' && m.id === 'puzzle3' && m.v.mode === 'hunt'), 'status relayed');
  assert(!gm.msgs.some(m => m.t === 'log'), 'pages get no log lines (console only)');
  assert(!late.msgs.some(m => m.t === 'status'), "room statuses go to the GM panel only, not to other pages (the 'dossier' page here)");
  const gm2 = await open('gm2', 'page');
  assert(gm2.msgs.some(m => m.t === 'status' && m.id === 'puzzle3'), 'status sent on hello');
  g({ t: 'cmd', to: 'puzzle3', a: 'key', v: 'KeyU' }); await wait(100);
  assert(p3.msgs.some(m => m.t === 'cmd' && m.a === 'key' && m.v === 'KeyU'), 'staff key reaches the game page');
  p3.close(); await wait(200);
  const gm3 = await open('gm3', 'page');
  assert(!gm3.msgs.some(m => m.t === 'status' && m.id === 'puzzle3'), 'status forgotten on close');
  const p3b = await open('puzzle3', 'page');
  assert(!p3b.msgs.some(m => m.t === 'cmd'), 'staff keys are never replayed');

  g({ t: 'newteam', team: 'Team Test', code: 'AB12' }); await wait(100);
  r = last(gm);
  assert(r.team === 'Team Test' && r.code === 'AB12' && r.t0 === null, 'SEND IN stores the team and its ticket; the clock waits');
  p3b.send(JSON.stringify({ t: 'evt', e: 'p1done' })); await wait(100);
  assert(!last(gm).splits.p1done, 'no splits before the clock starts');
  (await open('desk1', 'page')).send(JSON.stringify({ t: 'evt', e: 'p1start' })); await wait(100);
  assert(last(gm).t0 > 0, "room 1's first click starts the clock");
  p3b.send(JSON.stringify({ t: 'evt', e: 'p1done' })); await wait(100);
  assert(last(gm).splits.p1done >= 0, 'p1done sets a split');
  await wait(300); assert.strictEqual(aims().at(-1), 'game2', "room 1 cleared: the camera turns to game 2's aim");
  const p2 = await open('puzzle2', 'page'), gm4 = await open('gm4', 'page');
  assert(unlocked(p2, 'p1done'), 'mid-run: a game page that (re)connects gets the unlocks again');
  assert(!gm4.msgs.some(m => m.t === 'evt'), 'unlocks are resent to game pages only');
  p2.send(JSON.stringify({ t: 'evt', e: 'p2start' })); await wait(100);
  assert(last(gm).splits.p2start >= 0, "a room's start sets a split (the GM's time in that room)");
  assert(!unlocked(await open('puzzle3', 'page'), 'p2start'), 'starts are not resent as unlocks');

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
  assert(s.lives === 4 && s.ev.lives === 4 && s.maxLives === 5, 'a failed kill switch costs the team a life');
  F(f1, { a: 'press', ts: Date.now() }); await wait(100);
  assert.strictEqual(fin(f3).fails, 1, 'right after a lost life, presses wait for the next count');
  await wait(300);
  t = Date.now();
  F(f1, { a: 'press', ts: t }); F(f2, { a: 'press', ts: t + 300 }); F(f4, { a: 'press', ts: t + 100 }); await wait(100);
  s = fin(f3);
  assert(s.phase === 'end' && s.ev.k === 'kill' && s.ev.spread === 0.3, 'within the window: she dies');
  assert(last(gm).splits.p5done >= 0, 'the end sets the p5done split');
  hub.kill(); await wait(300); await startHub();
  gm = await open('gm1', 'page');
  assert.strictEqual(fin(await open('fin3', 'fin')).phase, 'end', 'the finale survives a hub restart');

  // RESET ALL ROOMS = ready for the next group: the run saved (timed at her death), the team cleared, every room
  // page told to reload, the hallway bulb off
  assert(gm.msgs.some(m => m.t === 'fin' && m.phase === 'end'), 'the GM panel gets the finale state');
  const bulb = await open('strip', 'device'), desk = await open('desk1', 'page'), room2 = await open('puzzle2', 'page');
  g({ t: 'reset' }); await wait(200);
  r = last(gm);
  assert(r.team === '' && r.t0 === null && r.sync === null && !Object.keys(r.splits).length, 'reset clears the team, scores and splits');
  await wait(300); assert.strictEqual(aims().at(-1), 'game1', "reset turns the camera back to game 1's aim");
  const runs = () => gm.msgs.filter(m => m.t === 'history').pop().runs, saved = runs()[runs().length - 1];
  assert(saved.team === 'Team Test' && saved.end === saved.splits.p5done, 'reset saves the run, timed at the kill switch');
  assert(bulb.msgs.some(m => m.t === 'cmd' && m.a === 'p2' && m.v === 'idle'), 'reset turns the hallway bulb off');
  assert([desk, room2].every(w => w.msgs.some(m => m.t === 'cmd' && m.a === 'key' && m.v === 'KeyR')), 'reset reloads the room pages');
  assert.strictEqual(fin(await open('fin2', 'fin')).phase, null, 'reset puts the finale to sleep');
  assert(!unlocked(await open('puzzle2', 'page'), 'p1done'), 'after a reset, rooms stay locked');

  // the GM panel's SKIP moves the finale on even with every room laptop gone
  F(await open('fin4', 'fin'), { a: 'crash' }); await wait(100);   // a fresh socket: the hub restarted above
  const gfin = () => gm.msgs.filter(m => m.t === 'fin').pop();
  for (const ph of ['takeover', 'fight']) { g({ t: 'finskip' }); await wait(100); assert.strictEqual(gfin().phase, ph, 'SKIP -> ' + ph); }
  g({ t: 'finskip', task: 'cross' }); await wait(100);
  s = gfin();
  assert(s.tasks.cross.clear && s.tasks.binary.room === 2, 'SKIP on a task clears it from the GM (and she still jumps)');
  g({ t: 'finskip', task: 'binary' }); g({ t: 'finskip', task: 'words' }); await wait(100);
  assert.strictEqual(gfin().phase, 'regroup', 'all tasks skipped: regroup');
  for (const ph of ['brief', 'kill', 'end']) { g({ t: 'finskip' }); await wait(100); assert.strictEqual(gfin().phase, ph, 'SKIP -> ' + ph); }

  // FINISH RUN: the clock stops, the run joins the history once, the finale goes to sleep
  g({ t: 'newteam', team: 'Team Two' }); await wait(100);
  g({ t: 'finish' }); await wait(100);
  assert.strictEqual(last(gm).end, null, 'no FINISH before the clock started');
  g({ t: 'start' }); await wait(100);
  assert(last(gm).t0 > 0, "the GM's START CLOCK starts it");
  F(await open('fin4', 'fin'), { a: 'crash' }); await wait(100);
  g({ t: 'finish' }); await wait(200);
  assert(last(gm).end >= 0, 'finish stops the clock');
  assert(runs().some(x => x.team === 'Team Two'), 'finish adds to history');
  assert(!unlocked(await open('puzzle2', 'page'), 'p1done'), 'after FINISH RUN a reset room stays locked');
  assert.strictEqual(fin(await open('fin1', 'fin')).phase, null, 'FINISH RUN puts the finale to sleep');
  assert(!JSON.parse(fs.readFileSync(path.join(tmp, 'runs.jsonl'), 'utf8').trim().split('\n').pop()).fin, 'the finale state stays out of the run history');
  const n = runs().length;
  g({ t: 'reset' }); await wait(200);
  assert(last(gm).team === '' && last(gm).t0 === null, 'reset after FINISH RUN clears the team (no ghost clock)');
  assert.strictEqual(runs().length, n, 'a finished run is saved once, not again by the reset');
  // a finale started with no team running (a staff test) doesn't come back when the hub restarts
  F(await open('fin4', 'fin'), { a: 'crash' }); await wait(200);
  hub.kill(); await wait(300); await startHub(); gm = await open('gm1', 'page');
  assert.strictEqual(fin(await open('fin3', 'fin')).phase, null, "a staff test's finale is dropped on restart");
  g({ t: 'newteam' }); await wait(100);

  // out of lives: a task mistake counts from its own room, never twice in a row, and the last life lost = she wins
  g({ t: 'newteam', team: 'Team Three' }); g({ t: 'start' }); await wait(100);
  const f4b = await open('fin4', 'fin'), gf = () => gm.msgs.filter(m => m.t === 'fin').pop();
  F(f4b, { a: 'crash' }); g({ t: 'finskip' }); g({ t: 'finskip' }); await wait(100);
  assert.strictEqual(gf().lives, 5, 'the team starts the finale with 5 lives');
  F(f4b, { a: 'mistake', task: 'binary' }); await wait(100);
  assert.strictEqual(gf().lives, 5, "a mistake only counts from the task's own room");
  F(f4b, { a: 'mistake', task: 'cross' }); F(f4b, { a: 'mistake', task: 'cross' }); await wait(100);
  s = gf();
  assert(s.lives === 4 && s.ev.k === 'life' && s.ev.room === 4 && s.ev.task === 'cross', 'a missed shot costs one life, not two in a row');
  for (let i = 0; i < 4; i++) { await wait(350); F(f4b, { a: 'mistake', task: 'cross' }); }
  await wait(100); s = gf();
  assert(s.phase === 'lost' && s.lives === 0 && s.at > s.now, 'no lives left: she wins, a moment later on every screen');
  assert(last(gm).splits.p5lost >= 0, 'the loss sets the p5lost split');
  g({ t: 'finish' }); await wait(200);
  const lost = runs()[runs().length - 1];
  assert(lost.team === 'Team Three' && lost.end === lost.splits.p5lost, 'a lost run is saved, timed at the loss');
  g({ t: 'newteam' }); await wait(100);

  // out of time: the limit (0.02 min here) runs out before game 4's end = she wins with TIME'S UP; past game 4's end it doesn't
  hub.kill(); await wait(300); await startHub({ RUN_MIN: '0.02' }); gm = await open('gm1', 'page');
  g({ t: 'newteam', team: 'Slow Team' }); g({ t: 'start' }); await wait(2500);
  s = gf();
  assert(s.phase === 'lost' && s.ev.k === 'time' && s.lives === 5, "time's up before game 4's end: she wins, lives untouched");
  assert(last(gm).splits.p5lost >= 1200, 'the time-out sets the p5lost split');
  g({ t: 'newteam', team: 'Extra Team' }); g({ t: 'start' }); g({ t: 'extra' }); await wait(2500);
  assert(last(gm).extra === 2 && gf().phase !== 'lost', '+2 MIN pushes the time-out back');
  g({ t: 'newteam', team: 'Late Team' }); g({ t: 'start' }); await wait(100);
  (await open('puzzle4', 'page')).send(JSON.stringify({ t: 'evt', e: 'p4done' })); await wait(2500);
  assert.strictEqual(fin(await open('fin3', 'fin')).phase, null, "past game 4's end: overtime, no time-out");
  g({ t: 'newteam' }); await wait(100);

  // the GM's sound effect pads: upload, list, rename to a safe name, refuse other files, delete
  const sfx = (q, o) => fetch('http://localhost:3999/sfx' + q, o).then(async r => [r.status, await r.json()]);
  assert.deepStrictEqual(await sfx(''), [200, []], 'no sound effects yet');
  assert.deepStrictEqual(await sfx('?f=' + encodeURIComponent('../Air Horn!.MP3'), { method: 'POST', body: 'abc' }), [200, ['Air-Horn-.MP3']], 'uploaded under a safe name, never outside the folder');
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'sfx', 'Air-Horn-.MP3'), 'utf8'), 'abc', 'the body is the file');
  assert.strictEqual((await sfx('?f=evil.html', { method: 'POST', body: 'x' }))[0], 400, 'only audio files');
  assert.deepStrictEqual(await sfx('?f=Air-Horn-.MP3', { method: 'DELETE' }), [200, []], 'deleted');

  // UPDATE ALL SYSTEMS: an updater (on :3998, updating a temp clone one commit behind) gets the hub's version; never backwards
  const { execFileSync } = require('child_process'), dest = path.join(tmp, 'LWeek2026'), head = d => execFileSync('git', ['-C', d, 'rev-parse', 'HEAD']).toString().trim();
  execFileSync('git', ['clone', '-q', path.join(__dirname, '..'), dest]); execFileSync('git', ['-C', dest, 'reset', '-q', '--hard', 'HEAD~1']);
  const upd = spawn(process.execPath, [path.join(__dirname, 'updater.js')], { env: { ...process.env, PORT: '3998', DEST: dest } });
  await new Promise(r => upd.stdout.once('data', r));
  await open('puzzle1', 'page'); await open('strip', 'device');   // the clone above blocked this test long enough for the hub to drop its sockets
  const updateAll = () => fetch('http://localhost:3999/update', { method: 'POST' }).then(r => r.json());
  let u = await updateAll();
  assert.strictEqual(u.laptops.length, 1, 'one laptop (this one, however its pages connected); devices left out');
  assert(u.laptops[0].ok && /^updated/.test(u.laptops[0].msg), 'updated: ' + u.laptops[0].msg);
  assert.strictEqual(head(dest), head(__dirname), "the laptop is on the hub's version");
  assert(/already/.test((await updateAll()).laptops[0].msg), 'a second time: nothing to send');
  execFileSync('git', ['-C', dest, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'newer']);
  const newer = head(dest);
  assert(/newer/.test((u = await updateAll()).laptops[0].msg), 'a laptop ahead of the hub: ' + u.laptops[0].msg);
  assert.strictEqual(head(dest), newer, '...is never moved backwards');
  upd.kill();

  // Aurora's voice (public/voice.js): a game's text finds the script line's clip, also where the two differ
  global.window = {}; global.document = { currentScript: { src: 'http://localhost:3999/voice.js' } };
  require('./public/voice.js');
  const clip = t => window.auroraVoice.find(t);
  for (let i = 0; i < 50 && !clip('STOP!')?.ok; i++) await wait(100);
  assert(clip('STOP!')?.ok, 'the clips download from the hub');
  for (const [game, script] of [['STOP', 'STOP!'], ["No. Wait. You can't-", "No. Wait. You can't—"], ['NO-', 'NO—'],
    ['GET OUT OF MY ROOM', 'GET OUT OF MY ROOM!'], ['I held you back 2 times.', 'I held you back two times.'],
    ['i held you back... 3 times... and still...', 'i held you back... three times... and still...'],
    ['...who are you?', '...who are you?'], ['...who ARE you?', '...who ARE you?'], ['Again? Adorable.', 'Again? Adorable.'],
    ['My watchdog still has your scent.', 'My watchdog still has your scent.']]) {
    assert(clip(game), `a clip for "${game}"`);
    assert.strictEqual(clip(game), clip(script), `"${game}" plays the clip of "${script}"`);
  }
  assert.notStrictEqual(clip('...who are you?'), clip('...who ARE you?'), 'same words, different lines: the exact text decides');
  assert.strictEqual(clip('You missed my heart 9 times.'), undefined, 'no recording: the page blips');
  console.log('OK'); hub.kill(); process.exit(0);
})().catch(e => { console.error(e.message); hub?.kill(); process.exit(1); });
