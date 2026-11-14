import { formatNaira, formatToken, type OfferView } from "@konfam/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BuyDialog } from "@/features/market/buy-dialog";
import { useLinkedBank, useOffers, useToken } from "@/lib/queries";
import { shortAccount } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function SetupBanner() {
  const { hasSession } = useWallet();
  const bank = useLinkedBank();
  if (!hasSession || bank.isLoading || bank.data) return null;
  return (
    <div className="flex flex-col gap-3 rounded-control border border-alert/40 bg-alert-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">One step before you buy</p>
        <p className="text-sm text-slate">Add the bank account you'll pay from, so Konfam can see your transfer and release your USDT.</p>
      </div>
      <Link to="/profile#pay-from" className={buttonVariants({ size: "sm" })}>
        Add bank account
      </Link>
    </div>
  );
}

export function MarketPage() {
  const offers = useOffers();
  const token = useToken();
  const { accountId } = useWallet();
  const [selected, setSelected] = useState<OfferView | null>(null);

  const sorted = useMemo(
    () => [...(offers.data ?? [])].sort((a, b) => (BigInt(a.rate_kobo) < BigInt(b.rate_kobo) ? -1 : 1)),
    [offers.data],
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Buy USDT with a bank transfer"
        description="Pick a seller and choose how much you want. Pay their bank account, and the USDT lands in your wallet as soon as your transfer is confirmed."
        actions={
          <Link to="/sell" className={buttonVariants({ variant: "outline" })}>
            Sell instead
          </Link>
        }
      />

      <SetupBanner />

      {offers.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : offers.error ? (
        <p className="rounded-panel border border-danger/30 bg-danger-soft p-5 text-sm text-danger">
          Couldn't load sellers right now. Refresh the page in a moment.
        </p>
      ) : sorted.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-10 text-center">
          <p className="font-semibold">No sellers have USDT listed right now</p>
          <p className="mt-1 text-sm text-slate">List your own USDT and set the price buyers pay.</p>
          <Link to="/sell" className={buttonVariants({ className: "mt-5" })}>
            List USDT
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Sellers with USDT available, cheapest first</caption>
            <thead className="border-b border-line bg-muted/60 text-[13px] text-slate">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Seller</th>
                <th scope="col" className="px-5 py-3 font-medium">Price per {token.symbol}</th>
                <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Available</th>
                <th scope="col" className="hidden px-5 py-3 font-medium md:table-cell">Limits</th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((offer) => {
                const own = offer.seller === accountId;
                return (
                  <tr key={offer.id} className="align-middle">
                    <td className="px-5 py-4">
                      <p className="font-medium">{shortAccount(offer.seller, 14)}</p>
                    </td>
                    <td className="px-5 py-4 text-[17px] font-semibold tracking-tight">{formatNaira(offer.rate_kobo)}</td>
                    <td className="hidden px-5 py-4 sm:table-cell">{formatToken(offer.available, token.decimals, token.symbol)}</td>
                    <td className="hidden px-5 py-4 text-slate md:table-cell">
                      {formatToken(offer.min_amount, token.decimals, "")}to{" "}
                      {formatToken(BigInt(offer.max_amount) < BigInt(offer.available) ? offer.max_amount : offer.available, token.decimals, token.symbol)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button size="sm" disabled={own} onClick={() => setSelected(offer)}>
                        {own ? "Your offer" : "Buy"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected ? <BuyDialog offer={selected} open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} /> : null}
    </div>
  );
}
