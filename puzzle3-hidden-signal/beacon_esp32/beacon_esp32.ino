// NEXUS Puzzle 3 - the beacon: 3 blue LEDs in a row, hidden in the room. NexusV at 192.168.0.51
// (network: secrets.h, same as game 4's controller).
// A dumb player: puzzle3-hidden-signal/game.html decides everything the lights do and sends it as a list of steps.
//   GET /play?p=900:300,000:400,...   the loop (the code), resent every 3 s. A new one starts from its first step
//   GET /fx?p=...                     a one-shot effect (wrong code, layer cracked, her heartbeat...), then the loop restarts
// A step = one level per light (0 = off .. 9 = full) and how long it lasts in ms. When a step lights two or three LEDs,
// they take turns 1 ms each (too fast to see), so the shared resistor only ever carries one LED.
// Red LED: on while the beacon is not on Wi-Fi, off once it's connected (same as the mask).
// With no Wi-Fi it keeps playing its last loop. At power-on the lights sweep 1-2-3 twice (a wiring check), then stay dark.
#include <WiFi.h>
#include <WebServer.h>
#include "driver/gpio.h"

// Networks in order of preference. The first (NexusV) gets FIRST_TRY_MS to connect, the others TRY_MS, then the next.
// The board uses the ip in secrets.h, also listed in game.html (CFG.BEACON_IPS).
struct Net { const char* ssid; const char* pass; IPAddress ip, gateway; };
#include "secrets.h"   // Net NETS[] = {...}: Wi-Fi names + passwords
const int NET_COUNT = sizeof(NETS) / sizeof(NETS[0]);
IPAddress SUBNET(255, 255, 255, 0);
const unsigned long FIRST_TRY_MS = 4000;   // no NexusV after 4 s: try again
const unsigned long TRY_MS = 10000;        // a backup network gets longer: joining can take a few seconds

// Blue LED 1..3: pin -> LED long leg. All 3 short legs join -> ONE shared resistor (120R, or 2 x 120R side by side = 60R) -> GND.
// Sharing one resistor only works because only one LED is ever lit at a time (see show()). Keep it that way.
const int LIGHTS = 3;                // must match LIGHTS in game.html
const int LED_PINS[LIGHTS] = { 32, 33, 25 };
const int RED_PIN   = 27;            // -> 120R -> red LED -> GND: on = not on Wi-Fi
const int BOARD_LED = 2;             // the DevKit's own blue LED: kept off so it doesn't give the beacon away
// level 0-9 -> PWM duty (8 bit), curved so fades look even to the eye. 256 = fully on: no PWM at all, so a full blink
// films cleanly in slow motion
const int DUTY[10] = { 0, 3, 13, 28, 50, 79, 113, 154, 201, 256 };
const char* BOOT = "900:150,090:150,009:150,900:150,090:150,009:150";

WebServer server(80);
unsigned long tryStart = 0;
bool wasOnline = false, stay = false;   // stay: it has been online on NETS[net], so a drop only re-joins that one
int net = 0;

const int MAX_STEPS = 160;           // the longest list game.html sends is about 70 steps
struct List { uint8_t lv[MAX_STEPS][LIGHTS]; uint16_t ms[MAX_STEPS]; int n; };
List loopL, fxL;
String loopSrc;
bool inFx = false;
int step = 0;
unsigned long stepAt = 0;

// "900:300,000:400" -> steps. A malformed step is skipped; ms are clamped to 1-10000
int parse(const String& s, List& L) {
  L.n = 0;
  for (int i = 0; i < (int)s.length() && L.n < MAX_STEPS; ) {
    int c = s.indexOf(',', i); if (c < 0) c = s.length();
    String t = s.substring(i, c); i = c + 1;
    if (t.indexOf(':') != LIGHTS) continue;
    bool ok = true;
    for (int j = 0; j < LIGHTS; j++) { char ch = t[j]; if (ch < '0' || ch > '9') ok = false; else L.lv[L.n][j] = ch - '0'; }
    long ms = t.substring(LIGHTS + 1).toInt();
    if (!ok || ms < 1) continue;
    L.ms[L.n++] = ms > 10000 ? 10000 : ms;
  }
  return L.n;
}
// the code a loop spells: how many times each light switches on. Printed to Serial, to check against the game's code
String spell(const List& L) {
  String s;
  for (int j = 0; j < LIGHTS; j++) {
    int n = 0;
    for (int i = 0; i < L.n; i++) n += L.lv[i][j] && (i == 0 || !L.lv[i - 1][j]);
    s += n;
  }
  return s;
}
List& cur() { return inFx ? fxL : loopL; }
void restart(bool fx) { inFx = fx; step = 0; stepAt = millis(); }

void show() {
  static int last[LIGHTS] = { -1, -1, -1 };
  const List& L = cur();
  uint8_t lv[LIGHTS] = { 0 };
  if (L.n) memcpy(lv, L.lv[step], LIGHTS);
  int lit = 0;
  for (int i = 0; i < LIGHTS; i++) lit += lv[i] > 0;
  if (lit > 1) {                     // several lit: keep one, a different one every millisecond
    int keep = (micros() / 1000) % lit;
    for (int i = 0; i < LIGHTS; i++) if (lv[i] && keep-- != 0) lv[i] = 0;
  }
  for (int i = 0; i < LIGHTS; i++) if (lv[i] != last[i]) { ledcWrite(LED_PINS[i], DUTY[lv[i]]); last[i] = lv[i]; }
}

void join(int i) {
  net = i; tryStart = millis();
  Serial.printf("trying %s as %s\n", NETS[i].ssid, NETS[i].ip.toString().c_str());
  WiFi.disconnect();
  WiFi.config(NETS[i].ip, NETS[i].gateway, SUBNET);
  WiFi.begin(NETS[i].ssid, NETS[i].pass);
}

void setup() {
  Serial.begin(115200);
  for (int p : LED_PINS) {
    ledcAttach(p, 20000, 8);
    ledcWrite(p, 0);
    gpio_set_drive_capability((gpio_num_t)p, GPIO_DRIVE_CAP_3);   // strongest pin drive (default is weaker): brighter LEDs. Only one LED is ever on at a time
  }
  pinMode(RED_PIN, OUTPUT);
  pinMode(BOARD_LED, OUTPUT);
  digitalWrite(BOARD_LED, LOW);
  loopL.n = 0;
  parse(BOOT, fxL); restart(true);   // the wiring check, then dark until the game sends a loop

  WiFi.mode(WIFI_STA);
  join(0);

  server.on("/play", [] {
    String p = server.arg("p");
    if (p != loopSrc) {              // resent every 3 s: the same loop again doesn't restart it
      loopSrc = p; parse(p, loopL);
      if (!inFx) restart(false);     // during an effect, the new loop waits for it to end
      Serial.printf("playing %s (%d steps)\n", spell(loopL).c_str(), loopL.n);
    }
    server.sendHeader("Access-Control-Allow-Origin", "*");   // lets the game read this "ok": that's how it tells this sketch from an old one
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", "ok");
  });
  server.on("/fx", [] {
    if (parse(server.arg("p"), fxL)) restart(true);
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", "ok");
  });
  server.begin();
}

void loop() {
  server.handleClient();

  bool online = WiFi.status() == WL_CONNECTED;
  if (online) { tryStart = millis(); stay = true; }                 // stay on this network while it works
  // offline too long: before it's ever been online, try the next network. After that a drop only re-joins the same one:
  // hopping to the backup mid-day turned a 1 s Wi-Fi blip into 14 s+ off NexusV
  else if (millis() - tryStart > (stay || net ? TRY_MS : FIRST_TRY_MS)) join(stay ? net : (net + 1) % NET_COUNT);
  if (online && !wasOnline) Serial.printf("beacon ready on %s at http://%s/play\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;

  digitalWrite(RED_PIN, !online);    // red = not connected

  List& L = cur();
  if (L.n && millis() - stepAt >= L.ms[step]) {
    stepAt += L.ms[step];
    if (millis() - stepAt > 200) stepAt = millis();   // fell behind (a slow request): carry on from now, don't race to catch up
    if (++step >= L.n) { if (inFx) restart(false); else step = 0; }   // an effect ends: the loop starts over
  }
  show();
}
