import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("relative inline-flex items-center gap-1 rounded-control border border-line bg-surface p-1", className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator className="absolute top-1/2 left-0 z-0 h-[calc(100%-0.5rem)] w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-1/2 rounded-[0.45rem] bg-ink transition-[translate,width] duration-200" />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative z-10 h-8 rounded-[0.45rem] px-3 text-sm font-medium text-slate transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[selected]:text-paper",
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel className={cn("outline-none", className)} {...props} />;
}
