import { fiatForAmount, type AgentView, type ContractInfo, type OfferView, type TradeView } from "@konfam/shared";
import type { EscrowChain } from "./types";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TRADE_DEPOSIT = "10000000000000000000000";

export class MemoryEscrow implements EscrowChain {
  readonly mode = "memory" as const;
  readonly decimals = 6;
  readonly feeBps = 50;
  readonly paymentWindowMs = 30 * 60 * 1000;
  readonly graceMs = 15 * 60 * 1000;
  clock: () => number = () => Date.now();
  readonly balances = new Map<string, bigint>();
  private readonly offers = new Map<string, OfferView>();
  private readonly trades = new Map<string, TradeView>();
  private readonly keys = new Map<string, Set<string>>();
  private nextOffer = 1;
  private nextTrade = 1;
  private feesCollected = 0n;

  constructor(
    private readonly agentId = "konfam-agent.memory",
    private readonly contract = "konfam.memory",
  ) {}

  agentAccountId() {
    return this.agentId;
  }

  contractId() {
    return this.contract;
  }

  inTee() {
    return false;
  }

  registerKey(accountId: string, publicKey: string) {
    const set = this.keys.get(accountId) ?? new Set<string>();
    set.add(publicKey);
    this.keys.set(accountId, set);
  }

  async isFullAccessKey(accountId: string, publicKey: string) {
    return this.keys.get(accountId)?.has(publicKey) ?? false;
  }

  mint(accountId: string, amount: bigint) {
    this.balances.set(accountId, (this.balances.get(accountId) ?? 0n) + amount);
  }

  balanceOf(accountId: string) {
    return this.balances.get(accountId) ?? 0n;
  }

  private move(from: string, to: string, amount: bigint) {
    const balance = this.balanceOf(from);
    if (balance < amount) throw new Error("Insufficient token balance");
    this.balances.set(from, balance - amount);
    this.mint(to, amount);
  }

  createOffer(input: {
    seller: string;
    amount: bigint;
    rateKobo: bigint;
    minAmount: bigint;
    maxAmount: bigint;
    bankCommitment: string;
  }): OfferView {
    if (input.minAmount < 10n ** BigInt(this.decimals) || input.minAmount > input.maxAmount) throw new Error("Invalid trade limits");
    if (input.amount < input.minAmount) throw new Error("Offer smaller than its minimum trade");
    this.move(input.seller, this.contract, input.amount);
    const id = String(this.nextOffer++);
    const offer: OfferView = {
      id,
      seller: input.seller,
      available: input.amount.toString(),
      locked: "0",
      min_amount: input.minAmount.toString(),
      max_amount: input.maxAmount.toString(),
      rate_kobo: input.rateKobo.toString(),
      bank_commitment: input.bankCommitment,
      status: "Active",
      created_ms: String(this.clock()),
    };
    this.offers.set(id, offer);
    return offer;
  }

  takeOffer(input: { buyer: string; offerId: string; amount: bigint }): TradeView {
    const offer = this.offers.get(input.offerId);
    if (!offer || offer.status !== "Active") throw new Error("Offer is not active");
    if (offer.seller === input.buyer) throw new Error("Seller cannot take own offer");
    if (input.amount < BigInt(offer.min_amount) || input.amount > BigInt(offer.max_amount)) {
      throw new Error("Amount outside offer limits");
    }
    if (input.amount > BigInt(offer.available)) throw new Error("Not enough liquidity");
    const openTrade = [...this.trades.values()].find((t) => t.buyer === input.buyer && t.status === "AwaitingPayment");
    if (openTrade) throw new Error("Finish your open trade first");
    offer.available = (BigInt(offer.available) - input.amount).toString();
    offer.locked = (BigInt(offer.locked) + input.amount).toString();
    const id = String(this.nextTrade++);
    const now = this.clock();
    const random = crypto.getRandomValues(new Uint8Array(6));
    const reference = `KF${Array.from(random, (b) => ALPHABET[b & 31]).join("")}`;
    const trade: TradeView = {
      id,
      offer_id: offer.id,
      seller: offer.seller,
      buyer: input.buyer,
      amount: input.amount.toString(),
      fee: ((input.amount * BigInt(this.feeBps)) / 10_000n).toString(),
      deposit: TRADE_DEPOSIT,
      fiat_kobo: fiatForAmount(input.amount, BigInt(offer.rate_kobo), this.decimals).toString(),
      reference,
      opened_ms: String(now),
      expires_ms: String(now + this.paymentWindowMs),
      reclaimable_after_ms: String(now + this.paymentWindowMs + this.graceMs),
      status: "AwaitingPayment",
      evidence_hash: null,
      verified_by: null,
      settled_ms: null,
    };
    this.trades.set(id, trade);
    return trade;
  }

  async confirmPayment(tradeId: string, evidenceHash: string): Promise<void> {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found");
    if (trade.status !== "AwaitingPayment") throw new Error("Trade is not awaiting payment");
    const offer = this.offers.get(trade.offer_id);
    if (offer) offer.locked = (BigInt(offer.locked) - BigInt(trade.amount)).toString();
    const fee = BigInt(trade.fee);
    this.move(this.contract, trade.buyer, BigInt(trade.amount) - fee);
    this.feesCollected += fee;
    trade.status = "Released";
    trade.deposit = "0";
    trade.evidence_hash = evidenceHash;
    trade.verified_by = this.agentId;
    trade.settled_ms = String(this.clock());
  }

  async getContractInfo(): Promise<ContractInfo> {
    return {
      requires_tee: false,
      trade_deposit: TRADE_DEPOSIT,
      attestation_expiration_time_ms: String(7 * 24 * 60 * 60 * 1000),
      owner_id: "owner.memory",
      token_id: "usdt.memory",
      token_decimals: this.decimals,
      fee_bps: this.feeBps,
      fee_recipient: "owner.memory",
      payment_window_ms: String(this.paymentWindowMs),
      release_grace_ms: String(this.graceMs),
      fees_collected: this.feesCollected.toString(),
      offer_count: this.nextOffer - 1,
      trade_count: this.nextTrade - 1,
    };
  }

  async getTrade(tradeId: string) {
    const trade = this.trades.get(tradeId);
    return trade ? { ...trade } : null;
  }

  async getOffer(offerId: string) {
    const offer = this.offers.get(offerId);
    return offer ? { ...offer } : null;
  }

  async getAgent(accountId: string): Promise<AgentView | null> {
    if (accountId !== this.agentId) return null;
    return {
      account_id: this.agentId,
      measurements: {},
      ppid: "00000000000000000000000000000000",
      valid_until_ms: String(this.clock() + 7 * 24 * 60 * 60 * 1000),
      validity: "Valid",
    };
  }
}
