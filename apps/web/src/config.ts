const env = import.meta.env;

export type NetworkId = "testnet" | "mainnet";

const networkId: NetworkId = env.VITE_NETWORK_ID === "mainnet" ? "mainnet" : "testnet";

export const config = {
  networkId,
  contractId: String(env.VITE_CONTRACT_ID ?? ""),
  agentUrl: String(env.VITE_AGENT_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  rpcUrl: String(env.VITE_RPC_URL ?? (networkId === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com")),
  monoPublicKey: String(env.VITE_MONO_PUBLIC_KEY ?? ""),
  explorerUrl: networkId === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io",
  mainnetUsdtAsset: "nep141:usdt.tether-token.near",
};

export const isConfigured = config.contractId.length > 0;
