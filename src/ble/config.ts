// From PathGuard.ino (ESP32 firmware). Keep these in sync with the sketch.
export const PATHGUARD_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
// ESP32 -> phone (Read + Notify): 4-byte alert packet, see parseTelemetry.ts
export const PATHGUARD_DISTANCE_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
// Phone -> ESP32 (Write): first byte is the "mode" (we send the sensitivity 1-10)
export const PATHGUARD_SETTINGS_CHARACTERISTIC_UUID = '1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e';

// If the characteristic can't notify, the app reads it this often instead.
export const POLL_INTERVAL_MS = 300;

// The firmware only sends packets while an obstacle is within 150 cm.
// If none arrive for this long, the app treats the path as clear.
export const CLEAR_AFTER_MS = 1000;
export const CLEAR_DISTANCE_CM = 999;
