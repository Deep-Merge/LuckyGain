import { format } from "date-fns";
import { uid } from "../dates";
import { exec, execOne, run } from "./client";

export interface ChuckChannelEntry {
  id: string;
  occurredOn: string;
  givenCents: number;
  realIncomeCents: number;
  note: string | null;
}

export interface ChuckChannelMonthGroup {
  month: string;
  label: string;
  givenCents: number;
  realIncomeCents: number;
  netCents: number;
  entries: ChuckChannelEntry[];
}

function mapEntry(row: {
  id: string;
  occurred_on: string;
  given_cents: number;
  real_income_cents: number;
  note: string | null;
}): ChuckChannelEntry {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    givenCents: row.given_cents ?? 0,
    realIncomeCents: row.real_income_cents ?? 0,
    note: row.note,
  };
}

export function listChuckChannelEntries(): ChuckChannelEntry[] {
  return exec<{
    id: string;
    occurred_on: string;
    given_cents: number;
    real_income_cents: number;
    note: string | null;
  }>(
    `SELECT id, occurred_on, given_cents, real_income_cents, note
     FROM chuck_channel_entries
     WHERE soft_deleted = 0
     ORDER BY occurred_on DESC, created_at DESC`,
  ).map(mapEntry);
}

/** Month groups that have at least one entry (empty months omitted). */
export function getChuckChannelBoard(): ChuckChannelMonthGroup[] {
  const entries = listChuckChannelEntries();
  const byMonth = new Map<string, ChuckChannelEntry[]>();

  for (const entry of entries) {
    const month = entry.occurredOn.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const list = byMonth.get(month) ?? [];
    list.push(entry);
    byMonth.set(month, list);
  }

  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, monthEntries]) => {
      const [y, m] = month.split("-").map(Number);
      const givenCents = monthEntries.reduce((s, e) => s + e.givenCents, 0);
      const realIncomeCents = monthEntries.reduce(
        (s, e) => s + e.realIncomeCents,
        0,
      );
      return {
        month,
        label: format(new Date(y, m - 1, 1), "MMM yyyy"),
        givenCents,
        realIncomeCents,
        netCents: realIncomeCents - givenCents,
        entries: monthEntries.sort((a, b) =>
          b.occurredOn.localeCompare(a.occurredOn),
        ),
      };
    });
}

/** @deprecated use getChuckChannelBoard */
export function getChuckChannelTable(): ChuckChannelMonthGroup[] {
  return getChuckChannelBoard();
}

export function addChuckChannelEntry(input: {
  occurredOn: string;
  givenUsd: number;
  realIncomeUsd: number;
  note?: string;
}): string {
  const occurredOn = input.occurredOn.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error("Invalid date");
  }
  if (!Number.isFinite(input.givenUsd) || input.givenUsd < 0) {
    throw new Error("Given amount must be zero or positive");
  }
  if (!Number.isFinite(input.realIncomeUsd) || input.realIncomeUsd < 0) {
    throw new Error("Real income must be zero or positive");
  }
  if (input.givenUsd === 0 && input.realIncomeUsd === 0) {
    throw new Error("Enter given or real income");
  }

  const id = uid("cce");
  run(
    `INSERT INTO chuck_channel_entries
       (id, occurred_on, given_cents, real_income_cents, note)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      occurredOn,
      Math.round(input.givenUsd * 100),
      Math.round(input.realIncomeUsd * 100),
      input.note?.trim() || null,
    ],
  );
  return id;
}

export function updateChuckChannelEntry(input: {
  id: string;
  occurredOn: string;
  givenUsd: number;
  realIncomeUsd: number;
  note?: string | null;
}): void {
  const occurredOn = input.occurredOn.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error("Invalid date");
  }
  if (!Number.isFinite(input.givenUsd) || input.givenUsd < 0) {
    throw new Error("Given amount must be zero or positive");
  }
  if (!Number.isFinite(input.realIncomeUsd) || input.realIncomeUsd < 0) {
    throw new Error("Real income must be zero or positive");
  }
  if (input.givenUsd === 0 && input.realIncomeUsd === 0) {
    throw new Error("Enter given or real income");
  }

  const existing = execOne<{ id: string }>(
    `SELECT id FROM chuck_channel_entries WHERE id = ? AND soft_deleted = 0`,
    [input.id],
  );
  if (!existing) throw new Error("Entry not found");

  run(
    `UPDATE chuck_channel_entries
     SET occurred_on = ?,
         given_cents = ?,
         real_income_cents = ?,
         note = ?,
         updated_at = datetime('now')
     WHERE id = ? AND soft_deleted = 0`,
    [
      occurredOn,
      Math.round(input.givenUsd * 100),
      Math.round(input.realIncomeUsd * 100),
      input.note?.trim() || null,
      input.id,
    ],
  );
}

export function deleteChuckChannelEntry(id: string): void {
  run(
    `UPDATE chuck_channel_entries
     SET soft_deleted = 1, updated_at = datetime('now')
     WHERE id = ? AND soft_deleted = 0`,
    [id],
  );
}
