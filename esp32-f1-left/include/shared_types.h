#ifndef SHARED_TYPES_H
#define SHARED_TYPES_H

#include <Arduino.h>
#include <ESP32Servo.h>

/* ================= CONFIGURABLE PARAMETERS ================= */
#define FLOOR_NUMBER        1
#define FLOOR_DEVICE_ID     "Floor-1"

#define SLOT_PREFIX         "A"
#define LOCAL_SLOT_OFFSET   0
#define REMOTE_SLOT_OFFSET  3

/* ================= ALGORITHM CONSTRAINTS ================= */
const float HYSTERESIS_ENTER_CM = 9.0f;       // ต่ำกว่านี้ = มีรถจอด
const float HYSTERESIS_EXIT_CM = 10.0f;       // สูงกว่านี้ = ช่องว่าง
const unsigned long DEBOUNCE_TIME_MS = 2000;  // สถานะต้องนิ่ง 2 วินาที
const unsigned long TERMINAL_LOG_INTERVAL = 2000;
const unsigned long NETWORK_COOLDOWN_MS = 2000;
const unsigned long PERIODIC_SYNC_MS = 15000;
const int SERVO_CLOSED_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;

/* ================= ESP-NOW TIMING ================= */
const unsigned long ESPNOW_SEND_INTERVAL_MS = 500;
const unsigned long ESPNOW_STALE_TIMEOUT_MS = 5000;
const int ESPNOW_MAX_RETRIES = 2;
const unsigned long ESPNOW_RETRY_DELAY_MS = 100;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 10000;

/* ================= HARDWARE DATA STRUCTURE ================= */
const int NUM_SLOTS = 3;

struct SlotHardware {
  char slotId[4];
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

/* ================= ESP-NOW PACKET DEFINITIONS ================= */
typedef struct __attribute__((packed)) {
  char slotId[4];
  float distanceCm;
  bool occupied;
} SlotTelemetryPacket;

typedef struct __attribute__((packed)) {
  uint8_t numSlots;
  SlotTelemetryPacket slots[3];
} TelemetryPayload;

typedef struct __attribute__((packed)) {
  char slotId[4];
  bool gateOpen;
} BarrierCommandPacket;

typedef struct __attribute__((packed)) {
  uint8_t numCommands;
  BarrierCommandPacket commands[3];
} BarrierCommandPayload;

/* ================= SHARED DATA (Inter-Task) ================= */
struct SharedSlotData {
  float distanceCm;
  bool confirmedOccupied;
};

/* ================= REMOTE SLOT DATA ================= */
const int NUM_REMOTE_SLOTS = 3;

struct RemoteSlotData {
  char slotId[4];
  float distanceCm;
  bool occupied;
};

#endif // SHARED_TYPES_H
