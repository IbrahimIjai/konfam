import type { OfferStatus, TradeStatus } from "@konfam/shared";
import { Badge } from "@/components/ui/badge";

const TRADE: Record<TradeStatus, { label: string; tone: "alert" | "stamp" | "neutral" | "danger" | "ink" }> = {
  AwaitingPayment: { label: "Waiting for transfer", tone: "alert" },
  Releasing: { label: "Releasing", tone: "ink" },
  Verified: { label: "Payout retry needed", tone: "danger" },
  Released: { label: "Released", tone: "stamp" },
  Cancelled: { label: "Cancelled", tone: "neutral" },
};

const OFFER: Record<OfferStatus, { label: string; tone: "stamp" | "neutral" | "alert" }> = {
  Active: { label: "Active", tone: "stamp" },
  Paused: { label: "Paused", tone: "alert" },
  Closed: { label: "Closed", tone: "neutral" },
};

export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  const s = TRADE[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const s = OFFER[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
