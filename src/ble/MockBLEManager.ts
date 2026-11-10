import type {
  BLEManager,
  ConnectionState,
  DeviceReading,
  DeviceSettings,
  Unsubscribe,
} from './types';

export interface MockOptions {
  scanDelayMs?: number;
  connectDelayMs?: number;
  tickMs?: number;
}

// Simulated device for demos and tests: no hardware or Bluetooth needed.
// Distance sweeps between ~30 cm and ~300 cm so the pulse rate visibly changes.
export class MockBLEManager implements BLEManager {
  private state: ConnectionState = 'disconnected';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private dataListeners = new Set<(r: DeviceReading) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private demoDistanceCm: number | null = null;

  readonly lastSettings: DeviceSettings[] = [];

  private scanDelayMs: number;
  private connectDelayMs: number;
  private tickMs: number;

  constructor(options: MockOptions = {}) {
    this.scanDelayMs = options.scanDelayMs ?? 1500;
    this.connectDelayMs = options.connectDelayMs ?? 1000;
    this.tickMs = options.tickMs ?? 600;
  }

  getState(): ConnectionState {
    return this.state;
  }

  scan(): void {
    if (this.state === 'scanning' || this.state === 'connecting') return;
    this.setState('scanning');
    this.after(this.scanDelayMs, () => this.setState('found'));
  }

  connect(): void {
    if (this.state !== 'found') return; // can only connect after a scan finds a device
    this.setState('connecting');
    this.after(this.connectDelayMs, () => {
      this.setState('connected');
      this.startStreaming();
    });
  }

  disconnect(): void {
    this.clearTimers();
    this.demoDistanceCm = null;
    this.setState('disconnected');
  }

  // Demo control: hold the distance at a fixed value (null resumes the sweep).
  setDemoDistanceCm(cm: number | null): void {
    this.demoDistanceCm = cm;
  }

  async sendSettings(settings: DeviceSettings): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('Device is not connected.');
    }
    this.lastSettings.push(settings);
  }

  onStateChange(listener: (s: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onData(listener: (r: DeviceReading) => void): Unsubscribe {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private setState(next: ConnectionState) {
    this.state = next;
    this.stateListeners.forEach((l) => l(next));
  }

  private after(ms: number, fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  private startStreaming() {
    this.tick = 0;
    this.ticker = setInterval(() => {
      this.tick += 1;
      const distanceCm =
        this.demoDistanceCm ?? Math.round(165 + 135 * Math.sin(this.tick / 4));
      const reading: DeviceReading = {
        distanceCm,
        batteryPercent: 78,
        timestamp: Date.now(),
      };
      this.dataListeners.forEach((l) => l(reading));
    }, this.tickMs);
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    this.timer = null;
    this.ticker = null;
  }
}
