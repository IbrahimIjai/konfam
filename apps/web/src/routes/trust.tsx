import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";
import { explorerAccount } from "@/lib/near";
import { useAttestation, useContractInfo } from "@/lib/queries";
import { formatDuration, formatTime, shortHash } from "@/lib/utils";

function Fact({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-4">
      {ok ? <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-stamp" /> : <CircleXIcon className="mt-0.5 size-5 shrink-0 text-alert" />}
      <div>
        <p className="font-medium">{label}</p>
        <div className="mt-0.5 text-sm text-slate">{children}</div>
      </div>
    </div>
  );
}

export function TrustPage() {
  const attestation = useAttestation();
  const info = useContractInfo();
  const a = attestation.data;
  const registration = a?.registration;
  const valid = registration?.validity === "Valid";

  return (
    <div className="grid gap-10">
      <PageHeader
        title="How payments get verified"
        description="The escrow contract only accepts a payment confirmation from a verifier that proved, with a hardware attestation, exactly which code it runs. Everything on this page is read live."
      />

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="grid content-start gap-2">
          <h2 className="text-xl font-semibold tracking-tight">The verifier right now</h2>
          {attestation.isLoading ? (
            <Skeleton className="h-48" />
          ) : !a ? (
            <p className="text-sm text-danger">Can't reach the verifier at {config.agentUrl}.</p>
          ) : (
            <div className="divide-y divide-line rounded-panel border border-line bg-surface px-5">
              <Fact ok={a.inTee} label={a.inTee ? "Running inside a TEE" : "Running outside a TEE"}>
                {a.inTee
                  ? "Intel TDX confidential VM on Phala Cloud. Memory is encrypted and the host can't read it."
                  : "Local development mode. Real deployments run inside Intel TDX."}
              </Fact>
              <Fact ok={valid} label={registration ? (valid ? "Registered with the contract" : "Registration invalid") : "Not registered"}>
                <a className="underline underline-offset-4" href={explorerAccount(a.agentAccountId)} target="_blank" rel="noreferrer">
                  {shortHash(a.agentAccountId, 12)}
                </a>
                {registration ? `, valid until ${formatTime(registration.valid_until_ms)}` : ""}
              </Fact>
              <Fact ok={a.bankProvider === "mono"} label={a.bankProvider === "mono" ? "Reads banks through Mono" : "Reads the sandbox bank"}>
                {a.bankProvider === "mono"
                  ? "Mono open banking, under the CBN open banking framework. The bank token stays in the enclave."
                  : "Play-money bank for demos. Switch BANK_PROVIDER to mono for real accounts."}
              </Fact>
              <Fact ok label={`Code version ${a.codeVersion}`}>
                Published as a Docker image whose hash is approved in the contract.
              </Fact>
            </div>
          )}
        </section>

        <section className="grid content-start gap-2">
          <h2 className="text-xl font-semibold tracking-tight">What the contract enforces</h2>
          {info.data ? (
            <div className="divide-y divide-line rounded-panel border border-line bg-surface px-5">
              <Fact ok={info.data.requires_tee} label={info.data.requires_tee ? "Attestation required" : "Local mode, attestation off"}>
                {info.data.requires_tee
                  ? "Agents register only with a TDX quote whose measurements and CPU are on the approved list."
                  : "A whitelisted dev agent can confirm payments. Use requires_tee for production."}
              </Fact>
              <Fact ok label="Payout goes to the buyer, always">
                The verifier can only say "this trade is paid". It can't choose who receives the USDT.
              </Fact>
              <Fact ok label={`${formatDuration(Number(info.data.payment_window_ms))} payment window`}>
                After the window plus {formatDuration(Number(info.data.release_grace_ms))} grace, the seller can reclaim unpaid USDT.
              </Fact>
              <Fact ok label="0.01 NEAR deposit to reserve">
                Returned to the buyer when the USDT is released, kept if the trade is cancelled, so nobody can lock up
                sellers' liquidity for free.
              </Fact>
              <Fact ok label={`${(info.data.fee_bps / 100).toFixed(2)}% fee on release`}>
                Taken from the released USDT. Nothing is charged on cancelled trades.
              </Fact>
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </section>
      </div>

      <section className="grid gap-4 border-t border-line pt-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="text-xl font-semibold tracking-tight">What you're trusting</h2>
        <div className="grid gap-3 text-[15px] leading-relaxed text-slate">
          <p>
            Intel TDX and Phala's hosting to keep the enclave sealed, the contract owner to approve only audited code
            measurements, and Mono to report bank transactions accurately. You are not trusting the seller, the buyer, or
            Konfam's servers: none of them can release USDT.
          </p>
          {registration ? (
            <details className="rounded-control border border-line bg-surface p-4 text-sm">
              <summary className="cursor-pointer font-medium text-ink">Registered measurements</summary>
              <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed">{JSON.stringify(registration.measurements, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}
