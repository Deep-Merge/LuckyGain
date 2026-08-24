import type { Database, SqlJsStatic } from "sql.js";
import schemaSql from "./schema.sql?raw";
import { seedDatabase } from "./seed";
import { maybeBackfillGoodsCategories, maybeSeedPurseSheet } from "./purseSeed";
import { idbDeleteKey, idbGetBytes, idbSetBytes } from "./idbStorage";
import {
  loadGoodsMediaVault,
  mergeMediaSnaps,
  restoreGoodsMedia,
  saveGoodsMediaVault,
  snapshotGoodsMedia,
  type GoodsMediaSnap,
} from "./goodsMedia";

export const STORAGE_KEY = "luckygain.sqlite.v7";
/** One-shot leftover bytes from localStorage, used to recover photos after a wipe. */
let legacySqliteBytes: Uint8Array | null = null;

type InitSqlJs = (config?: {
  locateFile?: (file: string) => string;
}) => Promise<SqlJsStatic>;

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let initPromise: Promise<Database> | null = null;
let suppressPersist = false;
let dbVersion = 0;
const listeners = new Set<() => void>();
/** Serialize async IndexedDB writes so the newest export always wins. */
let persistChain: Promise<void> = Promise.resolve();

async function loadInitSqlJs(): Promise<InitSqlJs> {
  // sql.js ships as CJS. Import the Node/wasm build via Vite prebundle so we get a default export.
  const mod = await import("sql.js");
  const candidate = (mod as { default?: InitSqlJs }).default ?? (mod as unknown as InitSqlJs);
  if (typeof candidate !== "function") {
    throw new Error("sql.js failed to load (no init function export)");
  }
  return candidate;
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const initSqlJs = await loadInitSqlJs();
  SQL = await initSqlJs({
    locateFile: (file) => {
      if (file.endsWith(".wasm")) {
        return `${import.meta.env.BASE_URL}sql-wasm.wasm`;
      }
      return file;
    },
  });
  return SQL;
}

async function loadPersistedBytes(): Promise<Uint8Array | null> {
  const fromIdb = await idbGetBytes(STORAGE_KEY);

  // Keep legacy localStorage bytes for photo recovery even when IndexedDB is current.
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      legacySqliteBytes = Uint8Array.from(JSON.parse(raw) as number[]);
    } catch {
      legacySqliteBytes = null;
    }
  }

  if (fromIdb?.byteLength) return fromIdb;

  if (legacySqliteBytes?.byteLength) {
    await idbSetBytes(STORAGE_KEY, legacySqliteBytes);
    return legacySqliteBytes;
  }
  return null;
}

function persist(): void {
  if (!db || suppressPersist) return;
  const snapshot = new Uint8Array(db.export());
  const mediaSnap = snapshotGoodsMedia(db);
  persistChain = persistChain
    .catch(() => undefined)
    .then(async () => {
      await idbSetBytes(STORAGE_KEY, snapshot);
      try {
        const vault = await loadGoodsMediaVault();
        await saveGoodsMediaVault(mergeMediaSnaps(vault, mediaSnap));
      } catch (error) {
        console.warn("Failed to sync goods media vault", error);
      }
      // Keep localStorage as last-resort media backup until vault has content.
      try {
        const vault = await loadGoodsMediaVault();
        if (vault.length > 0) localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    })
    .catch((error) => {
      console.error("Failed to persist LuckyGain database", error);
      throw error;
    });
}

function notify(): void {
  if (suppressPersist) return;
  dbVersion += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeDb(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDbVersion(): number {
  return dbVersion;
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sql = await loadSqlJs();
    const bytes = await loadPersistedBytes();
    if (bytes?.byteLength) {
      try {
        db = new sql.Database(bytes);
      } catch {
        await idbDeleteKey(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        db = new sql.Database();
        db.run(schemaSql);
        seedDatabase(db);
        persist();
      }
    } else {
      db = new sql.Database();
      db.run(schemaSql);
      seedDatabase(db);
      persist();
    }
    db.run("PRAGMA foreign_keys = ON;");
    ensureSchemaUpgrades(db);
    await recoverGoodsMedia(db);
    return db;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function recoverGoodsMedia(database: Database): Promise<void> {
  const sources: GoodsMediaSnap[][] = [
    snapshotGoodsMedia(database),
  ];

  try {
    sources.push(await loadGoodsMediaVault());
  } catch {
    // vault missing / first run
  }

  if (legacySqliteBytes?.byteLength && SQL) {
    try {
      const temp = new SQL.Database(legacySqliteBytes);
      try {
        sources.push(snapshotGoodsMedia(temp));
      } finally {
        temp.close();
      }
    } catch {
      // corrupt legacy dump
    }
  }

  const merged = mergeMediaSnaps(...sources);
  if (merged.length === 0) return;

  try {
    await saveGoodsMediaVault(merged);
  } catch {
    // ignore vault write
  }

  const restored = restoreGoodsMedia(database, merged);
  if (restored > 0) {
    persist();
    notify();
  }
}

function ensureSchemaUpgrades(database: Database): void {
  const projectCols = tableColumns(database, "projects");
  if (!projectCols.has("start_date")) {
    database.run("ALTER TABLE projects ADD COLUMN start_date TEXT");
  }
  if (!projectCols.has("finish_date")) {
    database.run("ALTER TABLE projects ADD COLUMN finish_date TEXT");
  }
  if (!projectCols.has("project_type")) {
    database.run(
      "ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'Kareem'",
    );
  }

  const milestoneCols = tableColumns(database, "milestones");
  if (!milestoneCols.has("released_at")) {
    database.run("ALTER TABLE milestones ADD COLUMN released_at TEXT");
    database.run(
      `UPDATE milestones
       SET released_at = date(updated_at)
       WHERE status = 'released' AND (released_at IS NULL OR released_at = '')`,
    );
  }
  // Normalize any earlier datetime values to YYYY-MM-DD only
  database.run(
    `UPDATE milestones
     SET released_at = substr(released_at, 1, 10)
     WHERE released_at IS NOT NULL AND length(released_at) > 10`,
  );

  if (!milestoneCols.has("transfer_fee_bps")) {
    database.run(
      "ALTER TABLE milestones ADD COLUMN transfer_fee_bps INTEGER NOT NULL DEFAULT 0",
    );
    database.run(
      `UPDATE milestones SET transfer_fee_bps = COALESCE(fee_bps, 0)`,
    );
  }
  if (!milestoneCols.has("account_fee_bps")) {
    database.run(
      "ALTER TABLE milestones ADD COLUMN account_fee_bps INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!milestoneCols.has("fee_compound")) {
    database.run(
      "ALTER TABLE milestones ADD COLUMN fee_compound INTEGER NOT NULL DEFAULT 0",
    );
  }
  database.run(
    `UPDATE milestones
     SET fee_bps = transfer_fee_bps + account_fee_bps
     WHERE fee_bps != transfer_fee_bps + account_fee_bps`,
  );

  // Release date owns the month
  database.run(
    `UPDATE milestones
     SET work_month = substr(released_at, 1, 7)
     WHERE status = 'released'
       AND released_at IS NOT NULL
       AND length(released_at) >= 7
       AND work_month != substr(released_at, 1, 7)`,
  );

  database.run(
    `UPDATE users SET base_currency = 'USD' WHERE base_currency = 'CNY' OR base_currency IS NULL OR base_currency = ''`,
  );
  database.run(
    `UPDATE users
     SET name = 'Peter', greeting_name = 'Peter'
     WHERE greeting_name = 'Kareem' OR name = 'Kareem'`,
  );
  database.run(
    `UPDATE accounts SET currency = 'USD' WHERE currency = 'CNY'`,
  );

  const workMonthCols = tableColumns(database, "work_months");
  if (!workMonthCols.has("usd_cents")) {
    database.run(
      "ALTER TABLE work_months ADD COLUMN usd_cents INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!workMonthCols.has("yuan_cents")) {
    database.run(
      "ALTER TABLE work_months ADD COLUMN yuan_cents INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!workMonthCols.has("chuck_given_cents")) {
    database.run(
      "ALTER TABLE work_months ADD COLUMN chuck_given_cents INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!workMonthCols.has("chuck_real_income_cents")) {
    database.run(
      "ALTER TABLE work_months ADD COLUMN chuck_real_income_cents INTEGER NOT NULL DEFAULT 0",
    );
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS chuck_channel_entries (
      id TEXT PRIMARY KEY,
      occurred_on TEXT NOT NULL,
      given_cents INTEGER NOT NULL DEFAULT 0 CHECK (given_cents >= 0),
      real_income_cents INTEGER NOT NULL DEFAULT 0 CHECK (real_income_cents >= 0),
      note TEXT,
      soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_chuck_channel_entries_date
     ON chuck_channel_entries(occurred_on)`,
  );

  // One-time migrate month totals → dated entries (only if ledger is empty)
  const chuckEntryCount =
    execOneLocal<{ c: number }>(
      database,
      `SELECT COUNT(*) AS c FROM chuck_channel_entries WHERE soft_deleted = 0`,
    )?.c ?? 0;
  if (chuckEntryCount === 0) {
    const legacyStmt = database.prepare(
      `SELECT month, chuck_given_cents, chuck_real_income_cents
       FROM work_months
       WHERE COALESCE(chuck_given_cents, 0) > 0
          OR COALESCE(chuck_real_income_cents, 0) > 0`,
    );
    while (legacyStmt.step()) {
      const row = legacyStmt.getAsObject() as {
        month: string;
        chuck_given_cents: number;
        chuck_real_income_cents: number;
      };
      if (!/^\d{4}-\d{2}$/.test(row.month)) continue;
      database.run(
        `INSERT INTO chuck_channel_entries
           (id, occurred_on, given_cents, real_income_cents, note)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `cce_mig_${row.month}`,
          `${row.month}-01`,
          row.chuck_given_cents ?? 0,
          row.chuck_real_income_cents ?? 0,
          "Migrated monthly total",
        ],
      );
    }
    legacyStmt.free();
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS goods (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      purchased_on TEXT NOT NULL,
      for_whom TEXT NOT NULL CHECK (for_whom IN ('me','jackie','family','chuck','self')),
      category TEXT NOT NULL DEFAULT 'other',
      url TEXT,
      notes TEXT,
      image_data_url TEXT,
      returned_on TEXT,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      comment TEXT,
      called_price_cents INTEGER CHECK (called_price_cents IS NULL OR called_price_cents >= 0),
      soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const goodsCols = tableColumns(database, "goods");
  if (!goodsCols.has("category")) {
    database.run(
      `ALTER TABLE goods ADD COLUMN category TEXT NOT NULL DEFAULT 'other'`,
    );
  }
  if (!goodsCols.has("returned_on")) {
    database.run(`ALTER TABLE goods ADD COLUMN returned_on TEXT`);
  }
  database.run(`CREATE INDEX IF NOT EXISTS idx_goods_category ON goods(category)`);

  // Allow for_whom 'self' / 'chuck' (rebuild CHECK when missing)
  const goodsSql =
    execOneLocal<{ sql: string }>(
      database,
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='goods'`,
    )?.sql ?? "";
  if (goodsSql && !goodsSql.includes("'chuck'")) {
    database.run("PRAGMA foreign_keys = OFF");
    database.run(`
      CREATE TABLE goods_v2 (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        purchased_on TEXT NOT NULL,
        for_whom TEXT NOT NULL CHECK (for_whom IN ('me','jackie','family','chuck','self')),
        category TEXT NOT NULL DEFAULT 'other',
        url TEXT,
        notes TEXT,
        image_data_url TEXT,
        returned_on TEXT,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
        comment TEXT,
        called_price_cents INTEGER CHECK (called_price_cents IS NULL OR called_price_cents >= 0),
        soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.run(`
      INSERT INTO goods_v2 (
        id, title, price_cents, purchased_on, for_whom, category,
        url, notes, image_data_url, returned_on, soft_deleted, created_at, updated_at
      )
      SELECT
        id, title, price_cents, purchased_on, for_whom,
        COALESCE(category, 'other'),
        url, notes, image_data_url, returned_on, soft_deleted, created_at, updated_at
      FROM goods
    `);
    database.run(`DROP TABLE goods`);
    database.run(`ALTER TABLE goods_v2 RENAME TO goods`);
    database.run(
      `CREATE INDEX IF NOT EXISTS idx_goods_category ON goods(category)`,
    );
    database.run(
      `CREATE INDEX IF NOT EXISTS idx_goods_purchased ON goods(purchased_on)`,
    );
    database.run(`CREATE INDEX IF NOT EXISTS idx_goods_whom ON goods(for_whom)`);
    database.run("PRAGMA foreign_keys = ON");
  }

  const goodsColsAfter = tableColumns(database, "goods");
  if (!goodsColsAfter.has("enabled")) {
    database.run(
      `ALTER TABLE goods ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`,
    );
  }
  if (!goodsColsAfter.has("comment")) {
    database.run(`ALTER TABLE goods ADD COLUMN comment TEXT`);
  }
  if (!goodsColsAfter.has("called_price_cents")) {
    database.run(`ALTER TABLE goods ADD COLUMN called_price_cents INTEGER`);
  }

  // Revive soft-deleted returns that still have an active return-fee entry
  database.run(`
    UPDATE goods
    SET soft_deleted = 0,
        returned_on = COALESCE(
          returned_on,
          (
            SELECT e.occurred_on
            FROM purse_entries e
            WHERE e.goods_id = goods.id
              AND e.soft_deleted = 0
              AND e.kind = 'withdraw'
              AND IFNULL(e.note, '') LIKE '%[return-fee]%'
            ORDER BY e.occurred_on DESC, e.created_at DESC
            LIMIT 1
          )
        ),
        updated_at = datetime('now')
    WHERE soft_deleted = 1
      AND EXISTS (
        SELECT 1
        FROM purse_entries e
        WHERE e.goods_id = goods.id
          AND e.soft_deleted = 0
          AND e.kind = 'withdraw'
          AND IFNULL(e.note, '') LIKE '%[return-fee]%'
      )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS purse_entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw','goods_debit','goods_credit')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      occurred_on TEXT NOT NULL,
      note TEXT,
      goods_id TEXT REFERENCES goods(id),
      soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_goods_purchased ON goods(purchased_on)`,
  );
  database.run(`CREATE INDEX IF NOT EXISTS idx_goods_whom ON goods(for_whom)`);
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_purse_entries_date ON purse_entries(occurred_on)`,
  );
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_purse_entries_goods ON purse_entries(goods_id)`,
  );

  if (migrateReturnedGoodsLedger(database)) {
    persist();
  }

  // Extend attachment_links CHECK to allow entity_type 'goods'
  const linkSql =
    execOneLocal<{ sql: string }>(
      database,
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='attachment_links'`,
    )?.sql ?? "";
  if (linkSql && !linkSql.includes("'goods'")) {
    database.run(`
      CREATE TABLE IF NOT EXISTS attachment_links_v2 (
        id TEXT PRIMARY KEY,
        attachment_id TEXT NOT NULL REFERENCES attachments(id),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction','payment','project','goods')),
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.run(`
      INSERT INTO attachment_links_v2 (id, attachment_id, entity_type, entity_id, created_at)
      SELECT id, attachment_id, entity_type, entity_id, created_at FROM attachment_links
    `);
    database.run(`DROP TABLE attachment_links`);
    database.run(`ALTER TABLE attachment_links_v2 RENAME TO attachment_links`);
  }

  if (maybeSeedPurseSheet(database)) {
    persist();
    notify();
  }
  if (maybeBackfillGoodsCategories(database)) {
    persist();
    notify();
  }
}

function execOneLocal<T>(
  database: Database,
  sql: string,
  params: unknown[] = [],
): T | null {
  const stmt = database.prepare(sql);
  stmt.bind(params as never[]);
  const row = stmt.step() ? (stmt.getAsObject() as T) : null;
  stmt.free();
  return row;
}

/**
 * Old return model: soft-deleted debit + fee withdraw.
 * New model: keep debit (−price) + deposit refund (price − fee).
 */
function migrateReturnedGoodsLedger(database: Database): boolean {
  const goodsStmt = database.prepare(
    `SELECT id, title, price_cents, returned_on
     FROM goods
     WHERE soft_deleted = 0 AND returned_on IS NOT NULL`,
  );
  const returned: Array<{
    id: string;
    title: string;
    price_cents: number;
    returned_on: string;
  }> = [];
  while (goodsStmt.step()) {
    returned.push(
      goodsStmt.getAsObject() as {
        id: string;
        title: string;
        price_cents: number;
        returned_on: string;
      },
    );
  }
  goodsStmt.free();
  if (returned.length === 0) return false;

  let changed = false;

  for (const good of returned) {
    // Restore purchase ledger lines soft-deleted by the old return flow.
    database.run(
      `UPDATE purse_entries
       SET soft_deleted = 0, updated_at = datetime('now')
       WHERE goods_id = ?
         AND soft_deleted = 1
         AND kind IN ('goods_debit', 'goods_credit')`,
      [good.id],
    );
    if (database.getRowsModified() > 0) changed = true;

    const feeRow = execOneLocal<{ amount_cents: number; id: string }>(
      database,
      `SELECT id, amount_cents
       FROM purse_entries
       WHERE goods_id = ?
         AND soft_deleted = 0
         AND kind = 'withdraw'
         AND IFNULL(note, '') LIKE '%[return-fee]%'
       ORDER BY occurred_on DESC, created_at DESC
       LIMIT 1`,
      [good.id],
    );

    let feeCents = feeRow?.amount_cents ?? 0;
    if (!feeRow) {
      const oldFee = execOneLocal<{ amount_cents: number }>(
        database,
        `SELECT amount_cents
         FROM purse_entries
         WHERE goods_id = ?
           AND soft_deleted = 1
           AND kind = 'withdraw'
           AND IFNULL(note, '') LIKE '%[return-fee]%'
         ORDER BY occurred_on DESC, created_at DESC
         LIMIT 1`,
        [good.id],
      );
      feeCents = oldFee?.amount_cents ?? 0;
    }

    if (feeRow) {
      database.run(
        `UPDATE purse_entries
         SET soft_deleted = 1, updated_at = datetime('now')
         WHERE id = ?`,
        [feeRow.id],
      );
      changed = true;
    }

    const hasRefund = execOneLocal<{ id: string }>(
      database,
      `SELECT id
       FROM purse_entries
       WHERE goods_id = ?
         AND soft_deleted = 0
         AND kind = 'deposit'
         AND IFNULL(note, '') LIKE '%[return-refund]%'
       LIMIT 1`,
      [good.id],
    );
    if (hasRefund) continue;

    const refundCents = Math.max(0, good.price_cents - feeCents);
    if (refundCents <= 0) continue;

    const id = `pse_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const note = `Refund · ${good.title.trim() || "Refund"}\n[return-refund]`;
    database.run(
      `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note, goods_id)
       VALUES (?, 'deposit', ?, ?, ?, ?)`,
      [id, refundCents, good.returned_on, note, good.id],
    );
    changed = true;
  }

  return changed;
}

function tableColumns(database: Database, table: string): Set<string> {
  const cols = new Set<string>();
  const stmt = database.prepare(`PRAGMA table_info(${table})`);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: string };
    if (row.name) cols.add(row.name);
  }
  stmt.free();
  return cols;
}

export function resetDatabase(): void {
  localStorage.removeItem(STORAGE_KEY);
  void idbDeleteKey(STORAGE_KEY);
  db?.close();
  db = null;
  initPromise = null;
}

/** Download the current in-memory SQLite as a .sqlite file (browser Downloads). */
export function downloadDatabaseBackup(): string {
  const database = getDb();
  const bytes = database.export();
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `luckygain-backup-${stamp}.sqlite`;
  const blob = new Blob([bytes as BlobPart], {
    type: "application/x-sqlite3",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

/** Replace the live DB with a `.sqlite` backup file, then persist to IndexedDB. */
export async function restoreDatabaseFromBackup(file: File): Promise<void> {
  const sql = await loadSqlJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) {
    throw new Error("Backup file is empty");
  }

  let candidate: Database;
  try {
    candidate = new sql.Database(bytes);
  } catch {
    throw new Error("Not a valid SQLite backup");
  }

  try {
    const probe = candidate.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts' LIMIT 1",
    );
    if (!probe.length || !probe[0]?.values?.length) {
      candidate.close();
      throw new Error("Backup is missing LuckyGain tables");
    }
  } catch (error) {
    try {
      candidate.close();
    } catch {
      // ignore
    }
    throw error instanceof Error
      ? error
      : new Error("Could not read backup");
  }

  db?.close();
  db = candidate;
  initPromise = Promise.resolve(candidate);
  db.run("PRAGMA foreign_keys = ON;");
  ensureSchemaUpgrades(db);
  await recoverGoodsMedia(db);
  persist();
  await persistChain;
  notify();
}

export function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[]);
  persist();
  notify();
}

export function exec<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as never[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function execOne<T>(sql: string, params: unknown[] = []): T | null {
  return exec<T>(sql, params)[0] ?? null;
}

export function withTransaction(fn: () => void): void {
  const database = getDb();
  suppressPersist = true;
  let committed = false;
  try {
    database.run("BEGIN");
    fn();
    database.run("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) {
      try {
        database.run("ROLLBACK");
      } catch {
        // sql.js may already have aborted the txn; ignore double-rollback.
      }
    }
    suppressPersist = false;
    throw error;
  }
  suppressPersist = false;
  persist();
  notify();
}
