// Distance -> vibration pulse rules (FR-5, FR-10). Pure functions so they are
// easy to unit test. The same rules are meant to run in the ESP32 firmware
// (ProximityProcessor / HapticController); the app uses them to preview what
// the device will do.
//
// PROTOTYPE VALUES: tune these once the real sensor is tested.

export const MIN_SENSITIVITY = 1;
export const MAX_SENSITIVITY = 10;

const THRESHOLD_AT_MIN_CM = 50; // sensitivity 1  -> alert only within 0.5 m
const THRESHOLD_STEP_CM = 50; // each step adds 0.5 m (sensitivity 10 -> 5 m)

const SLOWEST_PULSE_MS = 1000; // at the edge of the detection range
const FASTEST_PULSE_MS = 150; // touching distance

export function clampSensitivity(value: number): number {
  if (Number.isNaN(value)) return MIN_SENSITIVITY;
  return Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, Math.round(value)));
}

// Sensitivity slider (1-10) -> detection distance in centimetres.
export function sensitivityToThresholdCm(sensitivity: number): number {
  return THRESHOLD_AT_MIN_CM + (clampSensitivity(sensitivity) - MIN_SENSITIVITY) * THRESHOLD_STEP_CM;
}

// Returns the time between vibration pulses in ms, or null when nothing is
// inside the detection range (no vibration). Closer => shorter interval.
export function pulseIntervalMs(
  distanceCm: number,
  thresholdCm: number,
): number | null {
  if (!Number.isFinite(distanceCm) || distanceCm < 0) return null;
  if (distanceCm > thresholdCm) return null;
  const closeness = 1 - distanceCm / thresholdCm; // 0 at the edge, 1 at 0 cm
  return Math.round(
    SLOWEST_PULSE_MS - closeness * (SLOWEST_PULSE_MS - FASTEST_PULSE_MS),
  );
}

// Rough hours left, assuming the 12-hour full-charge goal from the interviews.
export function batteryHoursLeft(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.floor((clamped / 100) * 12);
}
