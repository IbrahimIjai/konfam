import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="grid justify-items-start gap-4 py-16">
      <h1 className="text-[32px] font-semibold tracking-tight">This page doesn't exist</h1>
      <p className="text-slate">The link may be old, or the trade number may be wrong.</p>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Go to the start
      </Link>
    </div>
  );
}
