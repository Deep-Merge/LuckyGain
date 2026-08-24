import { savingsRate } from "../money";
import { monthPeriod, priorMonthPeriod, uid } from "../dates";
import type {
  Account,
  Category,
  DashboardSummary,
  Person,
  Transaction,
  TxType,
} from "../types";
import { exec, execOne, run, withTransaction } from "./client";

const ACTIVE = `status IN ('posted','cleared','reconciled') AND soft_deleted = 0`;

export function listAccounts(): Account[] {
  return exec<Account>(
    `SELECT * FROM accounts WHERE archived = 0 ORDER BY sort_order, name`,
  ).map((account) => ({
    ...account,
    balance_cents: getAccountBalance(account.id),
  }));
}

export function getAccountBalance(accountId: string): number {
  const account = execOne<{ opening_balance_cents: number }>(
    `SELECT opening_balance_cents FROM accounts WHERE id = ?`,
    [accountId],
  );
  if (!account) return 0;

  const opening = account.opening_balance_cents;

  const inflows =
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
       WHERE account_id = ? AND ${ACTIVE}
         AND type IN ('income','refund','opening_balance')`,
      [accountId],
    )?.total ?? 0;

  const outflows =
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
       WHERE account_id = ? AND ${ACTIVE}
         AND type IN ('expense','fee')`,
      [accountId],
    )?.total ?? 0;

  const adjustments =
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
       WHERE account_id = ? AND ${ACTIVE} AND type = 'balance_adjustment'`,
      [accountId],
    )?.total ?? 0;

  const transferOut =
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(t.amount_cents), 0) AS total
       FROM transactions t
       JOIN transaction_links l ON l.from_transaction_id = t.id
       WHERE t.account_id = ? AND t.type = 'transfer'
         AND t.status IN ('posted','cleared','reconciled') AND t.soft_deleted = 0`,
      [accountId],
    )?.total ?? 0;

  const transferIn =
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(t.amount_cents), 0) AS total
       FROM transactions t
       JOIN transaction_links l ON l.to_transaction_id = t.id
       WHERE t.account_id = ? AND t.type = 'transfer'
         AND t.status IN ('posted','cleared','reconciled') AND t.soft_deleted = 0`,
      [accountId],
    )?.total ?? 0;

  return opening + inflows - outflows + adjustments - transferOut + transferIn;
}

export function listPeople(): Person[] {
  return exec<Person>(
    `SELECT * FROM people WHERE archived = 0 ORDER BY sort_order, name`,
  );
}

export function listCategories(kind?: "income" | "expense"): Category[] {
  if (kind) {
    return exec<Category>(
      `SELECT * FROM categories WHERE archived = 0 AND (kind = ? OR kind = 'both')
       ORDER BY sort_order, name`,
      [kind],
    );
  }
  return exec<Category>(
    `SELECT * FROM categories WHERE archived = 0 ORDER BY sort_order, name`,
  );
}

export function listTransactions(limit = 200): Transaction[] {
  return exec<Transaction>(
    `SELECT t.*,
            a.name AS account_name,
            a.icon AS account_icon,
            c.name AS category_name,
            c.icon AS category_icon,
            c.color AS category_color,
            p.name AS person_name,
            COALESCE(att.cnt, 0) AS attachment_count,
            CASE
              WHEN t.type IN ('expense','income','fee') AND t.category_id IS NULL THEN 1
              ELSE 0
            END AS needs_review
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN people p ON p.id = t.person_id
     LEFT JOIN (
       SELECT entity_id, COUNT(*) AS cnt
       FROM attachment_links
       WHERE entity_type = 'transaction'
       GROUP BY entity_id
     ) att ON att.entity_id = t.id
     WHERE t.soft_deleted = 0
       AND (
         t.type != 'transfer'
         OR EXISTS (
           SELECT 1 FROM transaction_links l WHERE l.from_transaction_id = t.id
         )
       )
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export function listTransactionsForMonth(anchor = new Date()): Transaction[] {
  const period = monthPeriod(anchor);
  return exec<Transaction>(
    `SELECT t.*,
            a.name AS account_name,
            a.icon AS account_icon,
            c.name AS category_name,
            c.icon AS category_icon,
            c.color AS category_color,
            p.name AS person_name,
            COALESCE(att.cnt, 0) AS attachment_count,
            CASE
              WHEN t.type IN ('expense','income','fee') AND t.category_id IS NULL THEN 1
              ELSE 0
            END AS needs_review
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN people p ON p.id = t.person_id
     LEFT JOIN (
       SELECT entity_id, COUNT(*) AS cnt
       FROM attachment_links
       WHERE entity_type = 'transaction'
       GROUP BY entity_id
     ) att ON att.entity_id = t.id
     WHERE t.soft_deleted = 0
       AND t.date >= ? AND t.date <= ?
       AND (
         t.type != 'transfer'
         OR EXISTS (
           SELECT 1 FROM transaction_links l WHERE l.from_transaction_id = t.id
         )
       )
     ORDER BY t.date DESC, t.created_at DESC`,
    [period.start, period.end],
  );
}

export function dailySparkline(
  anchor: Date,
  types: TxType[],
): number[] {
  const period = monthPeriod(anchor);
  const placeholders = types.map(() => "?").join(",");
  const rows = exec<{ day: string; total: number }>(
    `SELECT date AS day, SUM(amount_cents) AS total
     FROM transactions
     WHERE ${ACTIVE} AND type IN (${placeholders})
       AND date >= ? AND date <= ?
     GROUP BY date
     ORDER BY date`,
    [...types, period.start, period.end],
  );
  return rows.map((r) => r.total);
}

export function topExpenseCategories(anchor = new Date(), limit = 4) {
  const period = monthPeriod(anchor);
  const rows = exec<{
    name: string;
    icon: string | null;
    color: string | null;
    total_cents: number;
  }>(
    `SELECT c.name AS name, c.icon AS icon, c.color AS color,
            SUM(t.amount_cents) AS total_cents
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.soft_deleted = 0
       AND t.status IN ('posted','cleared','reconciled')
       AND t.type IN ('expense','fee')
       AND t.date >= ? AND t.date <= ?
     GROUP BY c.id
     ORDER BY total_cents DESC
     LIMIT ?`,
    [period.start, period.end, limit],
  );
  const expenseTotal = rows.reduce((s, r) => s + r.total_cents, 0) || 1;
  return rows.map((r) => ({
    ...r,
    pct: (r.total_cents / expenseTotal) * 100,
  }));
}

export function getUserName(): string {
  return (
    execOne<{ greeting_name: string }>(`SELECT greeting_name FROM users LIMIT 1`)
      ?.greeting_name ?? "there"
  );
}

export function getDashboardSummary(anchor = new Date()): DashboardSummary {
  const period = monthPeriod(anchor);
  const prior = priorMonthPeriod(anchor);

  const totalAvailableCents = listAccounts()
    .filter((a) => a.include_in_total === 1)
    .reduce((sum, a) => sum + (a.balance_cents ?? 0), 0);

  const incomeCents = sumByTypes(period.start, period.end, ["income"]);
  const expenseCents = sumByTypes(period.start, period.end, ["expense", "fee"]);
  const priorIncomeCents = sumByTypes(prior.start, prior.end, ["income"]);
  const priorExpenseCents = sumByTypes(prior.start, prior.end, [
    "expense",
    "fee",
  ]);
  const netGainCents = incomeCents - expenseCents;

  return {
    totalAvailableCents,
    incomeCents,
    expenseCents,
    netGainCents,
    savingsRate: savingsRate(incomeCents, netGainCents),
    priorIncomeCents,
    priorExpenseCents,
    priorNetGainCents: priorIncomeCents - priorExpenseCents,
    monthLabel: period.label,
    isPartialMonth: period.isPartial,
  };
}

function sumByTypes(start: string, end: string, types: TxType[]): number {
  const placeholders = types.map(() => "?").join(",");
  return (
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
       WHERE ${ACTIVE} AND type IN (${placeholders}) AND date >= ? AND date <= ?`,
      [...types, start, end],
    )?.total ?? 0
  );
}

export function spendingByPerson(anchor = new Date()) {
  const period = monthPeriod(anchor);
  return exec<{ person_id: string; name: string; total_cents: number }>(
    `SELECT p.id AS person_id, p.name AS name, COALESCE(SUM(t.amount_cents), 0) AS total_cents
     FROM people p
     LEFT JOIN transactions t
       ON t.person_id = p.id
      AND t.type = 'expense'
      AND t.status IN ('posted','cleared','reconciled')
      AND t.soft_deleted = 0
      AND t.date >= ? AND t.date <= ?
     WHERE p.archived = 0
     GROUP BY p.id
     ORDER BY p.sort_order`,
    [period.start, period.end],
  );
}

export function cashflowSeries(anchor = new Date()) {
  const period = monthPeriod(anchor);
  const rows = exec<{ day: string; type: TxType; total: number }>(
    `SELECT date AS day, type, SUM(amount_cents) AS total
     FROM transactions
     WHERE ${ACTIVE} AND type IN ('income','expense','fee')
       AND date >= ? AND date <= ?
     GROUP BY date, type
     ORDER BY date`,
    [period.start, period.end],
  );
  const map = new Map<
    string,
    { day: string; income: number; expense: number }
  >();
  for (const row of rows) {
    const current = map.get(row.day) ?? {
      day: row.day,
      income: 0,
      expense: 0,
    };
    if (row.type === "income") current.income += row.total;
    else current.expense += row.total;
    map.set(row.day, current);
  }
  return Array.from(map.values());
}

export interface NewTransactionInput {
  type: TxType;
  date: string;
  amountCents: number;
  description: string;
  notes?: string;
  accountId: string;
  categoryId?: string | null;
  personId?: string | null;
  destinationAccountId?: string | null;
}

export function createTransaction(input: NewTransactionInput): string {
  if (input.amountCents <= 0) throw new Error("Amount must be positive");
  if (input.type === "transfer") {
    if (!input.destinationAccountId) {
      throw new Error("Transfer requires a destination account");
    }
    if (input.destinationAccountId === input.accountId) {
      throw new Error("Transfer accounts must differ");
    }
    return createTransfer(input);
  }

  const id = uid("txn");
  run(
    `INSERT INTO transactions
      (id, type, status, date, amount_cents, description, notes, account_id, category_id, person_id)
     VALUES (?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.type,
      input.date,
      input.amountCents,
      input.description,
      input.notes ?? null,
      input.accountId,
      input.categoryId ?? null,
      input.personId ?? null,
    ],
  );
  return id;
}

function createTransfer(input: NewTransactionInput): string {
  const linkId = uid("lnk");
  const fromId = uid("txn");
  const toId = uid("txn");

  withTransaction(() => {
    run(
      `INSERT INTO transactions
        (id, type, status, date, amount_cents, description, notes, account_id, transfer_pair_id)
       VALUES (?, 'transfer', 'posted', ?, ?, ?, ?, ?, ?)`,
      [
        fromId,
        input.date,
        input.amountCents,
        input.description,
        input.notes ?? null,
        input.accountId,
        linkId,
      ],
    );
    run(
      `INSERT INTO transactions
        (id, type, status, date, amount_cents, description, notes, account_id, transfer_pair_id)
       VALUES (?, 'transfer', 'posted', ?, ?, ?, ?, ?, ?)`,
      [
        toId,
        input.date,
        input.amountCents,
        input.description,
        input.notes ?? null,
        input.destinationAccountId!,
        linkId,
      ],
    );
    run(
      `INSERT INTO transaction_links (id, from_transaction_id, to_transaction_id, link_type)
       VALUES (?, ?, ?, 'transfer')`,
      [linkId, fromId, toId],
    );
  });

  return fromId;
}

export function softDeleteTransaction(id: string): void {
  const tx = execOne<{ type: TxType; transfer_pair_id: string | null }>(
    `SELECT type, transfer_pair_id FROM transactions WHERE id = ?`,
    [id],
  );
  if (!tx) return;
  if (tx.type === "transfer" && tx.transfer_pair_id) {
    run(
      `UPDATE transactions SET soft_deleted = 1, updated_at = datetime('now')
       WHERE transfer_pair_id = ?`,
      [tx.transfer_pair_id],
    );
    return;
  }
  run(
    `UPDATE transactions SET soft_deleted = 1, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export function countReviewIssues(): number {
  return (
    execOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM transactions
       WHERE soft_deleted = 0 AND status = 'posted'
         AND type IN ('expense','income','fee')
         AND category_id IS NULL`,
    )?.c ?? 0
  );
}
