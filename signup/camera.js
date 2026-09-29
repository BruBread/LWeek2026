// NEXUS hallway camera: the Tapo C200 behind the players in game 2. Node only, no npm packages.
//   node camera.js url   go2rtc runs this every time the kiosk pop-up opens the stream (see go2rtc.yaml). It finds the
//                        camera on the booth network and prints its stream address, or nothing if the camera is off.
//   node camera.js       aims the camera (hub\camerasetup.bat): arrows move it, + / - change the step,
//                        S saves the aim, H goes back to the saved aim, Q quits.
// camera.json next to this file (git ignores it) holds the Camera Account from the Tapo app, and the saved aim:
//   {"user": "...", "pass": "..."}
const crypto = require('crypto'), fs = require('fs'), net = require('net'), path = require('path'), readline = require('readline');

const FILE = path.join(__dirname, 'camera.json'), NET = process.env.NET || '192.168.0';
const PAN = [-170, 170], TILT = [-32, 35];   // degrees, as the C200 reports them (ONVIF GetNodes)
let C;
try { C = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch { console.error(`${FILE} is missing or broken. See puzzle2-system-power/SETUP.md, "Hallway camera".`); process.exit(1); }

// The booth router can't reserve addresses, so the camera's IP can change. Knock on port 2020 (ONVIF, the camera's
// control port) at every address on the booth network at once: the camera is the one that answers. About 1 s.
// ponytail: the first ONVIF device on NexusV wins; match the camera's MAC in `arp -a` if a second camera ever joins
const find = () => Promise.any(Array.from({ length: 254 }, (_, i) => new Promise((ok, no) => {
  const ip = `${NET}.${i + 1}`, s = net.connect(2020, ip);
  s.setTimeout(1500, () => { s.destroy(); no(); });
  s.on('connect', () => { s.destroy(); ok(ip); }).on('error', no);
}))).catch(() => null);

function onvif(ip, body) {                   // one ONVIF call, signed with the Camera Account (WS-Security digest)
  const nonce = crypto.randomBytes(16), created = new Date().toISOString();
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created + C.pass)])).digest('base64');
  const wss = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-';
  return fetch(`http://${ip}:2020/onvif/service`, {
    method: 'POST', headers: { 'Content-Type': 'application/soap+xml' }, signal: AbortSignal.timeout(4000),
    body: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Header>` +
      `<Security s:mustUnderstand="1" xmlns="${wss}wssecurity-secext-1.0.xsd"><UsernameToken><Username>${C.user}</Username>` +
      `<Password Type="${wss}username-token-profile-1.0#PasswordDigest">${digest}</Password>` +
      `<Nonce EncodingType="${wss}soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce>` +
      `<Created xmlns="${wss}wssecurity-utility-1.0.xsd">${created}</Created></UsernameToken></Security>` +
      `</s:Header><s:Body>${body}</s:Body></s:Envelope>`,
  }).then(r => r.text()).then(x => { if (/Fault/.test(x)) throw new Error('camera said no: ' + (x.match(/<[\w-]+:Text[^>]*>([^<]*)/) || [, x.slice(0, 200)])[1]); return x; });
}
const PTZ = 'xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>profile_1</ProfileToken>';
const moveTo = (ip, x, y) => onvif(ip, `<AbsoluteMove ${PTZ}<Position><PanTilt x="${x}" y="${y}" xmlns="http://www.onvif.org/ver10/schema"/></Position></AbsoluteMove>`);

async function aim() {
  console.log('Looking for the camera on ' + NET + '.x ...');
  const ip = await find();
  if (!ip) { console.log('Camera not found. Is it plugged in, and is this laptop on NexusV?'); process.exit(1); }
  const st = await onvif(ip, `<GetStatus ${PTZ}</GetStatus>`);
  let x = +st.match(/PanTilt[^>]*\sx="([-\d.]+)"/)[1], y = +st.match(/PanTilt[^>]*\sy="([-\d.]+)"/)[1], step = 5;
  console.log(`Camera at ${ip}. The live view is in the browser.\n` +
    'ARROWS move   + / - step size   S save this aim   H back to the saved aim   Q quit\n');
  const draw = note => process.stdout.write(`\rPAN ${x}   TILT ${y}   STEP ${step}   ${note || ''}`.padEnd(70));
  let busy = false, again = false;
  async function send() {                    // the newest aim wins: holding an arrow never floods the camera
    if (busy) return again = true;
    busy = true;
    do { again = false; await moveTo(ip, x, y).catch(e => draw(e.message)); } while (again);
    busy = false;
  }
  readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
  process.stdin.on('keypress', (s, k = {}) => {
    const n = k.name, clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
    if (n === 'q' || n === 'escape' || (k.ctrl && n === 'c')) { console.log(); process.exit(0); }
    if (s === '+' || s === '=') step = Math.min(45, step === 1 ? 5 : step * 3);
    if (s === '-') step = Math.max(1, step === 5 ? 1 : Math.round(step / 3));
    if (n === 's') { C.aim = { x, y }; fs.writeFileSync(FILE, JSON.stringify(C, null, 2)); return draw('SAVED'); }
    if (n === 'h') { if (!C.aim) return draw('NOTHING SAVED YET'); ({ x, y } = C.aim); send(); return draw('BACK TO SAVED'); }
    if (/^(left|right|up|down)$/.test(n)) {
      x = clamp(x + ({ left: -step, right: step }[n] || 0), PAN);
      y = clamp(y + ({ up: step, down: -step }[n] || 0), TILT);
      send();
    }
    draw();
  });
  draw();
}

if (process.argv[2] === 'url') find().then(ip => process.stdout.write(ip ?   // exit now: go2rtc waits, and so would the unanswered knocks
  `rtsp://${encodeURIComponent(C.user)}:${encodeURIComponent(C.pass)}@${ip}:554/stream1#media=video` : '', () => process.exit()));
else aim().catch(e => { console.log('\n' + e.message); process.exit(1); });
