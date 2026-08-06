import type { QueueEntry, QueueStorage } from './queue';

// M6M §5.2 — the browser's storage adapter: one IndexedDB object store of
// queue entries, keyed by entry_id. Everything above this file is pure and
// unit-tested; everything in this file is thin enough to verify by inspection
// plus the Playwright pass (a queued clock-in surviving a reload is the
// behavioural assertion).
//
// PHOTO BLOBS RIDE IN THE PAYLOAD. IndexedDB stores Blobs natively via
// structured clone, so a queued photo's bytes live in its entry and survive a
// reload. (They do NOT survive the user clearing site data — which is exactly
// why the CONFLICT store is a server table (§5.7) and only the not-yet-synced
// work is local.)

const DB_NAME = 'm6m-offline';
const STORE = 'queue';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'entry_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export class IdbStorage implements QueueStorage {
  private db: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.db) this.db = openDb();
    return this.db;
  }

  private tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.getDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const req = run(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        })
    );
  }

  async all(): Promise<QueueEntry[]> {
    const rows = await this.tx<unknown[]>('readonly', (s) => s.getAll() as IDBRequest<unknown[]>);
    return rows as QueueEntry[];
  }

  async put(entry: QueueEntry): Promise<void> {
    await this.tx('readwrite', (s) => s.put(entry));
  }

  async remove(entryId: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(entryId));
  }
}
