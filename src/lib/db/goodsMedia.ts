import type { Database } from "sql.js";

export type GoodsMediaSnap = {
  title: string;
  priceCents: number;
  purchasedOn: string;
  url: string | null;
  imageDataUrl: string | null;
};

const IDB_NAME = "luckygain";
const MEDIA_STORE = "goods_media";
const MEDIA_VAULT_KEY = "vault";

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains("sqlite")) {
        database.createObjectStore("sqlite");
      }
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        database.createObjectStore(MEDIA_STORE);
      }
    };
    req.onsuccess = () => {
      const database = req.result;
      // Older browsers may have v1 without media store if upgrade missed.
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        database.close();
        const bump = indexedDB.open(IDB_NAME, 2);
        bump.onupgradeneeded = () => {
          const d = bump.result;
          if (!d.objectStoreNames.contains(MEDIA_STORE)) {
            d.createObjectStore(MEDIA_STORE);
          }
        };
        bump.onsuccess = () => resolve(bump.result);
        bump.onerror = () =>
          reject(bump.error ?? new Error("IndexedDB media upgrade failed"));
        return;
      }
      resolve(database);
    };
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export function normalizeGoodsTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^j[_\s-]+/i, "")
    .replace(/^f[_\s-]+/i, "")
    .replace(/\s+/g, " ");
}

export function goodsMediaKeys(
  title: string,
  priceCents: number,
  purchasedOn: string,
): string[] {
  const t = normalizeGoodsTitle(title);
  const p = String(priceCents);
  const month = purchasedOn.slice(0, 7);
  return [`${t}|${p}|${month}`, `${t}|${p}`, t];
}

function hasMedia(snap: GoodsMediaSnap): boolean {
  return Boolean(snap.url?.trim() || snap.imageDataUrl?.trim());
}

/** Pull photo/url rows from the live sqlite DB. */
export function snapshotGoodsMedia(db: Database): GoodsMediaSnap[] {
  const out: GoodsMediaSnap[] = [];
  const stmt = db.prepare(
    `SELECT title, price_cents, purchased_on, url, image_data_url
     FROM goods
     WHERE soft_deleted = 0
       AND (
         (url IS NOT NULL AND trim(url) != '')
         OR (image_data_url IS NOT NULL AND trim(image_data_url) != '')
       )`,
  );
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      title: string;
      price_cents: number;
      purchased_on: string;
      url: string | null;
      image_data_url: string | null;
    };
    out.push({
      title: row.title,
      priceCents: row.price_cents,
      purchasedOn: row.purchased_on,
      url: row.url,
      imageDataUrl: row.image_data_url,
    });
  }
  stmt.free();
  return out;
}

export function mergeMediaSnaps(
  ...lists: GoodsMediaSnap[][]
): GoodsMediaSnap[] {
  const map = new Map<string, GoodsMediaSnap>();
  for (const list of lists) {
    for (const snap of list) {
      if (!hasMedia(snap)) continue;
      const primary = goodsMediaKeys(
        snap.title,
        snap.priceCents,
        snap.purchasedOn,
      )[0];
      const prev = map.get(primary);
      if (!prev) {
        map.set(primary, { ...snap });
        continue;
      }
      map.set(primary, {
        ...prev,
        url: snap.url?.trim() || prev.url,
        imageDataUrl: snap.imageDataUrl?.trim() || prev.imageDataUrl,
      });
    }
  }
  return [...map.values()];
}

/** Re-apply saved photos/URLs onto goods after a reseed. */
export function restoreGoodsMedia(
  db: Database,
  media: GoodsMediaSnap[],
): number {
  if (media.length === 0) return 0;

  const byKey = new Map<string, GoodsMediaSnap>();
  for (const snap of media) {
    for (const key of goodsMediaKeys(
      snap.title,
      snap.priceCents,
      snap.purchasedOn,
    )) {
      if (!byKey.has(key)) byKey.set(key, snap);
    }
  }

  let restored = 0;
  const stmt = db.prepare(
    `SELECT id, title, price_cents, purchased_on, url, image_data_url
     FROM goods WHERE soft_deleted = 0`,
  );
  const updates: Array<{
    id: string;
    url: string | null;
    imageDataUrl: string | null;
  }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: string;
      title: string;
      price_cents: number;
      purchased_on: string;
      url: string | null;
      image_data_url: string | null;
    };
    let snap: GoodsMediaSnap | undefined;
    for (const key of goodsMediaKeys(
      row.title,
      row.price_cents,
      row.purchased_on,
    )) {
      snap = byKey.get(key);
      if (snap) break;
    }
    if (!snap) continue;

    const nextUrl = row.url?.trim() || snap.url?.trim() || null;
    const nextImg =
      row.image_data_url?.trim() || snap.imageDataUrl?.trim() || null;
    if (
      nextUrl === (row.url ?? null) &&
      nextImg === (row.image_data_url ?? null)
    ) {
      continue;
    }
    if (!nextUrl && !nextImg) continue;
    updates.push({ id: row.id, url: nextUrl, imageDataUrl: nextImg });
  }
  stmt.free();

  for (const u of updates) {
    db.run(
      `UPDATE goods
       SET url = ?, image_data_url = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [u.url, u.imageDataUrl, u.id],
    );
    restored += 1;
  }
  return restored;
}

export async function loadGoodsMediaVault(): Promise<GoodsMediaSnap[]> {
  const database = await openMediaDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(MEDIA_STORE, "readonly");
      const req = tx.objectStore(MEDIA_STORE).get(MEDIA_VAULT_KEY);
      req.onsuccess = () => {
        const value = req.result;
        resolve(Array.isArray(value) ? (value as GoodsMediaSnap[]) : []);
      };
      req.onerror = () =>
        reject(req.error ?? new Error("IndexedDB media read failed"));
    });
  } finally {
    database.close();
  }
}

export async function saveGoodsMediaVault(
  media: GoodsMediaSnap[],
): Promise<void> {
  const merged = mergeMediaSnaps(media);
  const database = await openMediaDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(MEDIA_STORE, "readwrite");
      tx.objectStore(MEDIA_STORE).put(merged, MEDIA_VAULT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB media write failed"));
    });
  } finally {
    database.close();
  }
}
