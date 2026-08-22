import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import type * as BluetoothModule from 'munim-bluetooth';
import type { BLEDevice } from 'munim-bluetooth';
import { CompactPayload, LocalTransportService, chunkPayload, ChunkReassembler } from './LocalTransportService';

/**
 * BLE transport. Pay (payer) is the BLE central: it scans for a nearby OffTap
 * peripheral, connects, and writes the signed payload. Receive (merchant) is
 * the BLE peripheral: it advertises the OffTap service and accepts writes.
 *
 * Real BLE requires native code (munim-bluetooth + react-native-nitro-modules),
 * which only exists in a custom dev-client build — never in Expo Go, never on
 * web. When that native module isn't available, this service transparently
 * falls back to a simulated transport that walks through the exact same status
 * sequence (scanning → connecting → sending / advertising → receiving) with
 * realistic pacing, so the UI and UX are identical either way — only the radio
 * is fake. `isNativeAvailable()` lets the UI show that distinction if it wants to.
 */

export const OFFTAP_SERVICE_UUID = '26d698ce-5e68-43b9-b38a-fc1662745e8a';
export const OFFTAP_PAYLOAD_CHAR_UUID = '966d76ff-957f-4638-a341-7f71096aee19';

const SCAN_TIMEOUT_MS = 8000;
const DEFAULT_CHUNK_PAYLOAD_BYTES = 18; // safe floor under the default 20-byte ATT MTU
const SIMULATED_PAYER_ADDRESS = '0x2546BcD3c84621e976D8185a91A922aE77ECEc3';

export type BleStatus = 'scanning' | 'connecting' | 'sending' | 'advertising' | 'receiving';

export function statusLabel(status: BleStatus): string {
  switch (status) {
    case 'scanning':
      return 'Scanning for nearby device…';
    case 'connecting':
      return 'Connecting…';
    case 'sending':
      return 'Sending payment…';
    case 'advertising':
      return 'Listening for a tap…';
    case 'receiving':
      return 'Receiving payment…';
  }
}

let Bluetooth: typeof BluetoothModule | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Bluetooth = require('munim-bluetooth');
  } catch {
    Bluetooth = null;
  }
}

export function isNativeAvailable(): boolean {
  return Bluetooth !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scanForOffTapDevice(bt: typeof BluetoothModule): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (deviceId: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeListener();
      bt.stopScan();
      resolve(deviceId);
    };
    const removeListener = bt.addDeviceFoundListener((device: BLEDevice) => finish(device.id));
    const timer = setTimeout(() => finish(null), SCAN_TIMEOUT_MS);
    bt.startScan({ serviceUUIDs: [OFFTAP_SERVICE_UUID], allowDuplicates: false });
  });
}

async function sendPayloadReal(
  bt: typeof BluetoothModule,
  payload: CompactPayload,
  onStatus?: (status: BleStatus) => void
): Promise<boolean> {
  const granted = await bt.requestBluetoothPermission(['scan', 'connect']);
  if (!granted) throw new Error('Bluetooth permission was not granted.');

  const enabled = await bt.isBluetoothEnabled();
  if (!enabled) throw new Error('Turn on Bluetooth to pay.');

  onStatus?.('scanning');
  const deviceId = await scanForOffTapDevice(bt);
  if (!deviceId) {
    throw new Error('No nearby OffTap device found. Make sure Receive is open on the other phone.');
  }

  onStatus?.('connecting');
  await bt.connect(deviceId);
  try {
    await bt.discoverServices(deviceId);

    let chunkPayloadBytes = DEFAULT_CHUNK_PAYLOAD_BYTES;
    if (Platform.OS === 'android') {
      try {
        const mtu = await bt.requestMTU(deviceId, 247);
        chunkPayloadBytes = Math.max(DEFAULT_CHUNK_PAYLOAD_BYTES, mtu - 3 - 2);
      } catch {
        // Negotiation not supported here — keep the safe default chunk size.
      }
    }

    onStatus?.('sending');
    const serialized = LocalTransportService.serializePayload(payload);
    const chunks = chunkPayload(serialized, chunkPayloadBytes);
    for (const chunk of chunks) {
      await bt.writeCharacteristic(deviceId, OFFTAP_SERVICE_UUID, OFFTAP_PAYLOAD_CHAR_UUID, chunk, 'write');
    }
    return true;
  } finally {
    bt.disconnect(deviceId);
  }
}

async function sendPayloadSimulated(onStatus?: (status: BleStatus) => void): Promise<boolean> {
  onStatus?.('scanning');
  await delay(1100);
  onStatus?.('connecting');
  await delay(700);
  onStatus?.('sending');
  await delay(900);
  return true;
}

async function startListeningReal(
  bt: typeof BluetoothModule,
  onPayloadReceived: (payload: CompactPayload) => void,
  onStatus?: (status: BleStatus) => void
): Promise<void> {
  const granted = await bt.requestBluetoothPermission(['advertise', 'connect']);
  if (!granted) throw new Error('Bluetooth permission was not granted.');

  const enabled = await bt.isBluetoothEnabled();
  if (!enabled) throw new Error('Turn on Bluetooth to receive.');

  reassembler.reset();

  bt.setServices([
    {
      uuid: OFFTAP_SERVICE_UUID,
      characteristics: [
        {
          uuid: OFFTAP_PAYLOAD_CHAR_UUID,
          properties: ['write', 'writeWithoutResponse'],
        },
      ],
    },
  ]);

  removeWriteListener?.();
  removeWriteListener = bt.addEventListener('peripheralWriteRequest', ({ value }) => {
    const complete = reassembler.addChunk(value);
    if (complete) {
      onStatus?.('receiving');
      onPayloadReceived(LocalTransportService.deserializePayload(complete));
    }
  });

  onStatus?.('advertising');
  bt.startAdvertising({ serviceUUIDs: [OFFTAP_SERVICE_UUID], localName: 'OffTap' });
}

export class BleTransportService {
  /** Central role (Pay): scan, connect, and write the signed payload to a nearby OffTap peripheral. */
  public static async sendPayload(
    payload: CompactPayload,
    onStatus?: (status: BleStatus) => void
  ): Promise<boolean> {
    return Bluetooth ? sendPayloadReal(Bluetooth, payload, onStatus) : sendPayloadSimulated(onStatus);
  }

  /** Peripheral role (Receive): advertise the OffTap service and reassemble incoming writes. */
  public static async startListening(
    onPayloadReceived: (payload: CompactPayload) => void,
    onStatus?: (status: BleStatus) => void
  ): Promise<void> {
    if (Bluetooth) {
      await startListeningReal(Bluetooth, onPayloadReceived, onStatus);
      return;
    }
    // Simulated peripheral: just register the callbacks and announce "advertising".
    // A real incoming tap has no counterpart here, so the UI triggers it manually
    // via simulateIncomingTap() while listening.
    simulatedListener = { onPayloadReceived, onStatus };
    onStatus?.('advertising');
  }

  public static stopListening(): void {
    simulatedListener = null;
    if (!Bluetooth) return;
    Bluetooth.stopAdvertising();
    removeWriteListener?.();
    removeWriteListener = null;
    reassembler.reset();
  }

  /** Simulated-mode only: fabricates a signed incoming tap from a nearby payer. */
  public static async simulateIncomingTap(merchantAddress: string): Promise<void> {
    if (!simulatedListener) return;
    const { onPayloadReceived, onStatus } = simulatedListener;
    onStatus?.('receiving');
    await delay(800);

    const nonce = ++simulatedNonceCounter;
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${SIMULATED_PAYER_ADDRESS}:${merchantAddress}:${nonce}`
    );
    onPayloadReceived({
      user: SIMULATED_PAYER_ADDRESS,
      merchant: merchantAddress,
      amount: '10',
      nonce,
      r: '0x' + digest.substring(0, 32),
      s: '0x' + digest.substring(32, 64),
    });
  }
}

const reassembler = new ChunkReassembler();
let removeWriteListener: (() => void) | null = null;
let simulatedListener: {
  onPayloadReceived: (payload: CompactPayload) => void;
  onStatus?: (status: BleStatus) => void;
} | null = null;
let simulatedNonceCounter = 0;
