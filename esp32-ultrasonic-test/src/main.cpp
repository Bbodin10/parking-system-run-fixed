/* =============================================================================
 * Project: ESP32 Smart Parking Slot Controller (A-Left: Slots A1, A2, A3)
 * Architecture: Non-blocking Event-Driven FSM with Two-Way Supabase Sync
 * Features:
 *   - Round-Robin Ultrasonic Scanning (Anti-Crosstalk)
 *   - Schmitt-Trigger Hysteresis & Debounce Filtering
 *   - 2-Second Terminal Multi-Sensor Status Monitoring
 *   - 2-Way Batch HTTP Telemetry with Barrier Servo Actuation
 *   - Common-Cathode Dual-Color (Red/Green) Slot Indicators
 * =============================================================================
 */

#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

/* ------------------- NETWORK & BACKEND CONFIG ------------------- */
const char *WIFI_SSID = "B03_WIFI";
const char *WIFI_PASSWORD = "6121040067";

// ✅ ส่งข้อมูลมาที่ Backend (Railway) แทนการ POST ตรงไป Supabase
const char *BACKEND_URL = "https://enchanting-endurance-production.up.railway.app";

const char *CONTROLLER_DEVICE_ID = "A-Left";
const int NUM_SLOTS = 3;

/* ------------------- ALGORITHM CONSTRAINTS ------------------- */
const float HYSTERESIS_ENTER_CM = 9.0f;      // ต่ำกว่า 9.0 cm = สัญญาณมีรถจอด
const float HYSTERESIS_EXIT_CM = 10.0f;      // สูงกว่า 10.0 cm = สัญญาณช่องว่าง
const unsigned long DEBOUNCE_TIME_MS = 2000; // สถานะต้องนิ่งต่อเนื่อง 2 วินาที
const unsigned long TERMINAL_LOG_INTERVAL =
    2000;                                       // รายงานหน้า Terminal ทุก 2 วินาที
const unsigned long NETWORK_COOLDOWN_MS = 2000; // ป้องกันการส่งข้อมูลถี่เกินไป
const unsigned long PERIODIC_SYNC_MS = 15000;   // รอบส่งข้อมูลซ้ำเมื่อไม่มีการเคลื่อนไหว
const int SERVO_CLOSED_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;

/* ------------------- HARDWARE DATA STRUCTURES ------------------- */
struct SlotHardware {
  const char *slotId;
  int pinTrig;
  int pinEcho;
  int pinServo;
  int pinLedRed;
  int pinLedGreen;

  Servo servoInstance;

  // Realtime Measurements & Filtering
  float distanceCm;
  bool candidateOccupied;
  bool confirmedOccupied;
  unsigned long debounceTimer;

  // Actuator States
  bool isGateOpen;
};

SlotHardware slots[NUM_SLOTS] = {
    {"A1", 23, 34, 19, 26, 25, Servo(), -1.0f, false, false, 0, false},
    {"A2", 22, 35, 18, 33, 32, Servo(), -1.0f, false, false, 0, false},
    {"A3", 21, 27, 4, 14, 13, Servo(), -1.0f, false, false, 0, false}};

/* ------------------- SYSTEM TIMERS & FLAGS ------------------- */
unsigned long lastTerminalLogTime = 0;
unsigned long lastNetworkPostTime = 0;
bool statusChangedEvent = false;

/* ------------------- FUNCTION DECLARATIONS ------------------- */
void connectWiFi();
float measureUltrasonicSingle(int trigPin, int echoPin);
void scanSensorsSequential();
void updateSlotIndicators(int index);
void updateBarrierGate(int index, bool open);
void printTerminalDashboard();
bool transmitBatchTelemetry(const char *reason);

/* =============================================================================
 * SETUP INITIALIZATION
 * =============================================================================
 */
void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("==========================================================");
  Serial.println("[A-LEFT] ESP32 Parking Controller Initializing...");
  Serial.println("==========================================================");

  // เตรียมพินฮาร์ดแวร์สำหรับแต่ละช่องจอด
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(slots[i].pinTrig, OUTPUT);
    digitalWrite(slots[i].pinTrig, LOW);
    pinMode(slots[i].pinEcho, INPUT);

    pinMode(slots[i].pinLedRed, OUTPUT);
    pinMode(slots[i].pinLedGreen, OUTPUT);

    // เซ็ตสถานะไฟเริ่มต้นแบบ Active-LOW (เขียว = ว่าง)
    updateSlotIndicators(i);

    // ผูกพิน Servo และสั่งปิดไม้กั้นเริ่มต้นที่ 0 องศา
    slots[i].servoInstance.setPeriodHertz(50);
    slots[i].servoInstance.attach(slots[i].pinServo, 500, 2400);
    slots[i].servoInstance.write(SERVO_CLOSED_ANGLE);
    slots[i].isGateOpen = false;
  }

  connectWiFi();

  // สแกนรอบแรกและส่งข้อมูลซิงก์เริ่มต้น
  scanSensorsSequential();
  transmitBatchTelemetry("Initial Power-on Synchronization");
}

/* =============================================================================
 * MAIN LOOP (NON-BLOCKING COOPERATIVE SCHEDULING)
 * =============================================================================
 */
void loop() {
  unsigned long now = millis();

  // 1. สแกนเซนเซอร์แบบเรียงลำดับเพื่อป้องกันคลื่นกวนกัน
  scanSensorsSequential();

  // 2. ควบคุมการส่งข้อมูลขึ้น Supabase (Event-Driven ผสาน Throttling)
  bool cooldownSatisfied = (now - lastNetworkPostTime >= NETWORK_COOLDOWN_MS);
  bool periodicTimeout = (now - lastNetworkPostTime >= PERIODIC_SYNC_MS);

  if ((statusChangedEvent && cooldownSatisfied) || periodicTimeout) {
    const char *reason = statusChangedEvent ? "Slot Occupancy Event Triggered"
                                            : "Periodic Heartbeat Sync";
    if (transmitBatchTelemetry(reason)) {
      statusChangedEvent = false;
      lastNetworkPostTime = millis();
    }
  }

  // 3. รายงานข้อมูลผ่าน Serial Terminal ทุกๆ 2 วินาที
  if (now - lastTerminalLogTime >= TERMINAL_LOG_INTERVAL) {
    lastTerminalLogTime = now;
    printTerminalDashboard();
  }

  // 4. ตรวจสอบการเชื่อมต่อ WiFi อัตโนมัติ
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(
        "[WIFI] Warning: Connection lost! Attempting background reconnect...");
    WiFi.reconnect();
  }
}

/* =============================================================================
 * SENSOR SCANNING & HYSTERESIS LOGIC
 * =============================================================================
 */
float measureUltrasonicSingle(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // จำกัด Timeout ที่ 18000 us (ระยะสูงสุด ~3.0 เมตร)
  unsigned long duration = pulseIn(echoPin, HIGH, 18000);
  if (duration == 0)
    return -1.0f;
  return (float)(duration * 0.0343 / 2.0);
}

void scanSensorsSequential() {
  unsigned long now = millis();

  for (int i = 0; i < NUM_SLOTS; i++) {
    float rawDist = measureUltrasonicSingle(slots[i].pinTrig, slots[i].pinEcho);
    slots[i].distanceCm = rawDist;

    // ระบบ Schmitt-Trigger Hysteresis
    if (rawDist > 0.0f && rawDist < HYSTERESIS_ENTER_CM) {
      slots[i].candidateOccupied = true;
    } else if (rawDist > HYSTERESIS_EXIT_CM || rawDist < 0.0f) {
      slots[i].candidateOccupied = false;
    }

    // ระบบ Debounce 2 วินาทีสำหรับแต่ละช่องจอด
    if (slots[i].candidateOccupied != slots[i].confirmedOccupied) {
      if (slots[i].debounceTimer == 0) {
        slots[i].debounceTimer = now;
      } else if (now - slots[i].debounceTimer >= DEBOUNCE_TIME_MS) {
        slots[i].confirmedOccupied = slots[i].candidateOccupied;
        slots[i].debounceTimer = 0;
        statusChangedEvent = true; // ตั้งค่า Flag ส่งข้อมูลขึ้นคลาวด์
        updateSlotIndicators(i);   // ปรับเปลี่ยนสีไฟ LED ทันที
      }
    } else {
      slots[i].debounceTimer = 0;
    }

    // หน่วงเวลา 25 ms สลายคลื่นเสียงสะท้อนก่อนยิงช่องถัดไป (Anti-Crosstalk)
    delay(25);
  }
}

/* =============================================================================
 * ACTUATOR & INDICATOR CONTROLS (COMMON ANODE: ACTIVE-LOW)
 * =============================================================================
 */
void updateSlotIndicators(int index) {
  // สำหรับ Common Anode (ขากลางต่อ 3.3V):
  // LOW  = มีกระแสไหลผ่านหลอด (LED ติด)
  // HIGH = แรงดันสองฝั่งเท่ากันที่ 3.3V (LED ดับสนิท)
  if (slots[index].confirmedOccupied) {
    digitalWrite(slots[index].pinLedRed, LOW);    // แดงติด
    digitalWrite(slots[index].pinLedGreen, HIGH); // เขียวดับ
  } else {
    digitalWrite(slots[index].pinLedRed, HIGH);  // แดงดับ
    digitalWrite(slots[index].pinLedGreen, LOW); // เขียวติด
  }
}

void updateBarrierGate(int index, bool open) {
  if (slots[index].isGateOpen != open) {
    slots[index].isGateOpen = open;
    slots[index].servoInstance.write(open ? SERVO_OPEN_ANGLE
                                          : SERVO_CLOSED_ANGLE);
    Serial.printf("[ACTUATOR] Slot %s Barrier Gate -> %s (%d deg)\n",
                  slots[index].slotId, open ? "OPEN" : "CLOSED",
                  open ? SERVO_OPEN_ANGLE : SERVO_CLOSED_ANGLE);
  }
}

/* =============================================================================
 * SERIAL TERMINAL DASHBOARD
 * =============================================================================
 */
void printTerminalDashboard() {
  Serial.println("\n=========================== [A-LEFT DASHBOARD] "
                 "===========================");
  Serial.println("SLOT | DISTANCE (cm) | SENSOR RAW | CONFIRMED    | BARRIER "
                 "GATE | RGB LED");
  Serial.println("-------------------------------------------------------------"
                 "-------------");

  for (int i = 0; i < NUM_SLOTS; i++) {
    char distBuffer[10];
    if (slots[i].distanceCm < 0) {
      snprintf(distBuffer, sizeof(distBuffer), " OutRange");
    } else {
      snprintf(distBuffer, sizeof(distBuffer), "  %5.1f  ",
               slots[i].distanceCm);
    }

    Serial.printf(" %-3s |   %s   |  %-8s  | %-12s | %-12s | %-5s\n",
                  slots[i].slotId, distBuffer,
                  slots[i].candidateOccupied ? "OCCUPIED" : "VACANT  ",
                  slots[i].confirmedOccupied ? "UNAVAILABLE" : "AVAILABLE  ",
                  slots[i].isGateOpen ? "OPEN (90°)" : "CLOSED (0°)",
                  slots[i].confirmedOccupied ? "RED" : "GREEN");
  }

  Serial.println("-------------------------------------------------------------"
                 "-------------");
  Serial.printf("WiFi: %s (%d dBm) | Free Heap: %u bytes\n",
                (WiFi.status() == WL_CONNECTED) ? "ONLINE " : "OFFLINE",
                WiFi.RSSI(), ESP.getFreeHeap());
  Serial.println("============================================================="
                 "=============");
}

/* =============================================================================
 * NETWORK & TWO-WAY SUPABASE RPC TRANSMISSION
 * =============================================================================
 */
void connectWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
    delay(400);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Connected successfully! IP: %s\n",
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WIFI] Connection Failed. Proceeding in offline mode...");
  }
}

bool transmitBatchTelemetry(const char *reason) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[COMM] Transmission skipped: WiFi is disconnected.");
    return false;
  }

  // ✅ Railway ใช้ HTTPS → ใช้ WiFiClientSecure (ไม่ตรวจ cert ใน LAN)
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/iot/batch-telemetry";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // สร้าง Batch JSON Payload
  JsonDocument outDoc;
  outDoc["device_id"] = CONTROLLER_DEVICE_ID;
  JsonArray slotsArray = outDoc["slots"].to<JsonArray>();

  for (int i = 0; i < NUM_SLOTS; i++) {
    JsonObject slotObj = slotsArray.add<JsonObject>();
    slotObj["slot_id"] = slots[i].slotId;
    slotObj["distance_cm"] = slots[i].distanceCm;
    slotObj["occupied"] = slots[i].confirmedOccupied;
    slotObj["status"] =
        slots[i].confirmedOccupied ? "unavailable" : "available";
  }

  String requestPayload;
  serializeJson(outDoc, requestPayload);

  Serial.printf("\n[COMM] -> Backend (%s):\n", reason);
  Serial.println(requestPayload);

  int httpCode = http.POST(requestPayload);
  bool success = false;

  if (httpCode >= 200 && httpCode < 300) {
    String responsePayload = http.getString();
    Serial.printf("[COMM] HTTP %d OK. Backend Response:\n", httpCode);
    Serial.println(responsePayload);

    // ถอดรหัสคำสั่งเปิด-ปิดไม้กั้นจาก Response ของ Backend
    JsonDocument inDoc;
    DeserializationError err = deserializeJson(inDoc, responsePayload);
    if (!err && inDoc["barriers"].is<JsonArray>()) {
      JsonArray barriers = inDoc["barriers"].as<JsonArray>();
      for (JsonObject b : barriers) {
        const char *slotId = b["slot_id"];
        bool gateOpen = b["gate_open"] | false;
        if (slotId != nullptr) {
          for (int i = 0; i < NUM_SLOTS; i++) {
            if (strcmp(slots[i].slotId, slotId) == 0) {
              updateBarrierGate(i, gateOpen);
              break;
            }
          }
        }
      }
    }
    success = true;
  } else {
    Serial.printf("[COMM] HTTP POST Failed, Code: %d | Resp: %s\n", httpCode,
                  http.getString().c_str());
  }

  http.end();
  return success;
}