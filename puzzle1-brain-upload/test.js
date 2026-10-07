// node test.js: server.js serves the pages and passes a message from the laptop window to the wall, in order
process.env.PORT = 8999;
const assert = require('assert'), http = require('http'), server = require('./server.js');
const base = 'http://localhost:8999';
(async () => {
  assert.strictEqual((await fetch(base + '/desktop.html')).status, 200);
  assert.strictEqual((await fetch(base + '/..%2f..%2fhub%2fserver.js')).status, 403);
  const got = [];
  await new Promise(ok => http.get(base + '/link?id=wall', res => {   // the wall's event stream
    res.on('data', d => String(d).split('\n').filter(l => l.startsWith('data: ')).forEach(l => got.push(JSON.parse(l.slice(6)))));
    ok();
  }));
  for (const k of ['1', '0', '5', '1']) await fetch(base + '/link?to=wall', { method: 'POST', body: JSON.stringify({ a: 'kd', v: { key: k } }) });
  await fetch(base + '/link?to=desk', { method: 'POST', body: '{"a":"wall"}' });   // nobody listening as desk: dropped
  await new Promise(r => setTimeout(r, 200));
  assert.deepStrictEqual(got.map(m => m.v.key).join(''), '1051');
  console.log('OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
