import type { BankProvider } from "./bank/types";
import type { SandboxBank } from "./bank/sandbox";
import type { EscrowChain } from "./chain/types";
import type { Config } from "./config";
import type { Store } from "./store/db";
import type { IntentsOptions } from "./routes/intents";
import type { Verifier } from "./verify/service";

export interface AppDeps {
  config: Pick<Config, "NETWORK_ID" | "CORS_ORIGINS" | "BANK_PROVIDER" | "CODE_VERSION">;
  chain: EscrowChain;
  bank: BankProvider;
  store: Store;
  verifier: Verifier;
  sandbox: SandboxBank | null;
  intents: IntentsOptions;
}
