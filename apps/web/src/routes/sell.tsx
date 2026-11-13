import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireSession } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { config } from "@/config";
import { MyOffers } from "@/features/sell/my-offers";
import { OfferForm } from "@/features/sell/offer-form";
import { PayeeSection, usePayee } from "@/features/sell/payee-section";
import { functionCall } from "@/lib/near";
import { useToken } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

function Faucet() {
  const { send } = useWallet();
  const token = useToken();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (config.networkId !== "testnet" || !token.tokenId) return null;
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await send([{ receiverId: token.tokenId, actions: [functionCall("faucet", { amount: (1000n * 10n ** BigInt(token.decimals)).toString() }, 30)] }]);
          await queryClient.invalidateQueries({ queryKey: ["ft-balance"] });
          toast.success(`1,000 test ${token.symbol} added to your wallet`);
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Minting…" : `Get 1,000 test ${token.symbol}`}
    </Button>
  );
}

function Step({ n, title, description, children }: { n: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div>
        <span className="grid size-7 place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper">{n}</span>
        <h2 className="mt-3 font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function SellFlow() {
  const payee = usePayee();
  return (
    <div className="grid gap-12">
      <Step n={1} title="Where buyers pay you" description="Your bank account stays with the verifier. Only its fingerprint goes on-chain with your offer.">
        <PayeeSection />
      </Step>
      <Step n={2} title="Lock USDT for sale" description="USDT stays in escrow until a buyer's transfer is verified, and you can withdraw what isn't reserved at any time.">
        {payee.data ? (
          <OfferForm commitment={payee.data.commitment} />
        ) : (
          <p className="rounded-control border border-dashed border-line-strong p-5 text-sm text-slate">Save a payout account first.</p>
        )}
      </Step>
    </div>
  );
}

export function SellPage() {
  const { accountId } = useWallet();
  return (
    <div className="grid gap-10">
      <PageHeader
        title="Sell USDT for naira"
        description="Set your price, lock USDT in escrow, and get paid straight into your bank account. You never have to release coins by hand."
        actions={<Faucet />}
      />
      <RequireSession>
        <SellFlow />
      </RequireSession>
      {accountId ? (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Your offers</h2>
          <MyOffers />
        </section>
      ) : null}
    </div>
  );
}
