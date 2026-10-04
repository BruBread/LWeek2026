// NEXUS Puzzle 3 - the beacon: 3 blue LEDs in a row, hidden in the room. NexusV at 192.168.0.51,
// or walawifi at 192.168.1.51 when NexusV doesn't connect within 4 s (networks: secrets.h, same as game 4's controller).
// puzzle3-hidden-signal/game.html sends GET /code?v=352&on=100&off=120&gap=1000&loop=2500 every few seconds:
// the code AND the blink timing, one set per round (CFG.ROUNDS in game.html). Tune the speeds there, never here.
// Pattern (loops): LED 1 blinks digit 1 times, short pause, LED 2 blinks digit 2 times, LED 3 blinks digit 3 times, then a long pause.
// Round 3 blinks so fast the eye sees one flash per light: players need a phone's slow-motion video to count.
// Red LED: on while the beacon is not on Wi-Fi, off once it's connected (same as the mask).
// With no Wi-Fi it keeps blinking its last pattern (DEFAULT_CODE at the boot speed).
#include <WiFi.h>
#include <WebServer.h>
#include "driver/gpio.h"

// Networks in order of preference. The first (NexusV) gets FIRST_TRY_MS to connect, the others TRY_MS, then the next.
// The board uses the ip in secrets.h, also listed in game.html (CFG.BEACON_IPS).
struct Net { const char* ssid; const char* pass; IPAddress ip, gateway; };
#include "secrets.h"   // Net NETS[] = {...}: Wi-Fi names + passwords
const int NET_COUNT = sizeof(NETS) / sizeof(NETS[0]);
IPAddress SUBNET(255, 255, 255, 0);
const unsigned long FIRST_TRY_MS = 4000;   // no NexusV after 4 s: try walawifi
const unsigned long TRY_MS = 10000;        // a backup network gets longer: joining can take a few seconds

// Blue LED 1..3: pin -> LED long leg. All 3 short legs join -> ONE shared resistor (120R, or 2 x 120R side by side = 60R) -> GND.
// Sharing one resistor only works because the pattern never lights two LEDs at once. Keep it that way.
const int LIGHTS = 3;                // digits in the code; must match LIGHTS in game.html
const int LED_PINS[LIGHTS] = { 32, 33, 25 };
const int RED_PIN   = 27;            // -> 120R -> red LED -> GND: on = not on Wi-Fi
const int BOARD_LED = 2;             // the DevKit's own blue LED: kept off so it doesn't give the beacon away
const char* DEFAULT_CODE = "324";

// Blink timing in ms. These are only the boot values (round 1's speed): the game sends its own with every code.
int onMs = 300, offMs = 400, gapMs = 1200, loopMs = 3000;

WebServer server(80);
unsigned long tryStart = 0;
bool wasOnline = false;
int net = 0;

// The pattern is a list of steps: which LED is lit (-1 = all dark) and for how long.
String code;
int8_t led[48]; int dur[48]; int n = 0, step = 0;
unsigned long stepAt = 0;
void add(int8_t l, int d) { if (n < 48) led[n] = l, dur[n] = d, n++; }
void setPattern(const String& c, int on, int off, int gap, int lp) {
  if (c == code && on == onMs && off == offMs && gap == gapMs && lp == loopMs) return;   // resent every 3 s: don't restart mid-pattern
  code = c; onMs = on; offMs = off; gapMs = gap; loopMs = lp; n = 0;
  for (int i = 0; i < LIGHTS; i++) {
    int k = code[i] - '0';
    for (int b = 0; b < k; b++) { add(i, onMs); add(-1, b < k - 1 ? offMs : gapMs); }
  }
  dur[n - 1] = loopMs;               // the pause after the last LED is the long one
  step = n - 1; stepAt = millis();   // a new pattern starts with that long dark pause, so players see the round change
  Serial.printf("code %s  on %d off %d gap %d loop %d\n", code.c_str(), onMs, offMs, gapMs, loopMs);
}

// Digits 1-5 only, exactly LIGHTS of them. Anything else is ignored.
bool valid(const String& c) {
  if (c.length() != LIGHTS) return false;
  for (char ch : c) if (ch < '1' || ch > '5') return false;
  return true;
}
// A timing from the URL: missing = keep the current one, out of range = clamped, so a typo can't freeze the board
int ms(const char* key, int cur, int lo, int hi) {
  if (!server.hasArg(key)) return cur;
  int v = server.arg(key).toInt();
  return v < lo ? lo : v > hi ? hi : v;
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
    pinMode(p, OUTPUT);
    gpio_set_drive_capability((gpio_num_t)p, GPIO_DRIVE_CAP_3);   // strongest pin drive (default is weaker): brighter LEDs. Only one LED is ever on at a time
  }
  pinMode(RED_PIN, OUTPUT);
  pinMode(BOARD_LED, OUTPUT);
  digitalWrite(BOARD_LED, LOW);
  setPattern(DEFAULT_CODE, onMs, offMs, gapMs, loopMs);

  WiFi.mode(WIFI_STA);
  join(0);

  server.on("/code", [] {
    if (valid(server.arg("v")))
      setPattern(server.arg("v"), ms("on", onMs, 10, 2000), ms("off", offMs, 10, 2000), ms("gap", gapMs, 100, 5000), ms("loop", loopMs, 300, 10000));
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", code);
  });
  server.begin();
}

void loop() {
  server.handleClient();

  bool online = WiFi.status() == WL_CONNECTED;
  if (online) tryStart = millis();                                  // stay on this network while it works
  else if (millis() - tryStart > (net ? TRY_MS : FIRST_TRY_MS)) join((net + 1) % NET_COUNT);   // offline too long: try the next one
  if (online && !wasOnline) Serial.printf("beacon ready on %s at http://%s/code?v=234\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;

  digitalWrite(RED_PIN, !online);    // red = not connected

  if (millis() - stepAt >= (unsigned long)dur[step]) { stepAt = millis(); step = (step + 1) % n; }
  for (int i = 0; i < LIGHTS; i++) digitalWrite(LED_PINS[i], led[step] == i);
}
