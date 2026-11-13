import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyField({ label, value, display, emphasis }: { label: string; value: string; display?: string; emphasis?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] text-slate">{label}</p>
        <p className={cn("truncate", emphasis ? "text-xl font-semibold tracking-tight" : "text-[15px] font-medium")}>
          {display ?? value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line px-2.5 text-[13px] text-slate transition-colors hover:border-line-strong hover:text-ink"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon className="size-3.5 text-stamp" /> : <CopyIcon className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
