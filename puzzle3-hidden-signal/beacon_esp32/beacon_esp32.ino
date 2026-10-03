// NEXUS Puzzle 3 - the beacon: 3 IR LEDs in a row, invisible to eyes, visible through phone cameras. IP .51
// puzzle3-hidden-signal/game.html sends GET /code?v=351 every few seconds.
// Pattern (loops): LED 1 blinks digit 1 times, short pause, LED 2 blinks digit 2 times, LED 3 blinks digit 3 times, then a long pause.
// Keep the timing in sync with T in hub/public/beacon.html (the phone stand-in).
// Red LED: on while the beacon is not on Wi-Fi, off once it's connected (same as the mask).
// With no Wi-Fi it keeps blinking its last code (DEFAULT_CODE on boot).
#include <WiFi.h>
#include <WebServer.h>
#include "driver/gpio.h"

// Networks in order of preference (same as the mask). If one can't be joined within TRY_MS, it tries the next.
// The board uses the ip in secrets.h, also listed in game.html (CFG.BEACON_IPS).
struct Net { const char* ssid; const char* pass; IPAddress ip, gateway; };
#include "secrets.h"   // Net NETS[] = {...}: Wi-Fi names + passwords. Not in git: copy secrets.example.h to secrets.h
const int NET_COUNT = sizeof(NETS) / sizeof(NETS[0]);
IPAddress SUBNET(255, 255, 255, 0);
const unsigned long TRY_MS = 10000;

// IR LED 1..3: pin -> LED long leg. All 3 short legs join -> ONE shared resistor (120R, or 2 x 120R side by side = 60R) -> GND.
// Sharing one resistor only works because the pattern never lights two IR LEDs at once. Keep it that way.
const int LIGHTS = 3;                // digits in the code; must match LIGHTS in game.html
const int IR_PINS[LIGHTS] = { 32, 33, 25 };
const int RED_PIN   = 27;            // -> 120R -> red LED -> GND: on = not on Wi-Fi
const int BOARD_LED = 2;             // the DevKit's own blue LED: kept off so it doesn't give the beacon away
const char* DEFAULT_CODE = "314";

// Timing in ms. Hardware is never exact: slow these down if players miscount.
const int ON_MS = 250, OFF_MS = 350, LED_GAP_MS = 1000, LOOP_GAP_MS = 3000;

WebServer server(80);
unsigned long tryStart = 0;
bool wasOnline = false;
int net = 0;

// The pattern is a list of steps: which LED is lit (-1 = all dark) and for how long.
String code;
int8_t led[48]; int dur[48]; int n = 0, step = 0;
unsigned long stepAt = 0;
void add(int8_t l, int d) { if (n < 48) led[n] = l, dur[n] = d, n++; }
void setCode(const String& c) {
  if (c == code) return;             // same code resent: don't restart mid-pattern
  code = c; n = 0; step = 0; stepAt = millis();
  for (int i = 0; i < LIGHTS; i++) {
    int k = code[i] - '0';
    for (int b = 0; b < k; b++) { add(i, ON_MS); add(-1, b < k - 1 ? OFF_MS : LED_GAP_MS); }
  }
  dur[n - 1] = LOOP_GAP_MS;          // the pause after the last LED is the long one
  Serial.printf("code %s\n", code.c_str());
}

// Digits 1-5 only, exactly LIGHTS of them. Anything else is ignored.
bool valid(const String& c) {
  if (c.length() != LIGHTS) return false;
  for (char ch : c) if (ch < '1' || ch > '5') return false;
  return true;
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
  for (int p : IR_PINS) {
    pinMode(p, OUTPUT);
    gpio_set_drive_capability((gpio_num_t)p, GPIO_DRIVE_CAP_3);   // strongest pin drive (default is weaker): brighter IR. Only one LED is ever on at a time
  }
  pinMode(RED_PIN, OUTPUT);
  pinMode(BOARD_LED, OUTPUT);
  digitalWrite(BOARD_LED, LOW);
  setCode(DEFAULT_CODE);

  WiFi.mode(WIFI_STA);
  join(0);

  server.on("/code", [] {
    if (valid(server.arg("v"))) setCode(server.arg("v"));
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", code);
  });
  server.begin();
}

void loop() {
  server.handleClient();

  bool online = WiFi.status() == WL_CONNECTED;
  if (online) tryStart = millis();                                  // stay on this network while it works
  else if (millis() - tryStart > TRY_MS) join((net + 1) % NET_COUNT);   // offline too long: try the next one
  if (online && !wasOnline) Serial.printf("beacon ready on %s at http://%s/code?v=123\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;

  digitalWrite(RED_PIN, !online);    // red = not connected

  if (millis() - stepAt >= (unsigned long)dur[step]) { stepAt = millis(); step = (step + 1) % n; }
  for (int i = 0; i < LIGHTS; i++) digitalWrite(IR_PINS[i], led[step] == i);
}
