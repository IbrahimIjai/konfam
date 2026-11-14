import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { BuyPanel } from "@/features/market/buy-panel";
import { Faucet, SellPanel } from "@/features/sell/sell-panel";

type Side = "buy" | "sell";

const COPY: Record<Side, { title: string; description: string }> = {
  buy: {
    title: "Buy USDT with a bank transfer",
    description:
      "Pick a seller and choose how much you want. Pay their bank account, and the USDT lands in your wallet as soon as your transfer is confirmed.",
  },
  sell: {
    title: "Sell USDT for naira",
    description:
      "Set your price, lock USDT in escrow, and get paid straight into your bank account. You never have to release coins by hand.",
  },
};

export function TradePage() {
  const [params, setParams] = useSearchParams();
  const side: Side = params.get("side") === "sell" ? "sell" : "buy";
  const setSide = (next: Side) => setParams(next === "buy" ? {} : { side: next }, { replace: true });

  return (
    <div className="grid gap-8">
      <PageHeader title={COPY[side].title} description={COPY[side].description} actions={side === "sell" ? <Faucet /> : null} />
      <Tabs value={side} onValueChange={(value) => setSide(value as Side)}>
        <TabsList aria-label="Buy or sell USDT">
          <TabsTab value="buy">Buy USDT</TabsTab>
          <TabsTab value="sell">Sell USDT</TabsTab>
        </TabsList>
        <TabsPanel value="buy" className="mt-8">
          <BuyPanel onSell={() => setSide("sell")} />
        </TabsPanel>
        <TabsPanel value="sell" className="mt-8">
          <SellPanel />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
