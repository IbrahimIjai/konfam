import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BuildingIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { RequireSession } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { config } from "@/config";
import { agent } from "@/lib/agent";
import { useAttestation, useLinkedBank } from "@/lib/queries";
import { useSandboxAccounts } from "@/lib/sandbox-accounts";
import { errorMessage, formatTime } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function useLink() {
  const { authHeader } = useWallet();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { provider: "mono"; code: string } | { provider: "sandbox"; accountId: string }) =>
      agent.linkBank(await authHeader(), body),
    onSuccess: async (linked) => {
      toast.success(`${linked.institution} account linked`);
      await queryClient.invalidateQueries({ queryKey: ["linked-bank"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function MonoLink() {
  const link = useLink();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [opening, setOpening] = useState(false);

  const open = async (event: FormEvent) => {
    event.preventDefault();
    if (!config.monoPublicKey) {
      toast.error("Set VITE_MONO_PUBLIC_KEY to use Mono Connect");
      return;
    }
    setOpening(true);
    try {
      const { default: Connect } = await import("@mono.co/connect.js");
      const widget = new Connect({
        key: config.monoPublicKey,
        scope: "auth",
        data: { customer: { name, email } },
        onSuccess: ({ code }: { code: string }) => link.mutate({ provider: "mono", code }),
        onClose: () => setOpening(false),
      });
      widget.setup();
      widget.open();
    } catch (error) {
      toast.error(errorMessage(error));
      setOpening(false);
    }
  };

  return (
    <form onSubmit={open} className="grid gap-4 rounded-control border border-line bg-surface p-5 sm:grid-cols-2">
      <Field label="Full name on your bank account" htmlFor="mono-name">
        <Input id="mono-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="mono-email">
        <Input id="mono-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="text-[13px] text-slate">You'll log in to your bank inside Mono's window. Konfam never sees your password.</p>
        <Button type="submit" disabled={opening || link.isPending}>
          {link.isPending ? "Linking…" : "Link with Mono"}
        </Button>
      </div>
    </form>
  );
}

function SandboxLink() {
  const link = useLink();
  const { accounts, add } = useSandboxAccounts();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => agent.sandboxCreate(name),
    onSuccess: (account) => {
      add(account);
      setName("");
      link.mutate({ provider: "sandbox", accountId: account.id });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-4">
      <p className="rounded-control border border-alert/40 bg-alert-soft px-4 py-3 text-sm">
        This verifier runs with the sandbox bank, so you can try the whole flow with play money. In production the same
        step opens Mono Connect.
      </p>
      {accounts.length > 0 ? (
        <ul className="divide-y divide-line rounded-control border border-line bg-surface">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="font-medium">{account.holderName}</p>
                <p className="text-[13px] text-slate">
                  {account.bankName}, {account.accountNumber}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate({ provider: "sandbox", accountId: account.id })}>
                Link this account
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-3 rounded-control border border-line bg-surface p-5 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Open a test account" htmlFor="sandbox-name" className="flex-1" hint="Starts with ₦5,000,000 of play money.">
          <Input id="sandbox-name" required minLength={3} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Opening…" : "Open and link"}
        </Button>
      </form>
    </div>
  );
}

function LinkedCard() {
  const bank = useLinkedBank();
  const { authHeader } = useWallet();
  const queryClient = useQueryClient();
  const attestation = useAttestation();
  const unlink = useMutation({
    mutationFn: async () => agent.unlinkBank(await authHeader()),
    onSuccess: async () => {
      toast.success("Bank unlinked");
      await queryClient.invalidateQueries({ queryKey: ["linked-bank"] });
    },
  });

  return (
    <div className="grid gap-8">
      {bank.data ? (
        <div className="flex flex-col gap-4 rounded-panel border border-stamp/30 bg-stamp-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-11 place-items-center rounded-full bg-surface text-stamp-deep">
              <BuildingIcon className="size-5" />
            </div>
            <div>
              <p className="font-semibold">{bank.data.accountName}</p>
              <p className="text-sm text-slate">
                {bank.data.institution}, {bank.data.accountNumberMasked}. Linked {formatTime(bank.data.linkedAt)}.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/market" className={buttonVariants({ variant: "brand", size: "sm" })}>
              Buy USDT
            </Link>
            <Button size="sm" variant="ghost" onClick={() => unlink.mutate()}>
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[15px] text-slate">No bank linked yet. Link the account you'll send naira from.</p>
      )}
      <section className="grid gap-3">
        <h2 className="font-semibold">{bank.data ? "Link a different account" : "Link your bank"}</h2>
        {attestation.data?.bankProvider === "mono" ? <MonoLink /> : attestation.data ? <SandboxLink /> : <p className="text-sm text-slate">Connecting to the verifier…</p>}
      </section>
    </div>
  );
}

export function BankPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Your bank link"
        description="The verifier reads outgoing transfers from this account to confirm your payments. The link lives inside the verifier's secure hardware and never goes on-chain."
      />
      <RequireSession>
        <LinkedCard />
      </RequireSession>
    </div>
  );
}
