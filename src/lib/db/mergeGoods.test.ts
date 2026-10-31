import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Database, SqlJsStatic } from "sql.js";
import { mergeGoodsInto } from "./mergeGoods";

const require = createRequire(import.meta.url);

async function openSql(): Promise<SqlJsStatic> {
  const initSqlJs = require("sql.js") as (config?: {
    wasmBinary?: Buffer;
  }) => Promise<SqlJsStatic>;
  const wasm = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
  return initSqlJs({ wasmBinary: wasm });
}

function schema(db: Database) {
  db.run(`
    CREATE TABLE goods (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      purchased_on TEXT NOT NULL,
      for_whom TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      url TEXT,
      notes TEXT,
      image_data_url TEXT,
      returned_on TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      comment TEXT,
      called_price_cents INTEGER,
      soft_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE purse_entries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      occurred_on TEXT NOT NULL,
      note TEXT,
      goods_id TEXT,
      soft_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
}

function one(db: Database, sql: string, params: Array<string | number> = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

describe("mergeGoodsInto", () => {
  it("takes newer phone goods and leaves computer projects alone", async () => {
    const SQL = await openSql();
    const live = new SQL.Database();
    const incoming = new SQL.Database();
    schema(live);
    schema(incoming);

    live.run(
      `INSERT INTO projects (id, name) VALUES ('p1', 'Desktop project')`,
    );
    incoming.run(
      `INSERT INTO projects (id, name) VALUES ('p1', 'Phone should not win')`,
    );
    incoming.run(
      `INSERT INTO projects (id, name) VALUES ('p2', 'Phone only')`,
    );

    live.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('g-old', 'Coat', 1000, '2026-10-01', 'me', 1, 0, '2026-10-01 00:00:00', '2026-10-01 00:00:00')`,
    );
    live.run(
      `INSERT INTO purse_entries
        (id, kind, amount_cents, occurred_on, note, goods_id, soft_deleted, created_at, updated_at)
       VALUES ('pse-old', 'goods_debit', 1000, '2026-10-01', 'Coat', 'g-old', 0, '2026-10-01 00:00:00', '2026-10-01 00:00:00')`,
    );
    live.run(
      `INSERT INTO purse_entries
        (id, kind, amount_cents, occurred_on, note, goods_id, soft_deleted, created_at, updated_at)
       VALUES ('cash', 'deposit', 5000, '2026-10-02', 'Salary', NULL, 0, '2026-10-02 00:00:00', '2026-10-02 00:00:00')`,
    );
    live.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('g-pc', 'Lamp', 2000, '2026-09-01', 'me', 1, 0, '2026-09-01 00:00:00', '2026-10-20 00:00:00')`,
    );

    incoming.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('g-old', 'Coat', 1800, '2026-10-01', 'me', 0, 0, '2026-10-01 00:00:00', '2026-10-30 12:00:00')`,
    );
    incoming.run(
      `INSERT INTO purse_entries
        (id, kind, amount_cents, occurred_on, note, goods_id, soft_deleted, created_at, updated_at)
       VALUES ('pse-old', 'goods_debit', 1000, '2026-10-01', 'Coat', 'g-old', 0, '2026-10-01 00:00:00', '2026-10-01 00:00:00')`,
    );
    incoming.run(
      `INSERT INTO purse_entries
        (id, kind, amount_cents, occurred_on, note, goods_id, soft_deleted, created_at, updated_at)
       VALUES ('pse-up', 'goods_debit', 800, '2026-10-30', 'Price up · Coat', 'g-old', 0, '2026-10-30 12:00:00', '2026-10-30 12:00:00')`,
    );
    incoming.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('g-pc', 'Lamp', 1, '2026-09-01', 'me', 1, 0, '2026-09-01 00:00:00', '2026-10-02 00:00:00')`,
    );
    incoming.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('g-new', 'Hat', 400, '2026-10-30', 'jackie', 1, 0, '2026-10-30 08:00:00', '2026-10-30 08:00:00')`,
    );

    const result = mergeGoodsInto(live, incoming);

    expect(result).toEqual({
      inserted: 1,
      updated: 1,
      unchanged: 1,
      changes: [
        { title: "Coat", action: "updated" },
        { title: "Hat", action: "added" },
      ],
    });
    expect(one(live, `SELECT name FROM projects WHERE id = 'p1'`).name).toBe(
      "Desktop project",
    );
    expect(one(live, `SELECT COUNT(*) AS c FROM projects`).c).toBe(1);
    expect(one(live, `SELECT price_cents, enabled FROM goods WHERE id = 'g-old'`)).toEqual({
      price_cents: 1800,
      enabled: 0,
    });
    expect(one(live, `SELECT price_cents FROM goods WHERE id = 'g-pc'`).price_cents).toBe(
      2000,
    );
    expect(one(live, `SELECT title FROM goods WHERE id = 'g-new'`).title).toBe(
      "Hat",
    );
    expect(one(live, `SELECT COUNT(*) AS c FROM purse_entries WHERE goods_id = 'g-old'`).c).toBe(
      2,
    );
    expect(one(live, `SELECT amount_cents FROM purse_entries WHERE id = 'cash'`).amount_cents).toBe(
      5000,
    );

    live.close();
    incoming.close();
  });

  it("does not insert a second copy of the same good with a new id", async () => {
    const SQL = await openSql();
    const live = new SQL.Database();
    const incoming = new SQL.Database();
    schema(live);
    schema(incoming);

    live.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('pc-socks', 'socks', 200, '2026-10-01', 'jackie', 1, 0, '2026-10-01 00:00:00', '2026-10-30 02:00:00')`,
    );
    incoming.run(
      `INSERT INTO goods
        (id, title, price_cents, purchased_on, for_whom, enabled, soft_deleted, created_at, updated_at)
       VALUES ('phone-socks', 'socks', 200, '2026-10-01', 'jackie', 1, 0, '2026-10-01 00:00:00', '2026-10-30 02:00:00')`,
    );

    const result = mergeGoodsInto(live, incoming);
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      changes: [],
    });
    expect(one(live, `SELECT COUNT(*) AS c FROM goods`).c).toBe(1);
    expect(one(live, `SELECT id FROM goods`).id).toBe("pc-socks");

    live.close();
    incoming.close();
  });
});
