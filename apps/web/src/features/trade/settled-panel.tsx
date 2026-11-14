import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatToken, type TradeView } from "@konfam/shared";
import { ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { RequireSession } from "@/components/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { config } from "@/config";
import { agent } from "@/lib/agent";
import { explorerAccount, functionCall } from "@/lib/near";
import { useToken } from "@/lib/queries";
import { errorMessage, formatTime, shortHash } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function EvidenceDetails({ trade }: { trade: TradeView }) {
  const { authHeader } = useWallet();
  const evidence = useQuery({
    queryKey: ["evidence", trade.id],
    queryFn: async () => agent.evidence(await authHeader(), trade.id),
  });
  if (evidence.isLoading) return <p className="text-sm text-slate">Loading evidence…</p>;
  if (evidence.error) return <p className="text-sm text-slate">{errorMessage(evidence.error)}</p>;
  if (!evidence.data) return null;
  const record = evidence.data.evidence as { transaction?: { amountKobo?: string; date?: string }; provider?: string; verifiedAt?: string };
  return (
    <div className="grid gap-3">
      {evidence.data.matchesChain ? (
        <Badge tone="stamp" className="w-fit">
          <ShieldCheckIcon />
          Konfam's record matches the proof saved on NEAR
        </Badge>
      ) : (
        <Badge tone="danger" className="w-fit">
          Record does not match the on-chain hash
        </Badge>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-slate">Bank data from</dt>
        <dd>{record.provider === "mono" ? "Mono open banking" : "Sandbox bank"}</dd>
        <dt className="text-slate">Transfer time</dt>
        <dd>{record.transaction?.date ? formatTime(Date.parse(record.transaction.date)) : "Unknown"}</dd>
        <dt className="text-slate">Checked at</dt>
        <dd>{record.verifiedAt ? formatTime(Date.parse(record.verifiedAt)) : "Unknown"}</dd>
      </dl>
    </div>
  );
}

export function SettledPanel({ trade }: { trade: TradeView }) {
  const token = useToken();
  const { send } = useWallet();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => send([{ receiverId: config.contractId, actions: [functionCall("retry_payout", { trade_id: trade.id }, 80)] }]),
    onSuccess: async () => {
      toast.success("Payout sent again");
      await queryClient.invalidateQueries({ queryKey: ["trade", trade.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const net = BigInt(trade.amount) - BigInt(trade.fee);

  if (trade.status === "Cancelled") {
    return (
      <div className="rounded-control border border-line bg-surface p-5">
        <p className="font-semibold">This trade was cancelled</p>
        <p className="mt-1 text-sm text-slate">No payment was confirmed, so the USDT went back to the seller.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-control border border-stamp/30 bg-stamp-soft p-5">
        {trade.status === "Released" ? (
          <>
            <p className="font-semibold text-stamp-deep">Payment confirmed. {formatToken(net, token.decimals, token.symbol)} sent to {trade.buyer}</p>
            <p className="mt-1 text-sm text-slate">
              Konfam fee {formatToken(trade.fee, token.decimals, token.symbol)}. Completed {trade.settled_ms ? formatTime(trade.settled_ms) : ""}.
            </p>
          </>
        ) : trade.status === "Releasing" ? (
          <p className="font-semibold text-stamp-deep">Payment confirmed. Sending the USDT now…</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Payment confirmed, but sending the USDT failed. Try again.</p>
            <Button variant="brand" disabled={retry.isPending} onClick={() => retry.mutate()}>
              {retry.isPending ? "Confirm in wallet…" : "Retry payout"}
            </Button>
          </div>
        )}
      </div>

      <details className="group rounded-control border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Technical proof</summary>
        <div className="mt-4 grid gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-slate">Confirmed by</dt>
          <dd className="truncate">
            {trade.verified_by ? (
              <a className="underline underline-offset-4" href={explorerAccount(trade.verified_by)} target="_blank" rel="noreferrer">
                {shortHash(trade.verified_by, 10)}
              </a>
            ) : (
              "Unknown"
            )}
          </dd>
          <dt className="text-slate">Evidence hash</dt>
          <dd className="truncate font-mono text-[12px]">{trade.evidence_hash ?? "None"}</dd>
        </dl>
        <RequireSession>
          <EvidenceDetails trade={trade} />
        </RequireSession>
        </div>
      </details>
    </div>
  );
}
