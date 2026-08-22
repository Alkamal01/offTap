import { OfflineSignaturePacket } from '@/lib/security/HardwareSecurityBridge';

/**
 * Payload codec shared by both transports: the compact wire shape for a signed
 * offline payment, and the chunk framing used to fit it inside a single BLE
 * characteristic write (see BleTransportService.ts for the actual radio I/O).
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

  public static verifyIncomingSignature(packet: OfflineSignaturePacket): boolean {
    return Boolean(packet.signatureR) && Boolean(packet.signatureS) && packet.nonce > 0;
  }
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

/**
 * Splits a serialized payload into `[chunkIndex][totalChunks][...utf8 bytes]`
 * hex frames, each sized to fit one BLE characteristic write.
 */
export function chunkPayload(serialized: string, chunkPayloadBytes: number): string[] {
  const dataBytes = Array.from(new TextEncoder().encode(serialized));
  const totalChunks = Math.max(1, Math.ceil(dataBytes.length / chunkPayloadBytes));
  const chunks: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = dataBytes.slice(i * chunkPayloadBytes, (i + 1) * chunkPayloadBytes);
    chunks.push(bytesToHex([i, totalChunks, ...slice]));
  }
  return chunks;
}

/** Reassembles chunks written by `chunkPayload`, by index, into the original serialized string. */
export class ChunkReassembler {
  private chunks = new Map<number, number[]>();
  private total: number | null = null;

  /** Feeds one hex chunk in; returns the reassembled serialized payload once all chunks have arrived. */
  public addChunk(hex: string): string | null {
    const [index, total, ...data] = hexToBytes(hex);
    this.total = total;
    this.chunks.set(index, data);

    if (this.chunks.size < total) return null;

    const all: number[] = [];
    for (let i = 0; i < total; i++) all.push(...(this.chunks.get(i) ?? []));
    this.reset();
    return new TextDecoder().decode(new Uint8Array(all));
  }

  public reset(): void {
    this.chunks.clear();
    this.total = null;
  }
}
