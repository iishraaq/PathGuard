import { parseDistanceCm } from '../parseTelemetry';
import { WebBluetoothBLEManager } from '../WebBluetoothBLEManager';
import type { ConnectionState, DeviceReading } from '../types';

describe('parseDistanceCm', () => {
  it('reads a single byte as centimetres', () => expect(parseDistanceCm([120])).toBe(120));
  it('reads the distance from the firmware 4-byte packet', () =>
    expect(parseDistanceCm([0, 48, 72, 2])).toBe(72));
  it('does not mistake the x-position byte for distance', () =>
    expect(parseDistanceCm([0, 48, 10, 2])).toBe(10));
  it('returns null for an unexpected length', () => expect(parseDistanceCm([1, 2, 3])).toBeNull());
  it('returns null for an empty packet', () => expect(parseDistanceCm([])).toBeNull());
});

// A tiny fake of the browser's Bluetooth API: one device that notifies one byte.
function fakeBluetooth(opts: { reject?: boolean } = {}) {
  let listener: ((e: unknown) => void) | null = null;
  const characteristic = {
    properties: { notify: true, read: true },
    value: undefined as DataView | undefined,
    startNotifications: async () => characteristic,
    stopNotifications: async () => characteristic,
    readValue: async () => new DataView(new Uint8Array([0]).buffer),
    written: [] as number[][],
    writeValue: async (v: BufferSource) => { characteristic.written.push(Array.from(v as Uint8Array)); },
    addEventListener: (_t: string, l: (e: unknown) => void) => { listener = l; },
    removeEventListener: () => { listener = null; },
  };
  const server = {
    connected: false,
    connect: async () => { server.connected = true; return server; },
    disconnect: () => { server.connected = false; },
    getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
  };
  const device = { gatt: server, addEventListener: () => undefined, removeEventListener: () => undefined };
  return {
    api: {
      requestDevice: async () => {
        if (opts.reject) { const e = new Error('cancelled'); e.name = 'NotFoundError'; throw e; }
        return device;
      },
    },
    characteristic,
    push: (distance: number) => {
      // same layout as the firmware: [hazardId, xPos, distance, zone]
      characteristic.value = new DataView(new Uint8Array([0, 48, distance, 1]).buffer);
      listener?.({ target: characteristic });
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WebBluetoothBLEManager', () => {
  it('scans, connects and turns a notified byte into a distance reading', async () => {
    const fake = fakeBluetooth();
    const ble = new WebBluetoothBLEManager(fake.api);
    const states: ConnectionState[] = [];
    const readings: DeviceReading[] = [];
    ble.onStateChange((s) => states.push(s));
    ble.onData((r) => readings.push(r));

    ble.scan();
    await flush();
    ble.connect();
    await flush();
    fake.push(85);

    expect(states).toEqual(['scanning', 'found', 'connecting', 'connected']);
    expect(readings[0].distanceCm).toBe(85);
    ble.disconnect();
    expect(readings[0].batteryPercent).toBeNull();
    ble.disconnect();
    expect(ble.getState()).toBe('disconnected');
  });

  it('sends the sensitivity to the settings characteristic and reports clear after silence', async () => {
    jest.useFakeTimers();
    const fake = fakeBluetooth();
    const ble = new WebBluetoothBLEManager(fake.api);
    const readings: DeviceReading[] = [];
    ble.onData((r) => readings.push(r));
    ble.scan();
    await jest.advanceTimersByTimeAsync(1);
    ble.connect();
    await jest.advanceTimersByTimeAsync(1);

    await ble.sendSettings({ sensitivity: 7 });
    expect(fake.characteristic.written).toEqual([[7]]);

    fake.push(60);
    await jest.advanceTimersByTimeAsync(1100);
    expect(readings.map((r) => r.distanceCm)).toEqual([60, 999]);
    ble.disconnect();
    jest.useRealTimers();
  });

  it('returns to disconnected without an error when the picker is closed', async () => {
    const ble = new WebBluetoothBLEManager(fakeBluetooth({ reject: true }).api);
    ble.scan();
    await flush();
    expect(ble.getState()).toBe('disconnected');
    expect(ble.getLastError()).toBeNull();
  });

  it('refuses to send settings when not connected', async () => {
    const ble = new WebBluetoothBLEManager(fakeBluetooth().api);
    await expect(ble.sendSettings({ sensitivity: 5 })).rejects.toThrow();
  });

  it('says so when Web Bluetooth is missing', () => {
    const ble = new WebBluetoothBLEManager(undefined);
    // navigator.bluetooth is absent under Jest, so scan() cannot start
    ble.scan();
    expect(ble.getState()).toBe('disconnected');
    expect(ble.getLastError()).toMatch(/Chrome/);
  });
});
