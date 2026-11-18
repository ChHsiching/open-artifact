/**
 * The little of IndexedDB the page's local stores need: one object store per database, opened once. Every failure is
 * an answer of `null` (no IndexedDB, a private window that refuses it, a blocked upgrade): the caller goes on without
 * a local copy.
 */

const opened = new Map<string, Promise<IDBDatabase | null>>();

/** How long opening may take before the page gives up on the local store (a blocked upgrade never settles). */
const OPEN_WAIT_MS = 3000;

export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** The database `name` with its one object store `store`, keyed by `keyPath`. */
export function openStore(name: string, store: string, keyPath: string | string[]): Promise<IDBDatabase | null> {
  const known = opened.get(name);
  if (known) return known;
  const made = new Promise<IDBDatabase | null>(resolve => {
    if (!hasIndexedDb()) return resolve(null);
    const timer = setTimeout(() => resolve(null), OPEN_WAIT_MS);
    const done = (db: IDBDatabase | null) => {
      clearTimeout(timer);
      resolve(db);
    };
    try {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath });
        } catch {
          // The open fails on its own below.
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another page wants a newer version: let it have it.
        db.onversionchange = () => {
          db.close();
          opened.delete(name);
        };
        done(db);
      };
      request.onerror = () => done(null);
      request.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  opened.set(name, made);
  return made;
}

/** A request's result once it succeeds. */
export function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolves once a transaction committed, rejects when it aborted. */
export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}
