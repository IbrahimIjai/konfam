import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CashOutPage } from "@/routes/cash-out";
import { HomePage } from "@/routes/home";
import { MarketPage } from "@/routes/market";
import { NotFoundPage } from "@/routes/not-found";
import { ProfilePage } from "@/routes/profile";
import { SellPage } from "@/routes/sell";
import { TestBankPage } from "@/routes/test-bank";
import { TradePage } from "@/routes/trade";
import { TradesPage } from "@/routes/trades";
import { TrustPage } from "@/routes/trust";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "market", element: <MarketPage /> },
      { path: "sell", element: <SellPage /> },
      { path: "trades", element: <TradesPage /> },
      { path: "trades/:id", element: <TradePage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "bank", element: <Navigate to="/profile#pay-from" replace /> },
      { path: "test-bank", element: <TestBankPage /> },
      { path: "cash-out", element: <CashOutPage /> },
      { path: "trust", element: <TrustPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
