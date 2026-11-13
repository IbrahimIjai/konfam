import type { VerifyResponse } from "@konfam/shared";
import type { BankProvider } from "../bank/types";
import type { EscrowChain } from "../chain/types";
import { HttpError } from "../errors";
import type { Store } from "../store/db";
import { buildEvidence } from "./evidence";
import { matchPayment } from "./match";

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface VerifierOptions {
  overpayToleranceKobo: bigint;
  clockSkewMs: number;
  watchIntervalMs: number;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export class Verifier {
  private readonly inFlight = new Map<string, Promise<VerifyResponse>>();
  private readonly watching = new Set<string>();
  private readonly nextAttempt = new Map<string, { attempts: number; at: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly chain: EscrowChain,
    private readonly bank: BankProvider,
    private readonly store: Store,
    private readonly options: VerifierOptions,
  ) {}

  verify(tradeId: string, requester?: string): Promise<VerifyResponse> {
    const existing = this.inFlight.get(tradeId);
    if (existing) return existing;
    const job = this.run(tradeId, requester).finally(() => this.inFlight.delete(tradeId));
    this.inFlight.set(tradeId, job);
    return job;
  }

  watched(): string[] {
    return [...this.watching];
  }

  private async run(tradeId: string, requester?: string): Promise<VerifyResponse> {
    const trade = await this.chain.getTrade(tradeId);
    if (!trade) throw new HttpError(404, "Trade not found");
    if (requester && requester !== trade.buyer) throw new HttpError(403, "Only the buyer can request verification");
    if (trade.status !== "AwaitingPayment") {
      this.unwatch(tradeId);
      return { status: "settled", tradeId, tradeStatus: trade.status };
    }
    const link = this.store.getBankLink(trade.buyer);
    if (!link) throw new HttpError(409, "Link your bank account before verification");

    const offer = await this.chain.getOffer(trade.offer_id);
    const payee = offer ? this.store.getPayeeByCommitment(offer.bank_commitment) : null;
    const payeeHints = payee ? [payee.details.accountName, payee.details.accountNumber] : [];

    const now = Date.now();
    const transactions = await this.bank.transactions(link.providerAccountId, {
      from: new Date(Number(trade.opened_ms) - LOOKBACK_MS),
      to: new Date(now),
    });
    const txKey = (id: string) => `${link.provider}:${link.providerAccountId}:${id}`;
    const terms = {
      id: trade.id,
      reference: trade.reference,
      fiatKobo: BigInt(trade.fiat_kobo),
      openedMs: Number(trade.opened_ms),
      expiresMs: Number(trade.expires_ms),
    };
    const previous = this.store.getVerification(tradeId);
    const result = matchPayment(terms, transactions, {
      overpayToleranceKobo: this.options.overpayToleranceKobo,
      clockSkewMs: this.options.clockSkewMs,
      isUsed: (id) => this.store.isTransactionUsed(txKey(id)) && previous?.txKey !== txKey(id),
      payeeHints,
    });

    if (!result.ok) {
      const watching = now < Number(trade.reclaimable_after_ms);
      if (watching) this.watch(tradeId, requester === undefined);
      else this.unwatch(tradeId);
      return { status: "not_found", tradeId, checks: result.checks, watching };
    }

    const key = txKey(result.transaction.id);
    let evidenceHash: string;
    if (previous && previous.txKey === key) {
      evidenceHash = previous.evidenceHash;
    } else {
      const built = buildEvidence({
        tradeId,
        reference: trade.reference,
        fiatKobo: terms.fiatKobo,
        provider: link.provider,
        providerAccountId: link.providerAccountId,
        transaction: result.transaction,
        agentAccountId: this.chain.agentAccountId(),
        contractId: this.chain.contractId(),
        verifiedAt: new Date(now),
      });
      if (previous) this.store.deleteVerification(tradeId);
      const saved = this.store.saveVerification({
        tradeId,
        txKey: key,
        evidence: built.json,
        evidenceHash: built.hash,
        confirmedAt: now,
      });
      if (!saved) throw new HttpError(409, "That bank transfer was already used for another trade");
      evidenceHash = built.hash;
    }

    try {
      await this.chain.confirmPayment(tradeId, evidenceHash);
    } catch (error) {
      const latest = await this.chain.getTrade(tradeId).catch(() => null);
      if (latest && latest.status !== "AwaitingPayment") {
        this.unwatch(tradeId);
        return { status: "settled", tradeId, tradeStatus: latest.status };
      }
      this.options.log?.("confirm_payment failed", { tradeId, error: String(error) });
      throw new HttpError(502, "Payment matched but on-chain confirmation failed, retrying soon");
    }
    this.unwatch(tradeId);
    this.options.log?.("payment confirmed", { tradeId, evidenceHash });
    return { status: "confirmed", tradeId, evidenceHash, checks: result.checks };
  }

  private watch(tradeId: string, automatic: boolean) {
    this.watching.add(tradeId);
    const state = this.nextAttempt.get(tradeId) ?? { attempts: 0, at: 0 };
    if (automatic) state.attempts += 1;
    const delay = Math.min(this.options.watchIntervalMs * 2 ** state.attempts, MAX_BACKOFF_MS);
    state.at = Date.now() + delay;
    this.nextAttempt.set(tradeId, state);
  }

  private unwatch(tradeId: string) {
    this.watching.delete(tradeId);
    this.nextAttempt.delete(tradeId);
  }

  async sweep(now = Date.now()): Promise<number> {
    let attempted = 0;
    for (const tradeId of [...this.watching]) {
      const due = this.nextAttempt.get(tradeId)?.at ?? 0;
      if (now < due) continue;
      attempted += 1;
      try {
        const result = await this.verify(tradeId);
        if (result.status !== "not_found" || !result.watching) this.unwatch(tradeId);
      } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 409)) this.unwatch(tradeId);
        this.options.log?.("watch attempt failed", { tradeId, error: String(error) });
      }
    }
    return attempted;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.options.watchIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
