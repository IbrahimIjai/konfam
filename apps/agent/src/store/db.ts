import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PayeeDetails } from "@konfam/shared";

export interface BankLinkRow {
  accountId: string;
  provider: "mono" | "sandbox";
  providerAccountId: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  linkedAt: number;
}

export interface PayeeRow {
  commitment: string;
  accountId: string;
  details: PayeeDetails;
  salt: string;
  createdAt: number;
}

export interface VerificationRow {
  tradeId: string;
  txKey: string;
  evidence: string;
  evidenceHash: string;
  confirmedAt: number;
}

export interface SandboxAccountRow {
  id: string;
  holderName: string;
  bankName: string;
  accountNumber: string;
  balanceKobo: bigint;
  createdAt: number;
}

export interface SandboxTransactionRow {
  id: string;
  accountId: string;
  type: "debit" | "credit";
  amountKobo: bigint;
  narration: string;
  counterparty: string;
  createdAt: number;
}

export class Store {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, safeIntegers: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  static open(dataDir: string): Store {
    mkdirSync(dataDir, { recursive: true });
    return new Store(join(dataDir, "konfam.sqlite"));
  }

  static memory(): Store {
    return new Store(":memory:");
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bank_links (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        institution TEXT NOT NULL,
        account_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        linked_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payees (
        commitment TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        details TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS payees_account ON payees(account_id, created_at);
      CREATE TABLE IF NOT EXISTS verifications (
        trade_id TEXT PRIMARY KEY,
        tx_key TEXT NOT NULL UNIQUE,
        evidence TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        confirmed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sandbox_accounts (
        id TEXT PRIMARY KEY,
        holder_name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL UNIQUE,
        balance_kobo INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sandbox_transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_kobo INTEGER NOT NULL,
        narration TEXT NOT NULL,
        counterparty TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sandbox_tx_account ON sandbox_transactions(account_id, created_at);
    `);
  }

  saveBankLink(row: BankLinkRow) {
    this.db
      .query(
        `INSERT INTO bank_links (account_id, provider, provider_account_id, institution, account_name, account_number, linked_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(account_id) DO UPDATE SET provider = ?2, provider_account_id = ?3, institution = ?4,
           account_name = ?5, account_number = ?6, linked_at = ?7`,
      )
      .run(row.accountId, row.provider, row.providerAccountId, row.institution, row.accountName, row.accountNumber, row.linkedAt);
  }

  getBankLink(accountId: string): BankLinkRow | null {
    const row = this.db.query("SELECT * FROM bank_links WHERE account_id = ?1").get(accountId) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      accountId: String(row.account_id),
      provider: String(row.provider) as BankLinkRow["provider"],
      providerAccountId: String(row.provider_account_id),
      institution: String(row.institution),
      accountName: String(row.account_name),
      accountNumber: String(row.account_number),
      linkedAt: Number(row.linked_at),
    };
  }

  deleteBankLink(accountId: string) {
    this.db.query("DELETE FROM bank_links WHERE account_id = ?1").run(accountId);
  }

  savePayee(row: PayeeRow) {
    this.db
      .query("INSERT OR REPLACE INTO payees (commitment, account_id, details, salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .run(row.commitment, row.accountId, JSON.stringify(row.details), row.salt, row.createdAt);
  }

  getPayeeByCommitment(commitment: string): PayeeRow | null {
    const row = this.db.query("SELECT * FROM payees WHERE commitment = ?1").get(commitment) as Record<string, unknown> | null;
    return row ? this.toPayee(row) : null;
  }

  getLatestPayee(accountId: string): PayeeRow | null {
    const row = this.db
      .query("SELECT * FROM payees WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 1")
      .get(accountId) as Record<string, unknown> | null;
    return row ? this.toPayee(row) : null;
  }

  private toPayee(row: Record<string, unknown>): PayeeRow {
    return {
      commitment: String(row.commitment),
      accountId: String(row.account_id),
      details: JSON.parse(String(row.details)) as PayeeDetails,
      salt: String(row.salt),
      createdAt: Number(row.created_at),
    };
  }

  isTransactionUsed(txKey: string): boolean {
    return this.db.query("SELECT 1 FROM verifications WHERE tx_key = ?1").get(txKey) !== null;
  }

  saveVerification(row: VerificationRow): boolean {
    try {
      this.db
        .query("INSERT INTO verifications (trade_id, tx_key, evidence, evidence_hash, confirmed_at) VALUES (?1, ?2, ?3, ?4, ?5)")
        .run(row.tradeId, row.txKey, row.evidence, row.evidenceHash, row.confirmedAt);
      return true;
    } catch {
      return false;
    }
  }

  deleteVerification(tradeId: string) {
    this.db.query("DELETE FROM verifications WHERE trade_id = ?1").run(tradeId);
  }

  getVerification(tradeId: string): VerificationRow | null {
    const row = this.db.query("SELECT * FROM verifications WHERE trade_id = ?1").get(tradeId) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      tradeId: String(row.trade_id),
      txKey: String(row.tx_key),
      evidence: String(row.evidence),
      evidenceHash: String(row.evidence_hash),
      confirmedAt: Number(row.confirmed_at),
    };
  }

  insertSandboxAccount(row: SandboxAccountRow) {
    this.db
      .query(
        "INSERT INTO sandbox_accounts (id, holder_name, bank_name, account_number, balance_kobo, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .run(row.id, row.holderName, row.bankName, row.accountNumber, row.balanceKobo, row.createdAt);
  }

  getSandboxAccount(id: string): SandboxAccountRow | null {
    const row = this.db.query("SELECT * FROM sandbox_accounts WHERE id = ?1").get(id) as Record<string, unknown> | null;
    return row ? this.toSandboxAccount(row) : null;
  }

  getSandboxAccountByNumber(accountNumber: string): SandboxAccountRow | null {
    const row = this.db
      .query("SELECT * FROM sandbox_accounts WHERE account_number = ?1")
      .get(accountNumber) as Record<string, unknown> | null;
    return row ? this.toSandboxAccount(row) : null;
  }

  private toSandboxAccount(row: Record<string, unknown>): SandboxAccountRow {
    return {
      id: String(row.id),
      holderName: String(row.holder_name),
      bankName: String(row.bank_name),
      accountNumber: String(row.account_number),
      balanceKobo: BigInt(row.balance_kobo as bigint),
      createdAt: Number(row.created_at),
    };
  }

  recordSandboxTransfer(input: {
    debit: SandboxTransactionRow;
    credit: SandboxTransactionRow | null;
  }) {
    const insert = this.db.query(
      "INSERT INTO sandbox_transactions (id, account_id, type, amount_kobo, narration, counterparty, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    );
    const adjust = this.db.query("UPDATE sandbox_accounts SET balance_kobo = balance_kobo + ?2 WHERE id = ?1");
    this.db.transaction(() => {
      const { debit, credit } = input;
      insert.run(debit.id, debit.accountId, debit.type, debit.amountKobo, debit.narration, debit.counterparty, debit.createdAt);
      adjust.run(debit.accountId, -debit.amountKobo);
      if (credit) {
        insert.run(credit.id, credit.accountId, credit.type, credit.amountKobo, credit.narration, credit.counterparty, credit.createdAt);
        adjust.run(credit.accountId, credit.amountKobo);
      }
    })();
  }

  listSandboxTransactions(accountId: string, fromMs = 0, toMs = Number.MAX_SAFE_INTEGER): SandboxTransactionRow[] {
    const rows = this.db
      .query(
        "SELECT * FROM sandbox_transactions WHERE account_id = ?1 AND created_at >= ?2 AND created_at <= ?3 ORDER BY created_at DESC",
      )
      .all(accountId, fromMs, toMs) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      type: String(row.type) as SandboxTransactionRow["type"],
      amountKobo: BigInt(row.amount_kobo as bigint),
      narration: String(row.narration),
      counterparty: String(row.counterparty),
      createdAt: Number(row.created_at),
    }));
  }
}
