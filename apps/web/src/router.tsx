import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CashOutPage } from "@/routes/cash-out";
import { HomePage } from "@/routes/home";
import { NotFoundPage } from "@/routes/not-found";
import { ProfilePage } from "@/routes/profile";
import { TestBankPage } from "@/routes/test-bank";
import { TradePage } from "@/routes/trade";
import { TradeDetailPage } from "@/routes/trade-detail";
import { TradesPage } from "@/routes/trades";
import { TrustPage } from "@/routes/trust";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "trade", element: <TradePage /> },
      { path: "market", element: <Navigate to="/trade" replace /> },
      { path: "sell", element: <Navigate to="/trade?side=sell" replace /> },
      { path: "trades", element: <TradesPage /> },
      { path: "trades/:id", element: <TradeDetailPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "bank", element: <Navigate to="/profile#pay-from" replace /> },
      { path: "test-bank", element: <TestBankPage /> },
      { path: "cash-out", element: <CashOutPage /> },
      { path: "trust", element: <TrustPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
