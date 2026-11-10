import {
  batteryHoursLeft,
  clampSensitivity,
  pulseIntervalMs,
  sensitivityToThresholdCm,
} from '../proximity';

describe('sensitivityToThresholdCm (FR-5)', () => {
  it('maps 1 to 50 cm and 10 to 500 cm', () => {
    expect(sensitivityToThresholdCm(1)).toBe(50);
    expect(sensitivityToThresholdCm(10)).toBe(500);
  });
  it('increases with sensitivity', () => {
    expect(sensitivityToThresholdCm(7)).toBeGreaterThan(sensitivityToThresholdCm(3));
  });
  it('clamps out-of-range values', () => {
    expect(clampSensitivity(0)).toBe(1);
    expect(clampSensitivity(99)).toBe(10);
    expect(clampSensitivity(NaN)).toBe(1);
  });
});

describe('pulseIntervalMs (FR-2, FR-10)', () => {
  const threshold = 300;
  it('returns null (no vibration) beyond the threshold', () => {
    expect(pulseIntervalMs(301, threshold)).toBeNull();
  });
  it('returns null for invalid distances', () => {
    expect(pulseIntervalMs(-5, threshold)).toBeNull();
    expect(pulseIntervalMs(NaN, threshold)).toBeNull();
  });
  it('pulses slowest at the edge of range and fastest up close', () => {
    expect(pulseIntervalMs(300, threshold)).toBe(1000);
    expect(pulseIntervalMs(0, threshold)).toBe(150);
  });
  it('pulses faster as the obstacle gets closer', () => {
    const far = pulseIntervalMs(250, threshold)!;
    const near = pulseIntervalMs(50, threshold)!;
    expect(near).toBeLessThan(far);
  });
});

describe('batteryHoursLeft (FR-11)', () => {
  it('scales on a 12 hour full charge', () => {
    expect(batteryHoursLeft(100)).toBe(12);
    expect(batteryHoursLeft(78)).toBe(9);
    expect(batteryHoursLeft(0)).toBe(0);
  });
  it('clamps out-of-range values', () => {
    expect(batteryHoursLeft(150)).toBe(12);
    expect(batteryHoursLeft(-10)).toBe(0);
  });
});
