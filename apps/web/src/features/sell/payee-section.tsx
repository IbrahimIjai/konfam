import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskAccountNumber, type PayeeDetails } from "@konfam/shared";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { agent, type PayeeReveal } from "@/lib/agent";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

export function usePayee() {
  const { accountId, hasSession, authHeader } = useWallet();
  return useQuery({
    queryKey: ["payee", accountId],
    queryFn: async () => agent.myPayee(await authHeader()),
    enabled: Boolean(accountId && hasSession),
  });
}

/**
 * The account buyers pay the seller into. When `manageInProfile` is set, a saved account links to the
 * profile page for changes instead of editing inline.
 */
export function PayeeSection({ onReady, manageInProfile = false }: { onReady?: (payee: PayeeReveal) => void; manageInProfile?: boolean }) {
  const payee = usePayee();
  const { authHeader } = useWallet();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PayeeDetails>({ bankName: "", accountNumber: "", accountName: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await agent.registerPayee(await authHeader(), form);
      await queryClient.invalidateQueries({ queryKey: ["payee"] });
      setEditing(false);
      onReady?.(saved);
      toast.success("Bank account saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (payee.isLoading) return <p className="text-sm text-slate">Loading your bank account…</p>;

  if (payee.data && !editing) {
    const { details } = payee.data;
    return (
      <div className="flex flex-col gap-4 rounded-control border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{details.accountName}</p>
          <p className="text-sm text-slate">
            {details.bankName}, {maskAccountNumber(details.accountNumber)}
          </p>
        </div>
        {manageInProfile ? (
          <Link to="/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Change in profile
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm(details);
              setEditing(true);
            }}
          >
            Change account
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-control border border-line bg-surface p-5 sm:grid-cols-3">
      <Field label="Bank" htmlFor="payee-bank">
        <Input id="payee-bank" required value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="GTBank" />
      </Field>
      <Field label="Account number" htmlFor="payee-number">
        <Input
          id="payee-number"
          required
          inputMode="numeric"
          pattern="\d{10}"
          maxLength={10}
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })}
          placeholder="0123456789"
        />
      </Field>
      <Field label="Account name" htmlFor="payee-name">
        <Input id="payee-name" required value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Tunde Bakare" />
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-3">
        <p className="text-[13px] text-slate">Only shown to a buyer who is paying you. Changes apply to new offers.</p>
        <div className="flex gap-2">
          {payee.data ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Keep current
            </Button>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save bank account"}
          </Button>
        </div>
      </div>
    </form>
  );
}
