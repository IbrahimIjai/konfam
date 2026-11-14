import { formatNaira, formatToken, type TradeView, type VerifyResponse } from "@konfam/shared";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { checksFromVerification, CHECK_ORDER, Receipt, type ReceiptCheck } from "@/components/receipt";
import { TradeStatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BuyerPanel } from "@/features/trade/buyer-panel";
import { SellerPanel } from "@/features/trade/seller-panel";
import { SettledPanel } from "@/features/trade/settled-panel";
import type { PayeeReveal } from "@/lib/agent";
import { useToken, useTrade } from "@/lib/queries";
import { formatTime, shortAccount } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function TradeSummary({ trade, symbol, decimals }: { trade: TradeView; symbol: string; decimals: number }) {
  const rows: [string, string][] = [
    ["USDT", formatToken(trade.amount, decimals, symbol)],
    ["Naira", formatNaira(trade.fiat_kobo)],
    ["Seller", shortAccount(trade.seller, 16)],
    ["Buyer", shortAccount(trade.buyer, 16)],
    ["Reference", trade.reference],
    ["Opened", formatTime(trade.opened_ms)],
  ];
  return (
    <section className="mt-10 grid gap-3">
      <h2 className="font-semibold">Trade details</h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-[13px] text-slate">{label}</dt>
            <dd className="mt-0.5 truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TradePage() {
  const { id } = useParams();
  const trade = useTrade(id);
  const token = useToken();
  const { accountId } = useWallet();
  const [verification, setVerification] = useState<VerifyResponse | null>(null);
  const [payee, setPayee] = useState<PayeeReveal | null>(null);
  const onPayee = useCallback((value: PayeeReveal) => setPayee(value), []);

  if (trade.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!trade.data) {
    return (
      <div className="grid justify-items-start gap-4">
        <h1 className="text-2xl font-semibold">Trade #{id} doesn't exist</h1>
        <Link to="/trades" className={buttonVariants({ variant: "outline" })}>
          Back to my trades
        </Link>
      </div>
    );
  }

  const t = trade.data;
  const role = accountId === t.buyer ? "buyer" : accountId === t.seller ? "seller" : "viewer";
  const settled = t.status !== "AwaitingPayment";
  const released = t.status === "Released";

  let checks: ReceiptCheck[];
  if (settled && t.status !== "Cancelled") checks = CHECK_ORDER.map((name) => ({ name, passed: true }));
  else if (verification && verification.status !== "settled") checks = checksFromVerification(verification.checks);
  else checks = CHECK_ORDER.map((name) => ({ name, passed: null }));

  return (
    <div className="grid gap-10">
      <div className="flex flex-col gap-3 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate">
            {role === "buyer" ? "You're buying" : role === "seller" ? "You're selling" : "A trade of"} {formatToken(t.amount, token.decimals, token.symbol)}
          </p>
          <h1 className="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.02em]">Trade #{t.id}</h1>
        </div>
        <TradeStatusBadge status={t.status} />
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {settled ? (
            <SettledPanel trade={t} />
          ) : role === "buyer" ? (
            <BuyerPanel trade={t} onVerify={setVerification} onPayee={onPayee} />
          ) : role === "seller" ? (
            <SellerPanel trade={t} />
          ) : (
            <p className="rounded-control border border-line bg-surface p-5 text-slate">
              This trade belongs to another wallet. Connect the buyer's or seller's wallet to see more.
            </p>
          )}
          {role === "buyer" && !settled ? null : <TradeSummary trade={t} symbol={token.symbol} decimals={token.decimals} />}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Transfer receipt">
          <Receipt
            amountKobo={t.fiat_kobo}
            reference={t.reference}
            toName={payee?.details.accountName}
            toBank={payee?.details.bankName}
            dateLabel={settled && t.settled_ms ? formatTime(t.settled_ms) : undefined}
            heading={released ? "Verified transfer" : "Expected transfer"}
            checks={checks}
            stamped={released}
            stampLabel={`${formatToken(BigInt(t.amount) - BigInt(t.fee), token.decimals, token.symbol)} released`}
          />
        </aside>
      </div>
    </div>
  );
}
