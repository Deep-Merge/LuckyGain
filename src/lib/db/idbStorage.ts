const IDB_NAME = "luckygain";
const IDB_STORE = "sqlite";
const IDB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE);
      }
      if (!database.objectStoreNames.contains("goods_media")) {
        database.createObjectStore("goods_media");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

export async function idbGetBytes(key: string): Promise<Uint8Array | null> {
  const database = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const value = req.result;
        if (value == null) {
          resolve(null);
          return;
        }
        if (value instanceof Uint8Array) {
          resolve(value);
          return;
        }
        if (value instanceof ArrayBuffer) {
          resolve(new Uint8Array(value));
          return;
        }
        if (value instanceof Blob) {
          void value
            .arrayBuffer()
            .then((buf) => resolve(new Uint8Array(buf)))
            .catch(reject);
          return;
        }
        resolve(null);
      };
      req.onerror = () =>
        reject(req.error ?? new Error("IndexedDB read failed"));
    });
  } finally {
    database.close();
  }
}

export async function idbSetBytes(
  key: string,
  data: Uint8Array,
): Promise<void> {
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(toArrayBuffer(data), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
}

export async function idbDeleteKey(key: string): Promise<void> {
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
  } finally {
    database.close();
  }
}
