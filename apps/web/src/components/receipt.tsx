import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import { formatNaira, type VerificationCheck } from "@konfam/shared";
import { cn } from "@/lib/utils";

export const CHECK_LABELS: Record<string, string> = {
  bank_activity: "Outgoing transfer found",
  debit: "Money left the buyer's bank",
  amount: "Amount matches the trade",
  reference: "Reference is in the narration",
  timing: "Sent inside the payment window",
  unused: "Transfer not used before",
  payee: "Seller is named on the transfer",
};

export const CHECK_ORDER = ["debit", "amount", "reference", "timing", "unused"];

export interface ReceiptCheck {
  name: string;
  passed: boolean | null;
  required?: boolean;
}

export function checksFromVerification(checks: VerificationCheck[] | undefined): ReceiptCheck[] {
  if (!checks || checks.length === 0) return CHECK_ORDER.map((name) => ({ name, passed: null }));
  return checks.map((check) => ({ name: check.name, passed: check.passed, required: check.required }));
}

interface ReceiptProps {
  amountKobo: string | bigint;
  reference: string;
  toName?: string;
  toBank?: string;
  dateLabel?: string;
  checks: ReceiptCheck[];
  stamped: boolean;
  stampLabel?: string;
  heading?: string;
  className?: string;
}

function CheckMark({ passed }: { passed: boolean | null }) {
  if (passed === null) return <CircleIcon className="size-3.5 text-line-strong" aria-label="Pending" />;
  if (passed) return <CheckIcon className="size-3.5 text-stamp" strokeWidth={3} aria-label="Passed" />;
  return <XIcon className="size-3.5 text-danger" strokeWidth={3} aria-label="Failed" />;
}

export function Stamp({ label = "Released", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none grid place-items-center rounded-[10px] border-[3px] border-stamp px-4 py-2 text-center text-stamp mix-blend-multiply animate-stamp-in",
        className,
      )}
      aria-label={`Konfam stamp: ${label}`}
    >
      <span className="font-display text-[26px] leading-none font-extrabold tracking-[0.06em]">KONFAM</span>
      <span className="mt-1 font-mono text-[10px] leading-none">{label}</span>
    </div>
  );
}

export function Receipt({
  amountKobo,
  reference,
  toName,
  toBank,
  dateLabel,
  checks,
  stamped,
  stampLabel,
  heading = "Transfer alert",
  className,
}: ReceiptProps) {
  return (
    <figure
      className={cn(
        "relative w-full max-w-sm bg-surface px-6 pt-6 pb-8 font-mono text-[12px] leading-relaxed text-ink shadow-[0_30px_60px_-30px_rgba(10,13,11,0.45)] receipt-edge",
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-[15px] font-semibold tracking-tight">{heading}</span>
        <span className="text-slate">NGN</span>
      </div>
      <p className="mt-4 font-sans text-[34px] leading-none font-semibold tracking-tight">
        {formatNaira(amountKobo)}
      </p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-y border-dashed border-line-strong py-4">
        <dt className="text-slate">Narration</dt>
        <dd className="truncate text-right font-medium">{reference}</dd>
        {toName ? (
          <>
            <dt className="text-slate">Beneficiary</dt>
            <dd className="truncate text-right">{toName}</dd>
          </>
        ) : null}
        {toBank ? (
          <>
            <dt className="text-slate">Bank</dt>
            <dd className="truncate text-right">{toBank}</dd>
          </>
        ) : null}
        {dateLabel ? (
          <>
            <dt className="text-slate">Date</dt>
            <dd className="text-right">{dateLabel}</dd>
          </>
        ) : null}
      </dl>
      <figcaption className="sr-only">Payment checks performed inside the Konfam verifier</figcaption>
      <ul className="mt-4 grid gap-1.5">
        {checks.map((check) => (
          <li key={check.name} className="flex items-center justify-between gap-3">
            <span className={cn(check.passed === null ? "text-mist" : "text-ink", check.required === false && "text-slate")}>
              {CHECK_LABELS[check.name] ?? check.name}
              {check.required === false ? " (advisory)" : ""}
            </span>
            <span key={String(check.passed)} className="animate-tick-in">
              <CheckMark passed={check.passed} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex min-h-[76px] items-center justify-between gap-4 border-t border-dashed border-line-strong pt-4">
        <span className="max-w-[9rem] text-[11px] leading-snug text-slate">
          {stamped ? "Checked inside the Konfam verifier" : "Waiting for the verifier"}
        </span>
        {stamped ? <Stamp label={stampLabel} className="-my-2 shrink-0" /> : null}
      </div>
    </figure>
  );
}
