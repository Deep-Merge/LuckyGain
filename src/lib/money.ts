/** Money helpers — integer minor units (cents) only. */

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatMoney(
  cents: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));
}

export function formatSignedMoney(
  cents: number,
  currency = "USD",
  locale = "en-US",
): string {
  const abs = formatMoney(Math.abs(cents), currency, locale);
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `−${abs}`;
  return abs;
}

/**
 * Parse values like "779(boss)" or "1,234.50 note" into amount + optional note.
 */
export function parseAmountText(raw: string): { amount: number; note?: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(-?\d+(?:[.,]\d+)?)\s*(?:\((.+)\))?$/,
  );
  if (!match) {
    throw new Error(`Cannot parse amount: ${raw}`);
  }
  const amount = Number(match[1].replace(",", ""));
  if (!Number.isFinite(amount)) {
    throw new Error(`Cannot parse amount: ${raw}`);
  }
  const note = match[2]?.trim() || undefined;
  return { amount, note };
}

export function savingsRate(incomeCents: number, netGainCents: number): number | null {
  if (incomeCents === 0) return null;
  return (netGainCents / incomeCents) * 100;
}
