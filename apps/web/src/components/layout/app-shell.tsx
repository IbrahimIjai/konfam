import { Link, NavLink, Outlet, useLocation } from "react-router";
import { config, isConfigured } from "@/config";
import { useAttestation, useOpenTrade } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { WalletButton } from "./wallet-button";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <rect x="2" y="2" width="28" height="28" rx="7" className="fill-ink" />
      <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-[#3ddc97]" />
    </svg>
  );
}

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
          <Link to="/" className="flex items-center gap-2.5" aria-label="Konfam home">
            <Mark />
            <span className="text-[19px] font-bold tracking-[-0.03em]">konfam</span>
          </Link>
          <nav className="-mx-1 hidden flex-1 items-center gap-1 overflow-x-auto px-1 md:flex" aria-label="Main">
            <NavItem to="/market">Buy USDT</NavItem>
            <NavItem to="/sell">Sell USDT</NavItem>
            <NavItem to="/trades">My trades</NavItem>
            <NavItem to="/bank">Bank</NavItem>
            {sandbox ? <NavItem to="/test-bank">Test bank</NavItem> : null}
            <NavItem to="/cash-out">Cash out</NavItem>
            <NavItem to="/trust">How it's verified</NavItem>
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
          <NavItem to="/market">Buy</NavItem>
          <NavItem to="/sell">Sell</NavItem>
          <NavItem to="/trades">Trades</NavItem>
          <NavItem to="/bank">Bank</NavItem>
          {sandbox ? <NavItem to="/test-bank">Test bank</NavItem> : null}
          <NavItem to="/cash-out">Cash out</NavItem>
          <NavItem to="/trust">Verified</NavItem>
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
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[13px] text-slate sm:flex-row sm:justify-between">
          <p>Escrow on NEAR. Payment checks run inside a Trusted Execution Environment.</p>
          <p>
            Contract{" "}
            <a className="underline underline-offset-4 hover:text-ink" href={`${config.explorerUrl}/address/${config.contractId}`} target="_blank" rel="noreferrer">
              {config.contractId || "not set"}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
