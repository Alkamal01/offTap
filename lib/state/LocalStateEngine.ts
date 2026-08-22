import * as SecureStore from '@/lib/storage/secureStorage';
import * as SQLite from 'expo-sqlite';
import { CompactPayload } from '@/lib/transport/LocalTransportService';

/**
 * Local state persistence. Sensitive wallet/key state lives in expo-secure-store
 * (iOS Keychain / Android Keystore — real hardware-backed encryption at rest).
 * The offline transaction queue lives in a real local SQLite database, mirroring
 * the spec's "encrypted storage wrapper" role without reinventing SQLCipher.
 */

const WALLET_STATE_KEY = 'offtap.wallet_state';
const DB_NAME = 'offtap_local_state.db';

export interface WalletState {
  address: string;
  onlineBalance: number;
  offlineBalance: number;
  hardwareX: string;
  hardwareY: string;
  recoveryAddress: string;
}

export interface QueuedTransaction extends CompactPayload {
  id: number;
  status: 'pending' | 'settled';
  createdAt: number;
}

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS transaction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        merchant TEXT NOT NULL,
        amount TEXT NOT NULL,
        nonce INTEGER NOT NULL,
        r TEXT NOT NULL,
        s TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export class LocalStateEngine {
  public static async initializeStorage(state: WalletState): Promise<void> {
    await SecureStore.setItemAsync(WALLET_STATE_KEY, JSON.stringify(state));
    await getDb();
  }

  public static async getWalletState(): Promise<WalletState | null> {
    const raw = await SecureStore.getItemAsync(WALLET_STATE_KEY);
    return raw ? (JSON.parse(raw) as WalletState) : null;
  }

  public static async updateBalances(online: number, offline: number): Promise<WalletState | null> {
    const current = await this.getWalletState();
    if (!current) return null;
    const next: WalletState = { ...current, onlineBalance: online, offlineBalance: offline };
    await SecureStore.setItemAsync(WALLET_STATE_KEY, JSON.stringify(next));
    return next;
  }

  public static async clearWalletState(): Promise<void> {
    await SecureStore.deleteItemAsync(WALLET_STATE_KEY);
    const database = await getDb();
    await database.execAsync('DELETE FROM transaction_queue;');
  }

  public static async queueInboundOfflinePayment(tx: CompactPayload): Promise<void> {
    const database = await getDb();
    await database.runAsync(
      `INSERT INTO transaction_queue (user, merchant, amount, nonce, r, s, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?);`,
      [tx.user, tx.merchant, tx.amount, tx.nonce, tx.r, tx.s, Date.now()]
    );
  }

  public static async getPendingSyncQueue(): Promise<QueuedTransaction[]> {
    const database = await getDb();
    return database.getAllAsync<QueuedTransaction>(
      `SELECT * FROM transaction_queue WHERE status = 'pending' ORDER BY createdAt ASC;`
    );
  }

  public static async getSettledHistory(): Promise<QueuedTransaction[]> {
    const database = await getDb();
    return database.getAllAsync<QueuedTransaction>(
      `SELECT * FROM transaction_queue WHERE status = 'settled' ORDER BY createdAt DESC LIMIT 20;`
    );
  }

  public static async markQueueSettled(): Promise<void> {
    const database = await getDb();
    await database.runAsync(`UPDATE transaction_queue SET status = 'settled' WHERE status = 'pending';`);
  }
}
