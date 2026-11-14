import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatNaira, nairaToKobo } from "@konfam/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { agent } from "@/lib/agent";
import { useLinkedBank } from "@/lib/queries";
import { useSandboxAccounts } from "@/lib/sandbox-accounts";
import { cn, errorMessage, formatTime } from "@/lib/utils";

function koboToNairaText(kobo: string): string {
  const value = BigInt(kobo);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

export function TestBankPage() {
  const [params] = useSearchParams();
  const { accounts, add } = useSandboxAccounts();
  const linked = useLinkedBank();
  const linkedId = linked.data?.sandboxAccountId ?? null;
  const [chosen, setChosen] = useState<string | null>(params.get("from"));
  const selected = chosen ?? linkedId ?? accounts[0]?.id ?? null;
  const setSelected = setChosen;
  const [name, setName] = useState("");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [amount, setAmount] = useState(params.get("amount") ? koboToNairaText(params.get("amount")!) : "");
  const [narration, setNarration] = useState(params.get("ref") ?? "");
  const queryClient = useQueryClient();

  const account = useQuery({
    queryKey: ["sandbox-account", selected],
    queryFn: () => agent.sandboxAccount(selected!),
    enabled: Boolean(selected),
    refetchInterval: 10_000,
  });

  // The linked account may have been opened in another browser. Remember it here so it shows in the list.
  useEffect(() => {
    const opened = account.data?.account;
    if (opened && !accounts.some((a) => a.id === opened.id)) add(opened);
  }, [account.data, accounts, add]);

  const notLinked = Boolean(linkedId && selected && selected !== linkedId);
  const tradePayment = Boolean(params.get("ref"));

  const create = useMutation({
    mutationFn: () => agent.sandboxCreate(name),
    onSuccess: (created) => {
      add(created);
      setSelected(created.id);
      setName("");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const transfer = useMutation({
    mutationFn: () =>
      agent.sandboxTransfer({
        fromAccountId: selected!,
        toAccountNumber: to,
        amountKobo: nairaToKobo(amount).toString(),
        narration,
      }),
    onSuccess: async () => {
      toast.success("Transfer sent");
      await queryClient.invalidateQueries({ queryKey: ["sandbox-account"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const send = (event: FormEvent) => {
    event.preventDefault();
    transfer.mutate();
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Test bank"
        description="Play-money bank accounts for trying Konfam without real naira. The verifier reads this bank the same way it reads Mono."
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="grid content-start gap-4">
          <h2 className="font-semibold">Account</h2>
          {accounts.length > 0 ? (
            <Select value={selected} onValueChange={(value) => setSelected(value as string)} items={accounts.map((a) => ({ value: a.id, label: `${a.holderName}, ${a.accountNumber}` }))}>
              <SelectTrigger placeholder="Choose an account" />
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.holderName}, {a.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {notLinked ? (
            <div className="flex flex-col gap-3 rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
              <p>
                This isn't the account linked to your profile ({linked.data?.accountNumberMasked}). The verifier only reads your linked account, so a
                transfer from here won't confirm a trade.
              </p>
              <Button size="sm" variant="outline" onClick={() => setSelected(linkedId)}>
                Use linked account
              </Button>
            </div>
          ) : null}
          {tradePayment && linked.isFetched && !linked.data ? (
            <p className="rounded-control border border-alert/40 bg-alert-soft px-4 py-3 text-sm">
              You haven't linked a bank yet, so the verifier can't see this transfer.{" "}
              <Link to="/profile#pay-from" className="font-semibold underline underline-offset-4">
                Link one in your profile
              </Link>{" "}
              first.
            </p>
          ) : null}
          {account.data ? (
            <div className="rounded-panel bg-ink p-6 text-paper">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-paper/70">{account.data.account.bankName}</p>
                {account.data.account.id === linkedId ? <Badge tone="stamp">Linked to your profile</Badge> : null}
              </div>
              <p className="mt-1 text-[30px] font-semibold tracking-tight">{formatNaira(account.data.account.balanceKobo)}</p>
              <p className="mt-3 text-sm text-paper/80">
                {account.data.account.holderName}, {account.data.account.accountNumber}
              </p>
            </div>
          ) : null}
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Open another account" htmlFor="tb-name" className="flex-1">
              <Input id="tb-name" required minLength={3} placeholder="Account holder name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="outline" disabled={create.isPending}>
              Open account
            </Button>
          </form>
        </section>

        <section className="grid content-start gap-4">
          <h2 className="font-semibold">Send a transfer</h2>
          <form onSubmit={send} className="grid gap-4 rounded-panel border border-line bg-surface p-5">
            <Field label="To account number" htmlFor="tb-to">
              <Input id="tb-to" required inputMode="numeric" maxLength={10} value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Amount in naira" htmlFor="tb-amount">
              <Input id="tb-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Narration" htmlFor="tb-narration" hint="Put the trade reference here.">
              <Input id="tb-narration" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </Field>
            <Button type="submit" disabled={!selected || transfer.isPending}>
              {transfer.isPending ? "Sending…" : "Send transfer"}
            </Button>
          </form>
        </section>
      </div>

      {account.data && account.data.transactions.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="font-semibold">Alerts</h2>
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {account.data.transactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3 font-mono text-[12px]">
                <div className="min-w-0">
                  <p className="truncate">{tx.narration}</p>
                  <p className="text-slate">{formatTime(tx.createdAt)}</p>
                </div>
                <p className={cn("shrink-0 font-semibold", tx.type === "credit" ? "text-stamp" : "text-ink")}>
                  {tx.type === "credit" ? "+" : "-"}
                  {formatNaira(tx.amountKobo)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
