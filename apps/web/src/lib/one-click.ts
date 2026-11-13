import { config } from "@/config";

export interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
}

export interface OneClickQuote {
  quote: {
    depositAddress?: string;
    amountIn: string;
    amountOut: string;
    amountOutFormatted: string;
    amountInFormatted: string;
    timeEstimate: number;
    deadline?: string;
  };
}

export type OneClickStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export const CHAIN_NAMES: Record<string, string> = {
  tron: "Tron",
  sol: "Solana",
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  bsc: "BNB Chain",
  pol: "Polygon",
  op: "Optimism",
  avax: "Avalanche",
  ton: "TON",
  aptos: "Aptos",
  sui: "Sui",
  stellar: "Stellar",
  plasma: "Plasma",
  monad: "Monad",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.agentUrl}/intents${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("Can't reach the Konfam agent");
  }
  const body = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? `NEAR Intents request failed (${response.status})`);
  return body;
}

export function fetchTokens() {
  return call<OneClickToken[]>("/tokens");
}

export function requestQuote(input: { dry: boolean; destinationAsset: string; amount: string; recipient: string; refundTo: string }) {
  return call<OneClickQuote>("/quote", {
    method: "POST",
    body: JSON.stringify({ ...input, originAsset: config.mainnetUsdtAsset }),
  });
}

export function submitDeposit(input: { txHash: string; depositAddress: string; nearSenderAccount: string }) {
  return call<{ status: OneClickStatus }>("/deposit", { method: "POST", body: JSON.stringify(input) });
}

export function fetchStatus(depositAddress: string) {
  return call<{ status: OneClickStatus }>(`/status?depositAddress=${encodeURIComponent(depositAddress)}`);
}
