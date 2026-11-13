import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/utils";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Countdown({ until, expiredLabel = "Time is up" }: { until: number; expiredLabel?: string }) {
  const now = useNow();
  const left = until - now;
  return <span className="tabular-nums">{left > 0 ? formatDuration(left) : expiredLabel}</span>;
}
