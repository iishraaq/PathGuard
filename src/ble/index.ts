import { MockBLEManager } from './MockBLEManager';
import { WebBluetoothBLEManager, webBluetoothAvailable } from './WebBluetoothBLEManager';
import type { BLEManager } from './types';

// The one device link the whole app uses. Default is the simulator.
// Open the web app with ?ble=real (Chrome) to talk to the real ESP32 instead.
const useReal =
  typeof window !== 'undefined' &&
  webBluetoothAvailable() &&
  new URLSearchParams(window.location.search).get('ble') === 'real';

export const bleManager: BLEManager = useReal ? new WebBluetoothBLEManager() : new MockBLEManager();

export type { BLEManager, ConnectionState, DeviceReading, DeviceSettings } from './types';
