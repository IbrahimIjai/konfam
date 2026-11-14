import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatNaira, payeeCommitment, type TradeView, type VerifyResponse } from "@konfam/shared";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
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
import { errorMessage } from "@/lib/utils";
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
      Seller's account checked: it matches their listing
    </Badge>
  ) : (
    <Badge tone="danger">
      <ShieldAlertIcon />
      This account doesn't match the seller's listing. Don't pay.
    </Badge>
  );
}

function StepHeading({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand font-display text-[13px] font-semibold text-ink">{n}</span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {children ? <p className="mt-0.5 text-sm text-slate">{children}</p> : null}
      </div>
    </div>
  );
}

/** Turns failed verification checks into plain instructions the buyer can act on. */
function hintsFor(result: VerifyResponse | null, trade: TradeView): string[] {
  if (!result || result.status !== "not_found") return [];
  const hints = result.checks
    .filter((check) => check.required && !check.passed)
    .map((check) => {
      switch (check.name) {
        case "bank_activity":
        case "debit":
          return "We can't see a transfer from your bank account yet. Make sure you paid from the account in your profile.";
        case "amount":
          return `Send exactly ${formatNaira(trade.fiat_kobo)}.`;
        case "reference":
          return `Put ${trade.reference} in the narration of your transfer.`;
        case "timing":
          return "Send the transfer after reserving the USDT and before the timer runs out.";
        case "unused":
          return "That transfer was already used for another trade. Send a new one.";
        default:
          return check.detail ?? check.name;
      }
    });
  return [...new Set(hints)];
}

function PaymentDetails({ trade, onPayee }: { trade: TradeView; onPayee: (payee: PayeeReveal) => void }) {
  const payee = usePayeeReveal(trade);
  const offer = useOffer(trade.offer_id);
  const attestation = useAttestation();
  const bank = useLinkedBank();

  useEffect(() => {
    if (payee.data) onPayee(payee.data);
  }, [payee.data, onPayee]);

  if (payee.isLoading) return <p className="text-sm text-slate">Getting the seller's bank details…</p>;
  if (payee.error) return <p className="text-sm text-danger">{errorMessage(payee.error)}</p>;
  if (!payee.data) return null;
  const { details } = payee.data;
  const sandbox = attestation.data?.bankProvider === "sandbox";
  const testBankLink = `/test-bank?to=${details.accountNumber}&amount=${trade.fiat_kobo}&ref=${trade.reference}&trade=${trade.id}${
    bank.data?.sandboxAccountId ? `&from=${bank.data.sandboxAccountId}` : ""
  }`;
  return (
    <div className="grid gap-4">
      <div className="divide-y divide-line rounded-control border border-line bg-surface px-5">
        <CopyField label="Amount" value={(BigInt(trade.fiat_kobo) / 100n).toString() + "." + (BigInt(trade.fiat_kobo) % 100n).toString().padStart(2, "0")} display={formatNaira(trade.fiat_kobo)} emphasis />
        <CopyField label="Narration (important)" value={trade.reference} emphasis />
        <CopyField label="Account number" value={details.accountNumber} />
        <CopyField label="Account name" value={details.accountName} />
        <CopyField label="Bank" value={details.bankName} />
      </div>
      <CommitmentBadge payee={payee.data} expected={offer.data?.bank_commitment} />
      {bank.data ? (
        <p className="text-sm text-slate">
          Pay from <span className="font-medium text-ink">{bank.data.accountName}, {bank.data.institution} {bank.data.accountNumberMasked}</span>.
          Konfam can only see transfers from this account.
        </p>
      ) : bank.isFetched ? (
        <p className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          You haven't added the bank account you'll pay from, so Konfam can't see your transfer.{" "}
          <Link to="/profile#pay-from" className="font-semibold underline underline-offset-4">
            Add it now
          </Link>
          , then come back.
        </p>
      ) : null}
      {sandbox ? (
        <Link className={buttonVariants({ variant: "outline", className: "w-fit" })} to={testBankLink}>
          Pay with the test bank (play money)
        </Link>
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
  const { authHeader, send, hasSession } = useWallet();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [watching, setWatching] = useState(false);
  const [lastResult, setLastResult] = useState<VerifyResponse | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const inFlight = useRef(false);
  const autoStarted = useRef(false);
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
  const startChecking = useCallback(() => {
    inFlight.current = true;
    setWatching(true);
    runVerify();
  }, [runVerify]);

  // Coming back from the test bank after sending: start checking straight away.
  useEffect(() => {
    if (autoStarted.current || params.get("sent") !== "1" || !hasSession) return;
    autoStarted.current = true;
    startChecking();
    setParams(
      (next) => {
        next.delete("sent");
        return next;
      },
      { replace: true },
    );
  }, [params, hasSession, startChecking, setParams]);
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

  const hints = hintsFor(lastResult, trade);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-alert-soft px-5 py-4">
        <p className="font-medium">Time left to pay</p>
        <p className="text-xl font-semibold">
          <Countdown until={Number(trade.expires_ms)} expiredLabel="Time's up" />
        </p>
      </div>

      <section className="grid gap-4">
        <StepHeading n={1} title={`Send ${formatNaira(trade.fiat_kobo)} to the seller`}>
          Use your bank app. Put {trade.reference} in the narration so we can match your payment.
        </StepHeading>
        <RequireSession>
          <PaymentDetails trade={trade} onPayee={onPayee} />
        </RequireSession>
      </section>

      <section className="grid gap-4">
        <StepHeading n={2} title="Tell us you've paid">
          We'll check your bank and send the USDT to your wallet automatically.
        </StepHeading>
        {hints.length > 0 ? (
          <div className="rounded-control border border-alert/40 bg-alert-soft px-4 py-3 text-sm">
            <p className="font-medium">We haven't found your payment yet.</p>
            <ul className="mt-1 list-disc pl-5">
              {hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            {lastResult?.status === "not_found" && lastResult.watching ? <p className="mt-1 text-slate">We'll keep checking.</p> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="brand" size="lg" disabled={verify.isPending} onClick={startChecking}>
            {verify.isPending ? "Checking your bank…" : watching ? "Check again" : "I've paid"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setCancelOpen(true)}>
            Cancel trade
          </Button>
        </div>
        {watching ? <p className="text-[13px] text-slate">Checking every 15 seconds. You can leave this page open.</p> : null}
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
