import type { SandboxAccountRow, Store } from "../store/db";
import { BankError, type BankProvider, type BankTransaction, type LinkedAccount, type LinkRequest } from "./types";

const STARTING_BALANCE_KOBO = 5_000_000_00n;
const SANDBOX_BANKS = ["Sandbox Bank", "Konfam Test MFB", "Demo Trust Bank"];

function randomDigits(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

export interface SandboxAccountView {
  id: string;
  holderName: string;
  bankName: string;
  accountNumber: string;
  balanceKobo: string;
}

export function toSandboxView(row: SandboxAccountRow): SandboxAccountView {
  return {
    id: row.id,
    holderName: row.holderName,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    balanceKobo: row.balanceKobo.toString(),
  };
}

export class SandboxBank {
  constructor(private readonly store: Store) {}

  createAccount(holderName: string): SandboxAccountRow {
    const name = holderName.trim().replace(/\s+/g, " ");
    if (name.length < 3) throw new BankError("Holder name is too short", 400);
    let accountNumber = `90${randomDigits(8)}`;
    while (this.store.getSandboxAccountByNumber(accountNumber)) accountNumber = `90${randomDigits(8)}`;
    const row: SandboxAccountRow = {
      id: `sbx_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      holderName: name.toUpperCase(),
      bankName: SANDBOX_BANKS[Number(accountNumber.slice(-1)) % SANDBOX_BANKS.length] ?? "Sandbox Bank",
      accountNumber,
      balanceKobo: STARTING_BALANCE_KOBO,
      createdAt: Date.now(),
    };
    this.store.insertSandboxAccount(row);
    return row;
  }

  getAccount(id: string): SandboxAccountRow {
    const row = this.store.getSandboxAccount(id);
    if (!row) throw new BankError("Sandbox account not found", 404);
    return row;
  }

  transfer(input: { fromAccountId: string; toAccountNumber: string; amountKobo: bigint; narration: string; at?: number }) {
    const from = this.getAccount(input.fromAccountId);
    if (input.amountKobo <= 0n) throw new BankError("Amount must be positive", 400);
    if (from.balanceKobo < input.amountKobo) throw new BankError("Insufficient sandbox balance", 400);
    const to = this.store.getSandboxAccountByNumber(input.toAccountNumber.trim());
    if (to && to.id === from.id) throw new BankError("Cannot transfer to the same account", 400);
    const at = input.at ?? Date.now();
    const narration = input.narration.trim().slice(0, 120);
    const debitId = `stx_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const debit = {
      id: debitId,
      accountId: from.id,
      type: "debit" as const,
      amountKobo: input.amountKobo,
      narration: `TRF/${narration}/TO ${to?.holderName ?? input.toAccountNumber}`,
      counterparty: input.toAccountNumber,
      createdAt: at,
    };
    const credit = to
      ? {
          id: `${debitId}_c`,
          accountId: to.id,
          type: "credit" as const,
          amountKobo: input.amountKobo,
          narration: `TRF/${narration}/FRM ${from.holderName}`,
          counterparty: from.accountNumber,
          createdAt: at,
        }
      : null;
    this.store.recordSandboxTransfer({ debit, credit });
    return { debit, credit };
  }

  history(accountId: string) {
    this.getAccount(accountId);
    return this.store.listSandboxTransactions(accountId);
  }
}

export class SandboxProvider implements BankProvider {
  readonly name = "sandbox" as const;

  constructor(private readonly bank: SandboxBank, private readonly store: Store) {}

  async link(request: LinkRequest): Promise<LinkedAccount> {
    if (request.provider !== "sandbox") throw new BankError("Expected a sandbox account id", 400);
    const account = this.bank.getAccount(request.accountId);
    return {
      providerAccountId: account.id,
      institution: account.bankName,
      accountName: account.holderName,
      accountNumber: account.accountNumber,
    };
  }

  async transactions(providerAccountId: string, range: { from: Date; to: Date }): Promise<BankTransaction[]> {
    return this.store
      .listSandboxTransactions(providerAccountId, range.from.getTime(), range.to.getTime())
      .map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountKobo: tx.amountKobo,
        narration: tx.narration,
        date: new Date(tx.createdAt).toISOString(),
        currency: "NGN",
      }));
  }
}
