export type OfferStatus = "Active" | "Paused" | "Closed";

export type TradeStatus =
  | "AwaitingPayment"
  | "Releasing"
  | "Verified"
  | "Released"
  | "Cancelled";

export interface OfferView {
  id: string;
  seller: string;
  available: string;
  locked: string;
  min_amount: string;
  max_amount: string;
  rate_kobo: string;
  bank_commitment: string;
  status: OfferStatus;
  created_ms: string;
}

export interface TradeView {
  id: string;
  offer_id: string;
  seller: string;
  buyer: string;
  amount: string;
  fee: string;
  deposit: string;
  fiat_kobo: string;
  reference: string;
  opened_ms: string;
  expires_ms: string;
  reclaimable_after_ms: string;
  status: TradeStatus;
  evidence_hash: string | null;
  verified_by: string | null;
  settled_ms: string | null;
}

export interface ContractInfo {
  requires_tee: boolean;
  trade_deposit: string;
  attestation_expiration_time_ms: string;
  owner_id: string;
  token_id: string;
  token_decimals: number;
  fee_bps: number;
  fee_recipient: string;
  payment_window_ms: string;
  release_grace_ms: string;
  fees_collected: string;
  offer_count: number;
  trade_count: number;
}

export type AgentValidity = "Valid" | { Invalid: string[] };

export interface AgentView {
  account_id: string;
  measurements: Record<string, unknown>;
  ppid: string;
  valid_until_ms: string;
  validity: AgentValidity;
}

export interface PayeeDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface LinkedBank {
  provider: "mono" | "sandbox";
  institution: string;
  accountName: string;
  accountNumberMasked: string;
  linkedAt: number;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  required: boolean;
  detail?: string;
}

export type VerifyResponse =
  | {
      status: "confirmed";
      tradeId: string;
      evidenceHash: string;
      checks: VerificationCheck[];
    }
  | {
      status: "not_found";
      tradeId: string;
      checks: VerificationCheck[];
      watching: boolean;
    }
  | {
      status: "settled";
      tradeId: string;
      tradeStatus: TradeStatus;
    };

export interface AttestationInfo {
  agentAccountId: string;
  contractId: string;
  networkId: string;
  inTee: boolean;
  requiresTee: boolean;
  bankProvider: "mono" | "sandbox";
  registration: AgentView | null;
  codeVersion: string;
}
