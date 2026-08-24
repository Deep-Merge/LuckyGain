import {
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { MonthPeriod } from "./types";

export function monthPeriod(anchor: Date = new Date()): MonthPeriod {
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  const today = new Date();
  const isPartial = isSameMonth(anchor, today) && today < end;
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(isPartial ? today : end, "yyyy-MM-dd"),
    key: format(start, "yyyy-MM"),
    label: format(start, "MMMM yyyy"),
    isPartial,
  };
}

export function priorMonthPeriod(anchor: Date = new Date()): MonthPeriod {
  return monthPeriod(subMonths(startOfMonth(anchor), 1));
}

export function greetingFor(name: string, now = new Date()): string {
  const hour = now.getHours();
  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

export function parseMonthKey(key: string): Date {
  return parseISO(`${key}-01`);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
