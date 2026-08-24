import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatSignedMoney,
  fromCents,
  parseAmountText,
  savingsRate,
  toCents,
} from "./money";

describe("money", () => {
  it("converts without float drift for common values", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(779)).toBe(77900);
    expect(fromCents(1999)).toBe(19.99);
  });

  it("parses annotated amounts from Excel", () => {
    expect(parseAmountText("779(boss)")).toEqual({
      amount: 779,
      note: "boss",
    });
    expect(parseAmountText("100.5")).toEqual({ amount: 100.5 });
  });

  it("formats currency and signed values", () => {
    expect(formatMoney(123456, "USD")).toContain("1,234.56");
    expect(formatMoney(123456)).toContain("$");
    expect(formatSignedMoney(500)).toMatch(/^\+/);
    expect(formatSignedMoney(-500)).toMatch(/^−/);
  });

  it("returns null savings rate when income is zero", () => {
    expect(savingsRate(0, -100)).toBeNull();
    expect(savingsRate(10000, 2500)).toBe(25);
  });
});
