const DB_NAME = 'opsvault-offline';
const DB_VERSION = 1;

export interface PendingMutation {
  id?: number;
  action: 'create' | 'update' | 'delete';
  uuid: string;
  payload?: unknown;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pending_mutations')) {
        db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const offlineCache = {
  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key, value });
    await txDone(tx);
    db.close();
  },

  async getMeta(key: string): Promise<unknown> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result?.value ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async addPendingMutation(mutation: Omit<PendingMutation, 'id'>): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('pending_mutations', 'readwrite');
    tx.objectStore('pending_mutations').add(mutation);
    await txDone(tx);
    db.close();
  },

  async getPendingMutations(): Promise<PendingMutation[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const req = tx.objectStore('pending_mutations').getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result as PendingMutation[]);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async clearPendingMutation(id: number): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('pending_mutations', 'readwrite');
    tx.objectStore('pending_mutations').delete(id);
    await txDone(tx);
    db.close();
  },

  async clearAllPending(): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('pending_mutations', 'readwrite');
    tx.objectStore('pending_mutations').clear();
    await txDone(tx);
    db.close();
  },
};
