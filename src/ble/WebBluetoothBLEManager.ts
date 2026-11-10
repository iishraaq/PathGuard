import {
  CLEAR_AFTER_MS,
  CLEAR_DISTANCE_CM,
  PATHGUARD_DISTANCE_CHARACTERISTIC_UUID,
  PATHGUARD_SERVICE_UUID,
  PATHGUARD_SETTINGS_CHARACTERISTIC_UUID,
  POLL_INTERVAL_MS,
} from './config';
import { parseDistanceCm } from './parseTelemetry';
import type {
  BLEManager,
  ConnectionState,
  DeviceReading,
  DeviceSettings,
  Unsubscribe,
} from './types';

// Minimal shapes for the Web Bluetooth API (not in TypeScript's default DOM types).
interface BtCharacteristic {
  properties: { notify: boolean; read: boolean };
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  stopNotifications(): Promise<BtCharacteristic>;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  addEventListener(type: string, listener: (e: unknown) => void): void;
  removeEventListener(type: string, listener: (e: unknown) => void): void;
}
interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BtService>;
}
interface BtDevice {
  gatt?: BtServer;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
interface BtApi {
  requestDevice(options: unknown): Promise<BtDevice>;
}

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as unknown as { bluetooth?: BtApi }).bluetooth;
}

// Real ESP32 link using Web Bluetooth (Chrome), matching PathGuard.ino.
export class WebBluetoothBLEManager implements BLEManager {
  private state: ConnectionState = 'disconnected';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private dataListeners = new Set<(r: DeviceReading) => void>();
  private device: BtDevice | null = null;
  private characteristic: BtCharacteristic | null = null;
  private settingsCharacteristic: BtCharacteristic | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private lastError: string | null = null;

  constructor(private bluetooth: BtApi | undefined = (typeof navigator !== 'undefined'
    ? (navigator as unknown as { bluetooth?: BtApi }).bluetooth
    : undefined)) {}

  getState(): ConnectionState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  // Opens the browser's device picker (must be called from a tap/click).
  scan(): void {
    if (this.state === 'scanning' || this.state === 'connecting') return;
    this.lastError = null;
    if (!this.bluetooth) {
      this.lastError = 'Web Bluetooth is not available in this browser. Use Chrome.';
      return;
    }
    this.setState('scanning');
    this.bluetooth
      .requestDevice({ acceptAllDevices: true, optionalServices: [PATHGUARD_SERVICE_UUID] })
      .then((device) => {
        this.device = device;
        this.setState('found');
      })
      .catch((e: unknown) => {
        // Closing the picker is normal, not an error.
        this.lastError = e instanceof Error && e.name === 'NotFoundError' ? null : String(e);
        this.setState('disconnected');
      });
  }

  connect(): void {
    if (this.state !== 'found' || !this.device?.gatt) return;
    const device = this.device;
    this.setState('connecting');
    device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    device
      .gatt!.connect()
      .then((server) => server.getPrimaryService(PATHGUARD_SERVICE_UUID))
      .then(async (service) => {
        // Settings characteristic is optional: older firmware may not have it.
        this.settingsCharacteristic = await service
          .getCharacteristic(PATHGUARD_SETTINGS_CHARACTERISTIC_UUID)
          .catch(() => null);
        return service.getCharacteristic(PATHGUARD_DISTANCE_CHARACTERISTIC_UUID);
      })
      .then(async (characteristic) => {
        this.characteristic = characteristic;
        if (characteristic.properties.notify) {
          characteristic.addEventListener('characteristicvaluechanged', this.handleValue);
          await characteristic.startNotifications();
        } else {
          this.poll = setInterval(() => {
            characteristic.readValue().then((v) => this.emit(v)).catch(() => undefined);
          }, POLL_INTERVAL_MS);
        }
        this.setState('connected');
      })
      .catch((e: unknown) => {
        this.lastError = `Could not connect: ${e instanceof Error ? e.message : String(e)}`;
        this.cleanup();
        this.setState('disconnected');
      });
  }

  disconnect(): void {
    this.cleanup();
    this.setState('disconnected');
  }

  // The firmware reads the first byte as "mode"; we send the sensitivity (1-10).
  async sendSettings(settings: DeviceSettings): Promise<void> {
    if (this.state !== 'connected' || !this.settingsCharacteristic) {
      throw new Error('Device is not connected.');
    }
    await this.settingsCharacteristic.writeValue(new Uint8Array([settings.sensitivity]));
  }

  onStateChange(listener: (s: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onData(listener: (r: DeviceReading) => void): Unsubscribe {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private handleValue = (e: unknown) => {
    const target = (e as { target?: BtCharacteristic }).target ?? this.characteristic;
    if (target?.value) this.emit(target.value);
  };

  private handleDisconnected = () => {
    this.cleanup();
    this.setState('disconnected');
  };

  private emit(view: DataView) {
    const bytes = Array.from({ length: view.byteLength }, (_, i) => view.getUint8(i));
    const distanceCm = parseDistanceCm(bytes);
    if (distanceCm === null) return;
    const reading: DeviceReading = { distanceCm, batteryPercent: null, timestamp: Date.now() };
    this.dataListeners.forEach((l) => l(reading));
    // The firmware goes quiet when nothing is within 150 cm: report "clear" after a pause.
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.dataListeners.forEach((l) =>
        l({ distanceCm: CLEAR_DISTANCE_CM, batteryPercent: null, timestamp: Date.now() }),
      );
    }, CLEAR_AFTER_MS);
  }

  private cleanup() {
    if (this.poll) clearInterval(this.poll);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.poll = null;
    this.clearTimer = null;
    this.settingsCharacteristic = null;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.characteristic = null;
  }

  private setState(next: ConnectionState) {
    this.state = next;
    this.stateListeners.forEach((l) => l(next));
  }
}
