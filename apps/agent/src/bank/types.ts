export interface BankTransaction {
  id: string;
  type: "debit" | "credit";
  amountKobo: bigint;
  narration: string;
  date: string;
  currency: string;
}

export interface LinkedAccount {
  providerAccountId: string;
  institution: string;
  accountName: string;
  accountNumber: string;
}

export type LinkRequest =
  | { provider: "mono"; code: string }
  | { provider: "sandbox"; accountId: string };

export interface BankProvider {
  readonly name: "mono" | "sandbox";
  link(request: LinkRequest): Promise<LinkedAccount>;
  transactions(providerAccountId: string, range: { from: Date; to: Date }): Promise<BankTransaction[]>;
}

export class BankError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 502 = 502,
  ) {
    super(message);
  }
}
