// Tiny IndexedDB wrapper. Everything stays on the device and survives
// going offline, locking the phone and closing the app.

export type Speaker = "me" | "them";

export type Entry = {
  id: string;
  ts: number;
  speaker: Speaker;
  from: string;
  to: string;
  source: string;
  translation: string;
  audio?: Blob; // cached TTS so replay works offline
  starred?: boolean;
};

export type PhraseCache = {
  key: string; // `${from}>${to}:${text}`
  translation: string;
  audio?: Blob;
};

const DB_NAME = "ciao";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "id" }).createIndex("ts", "ts");
      }
      if (!db.objectStoreNames.contains("phrases")) {
        db.createObjectStore("phrases", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
      })
  );
}

export const db = {
  allEntries: () =>
    tx<Entry[]>("entries", "readonly", (s) => s.index("ts").getAll()).catch(() => [] as Entry[]),
  putEntry: (e: Entry) => tx("entries", "readwrite", (s) => s.put(e)),
  deleteEntry: (id: string) => tx("entries", "readwrite", (s) => s.delete(id)),
  clearEntries: () => tx("entries", "readwrite", (s) => s.clear()),
  getPhrase: (key: string) =>
    tx<PhraseCache | undefined>("phrases", "readonly", (s) => s.get(key)).catch(() => undefined),
  putPhrase: (p: PhraseCache) => tx("phrases", "readwrite", (s) => s.put(p)),
};

/** Ask the browser not to evict our data under storage pressure. */
export async function persistStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {}
}
