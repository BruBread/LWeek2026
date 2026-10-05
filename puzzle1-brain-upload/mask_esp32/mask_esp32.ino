// NEXUS Puzzle 1 - mask. The projector page calls GET /level?v=0..255 to light the eyes (on hover).
// Red LED: on while the mask is not on Wi-Fi, off once it's connected. GET /red?v=1 makes it blink (the projector's
// stuck hint: the team hasn't clicked the mask a minute into the run), /red?v=0 stops it.
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
const unsigned long BLINK_MS = 250;  // red LED on/off time while the stuck hint blinks it

WebServer server(80);
unsigned long tryStart = 0;
bool wasOnline = false, stay = false;   // stay: it has been online on NETS[net], so a drop only re-joins that one
bool redBlink = false;
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
  server.on("/red", [] {
    redBlink = server.arg("v").toInt();
    Serial.printf("red blink %d\n", redBlink);
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
  else if (millis() - tryStart > TRY_MS) join(stay ? net : (net + 1) % NET_COUNT);
  if (online && !wasOnline) Serial.printf("mask ready on %s at http://%s/level?v=255\n", NETS[net].ssid, WiFi.localIP().toString().c_str());
  wasOnline = online;

  digitalWrite(RED_PIN, !online || (redBlink && millis() / BLINK_MS % 2));   // solid = not connected, blinking = stuck hint
}
