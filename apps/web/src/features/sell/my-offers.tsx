import { useQueryClient } from "@tanstack/react-query";
import { formatNaira, formatToken, type OfferView } from "@konfam/shared";
import { useState } from "react";
import { toast } from "sonner";
import { OfferStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { config } from "@/config";
import { functionCall } from "@/lib/near";
import { useMyOffers, useToken } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function OfferRow({ offer }: { offer: OfferView }) {
  const { send } = useWallet();
  const token = useToken();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, methodName: string, args: object, done: string) => {
    setBusy(label);
    try {
      await send([{ receiverId: config.contractId, actions: [functionCall(methodName, args, 100)] }]);
      await queryClient.invalidateQueries();
      toast.success(done);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const closed = offer.status === "Closed";
  return (
    <tr>
      <td className="px-5 py-4">
        <p className="font-medium">Offer #{offer.id}</p>
        <OfferStatusBadge status={offer.status} />
      </td>
      <td className="px-5 py-4 font-semibold">{formatNaira(offer.rate_kobo)}</td>
      <td className="px-5 py-4">{formatToken(offer.available, token.decimals, token.symbol)}</td>
      <td className="hidden px-5 py-4 text-slate sm:table-cell">{formatToken(offer.locked, token.decimals, token.symbol)}</td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          {!closed ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run(
                  "status",
                  "set_offer_status",
                  { offer_id: offer.id, status: offer.status === "Active" ? "Paused" : "Active" },
                  offer.status === "Active" ? "Offer paused" : "Offer resumed",
                )
              }
            >
              {offer.status === "Active" ? "Pause" : "Resume"}
            </Button>
          ) : null}
          {BigInt(offer.available) > 0n ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => run("withdraw", "withdraw_offer", { offer_id: offer.id, amount: null }, "USDT returned to your wallet")}
            >
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function MyOffers() {
  const offers = useMyOffers();
  if (!offers.data || offers.data.length === 0) {
    return <p className="text-sm text-slate">You haven't listed any USDT yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-muted/60 text-[13px] text-slate">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Offer</th>
            <th scope="col" className="px-5 py-3 font-medium">Price</th>
            <th scope="col" className="px-5 py-3 font-medium">Available</th>
            <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">In open trades</th>
            <th scope="col" className="px-5 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...offers.data].reverse().map((offer) => (
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
