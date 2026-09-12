/**
 * Photo storage on IndexedDB.
 *
 * Photos used to live inside the rounds JSON in localStorage as base64 data
 * URLs, which is the worst possible place for them: Safari caps localStorage
 * at 5MB per origin, base64 inflates binary by ~33%, and localStorage stores
 * strings as UTF-16 (2 bytes per character) — so a 300KB photo ate ~800KB of
 * a 5MB budget. IndexedDB stores the same photo as a 300KB binary Blob, and
 * a home screen web app gets a quota measured in gigabytes.
 */

const DB_NAME = 'haksu-golf';
const DB_VERSION = 1;
const STORE = 'photos';

let dbPromise = null;

export function isSupported() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!isSupported()) {
      reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB 접근이 차단되었습니다.'));
  });
  return dbPromise;
}

function runTx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장소 트랜잭션이 중단되었습니다.'));
  }));
}

export function putPhoto(id, blob) {
  return runTx('readwrite', (store) => store.put(blob, id));
}

export function getPhoto(id) {
  return runTx('readonly', (store) => store.get(id));
}

export function deletePhoto(id) {
  return runTx('readwrite', (store) => store.delete(id));
}

export function getAllPhotoIds() {
  return runTx('readonly', (store) => store.getAllKeys());
}

// --- Object URL cache -------------------------------------------------
// Rendering re-runs on every state change, so creating a fresh object URL
// per render would leak one per render. Cache them per round id and revoke
// only when the photo actually changes or goes away.

const urlCache = new Map();

export async function getPhotoUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getPhoto(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function releasePhotoUrl(id) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

/**
 * Total origin storage usage/quota (covers IndexedDB, Cache API and the
 * service worker's cached app shell). Returns null when the browser doesn't
 * expose it, so callers can fall back to a localStorage-only estimate.
 */
export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || !quota) return null;
    return { usage, quota };
  } catch (e) {
    console.error('storage estimate failed', e);
    return null;
  }
}
