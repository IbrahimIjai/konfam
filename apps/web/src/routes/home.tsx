import { useEffect, useState } from "react";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { CHECK_ORDER, Receipt, type ReceiptCheck } from "@/components/receipt";
import { useContractInfo } from "@/lib/queries";
import { cn } from "@/lib/utils";

const DEMO_KOBO = 24_000_000n;

function useDemoSequence() {
  const total = CHECK_ORDER.length + 1;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(total);
      return;
    }
    const timers = Array.from({ length: total }, (_, i) => setTimeout(() => setStep(i + 1), 900 + i * 520));
    return () => timers.forEach(clearTimeout);
  }, [total]);
  const checks: ReceiptCheck[] = CHECK_ORDER.map((name, i) => ({ name, passed: step > i ? true : null }));
  return { checks, stamped: step >= total };
}

const STEPS = [
  {
    title: "Seller locks USDT",
    body: "USDT moves into the escrow contract on NEAR. Their bank details stay with the verifier, and only a fingerprint of them goes on-chain.",
  },
  {
    title: "Buyer takes an amount",
    body: "The contract reserves that USDT for 30 minutes and gives the buyer a reference like KF7Q2M9X.",
  },
  {
    title: "Buyer sends naira",
    body: "A normal bank transfer to the seller, with the reference in the narration.",
  },
  {
    title: "Verifier confirms, contract releases",
    body: "Inside a TEE, the verifier reads the buyer's linked bank account, finds the transfer and tells the contract. USDT goes to the buyer immediately.",
  },
];

export function HomePage() {
  const demo = useDemoSequence();
  const info = useContractInfo();

  return (
    <div className="grid gap-24">
      <section className="grid items-center gap-12 pt-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-xl">
          <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[58px]">
            USDT releases the moment the naira lands.
          </h1>
          <p className="mt-6 text-[17px] leading-relaxed text-slate">
            Konfam is peer-to-peer USDT for naira without the "please check your alert" wait. A verifier running in
            secure hardware reads the buyer's bank transfer, and the escrow contract on NEAR only releases when it
            checks out. No screenshots. No disputes about fake receipts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/market" className={buttonVariants({ size: "lg" })}>
              Buy USDT
            </Link>
            <Link to="/sell" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Sell USDT
            </Link>
          </div>
          {info.data ? (
            <p className="mt-6 text-sm text-slate">
              {info.data.offer_count} offers listed and {info.data.trade_count} trades opened on this contract so far.
            </p>
          ) : null}
        </div>
        <div className="relative flex justify-center lg:justify-end">
          <Receipt
            className="rotate-[1.5deg]"
            amountKobo={DEMO_KOBO}
            reference="KF7Q2M9X"
            toName="TUNDE BAKARE"
            toBank="Sandbox Bank"
            dateLabel="Today, 10:42"
            checks={demo.checks}
            stamped={demo.stamped}
            stampLabel="150 USDT released"
          />
        </div>
      </section>

      <section aria-labelledby="how" className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="how" className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
            How a trade works
          </h2>
          <p className="mt-3 max-w-sm text-[15px] text-slate">
            Four steps, and nobody has to trust a stranger's screenshot.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="bg-surface p-6">
              <span className="grid size-7 place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sees" className="grid gap-6 border-t border-line pt-12 md:grid-cols-3">
        <h2 id="sees" className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          What the verifier sees, and what it can't do
        </h2>
        <div className="text-[15px] leading-relaxed text-slate">
          <p className="font-medium text-ink">It reads</p>
          <p className="mt-2">
            Outgoing transfers from the bank account the buyer linked through Mono: amount, narration and time. That is
            enough to match a transfer to one trade, once.
          </p>
        </div>
        <div className="text-[15px] leading-relaxed text-slate">
          <p className="font-medium text-ink">It can't</p>
          <p className="mt-2">
            Send USDT anywhere except to the buyer of that trade, release without a registered attestation, or put
            anyone's bank details on-chain. The contract enforces all three.
          </p>
          <Link to="/trust" className={cn(buttonVariants({ variant: "link" }), "mt-3")}>
            Check the live attestation
          </Link>
        </div>
      </section>
    </div>
  );
}
