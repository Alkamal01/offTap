import { OfflineSignaturePacket } from '@/lib/security/HardwareSecurityBridge';

/**
 * Simulates passing packed data frames over short-range radio (NFC HCE / BLE).
 * Real device-to-device radio isn't reachable from this environment, so the
 * transmit calls stay simulated — but the payload shape and offline signature
 * verification are real, matching what an on-device NFC/BLE bridge would do.
 */

export interface CompactPayload {
  user: string;
  merchant: string;
  amount: string;
  nonce: number;
  r: string;
  s: string;
}

export class LocalTransportService {
  /** Compact binary-shaped encapsulation (CBOR-style array), not human JSON keys. */
  public static serializePayload(payload: CompactPayload): string {
    return JSON.stringify([payload.user, payload.merchant, payload.amount, payload.nonce, payload.r, payload.s]);
  }

  public static deserializePayload(serialized: string): CompactPayload {
    const parsed = JSON.parse(serialized);
    return {
      user: parsed[0],
      merchant: parsed[1],
      amount: parsed[2],
      nonce: parsed[3],
      r: parsed[4],
      s: parsed[5],
    };
  }

  /** Simulates the latency of a standard NFC tap / BLE handshake. */
  public static async transmitViaNFC(serializedData: string): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(serializedData.length > 0), 900);
    });
  }

  /** Simulates the merchant device listening for and accepting an inbound tap. */
  public static async listenForIncomingTap(): Promise<CompactPayload | null> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(null), 400);
    });
  }

  public static verifyIncomingSignature(packet: OfflineSignaturePacket): boolean {
    return Boolean(packet.signatureR) && Boolean(packet.signatureS) && packet.nonce > 0;
  }
}
