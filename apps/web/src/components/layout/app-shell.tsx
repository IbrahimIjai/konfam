import { Link, NavLink, Outlet, useLocation } from "react-router";
import { config, isConfigured } from "@/config";
import { useAttestation, useOpenTrade } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { LogoMark, TAGLINE, Wordmark } from "@/components/brand";
import { WalletButton } from "./wallet-button";

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded-control px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
          isActive ? "bg-ink text-paper" : "text-slate hover:bg-muted hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function OpenTradeBanner() {
  const openTrade = useOpenTrade();
  const location = useLocation();
  if (!openTrade.data || location.pathname === `/trades/${openTrade.data.id}`) return null;
  return (
    <div className="border-b border-alert/30 bg-alert-soft">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-2 text-sm">
        <span>
          Trade #{openTrade.data.id} is waiting for your bank transfer.
        </span>
        <Link to={`/trades/${openTrade.data.id}`} className="font-semibold underline underline-offset-4">
          Open trade
        </Link>
      </div>
    </div>
  );
}

export function AppShell() {
  const attestation = useAttestation();
  const sandbox = attestation.data?.bankProvider === "sandbox";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Konfam home">
            <LogoMark className="size-8" />
            <Wordmark className="text-[22px]" />
          </Link>
          <nav className="-mx-1 hidden flex-1 items-center gap-1 overflow-x-auto px-1 md:flex" aria-label="Main">
            <NavItem to="/trade">Trade</NavItem>
            <NavItem to="/trades">My trades</NavItem>
            <NavItem to="/profile">Profile</NavItem>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {config.networkId === "testnet" ? (
              <span className="hidden rounded-full border border-alert/40 bg-alert-soft px-2 py-0.5 text-[12px] font-medium text-[#8a5d00] sm:inline">
                Testnet
              </span>
            ) : null}
            <WalletButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden" aria-label="Main mobile">
          <NavItem to="/trade">Trade</NavItem>
          <NavItem to="/trades">Trades</NavItem>
          <NavItem to="/profile">Profile</NavItem>
        </nav>
      </header>
      <OpenTradeBanner />
      {!isConfigured ? (
        <div className="bg-danger-soft px-5 py-2 text-center text-sm text-danger">
          Set VITE_CONTRACT_ID in apps/web/.env to point the app at your escrow contract.
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <Outlet />
      </main>
      <footer className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Konfam home">
              <LogoMark className="size-10" />
              <Wordmark className="text-[28px]" />
            </Link>
            <p className="mt-3 font-display text-[15px] tracking-[0.04em] text-haze">{TAGLINE}</p>
          </div>
          <div className="grid gap-1.5 text-[13px] text-haze sm:text-right">
            <nav className="flex flex-wrap gap-x-5 gap-y-1 sm:justify-end" aria-label="Footer">
              <Link to="/trust" className="text-white hover:text-brand">How payments are verified</Link>
              <Link to="/cash-out" className="text-white hover:text-brand">Cash out</Link>
              {sandbox ? <Link to="/test-bank" className="text-white hover:text-brand">Test bank</Link> : null}
            </nav>
            <p>USDT is held in an escrow contract on NEAR until the naira transfer is confirmed.</p>
            <p className="min-w-0 truncate">
              Contract{" "}
              <a className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-brand" href={`${config.explorerUrl}/address/${config.contractId}`} target="_blank" rel="noreferrer">
                {config.contractId || "not set"}
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
