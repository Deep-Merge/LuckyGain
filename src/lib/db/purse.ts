import { format, parse } from "date-fns";
import { uid } from "../dates";
import { exec, execOne, run, withTransaction } from "./client";

export const GOODS_FOR_WHOM = ["me", "jackie", "family", "chuck", "self"] as const;
export type GoodsForWhom = (typeof GOODS_FOR_WHOM)[number];

/** Whom picker (Self is a separate optional outside-wallet flag). */
export const GOODS_WHOM_OPTIONS = ["me", "jackie", "family", "chuck"] as const;
export type GoodsWhomOption = (typeof GOODS_WHOM_OPTIONS)[number];

/** Marker stored in notes so Self can coexist with Me/Jackie/Family (no schema change). */
export const OUTSIDE_WALLET_MARKER = "[outside-wallet]";

/** Marker on withdraw notes for Return fee (legacy; new returns use refund deposits). */
export const RETURN_FEE_MARKER = "[return-fee]";

/** Marker on deposit notes for goods refund (price − retrieve fee). */
export const RETURN_REFUND_MARKER = "[return-refund]";

export function isReturnFeeEntry(entry: {
  kind: string;
  note?: string | null;
}): boolean {
  return (
    entry.kind === "withdraw" &&
    (entry.note ?? "").includes(RETURN_FEE_MARKER)
  );
}

export function isReturnRefundEntry(entry: {
  kind: string;
  note?: string | null;
}): boolean {
  return (
    entry.kind === "deposit" &&
    (entry.note ?? "").includes(RETURN_REFUND_MARKER)
  );
}

export function stripReturnFeeMarker(note: string | null | undefined): string {
  return (note ?? "")
    .replaceAll(RETURN_FEE_MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripReturnRefundMarker(
  note: string | null | undefined,
): string {
  return (note ?? "")
    .replaceAll(RETURN_REFUND_MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function withReturnFeeMarker(title: string): string {
  const base = title.trim() || "Return";
  return `Return fee · ${base}\n${RETURN_FEE_MARKER}`;
}

export function withReturnRefundMarker(title: string): string {
  const base = title.trim() || "Refund";
  return `Refund · ${base}\n${RETURN_REFUND_MARKER}`;
}

export function isOutsideWallet(good: {
  forWhom: GoodsForWhom;
  notes?: string | null;
}): boolean {
  // Legacy rows used for_whom = 'self'
  if (good.forWhom === "self") return true;
  return (good.notes ?? "").includes(OUTSIDE_WALLET_MARKER);
}

/** Counts against wallet Status when not marked Self/outside. */
export function isWalletGood(good: {
  forWhom: GoodsForWhom;
  notes?: string | null;
}): boolean {
  return !isOutsideWallet(good);
}

/** @deprecated use isWalletGood — whom alone is not enough when Self is a flag. */
export function isWalletWhom(whom: GoodsForWhom): boolean {
  return whom !== "self";
}

export function stripOutsideWalletMarker(
  notes: string | null | undefined,
): string {
  return (notes ?? "")
    .replaceAll(OUTSIDE_WALLET_MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function withOutsideWalletMarker(
  notes: string | null | undefined,
  outside: boolean,
): string | null {
  const base = stripOutsideWalletMarker(notes);
  if (!outside) return base || null;
  return base ? `${base}\n${OUTSIDE_WALLET_MARKER}` : OUTSIDE_WALLET_MARKER;
}

/** Whom to show in UI when legacy for_whom was 'self'. */
export function displayWhom(good: {
  forWhom: GoodsForWhom;
}): GoodsWhomOption {
  if (good.forWhom === "self") return "me";
  return good.forWhom;
}

export const GOODS_CATEGORIES = [
  { id: "clothes", label: "Clothes" },
  { id: "shoes", label: "Shoes" },
  { id: "socks", label: "Socks / Underwear" },
  { id: "bags", label: "Bags" },
  { id: "sports", label: "Sports gear" },
  { id: "beauty", label: "Beauty" },
  { id: "health", label: "Health / Supplement" },
  { id: "smoking", label: "Smoking" },
  { id: "food", label: "Food / Dining" },
  { id: "electronics", label: "Electronics" },
  { id: "home", label: "Home" },
  { id: "cash_gift", label: "Cash / Gift" },
  { id: "other", label: "Other" },
] as const;

export type GoodsCategory = (typeof GOODS_CATEGORIES)[number]["id"];

export const GOODS_CATEGORY_LABEL: Record<GoodsCategory, string> =
  Object.fromEntries(GOODS_CATEGORIES.map((c) => [c.id, c.label])) as Record<
    GoodsCategory,
    string
  >;

export type PurseEntryKind =
  | "deposit"
  | "withdraw"
  | "goods_debit"
  | "goods_credit";

export interface GoodItem {
  id: string;
  title: string;
  priceCents: number;
  purchasedOn: string;
  forWhom: GoodsForWhom;
  category: GoodsCategory;
  url: string | null;
  notes: string | null;
  imageDataUrl: string | null;
  /** Set when the purchase was returned to the wallet */
  returnedOn: string | null;
  /** When false, the good is listed but excluded from all totals. */
  enabled: boolean;
  comment: string | null;
  /** Display-only; never used in wallet or spend math. */
  calledPriceCents: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurseEntry {
  id: string;
  kind: PurseEntryKind;
  amountCents: number;
  /** Signed effect on balance */
  signedCents: number;
  occurredOn: string;
  note: string | null;
  goodsId: string | null;
  goodsTitle: string | null;
  createdAt: string;
}

export interface PurseMonthCard {
  month: string;
  label: string;
  incomeCents: number;
  withdrawCents: number;
  goodsSpendCents: number;
  netCents: number;
  goodsCount: number;
  byWhom: Array<{ whom: GoodsForWhom; spendCents: number; count: number }>;
  goods: GoodItem[];
  incomeEntries: PurseEntry[];
  cashEntries: PurseEntry[];
}

export interface PurseBoard {
  balanceCents: number;
  goodsCount: number;
  goodsSpendCents: number;
  byWhom: Array<{ whom: GoodsForWhom; spendCents: number; count: number }>;
  goods: GoodItem[];
  entries: PurseEntry[];
  recent: PurseEntry[];
  months: PurseMonthCard[];
}

function isGoodsForWhom(v: string): v is GoodsForWhom {
  return (GOODS_FOR_WHOM as readonly string[]).includes(v);
}

function isGoodsCategory(v: string): v is GoodsCategory {
  return GOODS_CATEGORIES.some((c) => c.id === v);
}

function assertForWhom(v: string): GoodsForWhom {
  if (!isGoodsForWhom(v)) throw new Error("Invalid recipient");
  return v;
}

function assertCategory(v: string): GoodsCategory {
  if (!isGoodsCategory(v)) throw new Error("Invalid category");
  return v;
}

function signedForKind(kind: PurseEntryKind, amountCents: number): number {
  if (kind === "deposit" || kind === "goods_credit") return amountCents;
  return -amountCents;
}

function mapGood(row: {
  id: string;
  title: string;
  price_cents: number;
  purchased_on: string;
  for_whom: string;
  category: string | null;
  url: string | null;
  notes: string | null;
  image_data_url: string | null;
  returned_on?: string | null;
  enabled?: number | null;
  comment?: string | null;
  called_price_cents?: number | null;
  created_at: string;
  updated_at: string;
}): GoodItem {
  return {
    id: row.id,
    title: row.title,
    priceCents: row.price_cents,
    purchasedOn: row.purchased_on,
    forWhom: isGoodsForWhom(row.for_whom) ? row.for_whom : "me",
    category: isGoodsCategory(row.category ?? "")
      ? (row.category as GoodsCategory)
      : "other",
    url: row.url,
    notes: row.notes,
    imageDataUrl: row.image_data_url,
    returnedOn: row.returned_on ?? null,
    enabled: row.enabled !== 0,
    comment: row.comment ?? null,
    calledPriceCents:
      row.called_price_cents == null ? null : row.called_price_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isReturnedGood(good: Pick<GoodItem, "returnedOn">): boolean {
  return Boolean(good.returnedOn);
}

/** Disabled goods stay visible but drop out of every total. */
export function isGoodEnabled(good: Pick<GoodItem, "enabled">): boolean {
  return good.enabled !== false;
}

function optionalYuanToCents(
  yuan: number | null | undefined,
  label: string,
): number | null {
  if (yuan == null) return null;
  if (!(yuan >= 0) || !Number.isFinite(yuan)) {
    throw new Error(`${label} must be zero or positive`);
  }
  return Math.round(yuan * 100);
}

function mapEntry(row: {
  id: string;
  kind: string;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  goods_id: string | null;
  goods_title: string | null;
  created_at: string;
}): PurseEntry {
  const kind = row.kind as PurseEntryKind;
  return {
    id: row.id,
    kind,
    amountCents: row.amount_cents,
    signedCents: signedForKind(kind, row.amount_cents),
    occurredOn: row.occurred_on,
    note: row.note,
    goodsId: row.goods_id,
    goodsTitle: row.goods_title,
    createdAt: row.created_at,
  };
}

export function getPurseBalanceCents(): number {
  const row = execOne<{ bal: number | null }>(
    `SELECT COALESCE(SUM(
        CASE kind
          WHEN 'deposit' THEN amount_cents
          WHEN 'goods_credit' THEN amount_cents
          WHEN 'withdraw' THEN -amount_cents
          WHEN 'goods_debit' THEN -amount_cents
          ELSE 0
        END
      ), 0) AS bal
     FROM purse_entries e
     LEFT JOIN goods g ON g.id = e.goods_id
     WHERE e.soft_deleted = 0
       AND (e.goods_id IS NULL OR IFNULL(g.enabled, 1) = 1)`,
  );
  return row?.bal ?? 0;
}

export function getPurseBoard(): PurseBoard {
  const goodsRows = exec<{
    id: string;
    title: string;
    price_cents: number;
    purchased_on: string;
    for_whom: string;
    category: string | null;
    url: string | null;
    notes: string | null;
    image_data_url: string | null;
    returned_on: string | null;
    enabled: number | null;
    comment: string | null;
    called_price_cents: number | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, title, price_cents, purchased_on, for_whom, category, url, notes,
            image_data_url, returned_on, enabled, comment, called_price_cents,
            created_at, updated_at
     FROM goods
     WHERE soft_deleted = 0
     ORDER BY purchased_on DESC, created_at DESC`,
  );
  const goods = goodsRows.map(mapGood);
  const countedGoods = goods.filter(isGoodEnabled);
  const disabledIds = new Set(
    goods.filter((g) => !isGoodEnabled(g)).map((g) => g.id),
  );

  const entryRows = exec<{
    id: string;
    kind: string;
    amount_cents: number;
    occurred_on: string;
    note: string | null;
    goods_id: string | null;
    goods_title: string | null;
    created_at: string;
  }>(
    `SELECT e.id, e.kind, e.amount_cents, e.occurred_on, e.note, e.goods_id,
            g.title AS goods_title, e.created_at
     FROM purse_entries e
     LEFT JOIN goods g ON g.id = e.goods_id
     WHERE e.soft_deleted = 0
     ORDER BY e.occurred_on DESC, e.created_at DESC`,
  );
  const entries = entryRows.map(mapEntry);

  const byWhomMap = new Map<GoodsForWhom, { spendCents: number; count: number }>();
  for (const w of GOODS_FOR_WHOM) {
    byWhomMap.set(w, { spendCents: 0, count: 0 });
  }
  for (const g of countedGoods) {
    const slot = byWhomMap.get(g.forWhom)!;
    slot.spendCents += g.priceCents;
    slot.count += 1;
  }

  const monthKeys = new Set<string>();
  for (const g of goods) {
    monthKeys.add(g.purchasedOn.slice(0, 7));
    if (g.returnedOn) monthKeys.add(g.returnedOn.slice(0, 7));
  }
  for (const e of entries) monthKeys.add(e.occurredOn.slice(0, 7));

  const months: PurseMonthCard[] = [...monthKeys]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => {
      // Purchases this month + returns dated this month (for refund group UI).
      const monthGoods = goods.filter(
        (g) =>
          g.purchasedOn.startsWith(month) ||
          Boolean(g.returnedOn?.startsWith(month)),
      );
      // Spend always follows original purchase month (returned goods still count).
      const monthSpendGoods = countedGoods.filter((g) =>
        g.purchasedOn.startsWith(month),
      );
      const monthEntries = entries.filter((e) => e.occurredOn.startsWith(month));
      const cashEntries = monthEntries.filter(
        (e) =>
          (e.kind === "deposit" || e.kind === "withdraw") &&
          !(e.goodsId && disabledIds.has(e.goodsId)),
      );
      const incomeEntries = cashEntries.filter((e) => e.kind === "deposit");
      const incomeCents = incomeEntries.reduce((s, e) => s + e.amountCents, 0);
      const withdrawCents = cashEntries
        .filter((e) => e.kind === "withdraw")
        .reduce((s, e) => s + e.amountCents, 0);
      const goodsSpendCents = monthSpendGoods.reduce(
        (s, g) => s + g.priceCents,
        0,
      );
      const whomMap = new Map<
        GoodsForWhom,
        { spendCents: number; count: number }
      >();
      for (const w of GOODS_FOR_WHOM) {
        whomMap.set(w, { spendCents: 0, count: 0 });
      }
      for (const g of monthSpendGoods) {
        const slot = whomMap.get(g.forWhom)!;
        slot.spendCents += g.priceCents;
        slot.count += 1;
      }
      let label = month;
      try {
        label = format(
          parse(`${month}-01`, "yyyy-MM-dd", new Date()),
          "MMMM yyyy",
        );
      } catch {
        /* keep month key */
      }
      return {
        month,
        label,
        incomeCents,
        withdrawCents,
        goodsSpendCents,
        netCents: incomeCents - withdrawCents - goodsSpendCents,
        goodsCount: monthSpendGoods.length,
        byWhom: GOODS_FOR_WHOM.map((whom) => ({
          whom,
          spendCents: whomMap.get(whom)!.spendCents,
          count: whomMap.get(whom)!.count,
        })),
        goods: monthGoods,
        incomeEntries,
        cashEntries,
      };
    });

  return {
    balanceCents: getPurseBalanceCents(),
    goodsCount: countedGoods.length,
    goodsSpendCents: countedGoods.reduce((s, g) => s + g.priceCents, 0),
    byWhom: GOODS_FOR_WHOM.map((whom) => ({
      whom,
      spendCents: byWhomMap.get(whom)!.spendCents,
      count: byWhomMap.get(whom)!.count,
    })),
    goods,
    entries,
    recent: entries.slice(0, 8),
    months,
  };
}

export function addPurseCash(input: {
  kind: "deposit" | "withdraw";
  amountYuan: number;
  occurredOn?: string;
  note?: string;
}): string {
  if (!(input.amountYuan > 0)) throw new Error("Amount must be positive");
  const amountCents = Math.round(input.amountYuan * 100);
  const id = uid("pse");
  const occurredOn =
    input.occurredOn?.trim().slice(0, 10) ||
    format(new Date(), "yyyy-MM-dd");
  run(
    `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      input.kind,
      amountCents,
      occurredOn,
      input.note?.trim() || null,
    ],
  );
  return id;
}

export function updatePurseCashEntry(input: {
  id: string;
  amountYuan: number;
  occurredOn: string;
  note?: string | null;
}): void {
  if (!(input.amountYuan > 0)) throw new Error("Amount must be positive");
  const row = execOne<{ kind: string }>(
    `SELECT kind FROM purse_entries WHERE id = ? AND soft_deleted = 0`,
    [input.id],
  );
  if (!row) throw new Error("Entry not found");
  if (row.kind !== "deposit" && row.kind !== "withdraw") {
    throw new Error("Only manual cash entries can be edited here");
  }
  const note = input.note?.trim() || null;
  if (note && isTaggedPartnerIncomeNote(note)) {
    throw new Error("Partner income is recorded on Insights → Partners");
  }
  run(
    `UPDATE purse_entries
     SET amount_cents = ?,
         occurred_on = ?,
         note = ?,
         updated_at = datetime('now')
     WHERE id = ? AND soft_deleted = 0`,
    [
      Math.round(input.amountYuan * 100),
      input.occurredOn.trim().slice(0, 10),
      note,
      input.id,
    ],
  );
}

export function deletePurseCashEntry(id: string): void {
  const row = execOne<{ kind: string }>(
    `SELECT kind FROM purse_entries WHERE id = ? AND soft_deleted = 0`,
    [id],
  );
  if (!row) throw new Error("Entry not found");
  if (row.kind !== "deposit" && row.kind !== "withdraw") {
    throw new Error("Only manual cash entries can be deleted here");
  }
  run(
    `UPDATE purse_entries
     SET soft_deleted = 1, updated_at = datetime('now')
     WHERE id = ?`,
    [id],
  );
}

export function addGood(input: {
  title: string;
  priceYuan: number;
  purchasedOn?: string;
  forWhom: GoodsForWhom;
  category: GoodsCategory;
  url?: string | null;
  notes?: string | null;
  imageDataUrl?: string | null;
  enabled?: boolean;
  comment?: string | null;
  calledPriceYuan?: number | null;
}): string {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (!(input.priceYuan >= 0) || !Number.isFinite(input.priceYuan)) {
    throw new Error("Price must be zero or positive");
  }
  const forWhom = assertForWhom(input.forWhom);
  const category = assertCategory(input.category);
  const priceCents = Math.round(input.priceYuan * 100);
  const purchasedOn =
    input.purchasedOn?.trim().slice(0, 10) ||
    format(new Date(), "yyyy-MM-dd");
  const goodsId = uid("god");
  const entryId = uid("pse");
  const url = input.url?.trim() || null;
  const notes = input.notes?.trim() || null;
  const imageDataUrl = input.imageDataUrl?.trim() || null;
  const enabled = input.enabled !== false;
  const comment = input.comment?.trim() || null;
  const calledPriceCents = optionalYuanToCents(
    input.calledPriceYuan,
    "Called price",
  );

  withTransaction(() => {
    run(
      `INSERT INTO goods
         (id, title, price_cents, purchased_on, for_whom, category, url, notes,
          image_data_url, enabled, comment, called_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        goodsId,
        title,
        priceCents,
        purchasedOn,
        forWhom,
        category,
        url,
        notes,
        imageDataUrl,
        enabled ? 1 : 0,
        comment,
        calledPriceCents,
      ],
    );
    // Self = outside this wallet — log the good, but do not debit purse.
    if (
      priceCents > 0 &&
      isWalletGood({ forWhom, notes })
    ) {
      run(
        `INSERT INTO purse_entries
           (id, kind, amount_cents, occurred_on, note, goods_id)
         VALUES (?, 'goods_debit', ?, ?, ?, ?)`,
        [entryId, priceCents, purchasedOn, title, goodsId],
      );
    }
  });

  return goodsId;
}

export function updateGood(input: {
  id: string;
  title: string;
  priceYuan: number;
  purchasedOn: string;
  forWhom: GoodsForWhom;
  category: GoodsCategory;
  url?: string | null;
  notes?: string | null;
  imageDataUrl?: string | null;
  enabled?: boolean;
  comment?: string | null;
  calledPriceYuan?: number | null;
}): void {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (!(input.priceYuan >= 0) || !Number.isFinite(input.priceYuan)) {
    throw new Error("Price must be zero or positive");
  }
  const forWhom = assertForWhom(input.forWhom);
  const category = assertCategory(input.category);
  const priceCents = Math.round(input.priceYuan * 100);
  const purchasedOn = input.purchasedOn.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) {
    throw new Error("Invalid purchase date");
  }

  const existing = execOne<{
    price_cents: number;
    title: string;
    for_whom: string;
    notes: string | null;
  }>(
    `SELECT price_cents, title, for_whom, notes FROM goods WHERE id = ? AND soft_deleted = 0`,
    [input.id],
  );
  if (!existing) throw new Error("Good not found");

  const url = input.url?.trim() || null;
  const notes = input.notes?.trim() || null;
  const comment = input.comment?.trim() || null;
  const calledPriceCents = optionalYuanToCents(
    input.calledPriceYuan,
    "Called price",
  );
  const enabled = input.enabled !== false;
  const imageDataUrl =
    input.imageDataUrl === undefined
      ? undefined
      : input.imageDataUrl?.trim() || null;

  const wasWallet = isWalletGood({
    forWhom: isGoodsForWhom(existing.for_whom) ? existing.for_whom : "me",
    notes: existing.notes,
  });
  const nowWallet = isWalletGood({ forWhom, notes });

  withTransaction(() => {
    if (imageDataUrl === undefined) {
      run(
        `UPDATE goods
         SET title = ?, price_cents = ?, purchased_on = ?, for_whom = ?,
             category = ?, url = ?, notes = ?, enabled = ?, comment = ?,
             called_price_cents = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          title,
          priceCents,
          purchasedOn,
          forWhom,
          category,
          url,
          notes,
          enabled ? 1 : 0,
          comment,
          calledPriceCents,
          input.id,
        ],
      );
    } else {
      run(
        `UPDATE goods
         SET title = ?, price_cents = ?, purchased_on = ?, for_whom = ?,
             category = ?, url = ?, notes = ?, image_data_url = ?,
             enabled = ?, comment = ?, called_price_cents = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          title,
          priceCents,
          purchasedOn,
          forWhom,
          category,
          url,
          notes,
          imageDataUrl,
          enabled ? 1 : 0,
          comment,
          calledPriceCents,
          input.id,
        ],
      );
    }

    if (!wasWallet && !nowWallet) {
      return;
    }

    if (wasWallet && !nowWallet) {
      run(
        `UPDATE purse_entries
         SET soft_deleted = 1, updated_at = datetime('now')
         WHERE goods_id = ? AND soft_deleted = 0`,
        [input.id],
      );
      return;
    }

    if (!wasWallet && nowWallet) {
      if (priceCents > 0) {
        run(
          `INSERT INTO purse_entries
             (id, kind, amount_cents, occurred_on, note, goods_id)
           VALUES (?, 'goods_debit', ?, ?, ?, ?)`,
          [uid("pse"), priceCents, purchasedOn, title, input.id],
        );
      }
      return;
    }

    const delta = priceCents - existing.price_cents;
    if (delta > 0) {
      run(
        `INSERT INTO purse_entries
           (id, kind, amount_cents, occurred_on, note, goods_id)
         VALUES (?, 'goods_debit', ?, ?, ?, ?)`,
        [
          uid("pse"),
          delta,
          purchasedOn,
          `Price up · ${title}`,
          input.id,
        ],
      );
    } else if (delta < 0) {
      run(
        `INSERT INTO purse_entries
           (id, kind, amount_cents, occurred_on, note, goods_id)
         VALUES (?, 'goods_credit', ?, ?, ?, ?)`,
        [
          uid("pse"),
          Math.abs(delta),
          purchasedOn,
          `Price down · ${title}`,
          input.id,
        ],
      );
    } else {
      run(
        `UPDATE purse_entries
         SET occurred_on = ?, note = ?, updated_at = datetime('now')
         WHERE goods_id = ? AND kind = 'goods_debit' AND soft_deleted = 0
           AND id = (
             SELECT id FROM purse_entries
             WHERE goods_id = ? AND kind = 'goods_debit' AND soft_deleted = 0
             ORDER BY created_at ASC LIMIT 1
           )`,
        [purchasedOn, title, input.id, input.id],
      );
    }
  });
}

export function setGoodEnabled(id: string, enabled: boolean): void {
  const existing = execOne<{ id: string }>(
    `SELECT id FROM goods WHERE id = ? AND soft_deleted = 0`,
    [id],
  );
  if (!existing) throw new Error("Good not found");
  run(
    `UPDATE goods
     SET enabled = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [enabled ? 1 : 0, id],
  );
}

export function deleteGood(id: string): void {
  const existing = execOne<{ title: string; price_cents: number }>(
    `SELECT title, price_cents FROM goods WHERE id = ? AND soft_deleted = 0`,
    [id],
  );
  if (!existing) throw new Error("Good not found");

  withTransaction(() => {
    run(
      `UPDATE goods
       SET soft_deleted = 1, updated_at = datetime('now')
       WHERE id = ?`,
      [id],
    );
    // Soft-delete related goods ledger lines
    run(
      `UPDATE purse_entries
       SET soft_deleted = 1, updated_at = datetime('now')
       WHERE goods_id = ? AND soft_deleted = 0`,
      [id],
    );
    // Net effect of removing those lines restores balance; no extra credit needed
    // because soft-delete removes both debits and any price-adjust credits for this good.
  });
}

/**
 * Return a wallet purchase.
 * Keeps the original spend (−price on purchase date).
 * Adds a wallet deposit for refund = price − retrieve fee on the return date.
 */
export function returnGood(input: {
  id: string;
  feeYuan: number;
  returnedOn?: string;
}): void {
  if (!(input.feeYuan >= 0) || !Number.isFinite(input.feeYuan)) {
    throw new Error("Return fee must be zero or positive");
  }
  const feeCents = Math.round(input.feeYuan * 100);

  const existing = execOne<{
    title: string;
    price_cents: number;
    for_whom: string;
    notes: string | null;
    returned_on: string | null;
  }>(
    `SELECT title, price_cents, for_whom, notes, returned_on
     FROM goods WHERE id = ? AND soft_deleted = 0`,
    [input.id],
  );
  if (!existing) throw new Error("Good not found");
  if (existing.returned_on) {
    throw new Error("This purchase was already returned");
  }

  const forWhom = isGoodsForWhom(existing.for_whom)
    ? existing.for_whom
    : "me";
  if (!isWalletGood({ forWhom, notes: existing.notes })) {
    throw new Error("Only wallet purchases can be returned");
  }
  if (feeCents > existing.price_cents) {
    throw new Error("Return fee cannot exceed the purchase price");
  }

  const returnedOn =
    input.returnedOn?.trim().slice(0, 10) ||
    format(new Date(), "yyyy-MM-dd");
  const refundCents = existing.price_cents - feeCents;

  withTransaction(() => {
    run(
      `UPDATE goods
       SET returned_on = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [returnedOn, input.id],
    );
    // Original goods_debit stays — purchase date still −price.
    // Refund (except fee) lands as wallet income on the return date.
    if (refundCents > 0) {
      run(
        `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note, goods_id)
         VALUES (?, 'deposit', ?, ?, ?, ?)`,
        [
          uid("pse"),
          refundCents,
          returnedOn,
          withReturnRefundMarker(existing.title),
          input.id,
        ],
      );
    }
  });
}

/**
 * Update retrieve fee / return date for an already-returned good.
 * Adjusts the wallet refund deposit (price − fee).
 */
export function updateGoodReturnFee(input: {
  id: string;
  feeYuan: number;
  returnedOn?: string;
}): void {
  if (!(input.feeYuan >= 0) || !Number.isFinite(input.feeYuan)) {
    throw new Error("Return fee must be zero or positive");
  }
  const feeCents = Math.round(input.feeYuan * 100);

  const existing = execOne<{
    title: string;
    price_cents: number;
    for_whom: string;
    notes: string | null;
    returned_on: string | null;
  }>(
    `SELECT title, price_cents, for_whom, notes, returned_on
     FROM goods WHERE id = ? AND soft_deleted = 0`,
    [input.id],
  );
  if (!existing) throw new Error("Good not found");
  if (!existing.returned_on) {
    throw new Error("This purchase has not been returned yet");
  }

  const forWhom = isGoodsForWhom(existing.for_whom)
    ? existing.for_whom
    : "me";
  if (!isWalletGood({ forWhom, notes: existing.notes })) {
    throw new Error("Only wallet purchases can be returned");
  }
  if (feeCents > existing.price_cents) {
    throw new Error("Return fee cannot exceed the purchase price");
  }

  const returnedOn =
    input.returnedOn?.trim().slice(0, 10) || existing.returned_on;
  const refundCents = existing.price_cents - feeCents;

  const refundEntry = execOne<{ id: string }>(
    `SELECT id
     FROM purse_entries
     WHERE goods_id = ?
       AND soft_deleted = 0
       AND kind = 'deposit'
       AND IFNULL(note, '') LIKE ?
     ORDER BY occurred_on DESC, created_at DESC
     LIMIT 1`,
    [input.id, `%${RETURN_REFUND_MARKER}%`],
  );

  withTransaction(() => {
    run(
      `UPDATE goods
       SET returned_on = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [returnedOn, input.id],
    );

    if (refundCents > 0) {
      if (refundEntry) {
        run(
          `UPDATE purse_entries
           SET amount_cents = ?,
               occurred_on = ?,
               note = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [
            refundCents,
            returnedOn,
            withReturnRefundMarker(existing.title),
            refundEntry.id,
          ],
        );
      } else {
        run(
          `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note, goods_id)
           VALUES (?, 'deposit', ?, ?, ?, ?)`,
          [
            uid("pse"),
            refundCents,
            returnedOn,
            withReturnRefundMarker(existing.title),
            input.id,
          ],
        );
      }
    } else if (refundEntry) {
      run(
        `UPDATE purse_entries
         SET soft_deleted = 1, updated_at = datetime('now')
         WHERE id = ?`,
        [refundEntry.id],
      );
    }
  });
}

function isJackieIncomeNote(note: string | null | undefined): boolean {
  return isPartnerIncomeNote("jackie", note);
}

function isChuckIncomeNote(note: string | null | undefined): boolean {
  return isPartnerIncomeNote("chuck", note);
}

export type PartnerIncomeTag = "jackie" | "chuck";

export function isPartnerIncomeNote(
  tag: PartnerIncomeTag,
  note: string | null | undefined,
): boolean {
  const n = (note ?? "").trim().toLowerCase();
  return n === tag || n.startsWith(`${tag} `);
}

/** Any partner-tagged deposit that should not count as goods-wallet income. */
export function isTaggedPartnerIncomeNote(
  note: string | null | undefined,
): boolean {
  return isJackieIncomeNote(note) || isChuckIncomeNote(note);
}

export { isJackieIncomeNote, isChuckIncomeNote };

export interface PartnerMonthRollup {
  incomeCents: number;
  goodsCents: number;
}

/** Partner purse income + goods spend rolled up by yyyy-MM. */
export function getPartnerMonthRollups(
  tag: PartnerIncomeTag,
): Map<string, PartnerMonthRollup> {
  const map = new Map<string, PartnerMonthRollup>();

  function bump(month: string, patch: Partial<PartnerMonthRollup>) {
    const cur = map.get(month) ?? { incomeCents: 0, goodsCents: 0 };
    if (patch.incomeCents) cur.incomeCents += patch.incomeCents;
    if (patch.goodsCents) cur.goodsCents += patch.goodsCents;
    map.set(month, cur);
  }

  const deposits = exec<{
    occurred_on: string;
    amount_cents: number;
    note: string | null;
  }>(
    `SELECT occurred_on, amount_cents, note
     FROM purse_entries
     WHERE soft_deleted = 0 AND kind = 'deposit'`,
  );
  for (const row of deposits) {
    if (!isPartnerIncomeNote(tag, row.note)) continue;
    const month = row.occurred_on.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    bump(month, { incomeCents: row.amount_cents });
  }

  const goods = exec<{ purchased_on: string; price_cents: number }>(
    `SELECT purchased_on, price_cents
     FROM goods
     WHERE soft_deleted = 0
       AND IFNULL(enabled, 1) = 1
       AND for_whom = ?`,
    [tag],
  );
  for (const row of goods) {
    const month = row.purchased_on.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    bump(month, { goodsCents: row.price_cents });
  }

  return map;
}

/** @deprecated prefer getPartnerMonthRollups("jackie") */
export function getJackieMonthRollups(): Map<string, PartnerMonthRollup> {
  return getPartnerMonthRollups("jackie");
}

/**
 * Set partner deposit total for a calendar month (Yuan).
 * Replaces that partner’s deposits that month so Goods stays in sync.
 */
export function upsertPartnerMonthIncome(
  tag: PartnerIncomeTag,
  input: { month: string; amountYuan: number },
): void {
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("Invalid month");
  }
  if (!Number.isFinite(input.amountYuan) || input.amountYuan < 0) {
    throw new Error("Income must be zero or positive");
  }

  const amountCents = Math.round(input.amountYuan * 100);
  const monthPrefix = `${input.month}%`;
  const noteLabel = tag === "jackie" ? "Jackie" : "Chuck";

  withTransaction(() => {
    const existing = exec<{ id: string; note: string | null }>(
      `SELECT id, note
       FROM purse_entries
       WHERE soft_deleted = 0
         AND kind = 'deposit'
         AND occurred_on LIKE ?`,
      [monthPrefix],
    );
    for (const row of existing) {
      if (!isPartnerIncomeNote(tag, row.note)) continue;
      run(
        `UPDATE purse_entries
         SET soft_deleted = 1, updated_at = datetime('now')
         WHERE id = ?`,
        [row.id],
      );
    }

    if (amountCents > 0) {
      run(
        `INSERT INTO purse_entries (id, kind, amount_cents, occurred_on, note)
         VALUES (?, 'deposit', ?, ?, ?)`,
        [uid("pse"), amountCents, `${input.month}-01`, noteLabel],
      );
    }
  });
}

export function upsertJackieMonthIncome(input: {
  month: string;
  amountYuan: number;
}): void {
  upsertPartnerMonthIncome("jackie", input);
}

export function upsertChuckMonthIncome(input: {
  month: string;
  amountYuan: number;
}): void {
  upsertPartnerMonthIncome("chuck", input);
}
