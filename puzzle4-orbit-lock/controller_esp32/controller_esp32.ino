// NEXUS Puzzle 4: the Orbit Lock controller. ONE ESP32 on a breadboard, on the booth Wi-Fi (NexusV) at 192.168.0.52.
// Everything is on ONE side of the board (the VIN side), so nothing needs the 3V3 pin on the other side:
//   - two B100k knobs: middle pins on D34 (OUTER ring) and D35 (INNER ring); their + ends get 3.3 V from D32
//   - two loose fire wires, one from D13 and one from GND. Touch their metal ends together and hold = hold to fire
//   - a 1.3" OLED screen: VCC from D25, SDA on D26, SCK on D27. A spinning circle while waiting, FIRE when it shoots
//   - a red LED on D33 (through a 120 Ω resistor): on while the board is not on Wi-Fi, off once it's connected
//     (same as the mask and the beacon)
//   D32 and D25 are switched on as little 3.3 V supplies: the knobs draw almost nothing, the screen ~10-20 mA
// Every 20 ms it sends  ORBIT <outer knob mV> <inner knob mV> <wires touching 1/0>    e.g.  ORBIT 1650 2210 0
//   - over Wi-Fi: http://192.168.0.52:81/ is a never-ending stream of those lines (Server-Sent Events) that game.html reads
//   - over USB too, so a board plugged into the Puzzle 4 laptop still works if the Wi-Fi drops (Web Serial, Ctrl+Alt+P)
// The game says FIRE on every shot it really fires (http://192.168.0.52/fire, or the line FIRE over USB): the screen
// flashes FIRE. Power: any USB port or charger.
// Needs the U8g2 library (Arduino IDE: Tools > Manage Libraries > search "U8g2" > Install). Wi-Fi: secrets.h.
// Wiring and setup: ../SETUP.md. The mV at each knob's end stops goes into CFG.POT_MV in game.html.

#include <WiFi.h>
#include <WebServer.h>
#include <U8g2lib.h>
#include <driver/gpio.h>

// Networks in order of preference. If one can't be joined within TRY_MS, the board tries the next.
// Each ip must be free on that network, sit in its router's subnet, and match CFG.CTRL_IP in game.html.
struct Net { const char* ssid; const char* pass; IPAddress ip, gateway; };
#include "secrets.h"   // Net NETS[] = {...}: Wi-Fi names + passwords
const int NET_COUNT = sizeof(NETS) / sizeof(NETS[0]);
IPAddress SUBNET(255, 255, 255, 0);
const unsigned long TRY_MS = 10000;

const int OUTER_PIN = 34, INNER_PIN = 35;  // the knobs' middle pins. Input-only ADC1 pins (they work with Wi-Fi on)
const int KNOB_POWER = 32;      // both knobs' + pins
const int FIRE_PIN = 13;        // one fire wire. The other is GND: touching them pulls this pin LOW
const int SCREEN_POWER = 25, SCREEN_SDA = 26, SCREEN_SCK = 27;
const int RED_PIN = 33;         // -> 120R -> red LED -> GND: on = not on Wi-Fi

// the screen: our 1.3" OLED ("1.30' IIC V2.2" on the back) is an SH1106. If it's ever swapped for a 0.96" one
// (SSD1306) and shows nothing or garbage: put // in front of the SH1106 line and remove the // in front of the other
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, SCREEN_SCK, SCREEN_SDA);
// U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, SCREEN_SCK, SCREEN_SDA);

const int SAMPLES = 32;         // readings averaged for every value sent: more = steadier, a little slower
const float SMOOTH = 0.35;      // 0..1: how fast the value follows the knob. Lower = steadier ring, more lag
const int STEP_MV = 3;          // changes smaller than this are ignored, so a knob nobody touches doesn't make the ring shiver
const int HOLD_MS = 120;        // bare wire ends held by hand flicker: a break shorter than this still counts as touching
const int FIRE_SHOW_MS = 1200;  // how long the screen shows FIRE after a shot

WebServer server(80);           // /fire from the game
WiFiServer stream(81);          // the readings stream the game listens to
WiFiClient viewers[3];          // up to 3 pages listening at once (the game, plus a staff laptop checking)
unsigned long tryStart = 0;
bool wasOnline = false;
int net = 0;

struct Knob { int pin; float level; int sent; };
Knob knobs[2] = {{OUTER_PIN}, {INNER_PIN}};
unsigned long lastTouch = 0;
volatile bool touching = false;            // shared with the screen (other core)
volatile unsigned long fireUntil = 0;
String inbox;

int readMv(int pin) {           // calibrated millivolts, averaged
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) sum += analogReadMilliVolts(pin);
  return sum / SAMPLES;
}

void join(int i) {
  net = i; tryStart = millis();
  Serial.printf("trying %s as %s\n", NETS[i].ssid, NETS[i].ip.toString().c_str());
  WiFi.disconnect();
  WiFi.config(NETS[i].ip, NETS[i].gateway, SUBNET);
  WiFi.begin(NETS[i].ssid, NETS[i].pass);
}

// a page opens http://<ip>:81/: skip its request, answer with a Server-Sent Events header, then it gets every line
void acceptViewer() {
  WiFiClient c = stream.accept();
  if (!c) return;
  c.setTimeout(200);
  while (c.connected()) { String l = c.readStringUntil('\n'); if (l.length() <= 1) break; }
  c.print("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n"
          "Access-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\nretry: 1000\n\n");
  for (WiFiClient &v : viewers) if (!v.connected()) { v = c; return; }
  viewers[0].stop(); viewers[0] = c;           // all full: the oldest goes
}

// the screen runs on the ESP32's other core, so drawing it never slows down the knob readings
void screen(void *) {
  oled.begin();
  for (float a = 0;;) {
    oled.clearBuffer();
    if (millis() < fireUntil) {                     // FIRE, in a blinking double frame. No all-white flash: the screen
      oled.setFont(u8g2_font_logisoso32_tr);        // runs off a pin, so it keeps the lit pixels few
      oled.drawStr((128 - oled.getStrWidth("FIRE")) / 2, 48, "FIRE");
      if ((millis() / 100) % 2) { oled.drawFrame(0, 0, 128, 64); oled.drawFrame(3, 3, 122, 58); }
    } else {                                        // a spinning circle: a big dot leading, smaller ones trailing
      a = fmod(a + (touching ? 0.45 : 0.12), TWO_PI);   // spins faster while the wires touch (the laser is charging)
      for (int i = 0; i < 12; i++) {
        float t = a - i * TWO_PI / 12;
        oled.drawDisc(64 + cos(t) * 22, 32 + sin(t) * 22, i < 4 ? 4 - i : 1);
      }
    }
    oled.sendBuffer();
    vTaskDelay(pdMS_TO_TICKS(30));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RED_PIN, OUTPUT); digitalWrite(RED_PIN, HIGH);
  pinMode(KNOB_POWER, OUTPUT); digitalWrite(KNOB_POWER, HIGH);
  pinMode(SCREEN_POWER, OUTPUT); gpio_set_drive_capability((gpio_num_t)SCREEN_POWER, GPIO_DRIVE_CAP_3);   // full strength
  digitalWrite(SCREEN_POWER, HIGH);
  delay(150);                   // let the knobs' and the screen's power settle
  pinMode(FIRE_PIN, INPUT_PULLUP);
  for (Knob &k : knobs) k.sent = k.level = readMv(k.pin);
  xTaskCreatePinnedToCore(screen, "screen", 4096, nullptr, 1, nullptr, 0);

  WiFi.mode(WIFI_STA);
  join(0);
  server.on("/fire", [] {
    fireUntil = millis() + FIRE_SHOW_MS;
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", "ok");
  });
  server.on("/", [] {                               // a quick check from any browser on NexusV
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", "orbit controller. readings: http://" + WiFi.localIP().toString() + ":81/");
  });
  server.begin();
  stream.begin();
}

void loop() {
  server.handleClient();
  acceptViewer();

  bool online = WiFi.status() == WL_CONNECTED;
  if (online) tryStart = millis();                                  // stay on this network while it works
  else if (millis() - tryStart > TRY_MS) join((net + 1) % NET_COUNT);   // offline too long: try the next one
  if (online && !wasOnline) Serial.printf("controller ready on %s at http://%s:81/\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;
  digitalWrite(RED_PIN, !online);                   // red = not connected (same as the mask and the beacon)

  for (Knob &k : knobs) {
    k.level += (readMv(k.pin) - k.level) * SMOOTH;
    if (abs((int)k.level - k.sent) >= STEP_MV) k.sent = (int)k.level;
  }
  if (digitalRead(FIRE_PIN) == LOW) lastTouch = millis();
  touching = lastTouch && millis() - lastTouch < HOLD_MS;
  while (Serial.available()) {                      // over USB, the game says FIRE when it really fired
    char c = Serial.read();
    if (c == '\n') { if (inbox.startsWith("FIRE")) fireUntil = millis() + FIRE_SHOW_MS; inbox = ""; }
    else if (c != '\r' && inbox.length() < 32) inbox += c;
  }

  char line[40];
  snprintf(line, sizeof line, "ORBIT %d %d %d", knobs[0].sent, knobs[1].sent, touching ? 1 : 0);
  Serial.printf("%s\n", line);
  for (WiFiClient &v : viewers) if (v.connected()) v.printf("data: %s\n\n", line);
  delay(20);
}
