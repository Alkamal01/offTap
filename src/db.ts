import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type User = {
  phone: string;
  nwcSealed: Uint8Array;
  lnAddress: string | null;
  failedPins: number;
  lockedUntil: number;
  managedSealed: Uint8Array | null;
};

export type PaymentStatus = "pending" | "paid" | "failed";

export type Contact = { name: string; recipient: string };

export type SmsRecord = { id: number; phone: string; message: string; createdAt: number };

const MAX_PIN_ATTEMPTS = 3;
const LOCK_MS = 60 * 60 * 1000;
const LINK_CODE_MS = 15 * 60 * 1000;
export const MAX_CONTACTS = 20;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  nwc_sealed BLOB NOT NULL,
  ln_address TEXT,
  failed_pins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS link_codes (
  code TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_ngn REAL NOT NULL,
  sats INTEGER NOT NULL,
  fees_sats INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_hash TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_phone_time ON payments (phone, created_at);
CREATE TABLE IF NOT EXISTS contacts (
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  recipient TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner, name)
);
CREATE TABLE IF NOT EXISTS sms_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA);
    const columns = this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "managed_sealed")) this.db.exec("ALTER TABLE users ADD COLUMN managed_sealed BLOB");
  }

  close(): void {
    this.db.close();
  }

  getUser(phone: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as
      | {
          phone: string;
          nwc_sealed: Uint8Array;
          ln_address: string | null;
          failed_pins: number;
          locked_until: number;
          managed_sealed: Uint8Array | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      phone: row.phone,
      nwcSealed: row.nwc_sealed,
      lnAddress: row.ln_address,
      failedPins: row.failed_pins,
      lockedUntil: row.locked_until,
      managedSealed: row.managed_sealed,
    };
  }

  saveUser(
    phone: string,
    nwcSealed: Uint8Array,
    lnAddress: string | null,
    managedSealed: Uint8Array | null = null,
    now = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO users (phone, nwc_sealed, ln_address, managed_sealed, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(phone) DO UPDATE SET nwc_sealed = excluded.nwc_sealed, ln_address = excluded.ln_address,
           managed_sealed = excluded.managed_sealed, failed_pins = 0, locked_until = 0`,
      )
      .run(phone, nwcSealed, lnAddress, managedSealed, now);
  }

  isLocked(user: User, now = Date.now()): boolean {
    return user.lockedUntil > now;
  }

  recordWrongPin(phone: string, now = Date.now()): number {
    const user = this.getUser(phone);
    if (!user) return 0;
    const failed = user.failedPins + 1;
    if (failed >= MAX_PIN_ATTEMPTS) {
      this.db.prepare("UPDATE users SET failed_pins = 0, locked_until = ? WHERE phone = ?").run(now + LOCK_MS, phone);
      return 0;
    }
    this.db.prepare("UPDATE users SET failed_pins = ? WHERE phone = ?").run(failed, phone);
    return MAX_PIN_ATTEMPTS - failed;
  }

  clearWrongPins(phone: string): void {
    this.db.prepare("UPDATE users SET failed_pins = 0, locked_until = 0 WHERE phone = ?").run(phone);
  }

  createLinkCode(phone: string, now = Date.now()): string {
    this.db.prepare("DELETE FROM link_codes WHERE phone = ? OR expires_at < ?").run(phone, now);
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const taken = this.db.prepare("SELECT 1 FROM link_codes WHERE code = ?").get(code);
      if (taken) continue;
      this.db.prepare("INSERT INTO link_codes (code, phone, expires_at) VALUES (?, ?, ?)").run(code, phone, now + LINK_CODE_MS);
      return code;
    }
  }

  phoneForLinkCode(code: string, now = Date.now()): string | undefined {
    const row = this.db.prepare("SELECT phone FROM link_codes WHERE code = ? AND expires_at >= ?").get(code, now) as
      | { phone: string }
      | undefined;
    return row?.phone;
  }

  consumeLinkCode(code: string): void {
    this.db.prepare("DELETE FROM link_codes WHERE code = ?").run(code);
  }

  createPayment(p: { phone: string; recipient: string; amountNgn: number; sats: number }, now = Date.now()): number {
    const result = this.db
      .prepare("INSERT INTO payments (phone, recipient, amount_ngn, sats, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
      .run(p.phone, p.recipient, p.amountNgn, p.sats, now);
    return Number(result.lastInsertRowid);
  }

  finishPayment(id: number, status: PaymentStatus, details: { paymentHash?: string; feesSats?: number; error?: string }): void {
    this.db
      .prepare("UPDATE payments SET status = ?, payment_hash = ?, fees_sats = ?, error = ? WHERE id = ?")
      .run(status, details.paymentHash ?? null, details.feesSats ?? 0, details.error ?? null, id);
  }

  satsSpentSince(phone: string, since: number): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(sats), 0) AS total FROM payments WHERE phone = ? AND created_at >= ? AND status != 'failed'")
      .get(phone, since) as { total: number };
    return row.total;
  }

  paymentStatus(id: number): PaymentStatus | undefined {
    const row = this.db.prepare("SELECT status FROM payments WHERE id = ?").get(id) as { status: PaymentStatus } | undefined;
    return row?.status;
  }

  saveContact(owner: string, name: string, recipient: string, now = Date.now()): boolean {
    const existing = this.contacts(owner);
    if (existing.length >= MAX_CONTACTS && !existing.some((c) => c.name === name)) return false;
    this.db
      .prepare(
        `INSERT INTO contacts (owner, name, recipient, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(owner, name) DO UPDATE SET recipient = excluded.recipient`,
      )
      .run(owner, name, recipient, now);
    return true;
  }

  contacts(owner: string): Contact[] {
    return this.db.prepare("SELECT name, recipient FROM contacts WHERE owner = ? ORDER BY name").all(owner) as Contact[];
  }

  deleteContact(owner: string, name: string): void {
    this.db.prepare("DELETE FROM contacts WHERE owner = ? AND name = ?").run(owner, name);
  }

  addSms(phone: string, message: string, now = Date.now()): void {
    this.db.prepare("INSERT INTO sms_outbox (phone, message, created_at) VALUES (?, ?, ?)").run(phone, message, now);
  }

  smsFor(phone: string, limit = 10): SmsRecord[] {
    const rows = this.db
      .prepare("SELECT id, phone, message, created_at FROM sms_outbox WHERE phone = ? ORDER BY id DESC LIMIT ?")
      .all(phone, limit) as { id: number; phone: string; message: string; created_at: number }[];
    return rows.map((r) => ({ id: r.id, phone: r.phone, message: r.message, createdAt: r.created_at }));
  }
}
