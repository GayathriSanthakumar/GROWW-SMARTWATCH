"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/watchlist", label: "Watchlist" },
  { href: "/screener", label: "Screener" },
  { href: "/ai", label: "AI Analyst" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/blueprint", label: "Blueprint" },
  { href: "/market", label: "Market" },
  { href: "/education", label: "Learn" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    api.get<{ count: number }>("/api/notifications/unread-count").then((d) => setUnread(d.count)).catch(() => {});
    const onNotif = (e: Event) => {
      const detail = (e as CustomEvent).detail as { unread?: number };
      if (detail?.unread !== undefined) setUnread(detail.unread);
    };
    window.addEventListener("smartwatch:notifications", onNotif);
    return () => window.removeEventListener("smartwatch:notifications", onNotif);
  }, []);

  async function doLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-surface-border">
      <div className="mx-auto max-w-7xl px-4 flex items-center gap-6 h-14">
        <Link href="/watchlist" className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-brand text-white grid place-items-center font-bold text-sm">S</div>
          <span className="font-bold tracking-tight hidden sm:block">SMARTWATCH</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${active ? "text-brand bg-brand-light" : "text-gray-600 hover:bg-surface-muted"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {user?.isDemo && <span className="pill bg-amber-100 text-amber-700">Demo</span>}

          <div className="relative">
            <button onClick={() => setNotifOpen((v) => !v)} className="relative p-2 rounded-lg hover:bg-surface-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-down text-white text-[10px] grid place-items-center">{unread}</span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 card shadow-lg p-3 z-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Notifications</span>
                  <Link href="/alerts" className="text-xs text-brand">View all</Link>
                </div>
                <p className="text-xs text-gray-400">Open the Alerts page to see and manage notifications.</p>
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 p-1.5 rounded-full hover:bg-surface-muted">
              <div className="h-8 w-8 rounded-full bg-brand text-white grid place-items-center text-sm font-semibold">
                {user?.fullName?.charAt(0).toUpperCase() || "U"}
              </div>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 card shadow-lg py-2 z-50">
                <div className="px-4 py-2 border-b border-surface-border">
                  <p className="text-sm font-semibold truncate">{user?.fullName}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <Link href="/settings" className="block px-4 py-2 text-sm hover:bg-surface-muted">Settings</Link>
                <Link href="/alerts" className="block px-4 py-2 text-sm hover:bg-surface-muted">Alerts</Link>
                {user?.isDemo && <Link href="/demo" className="block px-4 py-2 text-sm hover:bg-surface-muted">Demo Control</Link>}
                <button onClick={doLogout} className="block w-full text-left px-4 py-2 text-sm text-down hover:bg-surface-muted">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
