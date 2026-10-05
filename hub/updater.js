// NEXUS updater: booth.bat starts this on every laptop. The GM panel's UPDATE ALL LAPTOPS button makes the hub call
// POST :3001/update here, and this laptop copies the hub laptop's version of the game into Downloads\LWeek2026, like
// Update.bat does from GitHub. It comes over the booth Wi-Fi as a git bundle, so no internet is needed.
// Edits made on this laptop to the game files are lost (camera aim included), files git ignores are kept.
// ponytail: anyone on the booth Wi-Fi can call it, same trust as the hub itself (the NexusV password is in the public repo)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile, exec } = require('child_process'), { promisify } = require('util');
const DEST = process.env.DEST || path.join(os.homedir(), 'Downloads', 'LWeek2026');   // DEST, PORT: only the tests change them
const PORT = +process.env.PORT || 3001, BUNDLE = path.join(os.tmpdir(), `nexus-update-${PORT}.bundle`);
const git = (...a) => promisify(execFile)('git', a, { cwd: DEST, timeout: 120000 }).then(r => r.stdout.trim());
const yes = p => p.then(() => true, () => false);

async function update(hub) {
  // only the booth copy is ever touched: a developer's own folder elsewhere never is
  if (!fs.existsSync(path.join(DEST, '.git'))) return 'skipped: no Downloads\\LWeek2026 here (run Install.bat)';
  const was = await git('rev-parse', 'HEAD');
  const r = await fetch(`${hub}/update/bundle?have=${was}`, { signal: AbortSignal.timeout(240000) });
  if (r.status === 204) return 'already on the hub\'s version (or newer)';
  if (!r.ok) throw await r.text();
  fs.writeFileSync(BUNDLE, Buffer.from(await r.arrayBuffer()));
  await git('fetch', '-q', BUNDLE, 'HEAD');
  const now = await git('rev-parse', 'FETCH_HEAD');
  if (await yes(git('merge-base', '--is-ancestor', now, was))) return 'skipped: this laptop is newer than the hub';
  const files = (await git('diff', '--name-only', was, now)).split('\n').filter(Boolean);
  await git('reset', '-q', '--hard', now);
  let npm = '';
  if (files.some(f => /^hub\/package(-lock)?\.json$/.test(f)))   // new hub packages: needs internet, NexusV has none
    npm = await promisify(exec)('npm install --no-audit --no-fund', { cwd: path.join(DEST, 'hub'), timeout: 120000 })
      .then(() => '', () => ' (npm install failed: run Update.bat on it with internet)');
  return `updated ${was.slice(0, 7)} -> ${now.slice(0, 7)}, ${files.length} files changed${npm}`;
}

let busy = false;
http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/update') return res.writeHead(404).end();
  if (busy) return res.writeHead(409).end('already updating');
  let port = '';
  req.on('data', d => port += d).on('end', () => {
    busy = true;
    // the hub is whoever asked: its address from the connection, its port in the body
    update(`http://${req.socket.remoteAddress.replace(/^::ffff:/, '')}:${+port || 3000}`)
      .then(msg => [200, msg], e => [500, String(e.stderr?.trim().split('\n').pop() || e.message || e)])
      .then(([code, msg]) => { console.log(new Date().toLocaleTimeString(), msg); res.writeHead(code).end(msg); busy = false; });
  });
}).on('error', e => { if (e.code === 'EADDRINUSE') process.exit(0); throw e; })   // another start.bat on this laptop already runs one
  .listen(PORT, '0.0.0.0', () => console.log(`NEXUS updater on :${PORT} for ${DEST} (keep this window open)`));
