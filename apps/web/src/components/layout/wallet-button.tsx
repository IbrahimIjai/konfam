import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon, ExternalLinkIcon, LogOutIcon, WalletIcon } from "lucide-react";
import { formatToken } from "@konfam/shared";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { explorerAccount } from "@/lib/near";
import { useToken, useTokenBalance } from "@/lib/queries";
import { errorMessage, shortAccount } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { accountId, ready, connect, disconnect } = useWallet();
  const token = useToken();
  const balance = useTokenBalance(accountId);

  if (!accountId) {
    return (
      <Button size="sm" disabled={!ready} onClick={() => connect().catch((e) => toast.error(errorMessage(e)))}>
        <WalletIcon />
        Connect wallet
      </Button>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex h-8 items-center gap-2 rounded-control border border-line-strong bg-surface pr-2 pl-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <span className="size-2 rounded-full bg-stamp" aria-hidden />
        {shortAccount(accountId, 8)}
        <ChevronDownIcon className="size-3.5 text-slate" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="w-64 rounded-control border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(10,13,11,0.35)] outline-none transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-medium">{accountId}</p>
              <p className="text-[13px] text-slate">
                {balance.data !== undefined ? formatToken(balance.data, token.decimals, token.symbol) : "Loading balance…"}
              </p>
            </div>
            <Menu.Separator className="my-1 h-px bg-line" />
            <Menu.Item
              className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={() => window.open(explorerAccount(accountId), "_blank", "noopener")}
            >
              <ExternalLinkIcon className="size-4 text-slate" />
              View on explorer
            </Menu.Item>
            <Menu.Item
              className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
              onClick={() => disconnect().catch((e) => toast.error(errorMessage(e)))}
            >
              <LogOutIcon className="size-4" />
              Disconnect
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
