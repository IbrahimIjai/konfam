import { normalizeReference, type VerificationCheck } from "@konfam/shared";
import type { BankTransaction } from "../bank/types";

export interface TradeTerms {
  id: string;
  reference: string;
  fiatKobo: bigint;
  openedMs: number;
  expiresMs: number;
}

export interface MatchOptions {
  overpayToleranceKobo: bigint;
  clockSkewMs: number;
  isUsed: (transactionId: string) => boolean;
  payeeHints?: string[];
}

const DAY_MS = 86_400_000;
const WAT_OFFSET_MS = 3_600_000;

export function isDateOnly(ms: number): boolean {
  return ms % DAY_MS === 0 || (ms + WAT_OFFSET_MS) % DAY_MS === 0;
}

function lagosDay(ms: number): number {
  return Math.floor((ms + WAT_OFFSET_MS) / DAY_MS);
}

function insideWindow(at: number, trade: TradeTerms, skewMs: number): boolean {
  if (!Number.isFinite(at)) return false;
  if (isDateOnly(at)) return lagosDay(at) >= lagosDay(trade.openedMs) && lagosDay(at) <= lagosDay(trade.expiresMs);
  return at >= trade.openedMs - skewMs && at <= trade.expiresMs + skewMs;
}

export type MatchResult =
  | { ok: true; transaction: BankTransaction; checks: VerificationCheck[] }
  | { ok: false; checks: VerificationCheck[] };

function evaluate(trade: TradeTerms, tx: BankTransaction, options: MatchOptions): VerificationCheck[] {
  const at = Date.parse(tx.date);
  const reference = normalizeReference(trade.reference);
  const narration = normalizeReference(tx.narration);
  const maxAmount = trade.fiatKobo + options.overpayToleranceKobo;
  const hints = (options.payeeHints ?? []).map(normalizeReference).filter((h) => h.length >= 4);
  return [
    { name: "debit", passed: tx.type === "debit", required: true, detail: "Money left the linked account" },
    {
      name: "amount",
      passed: tx.amountKobo >= trade.fiatKobo && tx.amountKobo <= maxAmount,
      required: true,
      detail: "Amount matches the trade within tolerance",
    },
    {
      name: "reference",
      passed: reference.length > 0 && narration.includes(reference),
      required: true,
      detail: `Narration contains ${trade.reference}`,
    },
    {
      name: "timing",
      passed: insideWindow(at, trade, options.clockSkewMs),
      required: true,
      detail: isDateOnly(at) ? "Sent on the trade date (bank reports dates only)" : "Sent inside the payment window",
    },
    {
      name: "unused",
      passed: !options.isUsed(tx.id),
      required: true,
      detail: "Transfer not used for another trade",
    },
    {
      name: "payee",
      passed: hints.length === 0 || hints.some((h) => narration.includes(h)),
      required: false,
      detail: "Narration names the seller's account",
    },
  ];
}

function score(checks: VerificationCheck[]): number {
  return checks.reduce((sum, check) => sum + (check.passed ? (check.required ? 10 : 1) : 0), 0);
}

export function matchPayment(trade: TradeTerms, transactions: BankTransaction[], options: MatchOptions): MatchResult {
  const debits = transactions.filter((tx) => tx.type === "debit");
  if (debits.length === 0) {
    return {
      ok: false,
      checks: [
        {
          name: "bank_activity",
          passed: false,
          required: true,
          detail: "No outgoing transfers found in the linked account yet",
        },
      ],
    };
  }
  let best: VerificationCheck[] | null = null;
  for (const tx of debits) {
    const checks = evaluate(trade, tx, options);
    if (checks.every((check) => check.passed || !check.required)) {
      return { ok: true, transaction: tx, checks };
    }
    if (!best || score(checks) > score(best)) best = checks;
  }
  return { ok: false, checks: best ?? [] };
}
