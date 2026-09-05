"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface MarketStatusInfo {
  status: "PRE_OPEN" | "REGULAR" | "CLOSED";
  label: string;
  isOpen: boolean;
  isPreOpen: boolean;
  closesAt: string | null;
  nextOpen: string | null;
  nextOpenLabel: string | null;
  lastCloseAt: string | null;
  lastCloseLabel: string | null;
  dataMode: "demo" | "live" | "delayed";
  feedSource: "tv" | "sim" | null;
  lastUpdated: string | null;
  lastLiveAt: string | null;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function MarketStatusBar() {
  const [info, setInfo] = useState<MarketStatusInfo | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<MarketStatusInfo>("/api/market/status")
        .then((d) => !cancelled && setInfo(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 12000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);

  if (!info) return null;

  const target = info.isOpen || info.isPreOpen ? info.closesAt : info.nextOpen;
  const remaining = target ? new Date(target).getTime() - now : 0;

  const dot = info.isOpen ? "bg-up" : info.isPreOpen ? "bg-amber-400" : "bg-gray-400";
  const sourceText = info.feedSource === "tv" ? "TradingView" : info.feedSource === "sim" ? "Simulator" : "—";
  const isLive = info.dataMode === "live";

  const marketSession = info.isOpen || info.isPreOpen;
  // When the market is CLOSED the prices shown ARE the up-to-date last close —
  // there is no live claim and no "delayed" claim either. "DELAYED" only applies
  // when the market is open but the feed is lagging.
  const modeBadge = marketSession
    ? isLive
      ? { text: "LIVE", cls: "bg-up/10 text-up" }
      : info.dataMode === "demo"
        ? { text: "DEMO DATA", cls: "bg-gray-100 text-gray-600" }
        : { text: "DELAYED", cls: "bg-amber-100 text-amber-700" }
    : info.dataMode === "demo"
      ? { text: "DEMO DATA", cls: "bg-gray-100 text-gray-600" }
      : null;

  let text: string;
  let ago: string | null = null;
  if (info.isOpen) {
    text = `${info.label} · Closes in ${fmtCountdown(remaining)}`;
    ago = `${sourceText} · updated ${timeAgo(info.lastUpdated, now)}`;
  } else if (info.isPreOpen) {
    text = `Pre-Open · Market opens at 09:15 AM IST`;
    ago = `${sourceText} · last close ${timeAgo(info.lastUpdated, now)}`;
  } else {
    // CLOSED: static, correct fact — the REAL last session close (15:30 IST on
    // the previous trading day, weekend/holiday aware). No live-ticking counter.
    text = `${info.label} · Last close: ${info.lastCloseLabel ?? "—"}`;
    ago = null;
  }

  return (
    <div className="bg-white border-b border-surface-border">
      <div className="mx-auto max-w-7xl px-4 py-1.5 flex items-center gap-2 text-xs text-gray-600">
        <span className={`inline-block h-2 w-2 rounded-full ${dot} ${info.isOpen || info.isPreOpen ? "animate-pulse" : ""}`} />
        <span className="tabular-nums">{text}</span>
        {ago && <span className="hidden sm:inline text-gray-400">· {ago}</span>}
        <span className="ml-auto flex items-center gap-2">
          {info.isOpen && !isLive && sourceText === "Simulator" && <span className="pill bg-amber-50 text-amber-600">Simulated feed</span>}
          {modeBadge && <span className={`pill ${modeBadge.cls}`}>{modeBadge.text}</span>}
        </span>
      </div>
    </div>
  );
}
