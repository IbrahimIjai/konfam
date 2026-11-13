import { base64 } from "@scure/base";
import { config } from "@/config";

export const TGAS = 1_000_000_000_000n;
export const ONE_YOCTO = "1";

export interface FunctionCallAction {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
}

export interface TransactionRequest {
  receiverId: string;
  actions: FunctionCallAction[];
}

export function functionCall(methodName: string, args: object, gasTgas = 100, deposit = "0"): FunctionCallAction {
  return { type: "FunctionCall", params: { methodName, args, gas: (BigInt(gasTgas) * TGAS).toString(), deposit } };
}

interface RpcResponse<T> {
  result?: T & { error?: string };
  error?: { message?: string; data?: unknown; cause?: { name?: string } };
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "konfam", method, params }),
  });
  const body = (await response.json()) as RpcResponse<T>;
  if (body.error) throw new Error(String(body.error.data ?? body.error.message ?? "RPC error"));
  if (!body.result) throw new Error("Empty RPC response");
  if (body.result.error) throw new Error(body.result.error);
  return body.result;
}

export async function view<T>(contractId: string, methodName: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: methodName,
    args_base64: base64.encode(new TextEncoder().encode(JSON.stringify(args))),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
}

export interface FtMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export function ftBalance(tokenId: string, accountId: string) {
  return view<string>(tokenId, "ft_balance_of", { account_id: accountId });
}

export function ftMetadata(tokenId: string) {
  return view<FtMetadata>(tokenId, "ft_metadata");
}

export async function storageDepositIfNeeded(tokenId: string, accountId: string): Promise<TransactionRequest | null> {
  const balance = await view<{ total: string } | null>(tokenId, "storage_balance_of", { account_id: accountId });
  if (balance) return null;
  const bounds = await view<{ min: string }>(tokenId, "storage_balance_bounds");
  return {
    receiverId: tokenId,
    actions: [functionCall("storage_deposit", { account_id: accountId, registration_only: true }, 30, bounds.min)],
  };
}

export function explorerAccount(accountId: string) {
  return `${config.explorerUrl}/address/${accountId}`;
}
