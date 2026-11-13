import { KeyRoundIcon, WalletIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function Notice({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-ink">{icon}</div>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-slate">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function RequireWallet({ children, reason }: { children: ReactNode; reason: string }) {
  const { accountId, connect } = useWallet();
  if (accountId) return <>{children}</>;
  return (
    <Notice
      icon={<WalletIcon className="size-5" />}
      title="Connect your NEAR wallet"
      body={reason}
      action={<Button onClick={() => connect().catch((e) => toast.error(errorMessage(e)))}>Connect wallet</Button>}
    />
  );
}

export function RequireSession({ children }: { children: ReactNode }) {
  const { accountId, hasSession, authHeader, connect } = useWallet();
  const [busy, setBusy] = useState(false);
  if (!accountId) {
    return (
      <Notice
        icon={<WalletIcon className="size-5" />}
        title="Connect your NEAR wallet"
        body="Your wallet is how the verifier knows which bank account and trades are yours."
        action={<Button onClick={() => connect().catch((e) => toast.error(errorMessage(e)))}>Connect wallet</Button>}
      />
    );
  }
  if (hasSession) return <>{children}</>;
  return (
    <Notice
      icon={<KeyRoundIcon className="size-5" />}
      title="Sign in to the verifier"
      body="Sign a free message so the verifier can show your private bank details. No transaction, no gas."
      action={
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await authHeader();
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Waiting for wallet…" : "Sign message"}
        </Button>
      }
    />
  );
}
