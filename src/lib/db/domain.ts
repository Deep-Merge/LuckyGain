import { format } from "date-fns";
import { monthPeriod } from "../dates";
import { savingsRate } from "../money";
import type { TxType } from "../types";
import { exec, execOne, run } from "./client";

const ACTIVE = `status IN ('posted','cleared','reconciled') AND soft_deleted = 0`;

export interface BudgetLineView {
  id: string;
  scope: string;
  label: string;
  planned_cents: number;
  actual_cents: number;
  category_id: string | null;
  person_id: string | null;
}

export interface BudgetView {
  id: string;
  month: string;
  notes: string | null;
  lines: BudgetLineView[];
  plannedExpenseCents: number;
  actualExpenseCents: number;
  plannedIncomeCents: number;
  actualIncomeCents: number;
  savingsTargetCents: number;
  remainingCents: number;
}

export function getBudgetForMonth(anchor = new Date()): BudgetView | null {
  const period = monthPeriod(anchor);
  const budget = execOne<{ id: string; month: string; notes: string | null }>(
    `SELECT id, month, notes FROM budgets WHERE month = ?`,
    [period.key],
  );
  if (!budget) return null;

  const lines = exec<{
    id: string;
    scope: string;
    label: string;
    planned_cents: number;
    category_id: string | null;
    person_id: string | null;
  }>(
    `SELECT id, scope, label, planned_cents, category_id, person_id
     FROM budget_lines WHERE budget_id = ? ORDER BY scope, label`,
    [budget.id],
  );

  const enriched: BudgetLineView[] = lines.map((line) => {
    let actual = 0;
    if (line.scope === "income") {
      actual = sumTypes(period.start, period.end, ["income"]);
    } else if (line.scope === "savings") {
      actual = sumTransferToSavings(period.start, period.end);
    } else if (line.scope === "person" && line.person_id) {
      actual =
        execOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
           WHERE ${ACTIVE} AND type IN ('expense','fee')
             AND person_id = ? AND date >= ? AND date <= ?`,
          [line.person_id, period.start, period.end],
        )?.total ?? 0;
    } else if (line.category_id) {
      actual =
        execOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
           WHERE ${ACTIVE} AND type IN ('expense','fee')
             AND category_id = ? AND date >= ? AND date <= ?`,
          [line.category_id, period.start, period.end],
        )?.total ?? 0;
    } else if (line.scope === "fixed" || line.scope === "flexible") {
      actual = 0;
    }
    return { ...line, actual_cents: actual };
  });

  const plannedExpenseCents = enriched
    .filter((l) => l.scope === "fixed" || l.scope === "flexible" || l.scope === "person")
    .reduce((s, l) => s + l.planned_cents, 0);
  const actualExpenseCents = sumTypes(period.start, period.end, ["expense", "fee"]);
  const plannedIncomeCents = enriched
    .filter((l) => l.scope === "income")
    .reduce((s, l) => s + l.planned_cents, 0);
  const actualIncomeCents = sumTypes(period.start, period.end, ["income"]);
  const savingsTargetCents = enriched
    .filter((l) => l.scope === "savings")
    .reduce((s, l) => s + l.planned_cents, 0);

  return {
    id: budget.id,
    month: budget.month,
    notes: budget.notes,
    lines: enriched,
    plannedExpenseCents,
    actualExpenseCents,
    plannedIncomeCents,
    actualIncomeCents,
    savingsTargetCents,
    remainingCents: plannedExpenseCents - actualExpenseCents,
  };
}

function sumTypes(start: string, end: string, types: TxType[]): number {
  const placeholders = types.map(() => "?").join(",");
  return (
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
       WHERE ${ACTIVE} AND type IN (${placeholders}) AND date >= ? AND date <= ?`,
      [...types, start, end],
    )?.total ?? 0
  );
}

function sumTransferToSavings(start: string, end: string): number {
  return (
    execOne<{ total: number }>(
      `SELECT COALESCE(SUM(t.amount_cents), 0) AS total
       FROM transactions t
       JOIN transaction_links l ON l.from_transaction_id = t.id
       JOIN transactions dest ON dest.id = l.to_transaction_id
       JOIN accounts a ON a.id = dest.account_id
       WHERE t.type = 'transfer' AND t.soft_deleted = 0
         AND t.status IN ('posted','cleared','reconciled')
         AND a.type = 'savings'
         AND t.date >= ? AND t.date <= ?`,
      [start, end],
    )?.total ?? 0
  );
}

import {
  getFreelanceIncomeTable,
  getProjectInsights,
  type FreelanceIncomeMonthRow,
  type ProjectInsights,
} from "./freelance";
import {
  getChuckChannelBoard,
  type ChuckChannelMonthGroup,
} from "./chuckChannel";

export type {
  FreelanceBoard,
  ProjectListItem,
  ProjectInsights,
  FreelanceIncomeMonthRow,
} from "./freelance";
export type { ChuckChannelMonthGroup, ChuckChannelEntry } from "./chuckChannel";
export {
  getFreelanceBoard,
  getProjectList,
  getProjectInsights,
  getFreelanceIncomeTable,
} from "./freelance";
export {
  getChuckChannelBoard,
  addChuckChannelEntry,
  updateChuckChannelEntry,
  deleteChuckChannelEntry,
} from "./chuckChannel";

export interface InsightsView {
  months: Array<{
    key: string;
    label: string;
    income: number;
    expense: number;
    net: number;
  }>;
  categoryShare: Array<{ name: string; total: number; color: string | null }>;
  personShare: Array<{ name: string; total: number }>;
  savingsRate: number | null;
  incomeCents: number;
  expenseCents: number;
  netGainCents: number;
  reviewCount: number;
  projects: ProjectInsights;
  freelanceMonths: FreelanceIncomeMonthRow[];
  chuckChannelMonths: ChuckChannelMonthGroup[];
  usdCnyRate: number;
}

export function getInsights(anchor = new Date()): InsightsView {
  const period = monthPeriod(anchor);
  const months: InsightsView["months"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const p = monthPeriod(d);
    // For historical complete months use full month end
    const fullEnd =
      i === 0
        ? p.end
        : format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
    const income = sumTypes(p.start, fullEnd, ["income"]);
    const expense = sumTypes(p.start, fullEnd, ["expense", "fee"]);
    months.push({
      key: p.key,
      label: format(d, "MMM"),
      income,
      expense,
      net: income - expense,
    });
  }

  const categoryShare = exec<{ name: string; total: number; color: string | null }>(
    `SELECT c.name AS name, SUM(t.amount_cents) AS total, c.color AS color
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE ${ACTIVE} AND t.type IN ('expense','fee')
       AND t.date >= ? AND t.date <= ?
     GROUP BY c.id
     ORDER BY total DESC
     LIMIT 6`,
    [period.start, period.end],
  );

  const personShare = exec<{ name: string; total: number }>(
    `SELECT p.name AS name, COALESCE(SUM(t.amount_cents), 0) AS total
     FROM people p
     LEFT JOIN transactions t
       ON t.person_id = p.id
      AND t.status IN ('posted','cleared','reconciled')
      AND t.soft_deleted = 0
      AND t.type IN ('expense','fee')
      AND t.date >= ? AND t.date <= ?
     WHERE p.archived = 0
     GROUP BY p.id
     ORDER BY p.sort_order`,
    [period.start, period.end],
  );

  const incomeCents = sumTypes(period.start, period.end, ["income"]);
  const expenseCents = sumTypes(period.start, period.end, ["expense", "fee"]);
  const netGainCents = incomeCents - expenseCents;

  const reviewCount =
    execOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM transactions
       WHERE soft_deleted = 0 AND status = 'posted'
         AND type IN ('expense','income','fee') AND category_id IS NULL`,
    )?.c ?? 0;

  return {
    months,
    categoryShare,
    personShare,
    savingsRate: savingsRate(incomeCents, netGainCents),
    incomeCents,
    expenseCents,
    netGainCents,
    reviewCount,
    projects: getProjectInsights(anchor),
    freelanceMonths: getFreelanceIncomeTable(anchor),
    chuckChannelMonths: getChuckChannelBoard(),
    usdCnyRate: getUsdCnyRate(),
  };
}

export interface AttachmentView {
  id: string;
  title: string | null;
  original_filename: string;
  mime_type: string;
  document_type: string | null;
  size_bytes: number;
  capture_date: string | null;
  created_at: string;
  linked_description: string | null;
  linked_amount_cents: number | null;
  orphan: number;
}

export function listAttachments(): AttachmentView[] {
  return exec<AttachmentView>(
    `SELECT a.id, a.title, a.original_filename, a.mime_type, a.document_type,
            a.size_bytes, a.capture_date, a.created_at,
            t.description AS linked_description,
            t.amount_cents AS linked_amount_cents,
            CASE WHEN al.id IS NULL THEN 1 ELSE 0 END AS orphan
     FROM attachments a
     LEFT JOIN attachment_links al
       ON al.attachment_id = a.id AND al.entity_type = 'transaction'
     LEFT JOIN transactions t ON t.id = al.entity_id
     WHERE a.soft_deleted = 0
     ORDER BY COALESCE(a.capture_date, a.created_at) DESC`,
  );
}

export interface SettingsSnapshot {
  userName: string;
  baseCurrency: string;
  usdCnyRate: number;
  accountCount: number;
  categoryCount: number;
  peopleCount: number;
  transactionCount: number;
  attachmentCount: number;
  clientCount: number;
  schemaVersion: string;
  storageKey: string;
}

const DEFAULT_USD_CNY_RATE = 7.2;

export function getUsdCnyRate(): number {
  const raw = execOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'usd_cny_rate'`,
  )?.value;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_CNY_RATE;
}

export function setUsdCnyRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Exchange rate must be a positive number");
  }
  const existing = execOne<{ key: string }>(
    `SELECT key FROM app_settings WHERE key = 'usd_cny_rate'`,
  );
  const value = String(rate);
  if (existing) {
    run(
      `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'usd_cny_rate'`,
      [value],
    );
  } else {
    run(`INSERT INTO app_settings (key, value) VALUES ('usd_cny_rate', ?)`, [
      value,
    ]);
  }
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return {
    userName:
      execOne<{ greeting_name: string }>(`SELECT greeting_name FROM users LIMIT 1`)
        ?.greeting_name ?? "Peter",
    baseCurrency:
      execOne<{ base_currency: string }>(`SELECT base_currency FROM users LIMIT 1`)
        ?.base_currency ?? "USD",
    usdCnyRate: getUsdCnyRate(),
    accountCount:
      execOne<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts WHERE archived = 0`)
        ?.c ?? 0,
    categoryCount:
      execOne<{ c: number }>(`SELECT COUNT(*) AS c FROM categories WHERE archived = 0`)
        ?.c ?? 0,
    peopleCount:
      execOne<{ c: number }>(`SELECT COUNT(*) AS c FROM people WHERE archived = 0`)?.c ??
      0,
    transactionCount:
      execOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM transactions WHERE soft_deleted = 0`,
      )?.c ?? 0,
    attachmentCount:
      execOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM attachments WHERE soft_deleted = 0`,
      )?.c ?? 0,
    clientCount:
      execOne<{ c: number }>(`SELECT COUNT(*) AS c FROM clients WHERE archived = 0`)
        ?.c ?? 0,
    schemaVersion:
      execOne<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = 'schema_version'`,
      )?.value ?? "1",
    storageKey: "luckygain.sqlite.v7",
  };
}
