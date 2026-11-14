import { useQueryClient } from "@tanstack/react-query";
import { fiatForAmount, formatNaira, formatToken, parseUnits, type OfferView, type TradeView } from "@konfam/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { RequireSession } from "@/components/gates";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { config } from "@/config";
import { functionCall, storageDepositIfNeeded, view, type TransactionRequest } from "@/lib/near";
import { useContractInfo, useLinkedBank, useToken } from "@/lib/queries";
import { errorMessage, formatMinutes } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function LinkedBankCheck() {
  const bank = useLinkedBank();
  if (bank.isLoading) return <p className="text-sm text-slate">Checking your bank account…</p>;
  if (!bank.data) {
    return (
      <div className="rounded-control border border-alert/40 bg-alert-soft p-3 text-sm">
        Add the bank account you'll pay from first, so Konfam can see your transfer.
      </div>
    );
  }
  return (
    <p className="text-sm text-slate">
      You'll pay from <span className="font-medium text-ink">{bank.data.accountName}</span>, {bank.data.institution} {bank.data.accountNumberMasked}.
    </p>
  );
}

const TRADE_DEPOSIT = "10000000000000000000000";

export function BuyDialog({ offer, open, onOpenChange }: { offer: OfferView; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { accountId, send } = useWallet();
  const token = useToken();
  const info = useContractInfo();
  const bank = useLinkedBank();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    if (!text) return { amount: null, error: null };
    try {
      const amount = parseUnits(text, token.decimals);
      if (amount < BigInt(offer.min_amount)) return { amount, error: `Minimum is ${formatToken(offer.min_amount, token.decimals, token.symbol)}` };
      const max = BigInt(offer.max_amount) < BigInt(offer.available) ? BigInt(offer.max_amount) : BigInt(offer.available);
      if (amount > max) return { amount, error: `Maximum is ${formatToken(max, token.decimals, token.symbol)}` };
      return { amount, error: null };
    } catch (error) {
      return { amount: null, error: errorMessage(error) };
    }
  }, [text, offer, token.decimals, token.symbol]);

  const fiat = parsed.amount ? fiatForAmount(parsed.amount, BigInt(offer.rate_kobo), token.decimals) : null;
  const holdFor = info.data ? formatMinutes(Number(info.data.payment_window_ms)) : "a few minutes";
  const canSubmit = Boolean(accountId && parsed.amount && !parsed.error && bank.data && !busy);

  const submit = async () => {
    if (!accountId || !parsed.amount) return;
    setBusy(true);
    try {
      const transactions: TransactionRequest[] = [];
      const storage = await storageDepositIfNeeded(token.tokenId, accountId);
      if (storage) transactions.push(storage);
      transactions.push({
        receiverId: config.contractId,
        actions: [
          functionCall("take_offer", { offer_id: offer.id, amount: parsed.amount.toString() }, 50, info.data?.trade_deposit ?? TRADE_DEPOSIT),
        ],
      });
      await send(transactions);
      const trade = await view<TradeView | null>(config.contractId, "get_open_trade", { buyer: accountId });
      await queryClient.invalidateQueries();
      toast.success("USDT reserved. Now send the bank transfer.");
      onOpenChange(false);
      if (trade) navigate(`/trades/${trade.id}`);
      else navigate("/trades");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy {token.symbol} at {formatNaira(offer.rate_kobo)}</DialogTitle>
          <DialogDescription>
            From {offer.seller}. We hold the USDT for you for {holdFor} while you send the bank transfer.
          </DialogDescription>
        </DialogHeader>
        <Field
          label={`Amount of ${token.symbol}`}
          htmlFor="buy-amount"
          error={parsed.error}
          hint={`Between ${formatToken(offer.min_amount, token.decimals, token.symbol)} and ${formatToken(
            BigInt(offer.max_amount) < BigInt(offer.available) ? offer.max_amount : offer.available,
            token.decimals,
            token.symbol,
          )}`}
        >
          <Input
            id="buy-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="100"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={Boolean(parsed.error)}
          />
        </Field>
        <div className="flex items-baseline justify-between rounded-control bg-muted px-4 py-3">
          <span className="text-sm text-slate">You'll pay</span>
          <span className="text-xl font-semibold tracking-tight">{fiat ? formatNaira(fiat) : "₦0.00"}</span>
        </div>
        <p className="text-[13px] text-slate">
          Your wallet will ask for a 0.01 NEAR deposit. You get it back when the USDT arrives. It's only kept if you
          don't pay.
        </p>
        <RequireSession>
          <LinkedBankCheck />
        </RequireSession>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          {bank.data || !accountId ? (
            <Button disabled={!canSubmit} onClick={submit}>
              {busy ? "Confirm in your wallet…" : "Reserve and pay"}
            </Button>
          ) : (
            <Link to="/profile#pay-from" className={buttonVariants()}>
              Add bank account
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
