import { useQueryClient } from "@tanstack/react-query";
import { fiatForAmount, formatNaira, formatToken, nairaToKobo, parseUnits } from "@konfam/shared";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { config } from "@/config";
import { functionCall, ONE_YOCTO, storageDepositIfNeeded, type TransactionRequest } from "@/lib/near";
import { useToken, useTokenBalance } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

interface FormState {
  amount: string;
  rate: string;
  min: string;
  max: string;
}

function parse(form: FormState, decimals: number) {
  try {
    const amount = parseUnits(form.amount, decimals);
    const rateKobo = nairaToKobo(form.rate);
    const min = parseUnits(form.min, decimals);
    const max = parseUnits(form.max, decimals);
    if (amount <= 0n) return { error: "Enter how much USDT to lock" };
    if (rateKobo <= 0n) return { error: "Enter your price in naira" };
    const oneToken = 10n ** BigInt(decimals);
    if (min < oneToken || min > max) return { error: "Smallest trade must be at least 1 and not more than the largest" };
    if (amount < min) return { error: "Lock at least your smallest trade size" };
    return { amount, rateKobo, min, max, error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export function OfferForm({ commitment }: { commitment: string }) {
  const { accountId, send } = useWallet();
  const token = useToken();
  const balance = useTokenBalance(accountId);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ amount: "", rate: "1600", min: "10", max: "500" });
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parse(form, token.decimals), [form, token.decimals]);
  const insufficient = parsed.amount !== undefined && balance.data !== undefined && parsed.amount > BigInt(balance.data);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (parsed.error || parsed.amount === undefined || !accountId) return;
    setBusy(true);
    try {
      const transactions: TransactionRequest[] = [];
      const storage = await storageDepositIfNeeded(token.tokenId, config.contractId);
      if (storage) transactions.push(storage);
      const msg = JSON.stringify({
        action: "create_offer",
        rate_kobo: parsed.rateKobo.toString(),
        min_amount: parsed.min.toString(),
        max_amount: parsed.max.toString(),
        bank_commitment: commitment,
      });
      transactions.push({
        receiverId: token.tokenId,
        actions: [
          functionCall("ft_transfer_call", { receiver_id: config.contractId, amount: parsed.amount.toString(), msg }, 150, ONE_YOCTO),
        ],
      });
      await send(transactions);
      await queryClient.invalidateQueries();
      toast.success("Your USDT is listed");
      setForm({ ...form, amount: "" });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-control border border-line bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`${token.symbol} to lock`}
          htmlFor="offer-amount"
          hint={balance.data !== undefined ? `Wallet balance ${formatToken(balance.data, token.decimals, token.symbol)}` : undefined}
          error={insufficient ? "More than your wallet balance" : null}
        >
          <Input id="offer-amount" inputMode="decimal" value={form.amount} onChange={update("amount")} placeholder="1000" aria-invalid={insufficient} />
        </Field>
        <Field label={`Your price per ${token.symbol} in naira`} htmlFor="offer-rate">
          <Input id="offer-rate" inputMode="decimal" value={form.rate} onChange={update("rate")} />
        </Field>
        <Field label="Smallest trade" htmlFor="offer-min">
          <Input id="offer-min" inputMode="decimal" value={form.min} onChange={update("min")} />
        </Field>
        <Field label="Largest trade" htmlFor="offer-max">
          <Input id="offer-max" inputMode="decimal" value={form.max} onChange={update("max")} />
        </Field>
      </div>
      <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate">
          {parsed.error && form.amount
            ? parsed.error
            : parsed.min !== undefined && parsed.rateKobo !== undefined && parsed.max !== undefined
              ? `Buyers will send you between ${formatNaira(fiatForAmount(parsed.min, parsed.rateKobo, token.decimals))} and ${formatNaira(fiatForAmount(parsed.max, parsed.rateKobo, token.decimals))} per trade.`
              : "Set how much to lock and your price."}
        </p>
        <Button type="submit" disabled={busy || Boolean(parsed.error) || insufficient}>
          {busy ? "Confirm in wallet…" : "Lock USDT and list"}
        </Button>
      </div>
    </form>
  );
}
