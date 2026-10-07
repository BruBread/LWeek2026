// Puzzle 1's page server (start.bat runs it): serves this folder on port 8000, and links the laptop window
// (desktop.html) to the wall (projector.html) on the same laptop, with no hub needed:
//   GET  /link?id=wall      an event stream: every message posted to "wall" arrives here
//   POST /link?to=wall      body = one JSON message, passed on as is
// Mind Upload's start, every key typed on the laptop and the wall's progress go this way. The hub only feeds the GM.
// No dependencies. Nothing is cached, so an edited page always loads fresh.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 8000;   // only test.js changes it
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const subs = {};                          // id -> Set of open event streams

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/link' && req.method === 'GET') {
    const id = u.searchParams.get('id');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    res.write(': hi\n\n');
    (subs[id] ||= new Set()).add(res);
    req.on('close', () => subs[id].delete(res));
    return;
  }
  if (u.pathname === '/link' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      subs[u.searchParams.get('to')]?.forEach(s => s.write(`data: ${body.replace(/\n/g, ' ')}\n\n`));
      res.writeHead(204).end();
    });
    return;
  }
  const f = path.join(__dirname, decodeURIComponent(u.pathname === '/' ? '/desktop.html' : u.pathname));
  if (!f.startsWith(__dirname)) return res.writeHead(403).end();
  fs.readFile(f, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
setInterval(() => Object.values(subs).forEach(set => set.forEach(s => s.write(': ping\n\n'))), 15000);   // keeps idle streams open
server.listen(PORT, () => console.log(`puzzle 1 pages + laptop/wall link on http://localhost:${PORT}`));
module.exports = server;
