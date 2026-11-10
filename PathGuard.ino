
#include <pg_ml_inferencing.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ====================================================================
// PIN DEFINITIONS & UUIDS
// ====================================================================
#define LUNA_RX_PIN 44      // Connects to TF-Luna TX (Pin 3)
#define LUNA_TX_PIN 43      // Connects to TF-Luna RX (Pin 2)

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define ALERT_CHAR_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a8" // ESP32 -> Phone (Notify)
#define SETTINGS_CHAR_UUID  "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e" // Phone -> ESP32 (Write)

HardwareSerial LunaSerial(1);
BLECharacteristic *pAlertCharacteristic;
bool deviceConnected = false;

// LiDAR State Variables
uint16_t currentDistanceCm = 999;
bool validReading = false;
unsigned long lastBleSendTime = 0;

// ====================================================================
// BLE CALLBACKS
// ====================================================================
class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("[BLE] PathGuard App Connected!");
    }

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("[BLE] App Disconnected. Restarting advertising...");
      pServer->getAdvertising()->start();
    }
};

class SettingsCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue();
      if (rxValue.length() > 0) {
        uint8_t mode = rxValue[0]; // Fixed array index
        Serial.printf("[BLE] App updated mode to: %d\n", mode);
      }
    }
};

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================
void setupBLE() {
  BLEDevice::init("PathGuard_Unit");
  
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pAlertCharacteristic = pService->createCharacteristic(
                      ALERT_CHAR_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pAlertCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pSettingsCharacteristic = pService->createCharacteristic(
                                         SETTINGS_CHAR_UUID,
                                         BLECharacteristic::PROPERTY_WRITE
                                       );
  pSettingsCharacteristic->setCallbacks(new SettingsCallbacks());

  pService->start();
  
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
  Serial.println("[BLE] Broadcasting as 'PathGuard_Unit'...");
}

void sendAlertToApp(uint8_t hazardId, uint8_t xPos, uint16_t distanceCm, uint8_t zone) {
  if (!deviceConnected) return;

  uint8_t clampedDist = (distanceCm > 255) ? 255 : (uint8_t)distanceCm;

  // Fixed array brackets []
  uint8_t payload[4] = {
    hazardId,
    xPos,
    clampedDist,
    zone
  };

  pAlertCharacteristic->setValue(payload, 4);
  pAlertCharacteristic->notify();
}

void updateLidar() {
  while (LunaSerial.available() >= 9) {
    if (LunaSerial.read() == 0x59) {
      if (LunaSerial.peek() == 0x59) {
        LunaSerial.read(); // Consume second 0x59

        uint8_t packet[7]; // Fixed array brackets []
        for (int i = 0; i < 7; i++) {
          packet[i] = LunaSerial.read();
        }

        uint8_t checksum = 0x59 + 0x59;
        for (int i = 0; i < 6; i++) {
          checksum += packet[i];
        }

        if (checksum == packet[6]) { // Fixed checksum index
          uint16_t rawDist = packet[0] | (packet[1] << 8);
          uint16_t rawFlux = packet[2] | (packet[3] << 8);

          if (rawFlux >= 100 && rawDist >= 20 && rawDist <= 800) {
            currentDistanceCm = rawDist;
            validReading = true;
          } else {
            validReading = false;
          }
        }
      }
    }
  }
}

// ====================================================================
// MANDATORY ARDUINO SETUP & LOOP
// ====================================================================
void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== Starting PathGuard LiDAR + BLE ===");

  // 1. Start LiDAR
  LunaSerial.begin(115200, SERIAL_8N1, LUNA_RX_PIN, LUNA_TX_PIN);
  
  // 2. Start Bluetooth
  setupBLE();
}

void loop() {
  // Continuously read the LiDAR
  updateLidar();

  // Send a BLE update every 200ms (5 times a second) if an obstacle is under 150cm
  if (validReading && currentDistanceCm <= 150) {
    if (millis() - lastBleSendTime > 200) {
      lastBleSendTime = millis();
      
      // Determine urgency zone (2 = Danger < 80cm, 1 = Caution < 150cm)
      uint8_t zone = (currentDistanceCm <= 80) ? 2 : 1;
      
      Serial.printf("[ALERT] Sending BLE Packet -> Dist: %d cm | Zone: %d\n", currentDistanceCm, zone);
      
      // Hazard ID 0 (LiDAR obstacle), X-Pos 48 (Center), Distance, Zone
      sendAlertToApp(0, 48, currentDistanceCm, zone);
    }
  }
}