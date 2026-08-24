import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function deltaLabel(current: number, prior: number): string {
  if (prior === 0) return current === 0 ? "—" : "new";
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}
