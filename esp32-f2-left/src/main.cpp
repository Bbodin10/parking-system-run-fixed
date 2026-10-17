/* =============================================================================
 * Project: ESP32 Smart Parking Slot Controller (Floor 2 Left: Slots B1, B2, B3)
 * Role: ESP-NOW Slave — ส่ง Telemetry ไปยัง Central Master (F1-Left), รับคำสั่งไม้กั้น
 * Architecture: FreeRTOS Dual-Core + ESP-NOW Peer-to-Peer
 * Features:
 *   - Core 1: SensorTask - Ultrasonic Round-Robin (B1-B3), Hysteresis, Debounce
 * & LEDs
 *   - Core 0: CommTask - ESP-NOW Send Telemetry ทุก 500ms/Event และรับคำสั่งไม้กั้น
 * =============================================================================
 */

#include "shared_types.h"
#include <Arduino.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

/* ============================ CONFIGURATION ============================ */
// ⚠️ MAC Address ของบอร์ด Central Master (Floor 1 Left)
// เมื่อเปิดบอร์ด F1-Left ให้อ่าน MAC Address จาก Serial Monitor แล้วนำมาใส่ที่นี่:
uint8_t masterMac[] = {0x20, 0x50, 0x0D, 0x76, 0xC8, 0x5C};

// ⚠️ WiFi Channel ของ Router "B03_WIFI" (อ่านได้จาก Serial Monitor ของบอร์ด
// F1-Left)
const int WIFI_CHANNEL = 1;

/* ======================= HARDWARE (FLOOR 2 LEFT) ======================= */
SlotHardware slots[NUM_SLOTS] = {
    {"B1", 23, 34, 19, 26, 25, Servo(), -1.0f, false, false, 0, false},
    {"B2", 22, 35, 18, 33, 32, Servo(), -1.0f, false, false, 0, false},
    {"B3", 21, 27, 4, 14, 13, Servo(), -1.0f, false, false, 0, false}};

/* ------------------- INTER-TASK DATA ------------------- */
SharedSlotData sharedSlots[NUM_SLOTS];
SemaphoreHandle_t xDataMutex = NULL;
volatile bool statusChangedEvent = false;
volatile bool commStatusChanged = false;

// ESP-NOW Send Status
volatile bool lastSendSuccess = false;
volatile unsigned long lastSendTime = 0;

// Auto-Close Timer สำหรับแต่ละช่องจอด (ปิดหลังรถออกจากช่อง 3 วินาที)
unsigned long autoCloseTimer[NUM_SLOTS] = {0, 0, 0};

/* ------------------- FUNCTION DECLARATIONS ------------------- */
float measureUltrasonicSingle(int trigPin, int echoPin);
void scanSensorsSequential();
void updateSlotIndicators(int index);
void updateBarrierGate(int index, bool open);
void printTerminalDashboard();
void sensorTaskFunc(void *pvParameters);
void commTaskFunc(void *pvParameters);

/* ------------------- ESP-NOW CALLBACKS ------------------- */

void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len == sizeof(BarrierCommandPayload)) {
    BarrierCommandPayload cmd;
    memcpy(&cmd, data, sizeof(cmd));

    Serial.printf("[ESP-NOW] Received %d barrier commands from Master\n",
                  cmd.numCommands);

    for (int c = 0; c < cmd.numCommands && c < 3; c++) {
      for (int i = 0; i < NUM_SLOTS; i++) {
        if (strcmp(slots[i].slotId, cmd.commands[c].slotId) == 0) {
          updateBarrierGate(i, cmd.commands[c].gateOpen);
          break;
        }
      }
    }
  }
}

void onEspNowSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  lastSendSuccess = (status == ESP_NOW_SEND_SUCCESS);
  lastSendTime = millis();
}

/* =============================================================================
 * SETUP
 * =============================================================================
 */
void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("==========================================================");
  Serial.println("[FLOOR 2 LEFT] ESP32 Parking Slave Initializing...");
  Serial.println("==========================================================");

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

    // 1. หมุนเปิด (OPEN: 90 deg)
    slots[i].servoInstance.write(SERVO_OPEN_ANGLE);
    slots[i].isGateOpen = true;
    delay(700);

    // 2. หมุนปิด (CLOSED: 0 deg)
    slots[i].servoInstance.write(SERVO_CLOSED_ANGLE);
    slots[i].isGateOpen = false;
    delay(700);
  }
  Serial.println("[ACTUATOR] Boot Self-Test Completed. All gates in CLOSED state (0 deg).");
  Serial.println("[ACTUATOR] Ready to receive OPEN commands from Web / Master.\n");

  // WiFi STA mode สำหรับ ESP-NOW (ไม่ต้องต่อเราเตอร์)
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  WiFi.setSleep(false);

  Serial.println("==========================================================");
  Serial.printf("[WIFI] Channel locked to: %d\n", WIFI_CHANNEL);
  Serial.printf("[INFO] ★ My MAC Address: %s  <- นำไปใส่ใน Master (F1-Left)\n",
                WiFi.macAddress().c_str());
  Serial.println("==========================================================");

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] Init FAILED!");
    return;
  }

  esp_now_register_recv_cb(onEspNowRecv);
  esp_now_register_send_cb(onEspNowSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, masterMac, 6);
  peerInfo.channel = WIFI_CHANNEL;
  peerInfo.encrypt = false;
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ESP-NOW] Waiting for Master MAC configuration...");
  }

  Serial.println("[ESP-NOW] Slave Ready. Listening & waiting for Master...");

  xDataMutex = xSemaphoreCreateMutex();

  scanSensorsSequential();

  xTaskCreatePinnedToCore(sensorTaskFunc, "SensorTask", 4096, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(commTaskFunc, "CommTask", 4096, NULL, 1, NULL, 0);
}

void loop() { vTaskDelay(portMAX_DELAY); }

/* =============================================================================
 * SENSOR TASK (Core 1)
 * =============================================================================
 */
void sensorTaskFunc(void *pvParameters) {
  TickType_t lastLog = xTaskGetTickCount();

  for (;;) {
    scanSensorsSequential();

    if (xSemaphoreTake(xDataMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      for (int i = 0; i < NUM_SLOTS; i++) {
        sharedSlots[i].distanceCm = slots[i].distanceCm;
        sharedSlots[i].confirmedOccupied = slots[i].confirmedOccupied;
      }
      if (statusChangedEvent) {
        commStatusChanged = true;
        statusChangedEvent = false;
      }
      xSemaphoreGive(xDataMutex);
    }

    if (xTaskGetTickCount() - lastLog >= pdMS_TO_TICKS(TERMINAL_LOG_INTERVAL)) {
      lastLog = xTaskGetTickCount();
      printTerminalDashboard();
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

/* =============================================================================
 * COMM TASK (Core 0)
 * =============================================================================
 */
void commTaskFunc(void *pvParameters) {
  unsigned long lastSend = 0;

  for (;;) {
    unsigned long now = millis();
    bool shouldSend =
        (now - lastSend >= ESPNOW_SEND_INTERVAL_MS) || commStatusChanged;

    if (shouldSend) {
      commStatusChanged = false;

      TelemetryPayload payload;
      payload.numSlots = NUM_SLOTS;

      if (xSemaphoreTake(xDataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        for (int i = 0; i < NUM_SLOTS; i++) {
          strncpy(payload.slots[i].slotId, slots[i].slotId, 3);
          payload.slots[i].slotId[3] = '\0';
          payload.slots[i].distanceCm = sharedSlots[i].distanceCm;
          payload.slots[i].occupied = sharedSlots[i].confirmedOccupied;
        }
        xSemaphoreGive(xDataMutex);
      }

      bool sent = false;
      for (int attempt = 0; attempt <= ESPNOW_MAX_RETRIES; attempt++) {
        esp_err_t result =
            esp_now_send(masterMac, (uint8_t *)&payload, sizeof(payload));

        if (result == ESP_OK) {
          sent = true;
          break;
        }

        if (attempt < ESPNOW_MAX_RETRIES) {
          vTaskDelay(pdMS_TO_TICKS(ESPNOW_RETRY_DELAY_MS));
        }
      }

      lastSend = millis();
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

/* =============================================================================
 * SENSOR SCANNING & HYSTERESIS
 * =============================================================================
 */
float measureUltrasonicSingle(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

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
 * ACTUATOR & INDICATOR CONTROLS (Common-Anode: Active-LOW)
 * =============================================================================
 */
void updateSlotIndicators(int index) {
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
    Serial.printf("[ACTUATOR] Slot %s Barrier -> %s (%d deg)\n",
                  slots[index].slotId, open ? "OPEN" : "CLOSED",
                  open ? SERVO_OPEN_ANGLE : SERVO_CLOSED_ANGLE);
  }
}

/* =============================================================================
 * SERIAL TERMINAL DASHBOARD (Floor 2 Left)
 * =============================================================================
 */
void printTerminalDashboard() {
  Serial.println("\n===== [FLOOR 2 LEFT SLAVE DASHBOARD] =====");
  Serial.println(
      "SLOT | DISTANCE | SENSOR RAW | CONFIRMED    | BARRIER  | LED");
  Serial.println(
      "-----|----------|------------|--------------|----------|------");

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

  Serial.println("-------------------------------------");
  Serial.printf("ESP-NOW -> Central Master: %s (last: %lu ms ago)\n",
                lastSendSuccess ? "✓ OK" : "✗ FAIL",
                lastSendTime > 0 ? (millis() - lastSendTime) : 0);
  Serial.printf("Channel: %d | Free Heap: %u bytes\n", WIFI_CHANNEL,
                ESP.getFreeHeap());
  Serial.println("=====================================");
}
