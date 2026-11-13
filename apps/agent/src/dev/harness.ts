import { createApp } from "../app";
import { SandboxBank, SandboxProvider } from "../bank/sandbox";
import { MemoryEscrow } from "../chain/memory";
import { Store } from "../store/db";
import { Verifier } from "../verify/service";
import { createDevWallet, type DevWallet } from "./wallet";

export interface MemoryStack {
  app: ReturnType<typeof createApp>;
  chain: MemoryEscrow;
  bank: SandboxProvider;
  store: Store;
  sandbox: SandboxBank;
  verifier: Verifier;
  wallet(accountId: string): DevWallet;
  call<T = unknown>(method: string, path: string, options?: { wallet?: DevWallet; body?: unknown }): Promise<{ status: number; body: T }>;
}

export function createMemoryStack(): MemoryStack {
  const store = Store.memory();
  const chain = new MemoryEscrow();
  const sandbox = new SandboxBank(store);
  const bank = new SandboxProvider(sandbox, store);
  const verifier = new Verifier(chain, bank, store, {
    overpayToleranceKobo: 10_000n,
    clockSkewMs: 5 * 60 * 1000,
    watchIntervalMs: 60_000,
  });
  const app = createApp({
    config: { NETWORK_ID: "testnet", CORS_ORIGINS: "*", BANK_PROVIDER: "sandbox", CODE_VERSION: "test" },
    chain,
    bank,
    store,
    verifier,
    sandbox,
    intents: {
      baseUrl: "https://1click.invalid",
      jwt: "",
      appFeeBps: 0,
      feeRecipient: "",
      fetch: async () => new Response(JSON.stringify({ message: "offline" }), { status: 503 }),
    },
  });

  return {
    app,
    chain,
    bank,
    store,
    sandbox,
    verifier,
    wallet(accountId) {
      const wallet = createDevWallet(accountId);
      chain.registerKey(accountId, wallet.publicKey);
      return wallet;
    },
    async call(method, path, options = {}) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (options.wallet) headers["x-konfam-auth"] = options.wallet.authHeader();
      const response = await app.request(path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      return { status: response.status, body: (await response.json()) as never };
    },
  };
}
