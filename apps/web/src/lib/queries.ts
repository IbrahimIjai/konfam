import { useQuery } from "@tanstack/react-query";
import type { ContractInfo, OfferView, TradeView } from "@konfam/shared";
import { config } from "@/config";
import { agent } from "@/lib/agent";
import { ftBalance, ftMetadata, view } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

const ACTIVE_TRADE: TradeView["status"][] = ["AwaitingPayment", "Releasing", "Verified"];

export function useContractInfo() {
  return useQuery({
    queryKey: ["contract-info"],
    queryFn: () => view<ContractInfo>(config.contractId, "get_contract_info"),
    staleTime: 60_000,
    enabled: config.contractId.length > 0,
  });
}

export function useToken() {
  const info = useContractInfo();
  const tokenId = info.data?.token_id;
  const meta = useQuery({
    queryKey: ["ft-metadata", tokenId],
    queryFn: () => ftMetadata(tokenId!),
    enabled: Boolean(tokenId),
    staleTime: Infinity,
  });
  return {
    tokenId: tokenId ?? "",
    decimals: info.data?.token_decimals ?? meta.data?.decimals ?? 6,
    symbol: meta.data?.symbol ?? "USDT",
    isLoading: info.isLoading,
  };
}

export function useTokenBalance(accountId: string | null) {
  const { tokenId } = useToken();
  return useQuery({
    queryKey: ["ft-balance", tokenId, accountId],
    queryFn: () => ftBalance(tokenId, accountId!),
    enabled: Boolean(tokenId && accountId),
    refetchInterval: 15_000,
  });
}

export function useOffers() {
  return useQuery({
    queryKey: ["offers"],
    queryFn: () => view<OfferView[]>(config.contractId, "get_offers", { from_index: 0, limit: 100, active_only: true }),
    enabled: config.contractId.length > 0,
    refetchInterval: 15_000,
  });
}

export function useOffer(offerId: string | undefined) {
  return useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => view<OfferView | null>(config.contractId, "get_offer", { offer_id: offerId }),
    enabled: Boolean(offerId),
  });
}

export function useMyOffers() {
  const { accountId } = useWallet();
  return useQuery({
    queryKey: ["my-offers", accountId],
    queryFn: () => view<OfferView[]>(config.contractId, "get_offers_by_seller", { seller: accountId }),
    enabled: Boolean(accountId),
    refetchInterval: 15_000,
  });
}

export function useTrade(tradeId: string | undefined) {
  return useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => view<TradeView | null>(config.contractId, "get_trade", { trade_id: tradeId }),
    enabled: Boolean(tradeId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE_TRADE.includes(status) ? 4_000 : false;
    },
  });
}

export function useMyTrades() {
  const { accountId } = useWallet();
  return useQuery({
    queryKey: ["my-trades", accountId],
    queryFn: () => view<TradeView[]>(config.contractId, "get_trades_for", { account_id: accountId }),
    enabled: Boolean(accountId),
    refetchInterval: 10_000,
  });
}

export function useOpenTrade() {
  const { accountId } = useWallet();
  return useQuery({
    queryKey: ["open-trade", accountId],
    queryFn: () => view<TradeView | null>(config.contractId, "get_open_trade", { buyer: accountId }),
    enabled: Boolean(accountId),
    refetchInterval: 15_000,
  });
}

export function useAttestation() {
  return useQuery({
    queryKey: ["attestation"],
    queryFn: agent.attestation,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useLinkedBank() {
  const { accountId, hasSession, authHeader } = useWallet();
  return useQuery({
    queryKey: ["linked-bank", accountId],
    queryFn: async () => agent.linkedBank(await authHeader()),
    enabled: Boolean(accountId && hasSession),
  });
}
