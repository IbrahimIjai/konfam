import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BuildingIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { config } from "@/config";
import { agent } from "@/lib/agent";
import { useAttestation, useLinkedBank } from "@/lib/queries";
import { useSandboxAccounts } from "@/lib/sandbox-accounts";
import { errorMessage, formatTime } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function useLink(onDone?: () => void) {
  const { authHeader } = useWallet();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { provider: "mono"; code: string } | { provider: "sandbox"; accountId: string }) =>
      agent.linkBank(await authHeader(), body),
    onSuccess: async (linked) => {
      toast.success(`${linked.institution} account linked`);
      await queryClient.invalidateQueries({ queryKey: ["linked-bank"] });
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function MonoLink({ onDone }: { onDone?: () => void }) {
  const link = useLink(onDone);
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

function SandboxLink({ onDone, linkedId }: { onDone?: () => void; linkedId?: string }) {
  const link = useLink(onDone);
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
  const others = accounts.filter((account) => account.id !== linkedId);

  return (
    <div className="grid gap-4">
      <p className="rounded-control border border-alert/40 bg-alert-soft px-4 py-3 text-sm">
        Testnet uses a play-money bank, so you can try the whole flow without real naira. In production this step opens
        Mono Connect.
      </p>
      {others.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-[13px] text-slate">Test accounts opened in this browser</p>
          <ul className="divide-y divide-line rounded-control border border-line bg-surface">
            {others.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="font-medium">{account.holderName}</p>
                  <p className="text-[13px] text-slate">
                    {account.bankName}, {account.accountNumber}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate({ provider: "sandbox", accountId: account.id })}>
                  Use this account
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form
        className="flex flex-col gap-3 rounded-control border border-line bg-surface p-5 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Open a new test account" htmlFor="sandbox-name" className="flex-1" hint="Starts with ₦5,000,000 of play money.">
          <Input id="sandbox-name" required minLength={3} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" disabled={create.isPending || link.isPending}>
          {create.isPending ? "Opening…" : "Open and link"}
        </Button>
      </form>
    </div>
  );
}

/** The bank account the buyer pays from. The verifier reads its outgoing transfers. */
export function PayFromSection() {
  const bank = useLinkedBank();
  const attestation = useAttestation();
  const { authHeader } = useWallet();
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const unlink = useMutation({
    mutationFn: async () => agent.unlinkBank(await authHeader()),
    onSuccess: async () => {
      toast.success("Bank unlinked");
      await queryClient.invalidateQueries({ queryKey: ["linked-bank"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (bank.isLoading) return <p className="text-sm text-slate">Loading your linked bank…</p>;

  const linker =
    attestation.data?.bankProvider === "mono" ? (
      <MonoLink onDone={() => setChanging(false)} />
    ) : attestation.data ? (
      <SandboxLink onDone={() => setChanging(false)} linkedId={bank.data?.sandboxAccountId} />
    ) : (
      <p className="text-sm text-slate">Connecting to the verifier…</p>
    );

  if (!bank.data) return linker;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-control border border-stamp/30 bg-stamp-soft p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-stamp-deep">
            <BuildingIcon className="size-5" />
          </div>
          <div>
            <p className="font-semibold">{bank.data.accountName}</p>
            <p className="text-sm text-slate">
              {bank.data.institution}, {bank.data.accountNumberMasked}
            </p>
            <p className="mt-0.5 text-[13px] text-slate">Linked {formatTime(bank.data.linkedAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setChanging((value) => !value)}>
            {changing ? "Keep this account" : "Change account"}
          </Button>
          <Button size="sm" variant="ghost" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Unlink
          </Button>
        </div>
      </div>
      {changing ? linker : null}
    </div>
  );
}
