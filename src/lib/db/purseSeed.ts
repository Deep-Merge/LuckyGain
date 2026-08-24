import type { Database } from "sql.js";
import { uid } from "../dates";
import {
  isWalletWhom,
  type GoodsCategory,
  type GoodsForWhom,
} from "./purse";
import {
  restoreGoodsMedia,
  saveGoodsMediaVault,
  snapshotGoodsMedia,
} from "./goodsMedia";

/** Excel buy/income ledger Mar–Aug 2026 + Jan–Feb Self holdovers. */
export const PURSE_SHEET_SEED_VERSION = "v4-excel-ledger";

type GoodLine = {
  title: string;
  yuan: number;
  whom: GoodsForWhom;
  day: number;
  category?: GoodsCategory;
};

type IncomeLine = {
  day: number;
  yuan: number;
  note: string;
};

type MonthBlock = {
  month: string;
  incomes: IncomeLine[];
  goods: GoodLine[];
};

/**
 * Jan–Feb: previous sheet buys kept as Self (outside wallet — not on this Excel).
 * Mar–Aug: exact buys + incomes from the Excel ledger screenshot.
 */
const MONTHS: MonthBlock[] = [
  // —— Self holdovers (not on Mar–Aug Excel) ——
  {
    month: "2026-01",
    incomes: [],
    goods: [
      { title: "socks", yuan: 38.9, whom: "self", day: 3 },
      { title: "socks", yuan: 4.94, whom: "self", day: 4 },
      { title: "socks", yuan: 7.8, whom: "self", day: 5 },
      { title: "bag", yuan: 48, whom: "self", day: 6 },
      { title: "bag (2/5)", yuan: 42.02, whom: "self", day: 7 },
      { title: "headphone (win)", yuan: 151, whom: "self", day: 8 },
      { title: "shoes (playboy)", yuan: 94.74, whom: "self", day: 9 },
      { title: "shoes (bottom)", yuan: 16.23, whom: "self", day: 10 },
      { title: "note (life's birth)", yuan: 100.72, whom: "self", day: 12 },
      { title: "canteen (5in with Jackie)", yuan: 350, whom: "self", day: 15 },
      { title: "cigarette (2)", yuan: 120, whom: "self", day: 20 },
      { title: "clothes (up+down)", yuan: 175, whom: "self", day: 8 },
      { title: "clothes (up+down)", yuan: 139, whom: "self", day: 12 },
      { title: "clothes (up+down)", yuan: 169, whom: "self", day: 16 },
      { title: "asics shoes", yuan: 409, whom: "self", day: 22 },
    ],
  },
  {
    month: "2026-02",
    incomes: [],
    goods: [
      { title: "cigarette (electronic)", yuan: 200, whom: "self", day: 10 },
      { title: "swimsuit", yuan: 283, whom: "self", day: 3 },
      { title: "swimsuit", yuan: 366, whom: "self", day: 4 },
      { title: "swimsuit", yuan: 299, whom: "self", day: 5 },
      { title: "swimsuit", yuan: 266, whom: "self", day: 6 },
      { title: "swimsuit", yuan: 186.01, whom: "self", day: 7 },
      { title: "swimsuit", yuan: 189, whom: "self", day: 8 },
      { title: "socks (asics ×4)", yuan: 390, whom: "self", day: 12 },
      { title: "socks (asics)", yuan: 74.4, whom: "self", day: 13 },
      { title: "socks (asics)", yuan: 74, whom: "self", day: 14 },
      { title: "asics up", yuan: 191, whom: "self", day: 18 },
      { title: "asics down", yuan: 244, whom: "self", day: 19 },
      { title: "makeup (nars)", yuan: 123.5, whom: "self", day: 9 },
      { title: "cl (autumn)", yuan: 113.99, whom: "self", day: 15 },
      { title: "makeup (cl)", yuan: 150, whom: "self", day: 21 },
    ],
  },

  // —— Excel ledger ——
  {
    month: "2026-03",
    incomes: [
      { day: 11, yuan: 690, note: "Income" },
      { day: 17, yuan: 1380, note: "Income" },
      { day: 24, yuan: 1000, note: "Income" },
      { day: 25, yuan: 69.17, note: "Income" },
    ],
    goods: [
      { title: "Original", yuan: 227.45, whom: "me", day: 11 },
      { title: "Pierre Cardin", yuan: 195, whom: "me", day: 12 },
      { title: "football shoes", yuan: 155, whom: "me", day: 12 },
      { title: "J_shoes(adi)", yuan: 499, whom: "jackie", day: 18 },
      { title: "J_sports set(under)", yuan: 278, whom: "jackie", day: 18 },
      { title: "J_sports under(under)", yuan: 187.08, whom: "jackie", day: 18 },
      { title: "J_handwrap", yuan: 12.9, whom: "jackie", day: 18 },
      { title: "J_handwrap", yuan: 216, whom: "jackie", day: 18 },
      { title: "J_football shoes", yuan: 300, whom: "jackie", day: 18 },
      { title: "sport set", yuan: 95, whom: "me", day: 18 },
      { title: "sports set(nike)", yuan: 122.55, whom: "me", day: 25 },
      { title: "J_sports set(nike)", yuan: 122.55, whom: "jackie", day: 25 },
      { title: "J_socks(UA)", yuan: 79, whom: "jackie", day: 25 },
      { title: "J_socks(UA)", yuan: 79, whom: "jackie", day: 25 },
      { title: "J_socks(adi)", yuan: 175.8, whom: "jackie", day: 25 },
      { title: "J_shoes(ua)", yuan: 387.2, whom: "jackie", day: 25 },
      { title: "J_mystery roller", yuan: 163.6, whom: "jackie", day: 25 },
    ],
  },
  {
    month: "2026-04",
    incomes: [
      { day: 3, yuan: 76, note: "Income" },
      { day: 23, yuan: 6, note: "Income" },
      { day: 25, yuan: 1370, note: "Income" },
      { day: 26, yuan: 680, note: "Jackie" },
      { day: 29, yuan: 300, note: "Jackie" },
    ],
    goods: [
      { title: "seat mat", yuan: 25, whom: "me", day: 23 },
      { title: "(blank)", yuan: 6.9, whom: "me", day: 24 },
      { title: "Under Armour(short up)", yuan: 139, whom: "me", day: 24 },
      { title: "pillow", yuan: 55.7, whom: "me", day: 24 },
      { title: "eye massager", yuan: 238, whom: "me", day: 25 },
      { title: "badminton", yuan: 231, whom: "me", day: 25 },
      { title: "J_UA(Jackie down)", yuan: 170, whom: "jackie", day: 26 },
      { title: "J_Fila Golf trousers", yuan: 1089, whom: "jackie", day: 29 },
      { title: "J Belt", yuan: 258, whom: "jackie", day: 29 },
    ],
  },
  {
    month: "2026-05",
    incomes: [
      { day: 4, yuan: 858, note: "Income" },
      { day: 14, yuan: 1089, note: "Income" },
      { day: 31, yuan: 1280, note: "Income" },
    ],
    goods: [
      { title: "Fila(Top)", yuan: 451, whom: "me", day: 3 },
      { title: "EarPhone", yuan: 201.4, whom: "me", day: 11 },
      { title: "Bag", yuan: 259.1, whom: "me", day: 16 },
      { title: "F top(sister)", yuan: 130, whom: "family", day: 16 },
      { title: "F shoes(sister)", yuan: 138, whom: "family", day: 16 },
      { title: "J trousers(UA)", yuan: 297, whom: "jackie", day: 16 },
      { title: "F massager(family)", yuan: 137.5, whom: "family", day: 16 },
      { title: "yonex(up & down)", yuan: 144.53, whom: "me", day: 16 },
      { title: "headbar(ua)", yuan: 45, whom: "me", day: 16 },
      { title: "headbar(lining)", yuan: 14, whom: "me", day: 16 },
    ],
  },
  {
    month: "2026-06",
    incomes: [{ day: 18, yuan: 2680, note: "Income" }],
    goods: [
      { title: "J Shoes", yuan: 711, whom: "jackie", day: 8 },
      { title: "phone case", yuan: 23.8, whom: "me", day: 9 },
      { title: "Yonex shoes", yuan: 377.1, whom: "me", day: 9 },
      { title: "shoes insoles", yuan: 21.51, whom: "me", day: 9 },
      { title: "glasses(sister)", yuan: 95.01, whom: "family", day: 9 },
      { title: "lining(YB)", yuan: 93, whom: "me", day: 9 },
      { title: "headbar(YB)", yuan: 16.99, whom: "me", day: 9 },
      { title: "lighter", yuan: 2, whom: "me", day: 9 },
      { title: "barber", yuan: 20, whom: "me", day: 9 },
      { title: "J eyemask", yuan: 199, whom: "jackie", day: 18 },
      { title: "J Eyemask", yuan: 199, whom: "jackie", day: 18 },
      { title: "J Shoes", yuan: 694.66, whom: "jackie", day: 18 },
      { title: "J UA top", yuan: 462.65, whom: "jackie", day: 18 },
      { title: "yonex", yuan: 39.1, whom: "me", day: 18 },
      { title: "yonex", yuan: 54.4, whom: "me", day: 18 },
      { title: "eyemask", yuan: 8.8, whom: "me", day: 18 },
      { title: "J_bar socks", yuan: 76, whom: "jackie", day: 18 },
      { title: "J_adi trousers", yuan: 191.04, whom: "jackie", day: 18 },
      { title: "J-ad tights", yuan: 65.66, whom: "jackie", day: 18 },
      { title: "J_nike tights", yuan: 58.8, whom: "jackie", day: 18 },
      { title: "J_real madrid bag", yuan: 47, whom: "jackie", day: 18 },
      { title: "J_real madrid sock", yuan: 35.1, whom: "jackie", day: 18 },
      { title: "J_UA shoes", yuan: 238, whom: "jackie", day: 18 },
      { title: "eyemask", yuan: 25.1, whom: "me", day: 18 },
      { title: "eyemask", yuan: 131.4, whom: "me", day: 18 },
      { title: "eyemask", yuan: 66.3, whom: "me", day: 18 },
    ],
  },
  {
    month: "2026-07",
    incomes: [
      { day: 1, yuan: 12.2, note: "Income" },
      { day: 1, yuan: 1004, note: "Income" },
      { day: 31, yuan: 740, note: "Income" },
    ],
    goods: [
      { title: "Dandong xiliu", yuan: 300, whom: "me", day: 3 },
      { title: "yonex", yuan: 36, whom: "me", day: 3 },
      { title: "yonex", yuan: 108, whom: "me", day: 3 },
      { title: "vitamin c", yuan: 112, whom: "me", day: 3 },
      { title: "collagen peptides", yuan: 236.76, whom: "me", day: 3 },
      { title: "gapul", yuan: 209, whom: "family", day: 3 },
      { title: "haircut", yuan: 20, whom: "me", day: 3 },
      { title: "receiver package", yuan: 25, whom: "me", day: 30 },
    ],
  },
  {
    month: "2026-08",
    incomes: [{ day: 6, yuan: 500, note: "Income" }],
    goods: [
      { title: "UA tights", yuan: 98, whom: "me", day: 4 },
      { title: "UA trouser", yuan: 128, whom: "me", day: 4 },
      { title: "headbar", yuan: 75, whom: "me", day: 4 },
      { title: "headbar", yuan: 30, whom: "me", day: 4 },
      { title: "ua trousers 7bu", yuan: 104, whom: "me", day: 6 },
      { title: "ua t-shirt", yuan: 234, whom: "me", day: 6 },
      { title: "ua shoes", yuan: 388, whom: "me", day: 6 },
      { title: "ua down short", yuan: 59, whom: "me", day: 6 },
    ],
  },
];

function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100);
}

/** Map sheet item titles → apparel category set. */
export function inferGoodsCategory(title: string): GoodsCategory {
  const t = title.toLowerCase().trim();

  if (/cigarette|cigar|vape|tobacco|marlboro|liqun|jianghua|\bsmoke\b|lighter/.test(t)) {
    return "smoking";
  }
  if (
    /canteen|restaurant|dining|lunch|dinner|meal|coffee|tea|snack|\bfood\b|\beat\b|si\s*lu\s*(lu|ju)/.test(
      t,
    )
  ) {
    return "food";
  }
  if (
    t === "father" ||
    t === "mother" ||
    t === "money" ||
    t === "gapai" ||
    t === "gapul" ||
    /^note\b/.test(t) ||
    /^mother \(lp\)/.test(t)
  ) {
    return "cash_gift";
  }
  if (
    /headphone|earphone|earphone|bluetooth|phone case|receiver|neck fan|laptop|tablet|charger|cable|usb|mouse|keyboard|ssd|airpods|iphone|ipad|camera|speaker|electronic/.test(
      t,
    )
  ) {
    return "electronics";
  }
  if (
    /seat mat|pillow|water cup|conditioner \(clothes\)|^home$|furniture|towel|blanket|curtain|kitchen|lamp|storage/.test(
      t,
    )
  ) {
    return "home";
  }
  if (
    /makeup|\bcl\b|shampoo|conditioner \(hair\)|haircut|barber|eye\s*mask|eyemask|lipstick|skincare|perfume|lotion|serum|cosmetic|nail/.test(
      t,
    )
  ) {
    return "beauty";
  }
  if (
    /vitamin|collagen|massager|mystery roller|supplement|protein|omega|medicine|\bpill\b|clinic/.test(
      t,
    )
  ) {
    return "health";
  }
  if (/\bbag\b|backpack|handbag|purse|tote|wallet|belt/.test(t)) return "bags";
  if (
    /sock|under|handwrap|tights|white\s*×|barcelona socks|real madrid sock|underwear|brief|\bbra\b|pantyhose/.test(
      t,
    )
  ) {
    return "socks";
  }
  if (
    /shoe|sneaker|boot|sandal|slipper|trainer|forex|dandong|gold lion|asics shoes|football shoes|insoles/.test(
      t,
    )
  ) {
    return "shoes";
  }
  if (
    /hammock|dumbbell|badminton|yonex|yb \(|headband|headbar|sports? set|lining|\bgym\b|yoga|racket|bike|fitness|\bsport/.test(
      t,
    )
  ) {
    return "sports";
  }
  if (
    /clothes|swimsuit|uniqlo|t-shirt|pants|trousers|short|down|wear|vest|pierre|fila|asics up|asics down|up \(ua\)|up \(down\)|ua up|ua trousers|ua down|adidas trousers|ad tights|nike tights|cotton dream|sports under|sun hat|jacket|hoodie|coat|dress|skirt|\bshirt\b|\btee\b|sweater|jean|denim|apparel|original/.test(
      t,
    )
  ) {
    return "clothes";
  }
  if (/belt|watch|glasses/.test(t)) return "other";
  return "other";
}

const GOODS_CATEGORY_INFER_KEY = "goods_category_infer";
const GOODS_CATEGORY_INFER_VERSION = "v2";

/** One-time: rewrite each good’s category from its title. */
export function maybeBackfillGoodsCategories(db: Database): boolean {
  const stmt = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
  stmt.bind([GOODS_CATEGORY_INFER_KEY]);
  const row = stmt.step()
    ? (stmt.getAsObject() as { value?: string })
    : null;
  stmt.free();
  if (row?.value === GOODS_CATEGORY_INFER_VERSION) return false;

  const goods = db.prepare(
    `SELECT id, title, category FROM goods WHERE soft_deleted = 0`,
  );
  while (goods.step()) {
    const g = goods.getAsObject() as {
      id: string;
      title: string;
      category: string;
    };
    const next = inferGoodsCategory(g.title);
    if (next !== g.category) {
      db.run(
        `UPDATE goods SET category = ?, updated_at = datetime('now') WHERE id = ?`,
        [next, g.id],
      );
    }
  }
  goods.free();

  const existing = db.prepare(`SELECT key FROM app_settings WHERE key = ?`);
  existing.bind([GOODS_CATEGORY_INFER_KEY]);
  const has = existing.step();
  existing.free();
  if (has) {
    db.run(
      `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?`,
      [GOODS_CATEGORY_INFER_VERSION, GOODS_CATEGORY_INFER_KEY],
    );
  } else {
    db.run(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, [
      GOODS_CATEGORY_INFER_KEY,
      GOODS_CATEGORY_INFER_VERSION,
    ]);
  }

  return true;
}

function dateOn(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const maxDay = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(day, 1), maxDay);
  return `${month}-${String(d).padStart(2, "0")}`;
}

function insertCash(
  db: Database,
  kind: "deposit" | "withdraw",
  fen: number,
  occurredOn: string,
  note: string,
): void {
  if (fen <= 0) return;
  db.run(
    `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note)
     VALUES (?, ?, ?, ?, ?)`,
    [uid("pse"), kind, fen, occurredOn, note],
  );
}

function insertGood(
  db: Database,
  title: string,
  fen: number,
  purchasedOn: string,
  forWhom: GoodsForWhom,
  category: GoodsCategory,
): void {
  const goodsId = uid("god");
  db.run(
    `INSERT INTO goods
       (id, title, price_cents, purchased_on, for_whom, category, url, notes, image_data_url)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
    [goodsId, title, fen, purchasedOn, forWhom, category],
  );
  // Self = outside wallet — no purse debit.
  if (fen > 0 && isWalletWhom(forWhom)) {
    db.run(
      `INSERT INTO purse_entries
         (id, kind, amount_cents, occurred_on, note, goods_id)
       VALUES (?, 'goods_debit', ?, ?, ?, ?)`,
      [uid("pse"), fen, purchasedOn, title, goodsId],
    );
  }
}

export function purseSheetSeedVersion(db: Database): string | null {
  const stmt = db.prepare(
    `SELECT value FROM app_settings WHERE key = 'purse_sheet_seed'`,
  );
  const row = stmt.step() ? (stmt.getAsObject() as { value?: string }) : null;
  stmt.free();
  return row?.value ?? null;
}

export function markPurseSheetSeeded(db: Database): void {
  const existing = db.prepare(
    `SELECT key FROM app_settings WHERE key = 'purse_sheet_seed'`,
  );
  const has = existing.step();
  existing.free();
  if (has) {
    db.run(
      `UPDATE app_settings SET value = ?, updated_at = datetime('now')
       WHERE key = 'purse_sheet_seed'`,
      [PURSE_SHEET_SEED_VERSION],
    );
  } else {
    db.run(`INSERT INTO app_settings (key, value) VALUES ('purse_sheet_seed', ?)`, [
      PURSE_SHEET_SEED_VERSION,
    ]);
  }
}

function clearPurseData(db: Database): void {
  db.run(`DELETE FROM purse_entries`);
  db.run(`DELETE FROM goods`);
  db.run(`DELETE FROM attachment_links WHERE entity_type = 'goods'`);
}

/** Seed Goods from the Excel buy/income ledger. */
export function seedPurseFromSheet(db: Database): void {
  for (const block of MONTHS) {
    for (const income of block.incomes) {
      insertCash(
        db,
        "deposit",
        yuanToFen(income.yuan),
        dateOn(block.month, income.day),
        income.note,
      );
    }

    for (const g of block.goods) {
      insertGood(
        db,
        g.title,
        yuanToFen(g.yuan),
        dateOn(block.month, g.day),
        g.whom,
        g.category ?? inferGoodsCategory(g.title),
      );
    }
  }

  markPurseSheetSeeded(db);
}

/** Seed or upgrade sheet ledger (clears prior purse/goods rows). */
export function maybeSeedPurseSheet(db: Database): boolean {
  if (purseSheetSeedVersion(db) === PURSE_SHEET_SEED_VERSION) return false;

  // Keep photos/URLs across wipe — matched back onto reseeds by title/price/month.
  const media = snapshotGoodsMedia(db);
  clearPurseData(db);
  seedPurseFromSheet(db);
  restoreGoodsMedia(db, media);
  void saveGoodsMediaVault(media).catch(() => undefined);
  return true;
}
