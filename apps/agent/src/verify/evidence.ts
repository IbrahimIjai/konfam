import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@konfam/shared";
import type { BankTransaction } from "../bank/types";

export function sha256HexSync(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export interface Evidence {
  version: 1;
  tradeId: string;
  reference: string;
  fiatKobo: string;
  provider: string;
  payerAccountHash: string;
  transaction: {
    idHash: string;
    amountKobo: string;
    date: string;
    narrationHash: string;
  };
  agentAccountId: string;
  contractId: string;
  verifiedAt: string;
}

export function buildEvidence(input: {
  tradeId: string;
  reference: string;
  fiatKobo: bigint;
  provider: string;
  providerAccountId: string;
  transaction: BankTransaction;
  agentAccountId: string;
  contractId: string;
  verifiedAt: Date;
}): { evidence: Evidence; json: string; hash: string } {
  const evidence: Evidence = {
    version: 1,
    tradeId: input.tradeId,
    reference: input.reference,
    fiatKobo: input.fiatKobo.toString(),
    provider: input.provider,
    payerAccountHash: sha256HexSync(`${input.provider}:${input.providerAccountId}`),
    transaction: {
      idHash: sha256HexSync(input.transaction.id),
      amountKobo: input.transaction.amountKobo.toString(),
      date: input.transaction.date,
      narrationHash: sha256HexSync(input.transaction.narration),
    },
    agentAccountId: input.agentAccountId,
    contractId: input.contractId,
    verifiedAt: input.verifiedAt.toISOString(),
  };
  const json = stableStringify(evidence);
  return { evidence, json, hash: sha256HexSync(json) };
}
