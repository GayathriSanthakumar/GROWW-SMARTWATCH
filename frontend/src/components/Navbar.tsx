"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  symbol: string | null;
  is_read: boolean;
  created_at: string;
}

function fmtAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const LINKS = [
  { href: "/watchlist", label: "Watchlist" },
  { href: "/screener", label: "Screener" },
  { href: "/ai", label: "AI Analyst" },
  { href: "/portfolio", label: "Portfolio" },
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
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadCount = () =>
      api.get<{ count: number }>("/api/notifications/unread-count").then((d) => mounted && setUnread(d.count)).catch(() => {});
    const loadList = () =>
      api.get<{ notifications: NotificationItem[] }>("/api/notifications").then((d) => mounted && setNotifs(d.notifications.slice(0, 12))).catch(() => {});
    loadCount();
    loadList();

    // Live updates: the server pushes unread counts + a changes signal on each
    // user's socket room whenever a change is detected or an alert fires.
    const socket = getSocket();
    const onNotif = (d: { unread?: number }) => {
      if (d?.unread !== undefined) setUnread(d.unread);
      loadList();
    };
    const onChange = () => {
      loadCount();
      loadList();
    };
    socket.on("notifications", onNotif);
    socket.on("changes", onChange);
    // Local apps can also refresh the badge (e.g. after "reviewed" catch-up).
    const onWin = (e: Event) => {
      const detail = (e as CustomEvent).detail as { unread?: number };
      if (detail?.unread !== undefined) setUnread(detail.unread);
      loadList();
    };
    window.addEventListener("smartwatch:notifications", onWin);
    return () => {
      mounted = false;
      socket.off("notifications", onNotif);
      socket.off("changes", onChange);
      window.removeEventListener("smartwatch:notifications", onWin);
    };
  }, []);

  async function markAllRead() {
    await api.post("/api/notifications/read-all");
    setUnread(0);
    setNotifs((n) => n.map((x) => ({ ...x, is_read: true })));
  }

  async function markRead(id: string) {
    await api.patch(`/api/notifications/${id}`, { isRead: true });
    setUnread((u) => Math.max(0, u - 1));
    setNotifs((n) => n.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
  }

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
              <div className="absolute right-0 mt-2 w-80 card shadow-lg p-0 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
                  <span className="font-semibold text-sm">Notifications</span>
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <button className="text-xs text-brand hover:underline" onClick={markAllRead}>
                        Mark all read
                      </button>
                    )}
                    <Link href="/alerts" className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setNotifOpen(false)}>
                      View all →
                    </Link>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-surface-border">
                  {notifs.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No notifications yet. Changes and alerts will appear here.</p>
                  ) : (
                    notifs.map((n) => (
                      <button key={n.id} className="w-full text-left px-3 py-2.5 hover:bg-surface-muted/60 flex items-start gap-2" onClick={() => (n.is_read ? undefined : markRead(n.id))}>
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.is_read ? "bg-surface-border" : "bg-brand"}`} />
                        <span className="min-w-0">
                          <span className={`block text-xs font-semibold ${n.is_read ? "text-gray-500" : "text-gray-900"}`}>
                            {n.symbol ? `${n.symbol} · ` : ""}{n.title}
                          </span>
                          {n.body && <span className="block text-xs text-gray-500 truncate">{n.body}</span>}
                          <span className="block text-[10px] text-gray-400 mt-0.5">{fmtAgo(n.created_at)}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
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
