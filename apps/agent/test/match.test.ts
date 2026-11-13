import { describe, expect, test } from "bun:test";
import type { BankTransaction } from "../src/bank/types";
import { matchPayment, type TradeTerms } from "../src/verify/match";

const opened = Date.parse("2026-11-12T10:00:00Z");
const terms: TradeTerms = {
  id: "7",
  reference: "KF7Q2M9X",
  fiatKobo: 16_000_000n,
  openedMs: opened,
  expiresMs: opened + 30 * 60 * 1000,
};
const options = { overpayToleranceKobo: 10_000n, clockSkewMs: 5 * 60 * 1000, isUsed: () => false };

function tx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "tx1",
    type: "debit",
    amountKobo: 16_000_000n,
    narration: "TRF/KF-7Q2M-9X/TO ADA OBI",
    date: new Date(opened + 5 * 60 * 1000).toISOString(),
    currency: "NGN",
    ...overrides,
  };
}

describe("matchPayment", () => {
  test("accepts an exact transfer with the reference in the narration", () => {
    const result = matchPayment(terms, [tx()], options);
    expect(result.ok).toBe(true);
  });

  test("ignores separators and case in the reference", () => {
    expect(matchPayment(terms, [tx({ narration: "trf kf 7q2m 9x for usdt" })], options).ok).toBe(true);
  });

  test("rejects underpayment", () => {
    const result = matchPayment(terms, [tx({ amountKobo: 15_999_999n })], options);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "amount")?.passed).toBe(false);
  });

  test("allows small overpayment within tolerance only", () => {
    expect(matchPayment(terms, [tx({ amountKobo: 16_010_000n })], options).ok).toBe(true);
    expect(matchPayment(terms, [tx({ amountKobo: 16_010_001n })], options).ok).toBe(false);
  });

  test("rejects a transfer without the reference", () => {
    const result = matchPayment(terms, [tx({ narration: "TRF/USDT/TO ADA OBI" })], options);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "reference")?.passed).toBe(false);
  });

  test("rejects transfers sent after the window", () => {
    const late = new Date(terms.expiresMs + 6 * 60 * 1000).toISOString();
    expect(matchPayment(terms, [tx({ date: late })], options).ok).toBe(false);
  });

  test("rejects transfers sent before the trade opened", () => {
    const early = new Date(opened - 10 * 60 * 1000).toISOString();
    expect(matchPayment(terms, [tx({ date: early })], options).ok).toBe(false);
  });

  test("rejects credits and reused transfers", () => {
    expect(matchPayment(terms, [tx({ type: "credit" })], options).ok).toBe(false);
    expect(matchPayment(terms, [tx()], { ...options, isUsed: () => true }).ok).toBe(false);
  });

  test("picks the matching transfer among many", () => {
    const result = matchPayment(
      terms,
      [tx({ id: "a", amountKobo: 1_000n }), tx({ id: "b", narration: "AIRTIME" }), tx({ id: "c" })],
      options,
    );
    expect(result.ok && result.transaction.id).toBe("c");
  });

  test("reports missing activity clearly", () => {
    const result = matchPayment(terms, [], options);
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.name).toBe("bank_activity");
  });

  test("accepts banks that report only the date of the trade day", () => {
    expect(matchPayment(terms, [tx({ date: "2026-11-12T00:00:00.000Z" })], options).ok).toBe(true);
    expect(matchPayment(terms, [tx({ date: "2026-11-11T23:00:00.000Z" })], options).ok).toBe(true);
  });

  test("rejects date-only transfers from another day", () => {
    expect(matchPayment(terms, [tx({ date: "2026-11-11T00:00:00.000Z" })], options).ok).toBe(false);
    expect(matchPayment(terms, [tx({ date: "2026-11-13T00:00:00.000Z" })], options).ok).toBe(false);
  });

  test("payee hint is advisory only", () => {
    const result = matchPayment(terms, [tx({ narration: "KF7Q2M9X" })], { ...options, payeeHints: ["ADA OBI"] });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "payee")?.passed).toBe(false);
  });
});
