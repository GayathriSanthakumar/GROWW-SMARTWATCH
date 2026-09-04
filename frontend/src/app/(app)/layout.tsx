"use client";

import { Navbar } from "@/components/Navbar";
import { RequireAuth } from "@/components/RequireAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-surface-border py-3 text-center text-[11px] text-gray-400">
          Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.
        </footer>
      </div>
    </RequireAuth>
  );
}
