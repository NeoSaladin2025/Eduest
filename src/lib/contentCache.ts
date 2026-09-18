/**
 * Eduest 문항/해설 초고속 영구 로컬 캐시 (IndexedDB 기반)
 * 새로고침하거나 브라우저를 다시 켜도 즉시(0ms) 로드되도록 지원합니다.
 */

const DB_NAME = 'eduest_content_store';
const DB_VERSION = 1;
const STORE_NAME = 'file_cache';

const memoryFallback = new Map<string, string>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getCachedContent(key: string): Promise<string | null> {
  if (memoryFallback.has(key)) {
    return memoryFallback.get(key)!;
  }

  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const val = req.result;
        if (val) memoryFallback.set(key, val);
        resolve(val || null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedContent(key: string, data: string): Promise<void> {
  memoryFallback.set(key, data);

  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
