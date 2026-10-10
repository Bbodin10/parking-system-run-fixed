/* =============================================================================
 * Project: ESP32 Smart Parking Master / Gateway (Floor 2 Left: Slots B1, B2, B3)
 * Board Role: Master Gateway
 *   - Core 1: SensorTask - Ultrasonic Round-Robin (B1-B3), Hysteresis,
 *             Debounce & Local Common-Anode LED Indicators
 *   - Core 0: NetworkTask - HTTPS 6-Slot Batch Telemetry (Floor-2: B1-B6),
 *             ESP-NOW Receiver & Forwarding of Barrier Commands to B-Right
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

// ⚠️ MAC Address ของบอร์ด Floor 2 Right (Slave)
// เมื่อเปิดบอร์ด F2-Right ให้อ่าน MAC Address จาก Serial Monitor แล้วนำมาใส่ที่นี่:
uint8_t peerMacRight[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

/* ======================== HARDWARE (FLOOR 2 LEFT) ======================= */
SlotHardware slots[NUM_SLOTS] = {
    {"B1", 23, 34, 19, 26, 25, Servo(), -1.0f, false, false, 0, false},
    {"B2", 22, 35, 18, 33, 32, Servo(), -1.0f, false, false, 0, false},
    {"B3", 21, 27, 4, 14, 13, Servo(), -1.0f, false, false, 0, false}};

/* ------------------- INTER-TASK SHARED DATA --------------------- */
SharedSlotData sharedLocalSlots[NUM_SLOTS];     // SensorTask เขียน, NetworkTask อ่าน
SemaphoreHandle_t xDataMutex = NULL;            // Mutex ป้องกัน Race Condition
volatile bool statusChangedEvent = false;       // Trigger จาก Sensor debouncing
volatile bool networkStatusChanged = false;     // Trigger ส่งไปยัง NetworkTask

/* ------------------- REMOTE SLOT DATA (B4-B6 from ESP-NOW) ------ */
volatile RemoteSlotData remoteSlots[NUM_REMOTE_SLOTS] = {
    {"B4", -1.0f, false},
    {"B5", -1.0f, false},
    {"B6", -1.0f, false}};
volatile bool remoteDataFresh = false;
volatile unsigned long lastRemoteUpdate = 0;

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

// --- Receive Callback: รับ Telemetry B4-B6 จาก F2-Right ---
void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len == sizeof(TelemetryPayload)) {
    TelemetryPayload payload;
    memcpy(&payload, data, sizeof(payload));

    bool stateChanged = false;
    for (int i = 0; i < payload.numSlots && i < NUM_REMOTE_SLOTS; i++) {
      if (remoteSlots[i].occupied != payload.slots[i].occupied) {
        stateChanged = true;
      }
      memcpy((void *)remoteSlots[i].slotId, payload.slots[i].slotId, 4);
      remoteSlots[i].distanceCm = payload.slots[i].distanceCm;
      remoteSlots[i].occupied = payload.slots[i].occupied;
    }
    remoteDataFresh = true;
    lastRemoteUpdate = millis();

    if (stateChanged) {
      networkStatusChanged = true;
    }

    Serial.printf("[ESP-NOW] Received telemetry from %02X:%02X:%02X:%02X:%02X:%02X\n",
                  mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  }
}

// --- Send Callback: ตรวจสถานะการส่งไปยัง F2-Right ---
void onEspNowSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.printf("[ESP-NOW] Send -> %s\n",
                status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
}

/* =============================================================================
 * SETUP INITIALIZATION
 * ============================================================================= */
void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("==========================================================");
  Serial.printf("[%s] ESP32 Parking Controller Initializing...\n", FLOOR_DEVICE_ID);
  Serial.println("==========================================================");

  // เตรียมพินฮาร์ดแวร์สำหรับแต่ละช่องจอด
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(slots[i].pinTrig, OUTPUT);
    digitalWrite(slots[i].pinTrig, LOW);
    pinMode(slots[i].pinEcho, INPUT);

    pinMode(slots[i].pinLedRed, OUTPUT);
    pinMode(slots[i].pinLedGreen, OUTPUT);

    updateSlotIndicators(i);

    slots[i].servoInstance.setPeriodHertz(50);
    slots[i].servoInstance.attach(slots[i].pinServo, 500, 2400);
    slots[i].servoInstance.write(SERVO_CLOSED_ANGLE);
    slots[i].isGateOpen = false;
  }

  xDataMutex = xSemaphoreCreateMutex();

  connectWiFi();

  scanSensorsSequential();

  // สร้าง FreeRTOS Tasks แยก Core
  xTaskCreatePinnedToCore(sensorTaskFunc,  "SensorTask",  4096, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(networkTaskFunc, "NetworkTask", 8192, NULL, 1, NULL, 0);

  transmitBatchTelemetry("Initial Power-on Synchronization");
}

/* =============================================================================
 * MAIN LOOP (ว่างเปล่า - การทำงานทั้งหมดจัดการใน FreeRTOS Tasks)
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
        slots[i].confirmedOccupied = slots[i].candidateOccupied;
        slots[i].debounceTimer = 0;
        statusChangedEvent = true;
        updateSlotIndicators(i);
      }
    } else {
      slots[i].debounceTimer = 0;
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
  Serial.printf("\n===== [%s GATEWAY DASHBOARD] =====\n", FLOOR_DEVICE_ID);
  Serial.println("SLOT | DISTANCE | SENSOR RAW | CONFIRMED    | BARRIER  | LED");
  Serial.println("-----|----------|------------|--------------|----------|------");

  // Local Slots (B1-B3)
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

  // Remote Slots (B4-B6 จาก ESP-NOW)
  Serial.println("---- [ESP-NOW Remote: Floor 2 Right] ----");
  unsigned long age = millis() - lastRemoteUpdate;
  bool stale = (age > ESPNOW_STALE_TIMEOUT_MS) && (lastRemoteUpdate > 0);
  bool noData = (lastRemoteUpdate == 0);

  for (int i = 0; i < NUM_REMOTE_SLOTS; i++) {
    char distBuf[10];
    if (remoteSlots[i].distanceCm < 0)
      snprintf(distBuf, sizeof(distBuf), " OutRange");
    else
      snprintf(distBuf, sizeof(distBuf), "  %5.1f  ", remoteSlots[i].distanceCm);

    Serial.printf(" %-3s |  %s  |     -      | %-12s |    -     | %-5s\n",
                  (const char *)remoteSlots[i].slotId,
                  distBuf,
                  remoteSlots[i].occupied ? "UNAVAILABLE" : "AVAILABLE  ",
                  remoteSlots[i].occupied ? "RED" : "GREEN");
  }

  Serial.printf("ESP-NOW: %s",
                noData ? "NO DATA" : (stale ? "⚠ STALE" : "✓ LINKED"));
  if (!noData) Serial.printf(" (age: %lu ms)", age);
  Serial.println();

  Serial.printf("WiFi: %s (%d dBm) | Heap: %u bytes\n",
                WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE",
                WiFi.RSSI(), ESP.getFreeHeap());
  Serial.println("==================================");
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
    Serial.printf("[INFO] ★ WiFi Channel: %d  <- นำไปใส่ WIFI_CHANNEL ใน F2-Right\n",
                  WiFi.channel());
    Serial.printf("[INFO] ★ My MAC Address: %s  <- นำไปใส่ masterMac ใน F2-Right\n",
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

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, peerMacRight, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ESP-NOW] Failed to add peer F2-Right");
  }

  Serial.println("[ESP-NOW] Gateway Ready.");
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

  // สร้าง Batch JSON Payload รวมทั้ง 6 ช่องของ Floor 2 (B1-B6)
  JsonDocument outDoc;
  outDoc["device_id"] = FLOOR_DEVICE_ID;  // "Floor-2"
  JsonArray slotsArray = outDoc["slots"].to<JsonArray>();

  // --- 1. Local Slots (B1-B3) ---
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

  // --- 2. Remote Slots (B4-B6 จาก ESP-NOW) + Stale Detection ---
  unsigned long age = millis() - lastRemoteUpdate;
  bool isStale = (age > ESPNOW_STALE_TIMEOUT_MS) && (lastRemoteUpdate > 0);
  bool noRemoteData = (lastRemoteUpdate == 0);

  for (int i = 0; i < NUM_REMOTE_SLOTS; i++) {
    JsonObject slotObj = slotsArray.add<JsonObject>();
    slotObj["slot_id"] = (const char *)remoteSlots[i].slotId;
    slotObj["distance_cm"] = remoteSlots[i].distanceCm;
    slotObj["occupied"] = (bool)remoteSlots[i].occupied;
    slotObj["status"] =
        remoteSlots[i].occupied ? "unavailable" : "available";

    if (isStale || noRemoteData) {
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

      BarrierCommandPayload remoteCommands;
      remoteCommands.numCommands = 0;

      for (JsonObject b : barriers) {
        const char *slotId = b["slot_id"];
        bool gateOpen = b["gate_open"] | false;
        if (slotId == nullptr) continue;

        bool isLocal = false;
        for (int i = 0; i < NUM_SLOTS; i++) {
          if (strcmp(slots[i].slotId, slotId) == 0) {
            updateBarrierGate(i, gateOpen);
            isLocal = true;
            break;
          }
        }

        if (!isLocal && remoteCommands.numCommands < 3) {
          int idx = remoteCommands.numCommands++;
          strncpy(remoteCommands.commands[idx].slotId, slotId, 3);
          remoteCommands.commands[idx].slotId[3] = '\0';
          remoteCommands.commands[idx].gateOpen = gateOpen;
        }
      }

      if (remoteCommands.numCommands > 0) {
        esp_err_t result = esp_now_send(peerMacRight,
                                         (uint8_t *)&remoteCommands,
                                         sizeof(remoteCommands));
        Serial.printf("[ESP-NOW] Forwarded %d barrier commands -> F2-Right (%s)\n",
                      remoteCommands.numCommands,
                      result == ESP_OK ? "sent" : "failed");
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
