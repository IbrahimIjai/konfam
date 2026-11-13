import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-control !border !border-line !bg-surface !text-ink !shadow-[0_16px_40px_-16px_rgba(15,31,61,0.35)] !font-sans",
          description: "!text-slate",
          success: "[&_[data-icon]]:!text-stamp",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
