import { z } from "zod";

const schema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    NETWORK_ID: z.enum(["testnet", "mainnet"]).default("testnet"),
    CHAIN_MODE: z.enum(["near", "memory"]).default("near"),
    AGENT_CONTRACT_ID: z.string().default(""),
    SPONSOR_ACCOUNT_ID: z.string().default(""),
    SPONSOR_PRIVATE_KEY: z.string().default(""),
    NEAR_RPC_URL: z.string().url().optional(),
    BANK_PROVIDER: z.enum(["mono", "sandbox"]).default("sandbox"),
    MONO_SECRET_KEY: z.string().default(""),
    MONO_BASE_URL: z.string().url().default("https://api.withmono.com"),
    MONO_REALTIME: z.enum(["true", "false"]).default("true"),
    DATA_DIR: z.string().default("./agent-data"),
    CORS_ORIGINS: z.string().default("*"),
    OVERPAY_TOLERANCE_KOBO: z.coerce.bigint().default(10_000n),
    CLOCK_SKEW_MS: z.coerce.number().int().nonnegative().default(5 * 60 * 1000),
    WATCH_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),
    CODE_VERSION: z.string().default("dev"),
    ONECLICK_URL: z.string().url().default("https://1click.chaindefuser.com"),
    ONECLICK_JWT: z.string().default(""),
    ONECLICK_APP_FEE_BPS: z.coerce.number().int().min(0).max(100).default(0),
    ONECLICK_FEE_RECIPIENT: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (env.CHAIN_MODE === "near") {
      for (const key of ["AGENT_CONTRACT_ID", "SPONSOR_ACCOUNT_ID", "SPONSOR_PRIVATE_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when CHAIN_MODE=near` });
      }
    }
    if (env.BANK_PROVIDER === "mono" && !env.MONO_SECRET_KEY) {
      ctx.addIssue({ code: "custom", path: ["MONO_SECRET_KEY"], message: "MONO_SECRET_KEY is required when BANK_PROVIDER=mono" });
    }
  });

export type Config = z.infer<typeof schema> & { rpcUrl: string };

const DEFAULT_RPC = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
} as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration\n${issues}`);
  }
  return { ...parsed.data, rpcUrl: parsed.data.NEAR_RPC_URL ?? DEFAULT_RPC[parsed.data.NETWORK_ID] };
}
