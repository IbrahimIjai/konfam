import {
  AUTH_HEADER,
  type AttestationInfo,
  type LinkedBank,
  type PayeeDetails,
  type VerifyResponse,
} from "@konfam/shared";
import { config } from "@/config";

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth) headers[AUTH_HEADER] = init.auth;
  let response: Response;
  try {
    response = await fetch(`${config.agentUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new AgentError("Can't reach the Konfam agent. Check that it is running.", 0);
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new AgentError(body.error ?? `Agent request failed (${response.status})`, response.status);
  return body as T;
}

export interface PayeeReveal {
  commitment: string;
  salt: string;
  details: PayeeDetails;
}

export interface SandboxAccount {
  id: string;
  holderName: string;
  bankName: string;
  accountNumber: string;
  balanceKobo: string;
}

export interface SandboxTransaction {
  id: string;
  type: "debit" | "credit";
  amountKobo: string;
  narration: string;
  counterparty: string;
  createdAt: number;
}

export interface EvidenceResponse {
  evidence: Record<string, unknown>;
  evidenceHash: string;
  onChainHash: string | null;
  matchesChain: boolean;
}

export const agent = {
  attestation: () => request<AttestationInfo>("/attestation"),
  linkedBank: (auth: string) => request<LinkedBank | null>("/bank/me", { auth }),
  linkBank: (auth: string, body: { provider: "mono"; code: string } | { provider: "sandbox"; accountId: string }) =>
    request<LinkedBank>("/bank/link", { method: "POST", auth, body }),
  unlinkBank: (auth: string) => request<{ ok: boolean }>("/bank/me", { method: "DELETE", auth }),
  myPayee: (auth: string) => request<PayeeReveal | null>("/payee/me", { auth }),
  registerPayee: (auth: string, details: PayeeDetails) => request<PayeeReveal>("/payee", { method: "POST", auth, body: details }),
  tradePayee: (auth: string, tradeId: string) => request<PayeeReveal>(`/trades/${tradeId}/payee`, { auth }),
  verify: (auth: string, tradeId: string) => request<VerifyResponse>(`/trades/${tradeId}/verify`, { method: "POST", auth }),
  evidence: (auth: string, tradeId: string) => request<EvidenceResponse>(`/trades/${tradeId}/evidence`, { auth }),
  sandboxCreate: (holderName: string) =>
    request<SandboxAccount>("/sandbox/accounts", { method: "POST", body: { holderName } }),
  sandboxAccount: (id: string) =>
    request<{ account: SandboxAccount; transactions: SandboxTransaction[] }>(`/sandbox/accounts/${id}`),
  sandboxTransfer: (body: { fromAccountId: string; toAccountNumber: string; amountKobo: string; narration: string }) =>
    request<{ id: string; narration: string }>("/sandbox/transfer", { method: "POST", body }),
};
