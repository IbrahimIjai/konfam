import type { AgentView, ContractInfo, OfferView, TradeView } from "@konfam/shared";

export interface EscrowChain {
  readonly mode: "near" | "memory";
  agentAccountId(): string;
  contractId(): string;
  inTee(): boolean;
  getContractInfo(): Promise<ContractInfo>;
  getTrade(tradeId: string): Promise<TradeView | null>;
  getOffer(offerId: string): Promise<OfferView | null>;
  getAgent(accountId: string): Promise<AgentView | null>;
  confirmPayment(tradeId: string, evidenceHash: string): Promise<void>;
  isFullAccessKey(accountId: string, publicKey: string): Promise<boolean>;
}
