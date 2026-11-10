// Turns the bytes the ESP32 sends into a distance. Pure function so it is easy to test.
// Firmware packet (sendAlertToApp in PathGuard.ino), 4 bytes:
//   [0] hazardId  (0 = LiDAR obstacle)
//   [1] xPos      (48 = centre)
//   [2] distance  in cm, capped at 255
//   [3] zone      (1 = caution < 150 cm, 2 = danger < 80 cm)
// A single byte is also accepted and read as the distance in cm.
export function parseDistanceCm(bytes: ArrayLike<number>): number | null {
  if (bytes.length >= 4) return bytes[2];
  if (bytes.length === 1) return bytes[0];
  return null;
}
