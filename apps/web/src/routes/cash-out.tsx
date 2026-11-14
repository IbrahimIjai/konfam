import { useMutation, useQuery } from "@tanstack/react-query";
import { formatToken, parseUnits } from "@konfam/shared";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireWallet } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { config } from "@/config";
import { functionCall, ONE_YOCTO, storageDepositIfNeeded, type TransactionRequest } from "@/lib/near";
import { CHAIN_NAMES, fetchStatus, fetchTokens, requestQuote, submitDeposit, type OneClickQuote } from "@/lib/one-click";
import { useToken, useTokenBalance } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

const USDT_DECIMALS = 6;
const live = config.networkId === "mainnet";

function txHashOf(outcomes: unknown[]): string | null {
  const last = outcomes[outcomes.length - 1] as { transaction?: { hash?: string } } | undefined;
  return last?.transaction?.hash ?? null;
}

function CashOutForm() {
  const { accountId, send } = useWallet();
  const token = useToken();
  const balance = useTokenBalance(accountId);
  const tokens = useQuery({ queryKey: ["1click-tokens"], queryFn: fetchTokens, staleTime: 5 * 60_000 });
  const [destination, setDestination] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<OneClickQuote | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);

  const options = useMemo(
    () =>
      (tokens.data ?? [])
        .filter((t) => ["USDT", "USDC"].includes(t.symbol) && t.blockchain !== "near" && CHAIN_NAMES[t.blockchain])
        .map((t) => ({ value: t.assetId, label: `${t.symbol} on ${CHAIN_NAMES[t.blockchain]}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tokens.data],
  );

  const status = useQuery({
    queryKey: ["1click-status", depositAddress],
    queryFn: () => fetchStatus(depositAddress!),
    enabled: Boolean(depositAddress),
    refetchInterval: (q) => (q.state.data && ["SUCCESS", "REFUNDED", "FAILED"].includes(q.state.data.status) ? false : 5000),
  });

  const getQuote = useMutation({
    mutationFn: async () =>
      requestQuote({
        dry: !live,
        destinationAsset: destination!,
        amount: parseUnits(amount, USDT_DECIMALS).toString(),
        recipient,
        refundTo: live ? accountId! : "konfam.near",
      }),
    onSuccess: setQuote,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const execute = useMutation({
    mutationFn: async () => {
      const address = quote?.quote.depositAddress;
      if (!address || !accountId) throw new Error("Get a fresh quote first");
      const transactions: TransactionRequest[] = [];
      const storage = await storageDepositIfNeeded(token.tokenId, address);
      if (storage) transactions.push(storage);
      transactions.push({
        receiverId: token.tokenId,
        actions: [functionCall("ft_transfer", { receiver_id: address, amount: quote.quote.amountIn }, 30, ONE_YOCTO)],
      });
      const outcomes = await send(transactions);
      const txHash = txHashOf(outcomes);
      if (txHash) await submitDeposit({ txHash, depositAddress: address, nearSenderAccount: accountId }).catch(() => undefined);
      return address;
    },
    onSuccess: (address) => {
      setDepositAddress(address);
      toast.success("Sent to NEAR Intents");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setQuote(null);
    getQuote.mutate();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <form onSubmit={submit} className="grid content-start gap-4 rounded-panel border border-line bg-surface p-6">
        <Field label="Receive as" htmlFor="co-destination">
          <Select value={destination} onValueChange={(v) => setDestination(v as string)} items={options}>
            <SelectTrigger id="co-destination" placeholder={tokens.isLoading ? "Loading chains…" : "Choose a chain"} />
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Recipient address on that chain" htmlFor="co-recipient">
          <Input id="co-recipient" required value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="T… or 0x… or your Solana address" />
        </Field>
        <Field
          label="USDT to send"
          htmlFor="co-amount"
          hint={live && balance.data ? `Balance ${formatToken(balance.data, token.decimals, token.symbol)}` : undefined}
        >
          <Input id="co-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </Field>
        <Button type="submit" disabled={!destination || getQuote.isPending}>
          {getQuote.isPending ? "Asking solvers…" : "Get quote"}
        </Button>
      </form>

      <aside className="grid content-start gap-4">
        <div className="rounded-panel border border-line bg-surface p-6">
          <p className="text-sm text-slate">You receive</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight">{quote ? quote.quote.amountOutFormatted : "—"}</p>
          {quote ? <p className="mt-1 text-sm text-slate">Arrives in about {Math.max(1, Math.round(quote.quote.timeEstimate))} seconds.</p> : null}
          {live && quote?.quote.depositAddress ? (
            <Button className="mt-5 w-full" variant="brand" disabled={execute.isPending} onClick={() => execute.mutate()}>
              {execute.isPending ? "Confirm in wallet…" : "Send USDT"}
            </Button>
          ) : null}
          {status.data ? (
            <Badge tone={status.data.status === "SUCCESS" ? "stamp" : ["FAILED", "REFUNDED"].includes(status.data.status) ? "danger" : "alert"} className="mt-4">
              {status.data.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          ) : null}
        </div>
        {!live ? (
          <p className="text-sm text-slate">
            NEAR Intents runs on mainnet, so on testnet you get live price previews only. On mainnet this sends your
            USDT through Intents in one transaction.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

export function CashOutPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Cash out to any chain"
        description="Move the USDT you bought to Tron, Solana, Base or another chain through NEAR Intents. Solvers compete to fill it and the best quote wins."
      />
      <RequireWallet reason="Connect the wallet that holds your USDT.">
        <CashOutForm />
      </RequireWallet>
    </div>
  );
}
