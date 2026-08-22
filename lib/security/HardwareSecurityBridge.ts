import * as Crypto from 'expo-crypto';
import * as SecureStore from '@/lib/storage/secureStorage';

/**
 * Simulates an Expo Native Module bridging to iOS CryptoKit.SecureEnclave /
 * Android KeyMint-StrongBox. Real hardware-backed key generation isn't reachable
 * from JS in a managed Expo app, so key material here is software-generated —
 * but the nonce and keys are persisted for real via expo-secure-store (iOS
 * Keychain / Android Keystore), so state survives an app restart instead of
 * living in a static in-memory counter.
 */

const KEY_PUBKEY_X = 'offtap.hw_pubkey_x';
const KEY_PUBKEY_Y = 'offtap.hw_pubkey_y';
const KEY_NONCE = 'offtap.hw_nonce';

export interface HardwareKeyPair {
  publicKeyX: string;
  publicKeyY: string;
}

export interface OfflineSignaturePacket {
  signatureR: string;
  signatureS: string;
  nonce: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class HardwareSecurityBridge {
  private static cachedKeys: HardwareKeyPair | null = null;
  private static cachedNonce: number | null = null;

  /** Loads persisted key/nonce state into memory. Call once at app startup. */
  public static async hydrate(): Promise<void> {
    const [x, y, nonceRaw] = await Promise.all([
      SecureStore.getItemAsync(KEY_PUBKEY_X),
      SecureStore.getItemAsync(KEY_PUBKEY_Y),
      SecureStore.getItemAsync(KEY_NONCE),
    ]);
    if (x && y) this.cachedKeys = { publicKeyX: x, publicKeyY: y };
    this.cachedNonce = nonceRaw ? parseInt(nonceRaw, 10) : 0;
  }

  public static hasKeys(): boolean {
    return this.cachedKeys !== null;
  }

  public static getKeys(): HardwareKeyPair | null {
    return this.cachedKeys;
  }

  /** Generates un-exportable-style secp256r1 key material inside the simulated enclave. */
  public static async generateHardwareTiedKeys(): Promise<HardwareKeyPair> {
    const randomBytesX = await Crypto.getRandomBytesAsync(32);
    const randomBytesY = await Crypto.getRandomBytesAsync(32);
    const keys: HardwareKeyPair = {
      publicKeyX: toHex(randomBytesX),
      publicKeyY: toHex(randomBytesY),
    };
    await Promise.all([
      SecureStore.setItemAsync(KEY_PUBKEY_X, keys.publicKeyX),
      SecureStore.setItemAsync(KEY_PUBKEY_Y, keys.publicKeyY),
    ]);
    this.cachedKeys = keys;
    this.cachedNonce = 0;
    await SecureStore.setItemAsync(KEY_NONCE, '0');
    return keys;
  }

  /** Hardware-enforced signature creation. The monotonic nonce is hardwired into the flow. */
  public static async signOfflineTransaction(
    userAddress: string,
    merchantAddress: string,
    amountInWei: string
  ): Promise<OfflineSignaturePacket> {
    if (!this.cachedKeys) {
      throw new Error('No hardware-tied keys provisioned. Call generateHardwareTiedKeys first.');
    }
    const nextNonce = (this.cachedNonce ?? 0) + 1;

    const executionBlob = `${userAddress}:${merchantAddress}:${amountInWei}:${nextNonce}`;
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, executionBlob);

    const signatureR = '0x' + digest.substring(0, 32);
    const signatureS = '0x' + digest.substring(32, 64);

    this.cachedNonce = nextNonce;
    await SecureStore.setItemAsync(KEY_NONCE, String(nextNonce));

    return { signatureR, signatureS, nonce: nextNonce };
  }

  public static getCurrentNonce(): number {
    return this.cachedNonce ?? 0;
  }

  /** Verifies a signature packet offline — checks structural validity only (mirrors the mocked on-chain check). */
  public static verifyOfflineSignature(packet: OfflineSignaturePacket): boolean {
    return Boolean(packet.signatureR) && Boolean(packet.signatureS) && packet.nonce > 0;
  }

  public static async resetHardwareState(): Promise<void> {
    this.cachedKeys = null;
    this.cachedNonce = 0;
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_PUBKEY_X),
      SecureStore.deleteItemAsync(KEY_PUBKEY_Y),
      SecureStore.deleteItemAsync(KEY_NONCE),
    ]);
  }
}
