import { existsSync } from "node:fs";
import type { ShadeClient } from "@neardefi/shade-agent-js";
import type { AgentView, ContractInfo, OfferView, TradeView } from "@konfam/shared";
import type { EscrowChain } from "./types";

const KEY_CACHE_MS = 5 * 60 * 1000;
const CONFIRM_GAS = 200_000_000_000_000n;

export class NearEscrow implements EscrowChain {
  readonly mode = "near" as const;
  private readonly keyCache = new Map<string, { ok: boolean; at: number }>();

  constructor(
    private readonly shade: ShadeClient,
    private readonly contract: string,
    private readonly rpcUrl: string,
  ) {}

  agentAccountId(): string {
    return this.shade.accountId();
  }

  contractId(): string {
    return this.contract;
  }

  inTee(): boolean {
    return existsSync("/var/run/dstack.sock");
  }

  private async view<T>(methodName: string, args: Record<string, unknown>): Promise<T> {
    return (await this.shade.view({ methodName, args })) as unknown as T;
  }

  getContractInfo(): Promise<ContractInfo> {
    return this.view<ContractInfo>("get_contract_info", {});
  }

  getTrade(tradeId: string): Promise<TradeView | null> {
    return this.view<TradeView | null>("get_trade", { trade_id: tradeId });
  }

  getOffer(offerId: string): Promise<OfferView | null> {
    return this.view<OfferView | null>("get_offer", { offer_id: offerId });
  }

  getAgent(accountId: string): Promise<AgentView | null> {
    return this.view<AgentView | null>("get_agent", { account_id: accountId });
  }

  async confirmPayment(tradeId: string, evidenceHash: string): Promise<void> {
    await this.shade.call({
      methodName: "confirm_payment",
      args: { trade_id: tradeId, evidence_hash: evidenceHash },
      gas: CONFIRM_GAS,
    });
  }

  async isFullAccessKey(accountId: string, publicKey: string): Promise<boolean> {
    const cacheKey = `${accountId}|${publicKey}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached && Date.now() - cached.at < KEY_CACHE_MS) return cached.ok;
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "konfam",
        method: "query",
        params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { result?: { permission?: unknown } };
    const ok = body.result?.permission === "FullAccess";
    this.keyCache.set(cacheKey, { ok, at: Date.now() });
    return ok;
  }
}
