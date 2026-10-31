import type { Database } from "sql.js";

export type GoodsChange = {
  title: string;
  action: "added" | "updated";
};

export type GoodsMergeResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  changes: GoodsChange[];
};

const GOODS_FIELDS = [
  "title",
  "price_cents",
  "purchased_on",
  "for_whom",
  "category",
  "url",
  "notes",
  "image_data_url",
  "returned_on",
  "enabled",
  "comment",
  "called_price_cents",
  "soft_deleted",
  "created_at",
  "updated_at",
] as const;

const PURSE_FIELDS = [
  "id",
  "kind",
  "amount_cents",
  "occurred_on",
  "note",
  "goods_id",
  "soft_deleted",
  "created_at",
  "updated_at",
] as const;

type Row = Record<string, string | number | Uint8Array | null>;

/**
 * Copy goods from a phone backup into the live ledger.
 * A phone row wins only when its updated_at is newer. Projects and every
 * wallet line that is not tied to an accepted good stay on the computer.
 */
export function mergeGoodsInto(
  live: Database,
  incoming: Database,
): GoodsMergeResult {
  if (!hasTable(incoming, "goods")) {
    throw new Error("This backup has no goods to merge");
  }

  const goodsCols = sharedColumns(live, incoming, "goods", GOODS_FIELDS);
  if (!goodsCols.includes("title") || !goodsCols.includes("updated_at")) {
    throw new Error("This backup is missing goods columns");
  }

  const liveGoods = indexById(selectAll(live, "goods"));
  const liveTwins = indexByIdentity(selectAll(live, "goods"));
  const incomingGoods = selectAll(incoming, "goods");
  const purseCols = sharedColumns(live, incoming, "purse_entries", PURSE_FIELDS);
  const canCopyPurse =
    purseCols.includes("id") &&
    purseCols.includes("kind") &&
    purseCols.includes("amount_cents") &&
    purseCols.includes("occurred_on") &&
    purseCols.includes("goods_id");
  const incomingPurse = canCopyPurse
    ? groupPurse(selectAll(incoming, "purse_entries"))
    : new Map<string, Row[]>();

  const result: GoodsMergeResult = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    changes: [],
  };

  for (const row of incomingGoods) {
    const id = text(row.id);
    if (!id) continue;
    const current = liveGoods.get(id) ?? liveTwins.get(identityKey(row));
    if (!current) {
      if (flag(row.soft_deleted)) {
        result.unchanged += 1;
        continue;
      }
      insertRow(live, "goods", ["id", ...goodsCols], { ...row, id });
      replacePurse(live, id, incomingPurse.get(id) ?? [], purseCols, canCopyPurse);
      liveGoods.set(id, row);
      const twin = identityKey(row);
      if (twin) liveTwins.set(twin, { ...row, id });
      result.inserted += 1;
      result.changes.push({ title: goodTitle(row), action: "added" });
      continue;
    }
    const keepId = text(current.id) || id;
    if (text(row.updated_at) > text(current.updated_at)) {
      updateRow(live, "goods", goodsCols, row, keepId);
      replacePurse(
        live,
        keepId,
        incomingPurse.get(id) ?? incomingPurse.get(keepId) ?? [],
        purseCols,
        canCopyPurse,
      );
      result.updated += 1;
      result.changes.push({ title: goodTitle(row), action: "updated" });
      continue;
    }
    result.unchanged += 1;
  }

  return result;
}

function replacePurse(
  live: Database,
  goodsId: string,
  rows: Row[],
  cols: string[],
  enabled: boolean,
) {
  if (!enabled) return;
  live.run(`DELETE FROM purse_entries WHERE goods_id = ?`, [goodsId]);
  for (const row of rows) {
    let id = text(row.id);
    if (!id) continue;
    const clash = live.prepare(`SELECT id FROM purse_entries WHERE id = ?`);
    clash.bind([id]);
    const taken = clash.step();
    clash.free();
    if (taken) id = `${id}_m`;
    insertRow(live, "purse_entries", cols, { ...row, id, goods_id: goodsId });
  }
}

function sharedColumns(
  live: Database,
  incoming: Database,
  table: string,
  fields: readonly string[],
): string[] {
  if (!hasTable(live, table) || !hasTable(incoming, table)) return [];
  const liveCols = tableColumns(live, table);
  const incomingCols = tableColumns(incoming, table);
  return fields.filter((name) => liveCols.has(name) && incomingCols.has(name));
}

function tableColumns(database: Database, table: string): Set<string> {
  const cols = new Set<string>();
  const stmt = database.prepare(`PRAGMA table_info(${table})`);
  while (stmt.step()) {
    const name = stmt.getAsObject().name;
    if (typeof name === "string") cols.add(name);
  }
  stmt.free();
  return cols;
}

function hasTable(database: Database, table: string): boolean {
  const stmt = database.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  );
  stmt.bind([table]);
  const found = stmt.step();
  stmt.free();
  return found;
}

function selectAll(database: Database, table: "goods" | "purse_entries"): Row[] {
  const stmt = database.prepare(`SELECT * FROM ${table}`);
  const rows: Row[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Row);
  stmt.free();
  return rows;
}

function indexById(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = text(row.id);
    if (id) map.set(id, row);
  }
  return map;
}

function indexByIdentity(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const key = identityKey(row);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

function identityKey(row: Row): string {
  const title = text(row.title).trim().toLowerCase();
  const purchasedOn = text(row.purchased_on);
  if (!title || !purchasedOn) return "";
  return [
    title,
    purchasedOn,
    String(row.price_cents ?? ""),
    text(row.for_whom).trim().toLowerCase(),
  ].join("\t");
}

function groupPurse(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const goodsId = text(row.goods_id);
    if (!goodsId) continue;
    const list = map.get(goodsId);
    if (list) list.push(row);
    else map.set(goodsId, [row]);
  }
  return map;
}

function insertRow(
  database: Database,
  table: "goods" | "purse_entries",
  cols: string[],
  row: Row,
) {
  const names = cols.filter((name) => Object.prototype.hasOwnProperty.call(row, name));
  database.run(
    `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    names.map((name) => row[name] ?? null),
  );
}

function updateRow(
  database: Database,
  table: "goods",
  cols: string[],
  row: Row,
  id: string,
) {
  const names = cols.filter((name) => name !== "id");
  database.run(
    `UPDATE ${table} SET ${names.map((name) => `${name} = ?`).join(", ")} WHERE id = ?`,
    [...names.map((name) => row[name] ?? null), id],
  );
}

function goodTitle(row: Row): string {
  const title = text(row.title).trim();
  return title || "Untitled";
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function flag(value: unknown): boolean {
  return value === 1 || value === true;
}
