import { exec } from "@/lib/db/client";
import type { CatalogItem, SyncRecord } from "./protocol";

type GoodRow = Record<string, unknown> & {
  id?: unknown;
  updated_at?: unknown;
  soft_deleted?: unknown;
  title?: unknown;
  purchased_on?: unknown;
  price_cents?: unknown;
  for_whom?: unknown;
};

export function readSyncCatalog(): CatalogItem[] {
  const rows = exec<GoodRow>(
    "SELECT id, title, price_cents, purchased_on, for_whom, updated_at, soft_deleted FROM goods",
  );
  return rows.flatMap((row) => {
    const id = text(row.id);
    if (!id) return [];
    const price = row.price_cents;
    return [
      {
        id,
        updatedAt: text(row.updated_at),
        deleted: row.soft_deleted === 1,
        title: text(row.title),
        purchasedOn: text(row.purchased_on),
        priceCents: typeof price === "number" ? price : Number(price ?? 0),
        forWhom: text(row.for_whom),
      },
    ];
  });
}

export function readSyncRecords(ids: string[]): SyncRecord[] {
  const records: SyncRecord[] = [];
  for (const id of ids) {
    const good = exec<GoodRow>("SELECT * FROM goods WHERE id = ?", [id])[0];
    if (!good) continue;
    const purse = exec<Record<string, unknown>>(
      "SELECT * FROM purse_entries WHERE goods_id = ?",
      [id],
    );
    records.push({ good, purse });
  }
  return records;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}
