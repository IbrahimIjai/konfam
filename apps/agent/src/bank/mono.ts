import { BankError, type BankProvider, type BankTransaction, type LinkedAccount, type LinkRequest } from "./types";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

interface MonoOptions {
  secretKey: string;
  baseUrl: string;
  realtime: boolean;
  fetch?: Fetch;
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function formatMonoDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getUTCFullYear()}`;
}

export function parseMonoTransaction(raw: unknown): BankTransaction | null {
  const tx = asRecord(raw);
  const id = tx.id ?? tx._id;
  const type = String(tx.type ?? "").toLowerCase();
  const amount = tx.amount;
  const date = tx.date ?? tx.created_at;
  if (typeof id !== "string" || (type !== "debit" && type !== "credit")) return null;
  if (typeof amount !== "number" && typeof amount !== "string") return null;
  if (typeof date !== "string") return null;
  return {
    id,
    type,
    amountKobo: BigInt(Math.round(Number(amount))),
    narration: String(tx.narration ?? ""),
    date: new Date(date).toISOString(),
    currency: String(tx.currency ?? "NGN"),
  };
}

export class MonoProvider implements BankProvider {
  readonly name = "mono" as const;
  private readonly fetchImpl: Fetch;

  constructor(private readonly options: MonoOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  private async request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Json> {
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "mono-sec-key": this.options.secretKey,
        ...init.headers,
      },
    });
    const body = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      const message = typeof body.message === "string" ? body.message : `Mono request failed (${response.status})`;
      throw new BankError(message, response.status === 404 ? 404 : response.status < 500 ? 400 : 502);
    }
    return body;
  }

  async link(request: LinkRequest): Promise<LinkedAccount> {
    if (request.provider !== "mono") throw new BankError("Expected a Mono authorisation code", 400);
    const auth = await this.request("/v2/accounts/auth", {
      method: "POST",
      body: JSON.stringify({ code: request.code }),
    });
    const accountId = asRecord(auth.data).id ?? auth.id;
    if (typeof accountId !== "string") throw new BankError("Mono did not return an account id");
    const details = await this.request(`/v2/accounts/${encodeURIComponent(accountId)}`);
    const data = asRecord(details.data);
    const account = asRecord(data.account ?? data);
    const institution = asRecord(account.institution);
    return {
      providerAccountId: accountId,
      institution: String(institution.name ?? "Bank"),
      accountName: String(account.name ?? ""),
      accountNumber: String(account.account_number ?? account.accountNumber ?? ""),
    };
  }

  async transactions(providerAccountId: string, range: { from: Date; to: Date }): Promise<BankTransaction[]> {
    const query = new URLSearchParams({
      start: formatMonoDate(range.from),
      end: formatMonoDate(range.to),
      type: "debit",
      paginate: "false",
    });
    const body = await this.request(`/v2/accounts/${encodeURIComponent(providerAccountId)}/transactions?${query}`, {
      headers: this.options.realtime ? { "x-realtime": "true" } : {},
    });
    const list = Array.isArray(body.data) ? body.data : [];
    return list.map(parseMonoTransaction).filter((tx): tx is BankTransaction => tx !== null);
  }
}
