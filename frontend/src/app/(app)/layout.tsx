"use client";

import { Navbar } from "@/components/Navbar";
import { RequireAuth } from "@/components/RequireAuth";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { LiveMarketSubscriber } from "@/components/LiveMarketSubscriber";
import { MarketProvider } from "@/context/MarketContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <MarketProvider>
        <LiveMarketSubscriber />
        <div className="min-h-screen flex flex-col">
        <Navbar />
        <MarketStatusBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-surface-border py-3 text-center text-[11px] text-gray-400">
          Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.
        </footer>
        </div>
      </MarketProvider>
    </RequireAuth>
  );
}
