import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt } from "node:crypto";

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export class WrongPinError extends Error {
  constructor() {
    super("Wrong PIN");
  }
}

function deriveKey(pin: string, salt: Buffer, serverSecret: string): Promise<Buffer> {
  const peppered = createHmac("sha256", serverSecret).update(pin).digest();
  return new Promise((resolve, reject) => {
    scrypt(peppered, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function seal(plaintext: string, pin: string, serverSecret: string): Promise<Buffer> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(pin, salt, serverSecret);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

export async function open(sealed: Uint8Array, pin: string, serverSecret: string): Promise<string> {
  const buf = Buffer.from(sealed);
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const body = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = await deriveKey(pin, salt, serverSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new WrongPinError();
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isWeakPin(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin) || pin === "1234" || pin === "4321";
}

const SERVER_ONLY = "server-held";

export function sealForServer(plaintext: string, serverSecret: string): Promise<Buffer> {
  return seal(plaintext, SERVER_ONLY, serverSecret);
}

export function openForServer(sealed: Uint8Array, serverSecret: string): Promise<string> {
  return open(sealed, SERVER_ONLY, serverSecret);
}
