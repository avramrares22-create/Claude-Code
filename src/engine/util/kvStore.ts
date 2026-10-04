/** Tiny IndexedDB key-value store with TTL. Fails soft (returns null) when IDB is unavailable. */

const DB = 'nature-engine';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function kvGet<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const d = await db();
    const rec = await new Promise<{ t: number; v: T } | undefined>((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return rec && Date.now() - rec.t < maxAgeMs ? rec.v : null;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, v: T): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ t: Date.now(), v }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal: data is just refetched next time.
  }
}
