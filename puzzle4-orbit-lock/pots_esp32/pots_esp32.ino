// NEXUS Puzzle 4: one ring controller. Two of these, each an ESP32 with one potentiometer and its own USB cable to
// the Puzzle 4 laptop. One line every 20 ms:  OUTER 1650   (or  INNER 1650  on the other controller): the knob in mV.
// No Wi-Fi and no IP: the laptop powers the board and reads it through USB (Web Serial in Edge/Chrome).
// Wiring and setup: ../SETUP.md. The mV at each end stop goes into CFG.POT_MV in game.html.

const bool INNER_RING = false;  // false = the OUTER ring controller, true = the INNER ring controller
const int PIN = 34;             // the knob's middle pin on D34. Input-only ADC1 pin: nothing else to set up
const int SAMPLES = 32;         // readings averaged for every value sent: more = steadier, a little slower
const float SMOOTH = 0.35;      // 0..1: how fast the value follows the knob. Lower = steadier ring, more lag
const int STEP_MV = 3;          // changes smaller than this are ignored, so a knob nobody touches doesn't make the ring shiver

float level;
int sent;

int readMv() {                  // calibrated millivolts, averaged
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) sum += analogReadMilliVolts(PIN);
  return sum / SAMPLES;
}

void setup() {
  Serial.begin(115200);
  sent = level = readMv();
}

void loop() {
  level += (readMv() - level) * SMOOTH;
  if (abs((int)level - sent) >= STEP_MV) sent = (int)level;
  Serial.printf("%s %d\n", INNER_RING ? "INNER" : "OUTER", sent);
  delay(20);
}
