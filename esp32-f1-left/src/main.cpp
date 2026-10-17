/* =============================================================================
 * Project: ESP32 Central Smart Parking Master Gateway (Floor 1 Left)
 * Board Role: Central Master Gateway for Entire Parking System (A1-A6 & B1-B6)
 *   - Core 1: SensorTask - Local Ultrasonic (A1-A3), Hysteresis, Debounce, LEDs & Servos
 *   - Core 0: NetworkTask - HTTPS 12-Slot Batch Telemetry to Railway Backend,
 *             ESP-NOW Receiver & Auto-Router for all 3 Slaves (F1-Right, F2-Left, F2-Right)
 * =============================================================================
 */

#include "shared_types.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_now.h>
#include <esp_wifi.h>

/* ============================ CONFIGURATION ============================ */
const char *WIFI_SSID = "B03_WIFI";
const char *WIFI_PASSWORD = "6121040067";

// Backend บน Railway
const char *BACKEND_URL =
    "https://enchanting-endurance-production.up.railway.app";

// ⚠️ MAC Address ของบอร์ด Slaves ทั้ง 3 ตัว
// (ระบบมี Auto-Learning MAC อัตโนมัติทันทีที่บอร์ดเปิดเครื่องและส่งข้อมูลเข้ามา)
uint8_t peerF1Right[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; // A4, A5, A6
uint8_t peerF2Left[6]  = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; // B1, B2, B3
uint8_t peerF2Right[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; // B4, B5, B6

bool peerF1RightKnown = false;
bool peerF2LeftKnown  = false;
bool peerF2RightKnown = false;

/* ======================== HARDWARE (FLOOR 1 LEFT) ======================= */
SlotHardware slots[NUM_SLOTS] = {
    {"A1", 23, 34, 19, 26, 25, Servo(), -1.0f, false, false, 0, false},
    {"A2", 22, 35, 18, 33, 32, Servo(), -1.0f, false, false, 0, false},
    {"A3", 21, 27, 4, 14, 13, Servo(), -1.0f, false, false, 0, false}};

/* ------------------- INTER-TASK SHARED DATA --------------------- */
SharedSlotData sharedLocalSlots[NUM_SLOTS];     // SensorTask เขียน, NetworkTask อ่าน
SemaphoreHandle_t xDataMutex = NULL;            // Mutex ป้องกัน Race Condition
volatile bool statusChangedEvent = false;       // Trigger จาก Sensor debouncing
volatile bool networkStatusChanged = false;     // Trigger ส่งไปยัง NetworkTask

// Auto-Close Timer สำหรับแต่ละช่องจอด (ปิดหลังรถออกจากช่อง 3 วินาที)
unsigned long autoCloseTimer[NUM_SLOTS] = {0, 0, 0};

/* ------------------- REMOTE SLOT DATA (A4-A6, B1-B6 from ESP-NOW) ------ */
volatile RemoteSlotData remoteSlots[NUM_REMOTE_SLOTS] = {
    {"A4", -1.0f, false},
    {"A5", -1.0f, false},
    {"A6", -1.0f, false},
    {"B1", -1.0f, false},
    {"B2", -1.0f, false},
    {"B3", -1.0f, false},
    {"B4", -1.0f, false},
    {"B5", -1.0f, false},
    {"B6", -1.0f, false}};
volatile unsigned long lastRemoteSlotUpdate[NUM_REMOTE_SLOTS] = {0};

/* ------------------- FUNCTION DECLARATIONS ---------------------- */
void connectWiFi();
float measureUltrasonicSingle(int trigPin, int echoPin);
void scanSensorsSequential();
void updateSlotIndicators(int index);
void updateBarrierGate(int index, bool open);
void printTerminalDashboard();
bool transmitBatchTelemetry(const char *reason);
void sensorTaskFunc(void *pvParameters);
void networkTaskFunc(void *pvParameters);

/* ------------------- ESP-NOW CALLBACKS -------------------------- */

void registerPeerIfNeeded(const uint8_t *mac) {
  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) == ESP_OK) {
      Serial.printf("[ESP-NOW] Auto-registered new Slave peer: %02X:%02X:%02X:%02X:%02X:%02X\n",
                    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    }
  }
}

// --- Receive Callback: รับ Telemetry จาก Slaves ทั้งหมด (A4-A6, B1-B3, B4-B6) ---
void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len == sizeof(TelemetryPayload)) {
    TelemetryPayload payload;
    memcpy(&payload, data, sizeof(payload));

    registerPeerIfNeeded(mac);

    bool stateChanged = false;
    for (int i = 0; i < payload.numSlots; i++) {
      const char *incomingId = payload.slots[i].slotId;

      // Auto-learn peer role from slot prefix
      if (strncmp(incomingId, "A4", 2) == 0 || strncmp(incomingId, "A5", 2) == 0 || strncmp(incomingId, "A6", 2) == 0) {
        memcpy(peerF1Right, mac, 6);
        peerF1RightKnown = true;
      } else if (strncmp(incomingId, "B1", 2) == 0 || strncmp(incomingId, "B2", 2) == 0 || strncmp(incomingId, "B3", 2) == 0) {
        memcpy(peerF2Left, mac, 6);
        peerF2LeftKnown = true;
      } else if (strncmp(incomingId, "B4", 2) == 0 || strncmp(incomingId, "B5", 2) == 0 || strncmp(incomingId, "B6", 2) == 0) {
        memcpy(peerF2Right, mac, 6);
        peerF2RightKnown = true;
      }

      // Match and update remote slot
      for (int r = 0; r < NUM_REMOTE_SLOTS; r++) {
        if (strcmp((const char *)remoteSlots[r].slotId, incomingId) == 0) {
          if (remoteSlots[r].occupied != payload.slots[i].occupied) {
            stateChanged = true;
          }
          remoteSlots[r].distanceCm = payload.slots[i].distanceCm;
          remoteSlots[r].occupied = payload.slots[i].occupied;
          lastRemoteSlotUpdate[r] = millis();
          break;
        }
      }
    }

    if (stateChanged) {
      networkStatusChanged = true;
    }
  }
}

// --- Send Callback: ตรวจสถานะการส่งคำสั่งไม้กั้นไปยัง Slaves ---
void onEspNowSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  // Silent callback
}

/* =============================================================================
 * SETUP INITIALIZATION
 * ============================================================================= */
void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("==========================================================");
  Serial.println("[CENTRAL MASTER GATEWAY] ESP32 Parking Controller Initializing...");
  Serial.println("==========================================================");

  // เตรียมพินฮาร์ดแวร์สำหรับช่องจอด A1-A3
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(slots[i].pinTrig, OUTPUT);
    digitalWrite(slots[i].pinTrig, LOW);
    pinMode(slots[i].pinEcho, INPUT);

    pinMode(slots[i].pinLedRed, OUTPUT);
    pinMode(slots[i].pinLedGreen, OUTPUT);

    updateSlotIndicators(i);

    slots[i].servoInstance.setPeriodHertz(50);
    slots[i].servoInstance.attach(slots[i].pinServo, 500, 2400);
  }

  // ─── ไม้กั้นทดสอบเปิด-ปิดตัวเอง 1 ครั้งทุกช่องเมื่อเริ่มทำงาน (Boot Self-Test) ───
  Serial.println();
  Serial.println("[ACTUATOR] Running Boot Self-Test: Sweeping barrier gates (OPEN -> CLOSE)...");
  for (int i = 0; i < NUM_SLOTS; i++) {
    Serial.printf("[ACTUATOR] Self-testing slot %s barrier gate...\n", slots[i].slotId);

    // 1. หมุนเปิด (OPEN: SERVO_OPEN_ANGLE)
    slots[i].servoInstance.write(SERVO_OPEN_ANGLE);
    slots[i].isGateOpen = true;
    delay(700);

    // 2. หมุนปิด (CLOSED: SERVO_CLOSED_ANGLE)
    slots[i].servoInstance.write(SERVO_CLOSED_ANGLE);
    slots[i].isGateOpen = false;
    delay(700);
  }
  Serial.println("[ACTUATOR] Boot Self-Test Completed. All gates locked in CLOSED state.");
  Serial.println("[ACTUATOR] Ready to receive OPEN commands from Web / Backend.\n");

  xDataMutex = xSemaphoreCreateMutex();

  connectWiFi();

  scanSensorsSequential();

  // สร้าง FreeRTOS Tasks แยก Core
  xTaskCreatePinnedToCore(sensorTaskFunc,  "SensorTask",  4096, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(networkTaskFunc, "NetworkTask", 8192, NULL, 1, NULL, 0);

  transmitBatchTelemetry("Initial Power-on Synchronization");
}

/* =============================================================================
 * MAIN LOOP
 * ============================================================================= */
void loop() {
  vTaskDelay(portMAX_DELAY);
}

/* =============================================================================
 * SENSOR TASK (Core 1)
 * ============================================================================= */
void sensorTaskFunc(void *pvParameters) {
  TickType_t lastTerminalLog = xTaskGetTickCount();

  for (;;) {
    scanSensorsSequential();

    if (xSemaphoreTake(xDataMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      for (int i = 0; i < NUM_SLOTS; i++) {
        sharedLocalSlots[i].distanceCm = slots[i].distanceCm;
        sharedLocalSlots[i].confirmedOccupied = slots[i].confirmedOccupied;
      }
      if (statusChangedEvent) {
        networkStatusChanged = true;
        statusChangedEvent = false;
      }
      xSemaphoreGive(xDataMutex);
    }

    if (xTaskGetTickCount() - lastTerminalLog >= pdMS_TO_TICKS(TERMINAL_LOG_INTERVAL)) {
      lastTerminalLog = xTaskGetTickCount();
      printTerminalDashboard();
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

/* =============================================================================
 * NETWORK TASK (Core 0)
 * ============================================================================= */
void networkTaskFunc(void *pvParameters) {
  unsigned long lastPostTime = 0;
  unsigned long lastReconnect = 0;

  for (;;) {
    unsigned long now = millis();

    bool cooldownOk = (now - lastPostTime >= NETWORK_COOLDOWN_MS);
    bool periodicOk = (now - lastPostTime >= PERIODIC_SYNC_MS);

    if ((networkStatusChanged && cooldownOk) || periodicOk) {
      const char *reason = networkStatusChanged
                               ? "Slot Occupancy Event Triggered"
                               : "Periodic Heartbeat Sync";
      lastPostTime = millis();
      if (transmitBatchTelemetry(reason)) {
        networkStatusChanged = false;
      }
    }

    if (WiFi.status() != WL_CONNECTED &&
        (now - lastReconnect >= WIFI_RECONNECT_INTERVAL_MS)) {
      lastReconnect = now;
      Serial.println("[WIFI] Warning: Connection lost! Attempting background reconnect...");
      WiFi.reconnect();
    }

    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

/* =============================================================================
 * SENSOR SCANNING & HYSTERESIS LOGIC
 * ============================================================================= */
float measureUltrasonicSingle(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long duration = pulseIn(echoPin, HIGH, 18000);
  if (duration == 0) return -1.0f;
  return (float)(duration * 0.0343 / 2.0);
}

void scanSensorsSequential() {
  unsigned long now = millis();

  for (int i = 0; i < NUM_SLOTS; i++) {
    float rawDist = measureUltrasonicSingle(slots[i].pinTrig, slots[i].pinEcho);
    slots[i].distanceCm = rawDist;

    if (rawDist > 0.0f && rawDist < HYSTERESIS_ENTER_CM) {
      slots[i].candidateOccupied = true;
    } else if (rawDist > HYSTERESIS_EXIT_CM || rawDist < 0.0f) {
      slots[i].candidateOccupied = false;
    }

    if (slots[i].candidateOccupied != slots[i].confirmedOccupied) {
      if (slots[i].debounceTimer == 0) {
        slots[i].debounceTimer = now;
      } else if (now - slots[i].debounceTimer >= DEBOUNCE_TIME_MS) {
        bool wasOccupied = slots[i].confirmedOccupied;
        slots[i].confirmedOccupied = slots[i].candidateOccupied;
        slots[i].debounceTimer = 0;
        statusChangedEvent = true;
        updateSlotIndicators(i);

        // ─── เมื่อรถออกจากช่องจอด (เคยมีรถจอด -> กลายเป็นช่องว่าง) ───
        if (wasOccupied && !slots[i].confirmedOccupied) {
          Serial.printf("[AUTO-CLOSE] Slot %s: Car exited slot! Starting 3-second countdown to close barrier...\n", slots[i].slotId);
          autoCloseTimer[i] = now;
        }
      }
    } else {
      slots[i].debounceTimer = 0;
    }

    // ─── ปิดไม้กั้นอัตโนมัติเมื่อครบ 3 วินาทีหลังจากรถออกจากช่องจอด ───
    if (autoCloseTimer[i] > 0 && (now - autoCloseTimer[i] >= AUTO_CLOSE_DELAY_MS)) {
      autoCloseTimer[i] = 0;
      if (slots[i].isGateOpen) {
        Serial.printf("[AUTO-CLOSE] Slot %s: 3 seconds elapsed after car exit -> Closing barrier gate.\n", slots[i].slotId);
        updateBarrierGate(i, false);
      }
    }

    delay(25);
  }
}

/* =============================================================================
 * ACTUATOR & INDICATOR CONTROLS (COMMON ANODE: ACTIVE-LOW)
 * ============================================================================= */
void updateSlotIndicators(int index) {
  if (slots[index].confirmedOccupied) {
    digitalWrite(slots[index].pinLedRed, LOW);    // แดงติด
    digitalWrite(slots[index].pinLedGreen, HIGH); // เขียวดับ
  } else {
    digitalWrite(slots[index].pinLedRed, HIGH);   // แดงดับ
    digitalWrite(slots[index].pinLedGreen, LOW);  // เขียวติด
  }
}

void updateBarrierGate(int index, bool open) {
  if (slots[index].isGateOpen != open) {
    slots[index].isGateOpen = open;
    slots[index].servoInstance.write(open ? SERVO_OPEN_ANGLE : SERVO_CLOSED_ANGLE);
    Serial.printf("[ACTUATOR] Slot %s Barrier Gate -> %s (%d deg)\n",
                  slots[index].slotId, open ? "OPEN" : "CLOSED",
                  open ? SERVO_OPEN_ANGLE : SERVO_CLOSED_ANGLE);
  }
}

/* =============================================================================
 * SERIAL TERMINAL DASHBOARD
 * ============================================================================= */
void printTerminalDashboard() {
  Serial.println("\n===== [CENTRAL MASTER GATEWAY DASHBOARD] =====");
  Serial.println("SLOT | DISTANCE | SENSOR RAW | CONFIRMED    | BARRIER  | LED");
  Serial.println("-----|----------|------------|--------------|----------|------");

  // Local Slots (A1-A3)
  for (int i = 0; i < NUM_SLOTS; i++) {
    char distBuf[10];
    if (slots[i].distanceCm < 0)
      snprintf(distBuf, sizeof(distBuf), " OutRange");
    else
      snprintf(distBuf, sizeof(distBuf), "  %5.1f  ", slots[i].distanceCm);

    Serial.printf(" %-3s |  %s  |  %-8s  | %-12s | %-8s | %-5s\n",
                  slots[i].slotId, distBuf,
                  slots[i].candidateOccupied ? "OCCUPIED" : "VACANT  ",
                  slots[i].confirmedOccupied ? "UNAVAILABLE" : "AVAILABLE  ",
                  slots[i].isGateOpen ? "OPEN 90°" : "CLOSED 0°",
                  slots[i].confirmedOccupied ? "RED" : "GREEN");
  }

  // Remote Slots (A4-A6, B1-B6 จาก ESP-NOW)
  Serial.println("---- [ESP-NOW Remotes: A4-A6, B1-B6] ----");
  for (int i = 0; i < NUM_REMOTE_SLOTS; i++) {
    char distBuf[10];
    if (remoteSlots[i].distanceCm < 0)
      snprintf(distBuf, sizeof(distBuf), " OutRange");
    else
      snprintf(distBuf, sizeof(distBuf), "  %5.1f  ", remoteSlots[i].distanceCm);

    unsigned long slotAge = millis() - lastRemoteSlotUpdate[i];
    bool isStale = (slotAge > ESPNOW_STALE_TIMEOUT_MS) || (lastRemoteSlotUpdate[i] == 0);

    Serial.printf(" %-3s |  %s  |     -      | %-12s |    -     | %s\n",
                  (const char *)remoteSlots[i].slotId,
                  distBuf,
                  isStale ? "OFFLINE" : (remoteSlots[i].occupied ? "UNAVAILABLE" : "AVAILABLE  "),
                  isStale ? "GREY" : (remoteSlots[i].occupied ? "RED" : "GREEN"));
  }

  Serial.printf("Slaves: F1-Right: %s | F2-Left: %s | F2-Right: %s\n",
                peerF1RightKnown ? "LINKED" : "WAITING",
                peerF2LeftKnown  ? "LINKED" : "WAITING",
                peerF2RightKnown ? "LINKED" : "WAITING");
  Serial.printf("WiFi: %s (%d dBm) | Free Heap: %u bytes\n",
                WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE",
                WiFi.RSSI(), ESP.getFreeHeap());
  Serial.println("==============================================");
}

/* =============================================================================
 * NETWORK & TWO-WAY BATCH TELEMETRY TRANSMISSION
 * ============================================================================= */
void connectWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
    delay(400);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Connected! IP: %s\n",
                  WiFi.localIP().toString().c_str());
    Serial.println("==========================================================");
    Serial.printf("[INFO] ★ WiFi Channel: %d  <- นำไปใส่ WIFI_CHANNEL ใน Slaves\n",
                  WiFi.channel());
    Serial.printf("[INFO] ★ My MAC Address: %s  <- นำไปใส่ masterMac ใน Slaves ทุกตัว\n",
                  WiFi.macAddress().c_str());
    Serial.println("==========================================================");
  } else {
    Serial.println("[WIFI] Connection Failed. Offline mode...");
  }

  WiFi.setSleep(false);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] Init FAILED!");
    return;
  }

  esp_now_register_recv_cb(onEspNowRecv);
  esp_now_register_send_cb(onEspNowSent);

  Serial.println("[ESP-NOW] Central Gateway Ready. Auto-pairing enabled for all Slaves.");
}

bool transmitBatchTelemetry(const char *reason) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[COMM] Transmission skipped: WiFi is disconnected.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/iot/batch-telemetry";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // สร้าง Batch JSON Payload รวมทั้ง 12 ช่อง (A1-A6 & B1-B6)
  JsonDocument outDoc;
  outDoc["device_id"] = "Central-Gateway";
  JsonArray slotsArray = outDoc["slots"].to<JsonArray>();

  // --- 1. Local Slots (A1-A3) ---
  if (xSemaphoreTake(xDataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    for (int i = 0; i < NUM_SLOTS; i++) {
      JsonObject slotObj = slotsArray.add<JsonObject>();
      slotObj["slot_id"] = slots[i].slotId;
      slotObj["distance_cm"] = sharedLocalSlots[i].distanceCm;
      slotObj["occupied"] = sharedLocalSlots[i].confirmedOccupied;
      slotObj["status"] =
          sharedLocalSlots[i].confirmedOccupied ? "unavailable" : "available";
    }
    xSemaphoreGive(xDataMutex);
  }

  // --- 2. Remote Slots (A4-A6, B1-B6 จาก ESP-NOW) ---
  unsigned long nowMs = millis();
  for (int i = 0; i < NUM_REMOTE_SLOTS; i++) {
    JsonObject slotObj = slotsArray.add<JsonObject>();
    slotObj["slot_id"] = (const char *)remoteSlots[i].slotId;
    slotObj["distance_cm"] = remoteSlots[i].distanceCm;
    slotObj["occupied"] = (bool)remoteSlots[i].occupied;
    slotObj["status"] =
        remoteSlots[i].occupied ? "unavailable" : "available";

    unsigned long age = nowMs - lastRemoteSlotUpdate[i];
    if (age > ESPNOW_STALE_TIMEOUT_MS || lastRemoteSlotUpdate[i] == 0) {
      slotObj["stale"] = true;
    }
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

    JsonDocument inDoc;
    DeserializationError err = deserializeJson(inDoc, responsePayload);
    if (!err && inDoc["barriers"].is<JsonArray>()) {
      JsonArray barriers = inDoc["barriers"].as<JsonArray>();

      BarrierCommandPayload cmdF1Right = {0};
      BarrierCommandPayload cmdF2Left  = {0};
      BarrierCommandPayload cmdF2Right = {0};

      for (JsonObject b : barriers) {
        const char *slotId = b["slot_id"];
        bool gateOpen = b["gate_open"] | false;
        if (slotId == nullptr) continue;

        // Check Local A1-A3
        bool isLocal = false;
        for (int i = 0; i < NUM_SLOTS; i++) {
          if (strcmp(slots[i].slotId, slotId) == 0) {
            updateBarrierGate(i, gateOpen);
            isLocal = true;
            break;
          }
        }
        if (isLocal) continue;

        // Route to F1-Right: A4, A5, A6
        if (strncmp(slotId, "A4", 2) == 0 || strncmp(slotId, "A5", 2) == 0 || strncmp(slotId, "A6", 2) == 0) {
          if (cmdF1Right.numCommands < 3) {
            int idx = cmdF1Right.numCommands++;
            strncpy(cmdF1Right.commands[idx].slotId, slotId, 3);
            cmdF1Right.commands[idx].slotId[3] = '\0';
            cmdF1Right.commands[idx].gateOpen = gateOpen;
          }
        }
        // Route to F2-Left: B1, B2, B3
        else if (strncmp(slotId, "B1", 2) == 0 || strncmp(slotId, "B2", 2) == 0 || strncmp(slotId, "B3", 2) == 0) {
          if (cmdF2Left.numCommands < 3) {
            int idx = cmdF2Left.numCommands++;
            strncpy(cmdF2Left.commands[idx].slotId, slotId, 3);
            cmdF2Left.commands[idx].slotId[3] = '\0';
            cmdF2Left.commands[idx].gateOpen = gateOpen;
          }
        }
        // Route to F2-Right: B4, B5, B6
        else if (strncmp(slotId, "B4", 2) == 0 || strncmp(slotId, "B5", 2) == 0 || strncmp(slotId, "B6", 2) == 0) {
          if (cmdF2Right.numCommands < 3) {
            int idx = cmdF2Right.numCommands++;
            strncpy(cmdF2Right.commands[idx].slotId, slotId, 3);
            cmdF2Right.commands[idx].slotId[3] = '\0';
            cmdF2Right.commands[idx].gateOpen = gateOpen;
          }
        }
      }

      // Forward to respective Slaves via ESP-NOW
      if (cmdF1Right.numCommands > 0 && peerF1RightKnown) {
        esp_now_send(peerF1Right, (uint8_t *)&cmdF1Right, sizeof(cmdF1Right));
      }
      if (cmdF2Left.numCommands > 0 && peerF2LeftKnown) {
        esp_now_send(peerF2Left, (uint8_t *)&cmdF2Left, sizeof(cmdF2Left));
      }
      if (cmdF2Right.numCommands > 0 && peerF2RightKnown) {
        esp_now_send(peerF2Right, (uint8_t *)&cmdF2Right, sizeof(cmdF2Right));
      }
    }

    success = true;
  } else {
    Serial.printf("[COMM] HTTP POST Failed. Code: %d\n", httpCode);
  }

  http.end();
  return success;
}
