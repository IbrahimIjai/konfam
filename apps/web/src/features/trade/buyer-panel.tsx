import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatNaira, payeeCommitment, type TradeView, type VerifyResponse } from "@konfam/shared";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CopyField } from "@/components/copy-field";
import { Countdown } from "@/components/countdown";
import { RequireSession } from "@/components/gates";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { config } from "@/config";
import { agent, type PayeeReveal } from "@/lib/agent";
import { functionCall } from "@/lib/near";
import { useAttestation, useLinkedBank, useOffer } from "@/lib/queries";
import { errorMessage, formatTime } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

const POLL_MS = 15_000;

function usePayeeReveal(trade: TradeView) {
  const { hasSession, authHeader } = useWallet();
  return useQuery({
    queryKey: ["trade-payee", trade.id],
    queryFn: async () => agent.tradePayee(await authHeader(), trade.id),
    enabled: hasSession && trade.status === "AwaitingPayment",
    staleTime: Infinity,
  });
}

function CommitmentBadge({ payee, expected }: { payee: PayeeReveal; expected: string | undefined }) {
  const check = useQuery({
    queryKey: ["commitment", payee.commitment, payee.salt],
    queryFn: () => payeeCommitment(payee.details, payee.salt),
  });
  if (!check.data || !expected) return null;
  return check.data === expected ? (
    <Badge tone="stamp">
      <ShieldCheckIcon />
      Matches the account locked on-chain
    </Badge>
  ) : (
    <Badge tone="danger">
      <ShieldAlertIcon />
      Doesn't match the on-chain fingerprint. Don't pay.
    </Badge>
  );
}

function PaymentDetails({ trade, onPayee }: { trade: TradeView; onPayee: (payee: PayeeReveal) => void }) {
  const payee = usePayeeReveal(trade);
  const offer = useOffer(trade.offer_id);
  const attestation = useAttestation();
  const bank = useLinkedBank();

  useEffect(() => {
    if (payee.data) onPayee(payee.data);
  }, [payee.data, onPayee]);

  if (payee.isLoading) return <p className="text-sm text-slate">Fetching the seller's account from the verifier…</p>;
  if (payee.error) return <p className="text-sm text-danger">{errorMessage(payee.error)}</p>;
  if (!payee.data) return null;
  const { details } = payee.data;
  const sandbox = attestation.data?.bankProvider === "sandbox";
  return (
    <div className="grid gap-4">
      <div className="divide-y divide-line rounded-control border border-line bg-surface px-5">
        <CopyField label="Amount to send" value={(BigInt(trade.fiat_kobo) / 100n).toString() + "." + (BigInt(trade.fiat_kobo) % 100n).toString().padStart(2, "0")} display={formatNaira(trade.fiat_kobo)} emphasis />
        <CopyField label="Narration or reference" value={trade.reference} emphasis />
        <CopyField label="Account number" value={details.accountNumber} />
        <CopyField label="Account name" value={details.accountName} />
        <CopyField label="Bank" value={details.bankName} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CommitmentBadge payee={payee.data} expected={offer.data?.bank_commitment} />
        {sandbox ? (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            to={`/test-bank?to=${details.accountNumber}&amount=${trade.fiat_kobo}&ref=${trade.reference}${bank.data?.sandboxAccountId ? `&from=${bank.data.sandboxAccountId}` : ""}`}
          >
            Pay from the test bank
          </Link>
        ) : null}
      </div>
      {bank.data ? (
        <p className="text-sm text-slate">
          Send it from your linked account:{" "}
          <span className="font-medium text-ink">
            {bank.data.accountName}, {bank.data.institution} {bank.data.accountNumberMasked}
          </span>
          . Transfers from any other account can't be verified.{" "}
          <Link to="/profile#pay-from" className="underline underline-offset-4">
            Change
          </Link>
        </p>
      ) : bank.isFetched ? (
        <p className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          You don't have a bank linked, so the verifier can't see your transfer.{" "}
          <Link to="/profile#pay-from" className="font-semibold underline underline-offset-4">
            Link the account you'll pay from
          </Link>{" "}
          before you send.
        </p>
      ) : null}
    </div>
  );
}

export function BuyerPanel({
  trade,
  onVerify,
  onPayee,
}: {
  trade: TradeView;
  onVerify: (result: VerifyResponse) => void;
  onPayee: (payee: PayeeReveal) => void;
}) {
  const { authHeader, send } = useWallet();
  const queryClient = useQueryClient();
  const [watching, setWatching] = useState(false);
  const [lastResult, setLastResult] = useState<VerifyResponse | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const inFlight = useRef(false);

  const verify = useMutation({
    mutationFn: async () => agent.verify(await authHeader(), trade.id),
    onSuccess: async (result) => {
      setLastResult(result);
      onVerify(result);
      if (result.status === "confirmed") {
        setWatching(false);
        toast.success("Transfer confirmed. Releasing your USDT.");
        await queryClient.invalidateQueries({ queryKey: ["trade", trade.id] });
      } else if (result.status === "settled") {
        setWatching(false);
        await queryClient.invalidateQueries({ queryKey: ["trade", trade.id] });
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const runVerify = verify.mutate;
  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      runVerify();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [watching, runVerify]);

  const cancel = useMutation({
    mutationFn: () => send([{ receiverId: config.contractId, actions: [functionCall("cancel_trade", { trade_id: trade.id }, 50)] }]),
    onSuccess: async () => {
      setCancelOpen(false);
      toast.success("Trade cancelled. The USDT went back to the seller's offer.");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const missing = lastResult?.status === "not_found" ? lastResult.checks.filter((c) => c.required && !c.passed) : [];

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-alert-soft px-5 py-4">
        <p className="font-medium">Send the transfer before the timer runs out</p>
        <p className="text-xl font-semibold">
          <Countdown until={Number(trade.expires_ms)} expiredLabel="Window closed" />
        </p>
      </div>

      <section className="grid gap-3">
        <h2 className="font-semibold">Pay the seller from your linked bank</h2>
        <RequireSession>
          <PaymentDetails trade={trade} onPayee={onPayee} />
        </RequireSession>
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">Then let the verifier check</h2>
        <p className="text-sm text-slate">
          It reads your linked account for an outgoing transfer of exactly this amount with {trade.reference} in the
          narration, sent after {formatTime(trade.opened_ms)}.
        </p>
        {missing.length > 0 ? (
          <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm">
            No matching transfer yet.{" "}
            {lastResult?.status === "not_found" && lastResult.watching ? "The verifier keeps checking on its own. " : ""}
            Missing: {missing.map((c) => c.detail ?? c.name).join(", ").toLowerCase()}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="brand"
            size="lg"
            disabled={verify.isPending}
            onClick={() => {
              inFlight.current = true;
              setWatching(true);
              verify.mutate();
            }}
          >
            {verify.isPending ? "Checking your bank…" : watching ? "Check again now" : "I've sent it, check my bank"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setCancelOpen(true)}>
            Cancel trade
          </Button>
        </div>
        {watching ? <p className="text-[13px] text-slate">Checking every 15 seconds while this page is open.</p> : null}
      </section>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this trade?</DialogTitle>
            <DialogDescription>
              Only cancel if you haven't sent the money. Once cancelled, a transfer you already made can't release this
              USDT.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep trade
            </Button>
            <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? "Confirm in wallet…" : "Cancel trade"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
