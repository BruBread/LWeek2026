// NEXUS Puzzle 1 - mask. The projector page calls GET /level?v=0..255 to light the eyes (on hover).
// Red LED: on while the mask is not on Wi-Fi, off once it's connected.
// Needs ESP32 Arduino core 3.x (ledcAttach). On core 2.x use ledcSetup(0,5000,8) + ledcAttachPin(EYES_PIN,0) + ledcWrite(0,v).
#include <WiFi.h>
#include <WebServer.h>

// Networks in order of preference. If one can't be joined within TRY_MS, the mask tries the next.
// Each ip must be free on that network, sit in its router's subnet, and be listed in CFG.MASK_IPS in projector.html.
struct Net { const char* ssid; const char* pass; IPAddress ip, gateway; };
#include "secrets.h"   // Net NETS[] = {...}: Wi-Fi names + passwords
const int NET_COUNT = sizeof(NETS) / sizeof(NETS[0]);
IPAddress SUBNET(255, 255, 255, 0);
const unsigned long TRY_MS = 10000;

const int EYES_PIN  = 25;            // -> 120R -> blue LED -> GND, once per eye (each eye has its own resistor)
const int RED_PIN   = 27;            // -> 120R -> red LED -> GND
const int BOARD_LED = 2;             // the DevKit's own blue LED: kept off so it doesn't give the mask away

WebServer server(80);
unsigned long tryStart = 0;
bool wasOnline = false;
int net = 0;

void join(int i) {
  net = i; tryStart = millis();
  Serial.printf("trying %s\n", NETS[i].ssid);
  WiFi.disconnect();
  WiFi.config(NETS[i].ip, NETS[i].gateway, SUBNET);
  WiFi.begin(NETS[i].ssid, NETS[i].pass);
}

void setup() {
  Serial.begin(115200);
  pinMode(RED_PIN, OUTPUT);
  pinMode(BOARD_LED, OUTPUT);
  digitalWrite(BOARD_LED, LOW);
  ledcAttach(EYES_PIN, 5000, 8);
  ledcWrite(EYES_PIN, 0);            // eyes off on boot

  WiFi.mode(WIFI_STA);
  join(0);

  server.on("/level", [] {
    int v = constrain(server.arg("v").toInt(), 0, 255);
    ledcWrite(EYES_PIN, v);
    Serial.printf("eyes %d\n", v);
    server.sendHeader("Connection", "close");   // one request per connection, so commands can't queue up behind each other
    server.send(200, "text/plain", "ok");
  });
  server.begin();
}

void loop() {
  server.handleClient();

  bool online = WiFi.status() == WL_CONNECTED;
  if (online) tryStart = millis();                                  // stay on this network while it works
  else if (millis() - tryStart > TRY_MS) join((net + 1) % NET_COUNT);   // offline too long: try the next one
  if (online && !wasOnline) Serial.printf("mask ready on %s at http://%s/level?v=255\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;

  digitalWrite(RED_PIN, !online);    // red = not connected
}
