import { MockBLEManager } from '../MockBLEManager';
import type { ConnectionState, DeviceReading } from '../types';

describe('MockBLEManager (FR-4)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('walks disconnected -> scanning -> found -> connecting -> connected', () => {
    const ble = new MockBLEManager({ scanDelayMs: 100, connectDelayMs: 50, tickMs: 10 });
    const states: ConnectionState[] = [];
    ble.onStateChange((s) => states.push(s));

    ble.scan();
    jest.advanceTimersByTime(100);
    ble.connect();
    jest.advanceTimersByTime(50);

    expect(states).toEqual(['scanning', 'found', 'connecting', 'connected']);
    ble.disconnect();
  });

  it('ignores connect() before a device has been found', () => {
    const ble = new MockBLEManager();
    ble.connect();
    expect(ble.getState()).toBe('disconnected');
  });

  it('streams readings only while connected', () => {
    const ble = new MockBLEManager({ scanDelayMs: 1, connectDelayMs: 1, tickMs: 10 });
    const readings: DeviceReading[] = [];
    ble.onData((r) => readings.push(r));

    ble.scan();
    jest.advanceTimersByTime(1);
    ble.connect();
    jest.advanceTimersByTime(1);
    jest.advanceTimersByTime(35);
    expect(readings.length).toBe(3);

    ble.disconnect();
    jest.advanceTimersByTime(100);
    expect(readings.length).toBe(3);
  });

  it('records settings sent while connected (FR-5)', async () => {
    const ble = new MockBLEManager({ scanDelayMs: 1, connectDelayMs: 1 });
    ble.scan();
    jest.advanceTimersByTime(1);
    ble.connect();
    jest.advanceTimersByTime(1);

    await ble.sendSettings({ sensitivity: 8 });
    expect(ble.lastSettings).toEqual([{ sensitivity: 8 }]);
    ble.disconnect();
  });

  it('rejects settings when not connected (negative case)', async () => {
    const ble = new MockBLEManager();
    await expect(ble.sendSettings({ sensitivity: 5 })).rejects.toThrow('not connected');
  });

  it('holds a demo distance until it is cleared', () => {
    const ble = new MockBLEManager({ scanDelayMs: 1, connectDelayMs: 1, tickMs: 10 });
    const readings: DeviceReading[] = [];
    ble.onData((r) => readings.push(r));
    ble.scan();
    jest.advanceTimersByTime(1);
    ble.connect();
    jest.advanceTimersByTime(1);

    ble.setDemoDistanceCm(40);
    jest.advanceTimersByTime(30);
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.every((r) => r.distanceCm === 40)).toBe(true);

    ble.setDemoDistanceCm(null);
    readings.length = 0;
    jest.advanceTimersByTime(30);
    expect(readings.some((r) => r.distanceCm !== 40)).toBe(true);
    ble.disconnect();
  });
});
