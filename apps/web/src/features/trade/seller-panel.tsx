import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatNaira, type TradeView } from "@konfam/shared";
import { toast } from "sonner";
import { Countdown, useNow } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { config } from "@/config";
import { functionCall } from "@/lib/near";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

export function SellerPanel({ trade }: { trade: TradeView }) {
  const { send } = useWallet();
  const queryClient = useQueryClient();
  const now = useNow();
  const reclaimAt = Number(trade.reclaimable_after_ms);
  const reclaim = useMutation({
    mutationFn: () => send([{ receiverId: config.contractId, actions: [functionCall("cancel_trade", { trade_id: trade.id }, 50)] }]),
    onSuccess: async () => {
      toast.success("USDT returned to your offer");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-6">
      <div className="rounded-control border border-line bg-surface p-5">
        <p className="font-semibold">Waiting for the buyer to pay you</p>
        <p className="mt-2 text-[15px] text-slate">
          They'll send <span className="font-semibold text-ink">{formatNaira(trade.fiat_kobo)}</span> to your bank with{" "}
          <span className="font-semibold text-ink">{trade.reference}</span> in the narration. You don't need to do
          anything. Konfam releases the USDT once the payment is confirmed.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate">
        <p>
          Time left for the buyer: <Countdown until={Number(trade.expires_ms)} expiredLabel="none" />
        </p>
        {now >= reclaimAt ? (
          <Button variant="outline" disabled={reclaim.isPending} onClick={() => reclaim.mutate()}>
            {reclaim.isPending ? "Confirm in your wallet…" : "Take back my USDT"}
          </Button>
        ) : (
          <p>
            If they don't pay, you can take the USDT back in <Countdown until={reclaimAt} />.
          </p>
        )}
      </div>
    </div>
  );
}
