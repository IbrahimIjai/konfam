import { ShadeClient } from "@neardefi/shade-agent-js";
import { createApp } from "./app";
import { MonoProvider } from "./bank/mono";
import { SandboxBank, SandboxProvider } from "./bank/sandbox";
import type { BankProvider } from "./bank/types";
import { MemoryEscrow } from "./chain/memory";
import { NearEscrow } from "./chain/near";
import type { EscrowChain } from "./chain/types";
import { loadConfig, type Config } from "./config";
import { Store } from "./store/db";
import { Verifier } from "./verify/service";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));
}

async function registerUntilAccepted(shade: ShadeClient) {
  for (;;) {
    try {
      const whitelisted = await shade.isWhitelisted();
      if (whitelisted === null || whitelisted) {
        if (await shade.register()) {
          log("agent registered", { accountId: shade.accountId() });
          return;
        }
      } else {
        log("waiting for local whitelist", { accountId: shade.accountId() });
      }
    } catch (error) {
      log("registration attempt failed", { error: String(error) });
    }
    await Bun.sleep(10_000);
  }
}

async function createChain(config: Config): Promise<EscrowChain> {
  if (config.CHAIN_MODE === "memory") return new MemoryEscrow();
  const shade = await ShadeClient.create({
    networkId: config.NETWORK_ID,
    agentContractId: config.AGENT_CONTRACT_ID,
    sponsor: { accountId: config.SPONSOR_ACCOUNT_ID, privateKey: config.SPONSOR_PRIVATE_KEY },
    derivationPath: config.SPONSOR_PRIVATE_KEY,
  });
  log("agent account", { accountId: shade.accountId() });
  if ((await shade.balance()) < 0.2) await shade.fund(0.3);
  await registerUntilAccepted(shade);
  setInterval(() => {
    shade.register().catch((error) => log("re-registration failed", { error: String(error) }));
  }, SIX_DAYS_MS);
  return new NearEscrow(shade, config.AGENT_CONTRACT_ID, config.rpcUrl);
}

function createBank(config: Config, store: Store): { bank: BankProvider; sandbox: SandboxBank | null } {
  if (config.BANK_PROVIDER === "mono") {
    return {
      bank: new MonoProvider({
        secretKey: config.MONO_SECRET_KEY,
        baseUrl: config.MONO_BASE_URL,
        realtime: config.MONO_REALTIME === "true",
      }),
      sandbox: null,
    };
  }
  const sandbox = new SandboxBank(store);
  return { bank: new SandboxProvider(sandbox, store), sandbox };
}

const config = loadConfig();
const store = Store.open(config.DATA_DIR);
const { bank, sandbox } = createBank(config, store);
const chain = await createChain(config);
const verifier = new Verifier(chain, bank, store, {
  overpayToleranceKobo: config.OVERPAY_TOLERANCE_KOBO,
  clockSkewMs: config.CLOCK_SKEW_MS,
  watchIntervalMs: config.WATCH_INTERVAL_MS,
  log,
});
verifier.start();

const intents = {
  baseUrl: config.ONECLICK_URL,
  jwt: config.ONECLICK_JWT,
  appFeeBps: config.ONECLICK_APP_FEE_BPS,
  feeRecipient: config.ONECLICK_FEE_RECIPIENT,
};
const app = createApp({ config, chain, bank, store, verifier, sandbox, intents });
Bun.serve({ port: config.PORT, fetch: app.fetch });
log("konfam agent listening", { port: config.PORT, chain: chain.mode, bank: bank.name, inTee: chain.inTee() });
