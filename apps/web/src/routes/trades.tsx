import { formatNaira, formatToken } from "@konfam/shared";
import { Link } from "react-router";
import { RequireWallet } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TradeStatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyTrades, useToken } from "@/lib/queries";
import { formatTime } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function TradeList() {
  const trades = useMyTrades();
  const token = useToken();
  const { accountId } = useWallet();
  if (trades.isLoading) return <Skeleton className="h-40" />;
  if (!trades.data || trades.data.length === 0) {
    return (
      <div className="rounded-panel border border-dashed border-line-strong p-10 text-center">
        <p className="font-semibold">No trades yet</p>
        <p className="mt-1 text-sm text-slate">Buy from a seller or list your own USDT to get started.</p>
        <Link to="/trade" className={buttonVariants({ className: "mt-5" })}>
          Browse sellers
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
      {[...trades.data].reverse().map((trade) => (
        <li key={trade.id}>
          <Link to={`/trades/${trade.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-muted/50">
            <div className="min-w-32">
              <p className="font-medium">Trade #{trade.id}</p>
              <p className="text-[13px] text-slate">{trade.buyer === accountId ? "Buying" : "Selling"}</p>
            </div>
            <p className="min-w-28 font-semibold">{formatToken(trade.amount, token.decimals, token.symbol)}</p>
            <p className="min-w-32 text-slate">{formatNaira(trade.fiat_kobo)}</p>
            <p className="hidden flex-1 text-sm text-slate md:block">{formatTime(trade.opened_ms)}</p>
            <TradeStatusBadge status={trade.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TradesPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="My trades" description="Every trade you've bought or sold, newest first." />
      <RequireWallet reason="Connect to see your trades.">
        <TradeList />
      </RequireWallet>
    </div>
  );
}
