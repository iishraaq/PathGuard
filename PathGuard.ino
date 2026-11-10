/*
 * ============================================================================
 * PathGuard Complete ESP32-S3 Firmware
 * ============================================================================
 * Hardware Pipeline:
 *   OV3660 Camera (RGB565) -> 96x96 Grayscale -> Edge Impulse FOMO Inference
 *   + Benewake TF-Luna LiDAR (UART Distance) -> BLE JSON Alert Notifications
 *
 * Arduino IDE Configuration:
 *   - Board:            ESP32S3 Dev Module
 *   - PSRAM:            OPI PSRAM (or QSPI, match your exact board module)
 *   - Partition Scheme: Huge APP (required to fit ML model + BLE stack)
 *   - Serial Monitor:   115200 baud
 * ============================================================================
 */

// --- Required Libraries ---
#include <pg_ml_inferencing.h>  // Custom Edge Impulse FOMO machine learning library
#include "esp_camera.h"         // Espressif camera driver for OV3660/OV2640
#include <BLEDevice.h>          // Core Bluetooth Low Energy (BLE) functionality
#include <BLEServer.h>          // Allows ESP32 to act as a BLE peripheral server
#include <BLEUtils.h>           // Helper utilities for BLE UUIDs and properties
#include <BLE2902.h>            // Descriptor required for client notifications (CCCD)

// ============================================================================
// 1. CAMERA PIN DEFINITIONS & ORIENTATION (ESP32-S3-CAM)
// ============================================================================
#define PWDN_GPIO_NUM   -1      // Power-down pin (-1 = unused / tied to GND)
#define RESET_GPIO_NUM  -1      // Hardware reset pin (-1 = unused / tied to 3.3V)
#define XCLK_GPIO_NUM   15      // External master clock input to camera
#define SIOD_GPIO_NUM    4      // SCCB (I2C-like) Data line for camera configuration
#define SIOC_GPIO_NUM    5      // SCCB (I2C-like) Clock line for camera configuration

// Parallel 8-bit DVP (Digital Video Port) data bus pins
#define Y9_GPIO_NUM     16      // Data bit 7 (MSB)
#define Y8_GPIO_NUM     17      // Data bit 6
#define Y7_GPIO_NUM     18      // Data bit 5
#define Y6_GPIO_NUM     12      // Data bit 4
#define Y5_GPIO_NUM     10      // Data bit 3
#define Y4_GPIO_NUM      8      // Data bit 2
#define Y3_GPIO_NUM      9      // Data bit 1
#define Y2_GPIO_NUM     11      // Data bit 0 (LSB)

// Camera frame synchronization signals
#define VSYNC_GPIO_NUM   6      // Vertical sync (signals start of a new frame)
#define HREF_GPIO_NUM    7      // Horizontal reference (signals valid row of pixels)
#define PCLK_GPIO_NUM   13      // Pixel clock (ticks once per pixel byte)

// Image orientation adjustments (1 = enabled, 0 = disabled)
#define CAM_VFLIP        1      // Flip image vertically so right-side up
#define CAM_HMIRROR      0      // Do not mirror image horizontally

// Static buffer holding the 96x96 grayscale image fed into the FOMO model
static uint8_t gray96[EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT];

// ============================================================================
// 2. BENEWAKE TF-LUNA LIDAR CONFIGURATION & PARSER
// ============================================================================
#define LIDAR_RX_PIN     14     // ESP32 RX pin -> connect to TF-Luna TX (Pin 2)
#define LIDAR_TX_PIN     41     // ESP32 TX pin -> connect to TF-Luna RX (Pin 3)
#define LIDAR_TIMEOUT_MS 500    // Max age (ms) before a distance reading is discarded

int current_distance_cm = -1;   // Latest valid distance in cm (-1 = no valid target)
unsigned long last_lidar_ms = 0;// Timestamp of the last valid LiDAR packet
uint8_t lidar_buf[9];           // Buffer to assemble a 9-byte TF-Luna data frame
int lidar_idx = 0;              // Current write index inside lidar_buf

/**
 * Reads incoming bytes from Serial1 and parses standard 9-byte TF-Luna frames.
 * Frame format: [0x59, 0x59, Dist_L, Dist_H, Strength_L, Strength_H, Temp_L, Temp_H, Checksum]
 */
static void updateLidar() {
  while (Serial1.available() > 0) {
    uint8_t b = Serial1.read();

    // Byte 0 and Byte 1 must both be the 0x59 frame header
    if (lidar_idx == 0 && b != 0x59) {
      continue;
    }
    if (lidar_idx == 1 && b != 0x59) {
      lidar_idx = 0;            // Reset if second header byte doesn't match
      continue;
    }

    // Store valid byte and advance index
    lidar_buf[lidar_idx++] = b;

    // Once all 9 bytes are collected, validate and extract data
    if (lidar_idx == 9) {
      uint8_t checksum = 0;
      for (int i = 0; i < 8; i++) {
        checksum += lidar_buf[i]; // Sum first 8 bytes (lower 8 bits)
      }

      // Verify checksum matches Byte 8
      if (checksum == lidar_buf[8]) {
        int dist = lidar_buf[2] + (lidar_buf[3] << 8);      // Little-endian distance (cm)
        int strength = lidar_buf[4] + (lidar_buf[5] << 8);  // Signal return strength

        // Filter out weak reflections (<100) and out-of-range noise (0 or >=800 cm)
        if (strength >= 100 && dist > 0 && dist < 800) {
          current_distance_cm = dist;
          last_lidar_ms = millis();
        }
      }
      lidar_idx = 0;            // Reset index for the next incoming frame
    }
  }
}

// ============================================================================
// 3. BLUETOOTH LOW ENERGY (BLE) SERVER SETUP
// ============================================================================
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pCharacteristic = nullptr; // Pointer to the notify characteristic
bool deviceConnected = false;                 // Tracks whether a mobile app is connected

/**
 * Handles BLE connection and disconnection events.
 */
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Phone connected!");
  }

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Phone disconnected. Restarting advertising...");
    pServer->getAdvertising()->start(); // Resume advertising so phone can reconnect
  }
};

// ============================================================================
// 4. CAMERA INITIALIZATION
// ============================================================================
/**
 * Configures and initializes the OV3660 camera sensor using PSRAM frame buffers.
 * Returns true on success, false if hardware initialization fails.
 */
static bool cameraInit() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;             // 20 MHz master clock
  config.pixel_format = PIXFORMAT_RGB565;     // Uncompressed 16-bit RGB (no JPEG decode needed)
  config.frame_size   = FRAMESIZE_QVGA;       // 320x240 resolution
  config.jpeg_quality = 12;                   // Unused in RGB565 mode, kept for struct completeness
  config.fb_count     = 1;                    // Single frame buffer
  config.fb_location  = CAMERA_FB_IN_PSRAM;   // Store frame buffer in external PSRAM
  config.grab_mode    = CAMERA_GRAB_LATEST;   // Always discard old frames and grab newest

  // Initialize camera driver
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  // Apply sensor orientation settings
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, CAM_VFLIP);
    s->set_hmirror(s, CAM_HMIRROR);
  }
  return true;
}

// ============================================================================
// 5. IMAGE PREPROCESSING (QVGA RGB565 -> 96x96 GRAYSCALE)
// ============================================================================
/**
 * Captures a 320x240 RGB565 frame, center-crops it to a 240x240 square,
 * downscales it to 96x96 with 2x2 box averaging, and converts it to 8-bit grayscale.
 */
static bool captureToGray() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return false;
  }

  // Calculate square center-crop boundaries (240x240 from 320x240)
  const int srcW = fb->width;
  const int srcH = fb->height;
  const int side = (srcW < srcH) ? srcW : srcH;
  const int offX = (srcW - side) / 2;
  const int offY = (srcH - side) / 2;
  const uint8_t *buf = fb->buf;

  // Map each output pixel (x, y) in 96x96 back to source coordinates
  for (int y = 0; y < EI_CLASSIFIER_INPUT_HEIGHT; y++) {
    int sy = offY + (y * side) / EI_CLASSIFIER_INPUT_HEIGHT;

    for (int x = 0; x < EI_CLASSIFIER_INPUT_WIDTH; x++) {
      int sx = offX + (x * side) / EI_CLASSIFIER_INPUT_WIDTH;

      // Average a 2x2 neighborhood to reduce aliasing noise during downscaling
      uint32_t sum = 0;
      for (int dy = 0; dy < 2; dy++) {
        for (int dx = 0; dx < 2; dx++) {
          int px = sx + dx;
          if (px >= srcW) px = srcW - 1;
          int py = sy + dy;
          if (py >= srcH) py = srcH - 1;

          // Extract 16-bit big-endian RGB565 pixel (5 bits R, 6 bits G, 5 bits B)
          int idx = (py * srcW + px) * 2;
          uint16_t p = ((uint16_t)buf[idx] << 8) | buf[idx + 1];

          // Expand RGB565 channels to full 8-bit (0-255) values
          uint8_t r = ((p >> 11) & 0x1F) << 3;
          uint8_t g = ((p >> 5)  & 0x3F) << 2;
          uint8_t b = (p & 0x1F) << 3;

          // Compute luminance using standard ITU-R BT.601 weights (0.299R + 0.587G + 0.114B)
          sum += (r * 77 + g * 150 + b * 29) >> 8;
        }
      }

      // Divide accumulated sum by 4 (right-shift by 2) to get final averaged pixel
      gray96[y * EI_CLASSIFIER_INPUT_WIDTH + x] = sum >> 2;
    }
  }

  // Return frame buffer to camera driver so next frame can be captured
  esp_camera_fb_return(fb);
  return true;
}

/**
 * Callback required by Edge Impulse SDK to fetch image slices during inference.
 * Packs each 8-bit grayscale value into a 24-bit RGB float format (0x00VVVVVV).
 */
static int getImageData(size_t offset, size_t length, float *out_ptr) {
  for (size_t i = 0; i < length; i++) {
    uint8_t v = gray96[offset + i];
    out_ptr[i] = (float)((v << 16) | (v << 8) | v);
  }
  return 0;
}

// ============================================================================
// 6. SYSTEM SETUP (RUNS ONCE ON BOOT)
// ============================================================================
void setup() {
  // Initialize USB Serial for debugging output
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
    delay(10);
  }
  Serial.println("\n=== PathGuard Full System Starting ===");

  // Initialize hardware UART1 for TF-Luna LiDAR
  // 1024-byte RX buffer prevents packet drops while ML inference blocks the CPU
  Serial1.setRxBufferSize(1024);
  Serial1.begin(115200, SERIAL_8N1, LIDAR_RX_PIN, LIDAR_TX_PIN);
  Serial.println("[OK] TF-Luna UART initialized.");

  // Verify external PSRAM is enabled and detected
  if (!psramFound()) {
    Serial.println("WARNING: PSRAM not found. Enable OPI PSRAM in Tools menu.");
  }

  // Initialize OV3660 camera; halt execution if hardware check fails
  if (!cameraInit()) {
    Serial.println("Halting: fix camera pins / wiring.");
    while (true) {
      delay(1000);
    }
  }
  Serial.println("[OK] Camera initialized.");

  // Initialize BLE Server and increase MTU to 185 bytes so JSON fits in 1 packet
  BLEDevice::init("PathGuard_ESP32");
  BLEDevice::setMTU(185);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create BLE Service and readable/notifiable Characteristic
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  // Start advertising with the Service UUID so mobile apps can filter for it
  BLEAdvertising *adv = pServer->getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->start();
  Serial.println("[OK] BLE Advertising as 'PathGuard_ESP32'.");
}

// ============================================================================
// 7. MAIN EXECUTION LOOP (SENSOR FUSION & BLE ALERTS)
// ============================================================================
void loop() {
  // 1. Poll LiDAR UART buffer before camera capture
  updateLidar();

  // 2. Capture and downscale camera frame to 96x96 grayscale
  if (!captureToGray()) {
    delay(50);
    return;
  }

  // 3. Poll LiDAR UART buffer before running ML inference
  updateLidar();

  // 4. Wrap grayscale buffer into Edge Impulse signal structure and run FOMO
  signal_t signal;
  signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
  signal.get_data = &getImageData;

  ei_impulse_result_t result = {};
  EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  if (err != EI_IMPULSE_OK) {
    Serial.printf("run_classifier failed (%d)\n", err);
    return;
  }

  // 5. Poll LiDAR UART buffer immediately after ML inference completes
  updateLidar();

  // 6. Invalidate stale LiDAR reading if no valid frame arrived within 500 ms
  if (millis() - last_lidar_ms > LIDAR_TIMEOUT_MS) {
    current_distance_cm = -1;
  }

  // 7. Find the highest-confidence object bounding box from FOMO results
  String best_label = "none";
  float best_conf = 0.0;
  String position = "center";

  for (uint32_t i = 0; i < result.bounding_boxes_count; i++) {
    ei_impulse_result_bounding_box_t bb = result.bounding_boxes[i];

    if (bb.value > best_conf) {
      best_conf = bb.value;
      best_label = String(bb.label);

      // Divide 96px frame width into 3 horizontal zones: left (<32), center (32-64), right (>64)
      int center_x = bb.x + (bb.width / 2);
      if (center_x < 32) {
        position = "left";
      } else if (center_x > 64) {
        position = "right";
      } else {
        position = "center";
      }
    }
  }

  // 8. Fuse LiDAR distance and FOMO detection to determine overall alert severity
  String alert_level = "clear";
  if (current_distance_cm > 0 && current_distance_cm <= 80) {
    alert_level = "danger";     // Immediate obstacle within 0.8 meters
  } else if (current_distance_cm > 80 && current_distance_cm <= 180) {
    alert_level = "caution";    // Approaching obstacle between 0.8 and 1.8 meters
  } else if (best_conf >= 0.50) {
    alert_level = "detected";   // Visual object detected beyond 1.8m (or outside LiDAR beam)
  }

  // 9. Format sensor fusion output as a compact JSON string
  String payload = "{\"obj\":\"" + best_label +
                   "\",\"conf\":" + String(best_conf, 2) +
                   ",\"pos\":\"" + position +
                   "\",\"dist\":" + String(current_distance_cm) +
                   ",\"alert\":\"" + alert_level + "\"}";

  // Print JSON telemetry to USB Serial Monitor
  Serial.println(payload);

  // Transmit JSON notification to connected mobile app over BLE
  if (deviceConnected) {
    pCharacteristic->setValue(payload.c_str());
    pCharacteristic->notify();
  }

  // Brief yield delay for background RTOS/BLE tasks
  delay(20);
}
