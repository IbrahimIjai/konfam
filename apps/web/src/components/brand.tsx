import { useId } from "react";
import { cn } from "@/lib/utils";

export const TAGLINE = "Confirm. Proceed. Move forward.";

/** The green K with the checkmark through it. `sparks` adds the two ticks at the top right. */
export function LogoMark({ className, sparks = true }: { className?: string; sparks?: boolean }) {
  const gradient = `konfam-green-${useId()}`;
  return (
    <svg viewBox={sparks ? "86 18 388 388" : "96 86 370 330"} className={className} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#39f54a" />
          <stop offset="0.52" stopColor="#00c853" />
          <stop offset="1" stopColor="#00a844" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`}>
        <path d="M112 104h82c8 0 14 6 14 14v73l-96 96V118c0-8 0-14 0-14z" />
        <path d="M112 287 284 115c7-7 15-11 25-11h86c13 0 20 15 11 24L137 397c-9 9-25 3-25-10V287z" />
        <path d="M256 300 314 242c7-7 18-7 25 0l112 112c9 9 2 25-11 25H354c-8 0-15-3-21-9l-77-70z" />
      </g>
      <path d="m154 257 57 52 143-143" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      {sparks ? (
        <g fill="none" stroke={`url(#${gradient})`} strokeWidth="18" strokeLinecap="round">
          <path d="m390 60 12-29" />
          <path d="m418 83 28-15" />
        </g>
      ) : null}
    </svg>
  );
}

/** The solid "o" with a checkmark knocked out of it. Sized in em so it tracks the wordmark's font size. */
function CheckO() {
  const mask = `konfam-o-${useId()}`;
  return (
    <svg viewBox="0 0 100 100" className="mx-[0.035em] inline-block size-[0.54em] align-[-0.012em]" aria-hidden>
      <mask id={mask}>
        <rect width="100" height="100" fill="#fff" />
        <path d="m29 52 14 13 28-29" fill="none" stroke="#000" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <circle cx="50" cy="50" r="50" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}

/** "Konfam" set in the brand face, with the checkmark "o". Inherits colour and size from its parent. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Konfam" className={cn("font-display leading-none font-bold tracking-[-0.025em] whitespace-nowrap", className)}>
      <span aria-hidden>K</span>
      <CheckO />
      <span aria-hidden>nfam</span>
    </span>
  );
}
