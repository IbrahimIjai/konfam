import { formatToken } from "@konfam/shared";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { RequireSession } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PayFromSection } from "@/features/profile/pay-from-section";
import { PayeeSection, usePayee } from "@/features/sell/payee-section";
import { explorerAccount } from "@/lib/near";
import { useLinkedBank, useToken, useTokenBalance } from "@/lib/queries";
import { useWallet } from "@/lib/wallet";

function Section({ id, title, description, status, children }: { id: string; title: string; description: string; status: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-24 gap-4 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate">{description}</p>
        <div className="mt-3">{status}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Ready({ ok, yes, no }: { ok: boolean | undefined; yes: string; no: string }) {
  if (ok === undefined) return null;
  return ok ? (
    <Badge tone="stamp">
      <CheckIcon />
      {yes}
    </Badge>
  ) : (
    <Badge tone="alert">{no}</Badge>
  );
}

function WalletCard() {
  const { accountId } = useWallet();
  const token = useToken();
  const balance = useTokenBalance(accountId);
  if (!accountId) return null;
  return (
    <div className="flex flex-col gap-4 rounded-panel bg-ink p-6 text-paper sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-paper/70">NEAR wallet</p>
        <p className="mt-1 truncate text-lg font-semibold">{accountId}</p>
        <p className="mt-3 text-[28px] font-semibold tracking-tight">
          {balance.data !== undefined ? formatToken(balance.data, token.decimals, token.symbol) : "…"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/cash-out" className={buttonVariants({ variant: "brand", size: "sm" })}>
          Cash out
        </Link>
        <a href={explorerAccount(accountId)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "border-paper/30 bg-transparent text-paper hover:bg-paper/10" })}>
          <ExternalLinkIcon />
          Explorer
        </a>
      </div>
    </div>
  );
}

function ProfileSections() {
  const bank = useLinkedBank();
  const payee = usePayee();
  return (
    <div className="grid gap-12">
      <Section
        id="pay-from"
        title="Account you pay from"
        description="Used when you buy. Always pay sellers from this account: it's the only one Konfam checks for your payments."
        status={<Ready ok={bank.isLoading ? undefined : Boolean(bank.data)} yes="Ready to buy" no="Needed to buy" />}
      >
        <PayFromSection />
      </Section>
      <Section
        id="receive-in"
        title="Account you receive naira in"
        description="Used when you sell. Buyers pay into this account. It's kept private and only shown to a buyer who is paying you."
        status={<Ready ok={payee.isLoading ? undefined : Boolean(payee.data)} yes="Ready to sell" no="Needed to sell" />}
      >
        <PayeeSection />
      </Section>
    </div>
  );
}

function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => window.clearTimeout(timer);
  }, [hash]);
}

export function ProfilePage() {
  useScrollToHash();
  return (
    <div className="grid gap-10">
      <PageHeader title="Profile" description="Your wallet and the two bank accounts Konfam uses: one you pay from when buying, one you get paid into when selling. They can be the same account." />
      <WalletCard />
      <RequireSession>
        <ProfileSections />
      </RequireSession>
    </div>
  );
}
