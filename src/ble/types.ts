// Contract between the app screens and the device link (BLEManager, Section 4.2).
// Screens only talk to this interface, so the mock can be swapped for a real
// Bluetooth implementation without touching any UI code.

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'found'
  | 'connecting'
  | 'connected';

// One telemetry packet from the device (HardwareBLEService.sendTelemetry).
export interface DeviceReading {
  distanceCm: number;
  batteryPercent: number | null; // null when the device does not report battery yet
  timestamp: number;
}

// Settings pushed to the device (HardwareBLEService.receiveSettings).
export interface DeviceSettings {
  sensitivity: number; // 1-10 (FR-5)
}

export type Unsubscribe = () => void;

export interface BLEManager {
  getState(): ConnectionState;
  scan(): void;
  connect(): void;
  disconnect(): void;
  sendSettings(settings: DeviceSettings): Promise<void>;
  onStateChange(listener: (state: ConnectionState) => void): Unsubscribe;
  onData(listener: (reading: DeviceReading) => void): Unsubscribe;
  // Demo-only: the simulator implements this; a real device does not.
  // Pass a distance in cm to hold the reading there, or null to resume the sweep.
  setDemoDistanceCm?(cm: number | null): void;
}
