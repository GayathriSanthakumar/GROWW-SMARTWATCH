"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { formatPercent } from "@/lib/format";
import { formatMarketAwareRelativeTime } from "@/lib/marketTime";

// "Return later and see what has changed": a hub on the watchlist page that
// summarises the meaningful changes detected while the user was away and lets
// them review everything in one click.

interface ChangeItem {
  id: string;
  instrumentId: string;
  eventType: string;
  magnitude: number;
  explanation: string;
  detectedAt: string;
  symbol: string;
  companyName: string;
  changePct: number;
  dataStatus: string;
}

interface MemorySummary {
  total: number;
  byType: Record<string, { total: number; stocks: number; last24h: number }>;
  distinctStocks: number;
  reviewedAt: string | null;
  recent: ChangeItem[];
}

const TYPE_META: Record<string, { icon: string; label: string }> = {
  price_movement: { icon: "📈", label: "Price move" },
  volume_spike: { icon: "🔊", label: "Volume spike" },
  attention_shift: { icon: "👀", label: "Attention shift" },
};

function fmtAgo(iso: string): string {
  return formatMarketAwareRelativeTime(iso);
}

export function WhatChangedHub({ onOpenStock }: { onOpenStock?: (instrumentId: string) => void }) {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get<MemorySummary>("/api/memory/summary").then(setSummary).catch(() => {});

  useEffect(() => {
    load();
    const socket = getSocket();
    const refresh = () => load();
    socket.on("changes", refresh);
    socket.on("notifications", refresh);
    return () => {
      socket.off("changes", refresh);
      socket.off("notifications", refresh);
    };
  }, []);

  if (!summary || summary.total === 0) return null;

  const totalStocks = summary.distinctStocks ?? 0;

  async function catchUp() {
    setBusy(true);
    try {
      await api.post("/api/memory/catchup");
      setSummary((s) => (s ? { ...s, total: 0, byType: {}, recent: [] } : s));
      window.dispatchEvent(new CustomEvent("smartwatch:notifications", { detail: { unread: 0 } }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div className="card border-l-4 border-l-brand p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              Since you were last here · <span className="text-brand">{summary.total} change{summary.total === 1 ? "" : "s"}</span>
              {totalStocks > 0 && <span className="text-gray-500 font-normal"> across {totalStocks} stock{totalStocks === 1 ? "" : "s"}</span>}
            </h2>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {Object.entries(summary.byType).map(([type, c]) => {
                const meta = TYPE_META[type] ?? { icon: "•", label: type };
                return (
                  <span key={type} className="pill bg-surface-muted text-gray-600">
                    {meta.icon} {meta.label} · {c.total}
                  </span>
                );
              })}
            </div>
          </div>
          <button className="btn-primary" disabled={busy} onClick={catchUp}>
            {busy ? "Reviewing…" : "✓ I've reviewed these"}
          </button>
        </div>

        {summary.recent.length > 0 && (
          <ul className="mt-3 divide-y divide-surface-border">
            {summary.recent.map((c) => {
              const meta = TYPE_META[c.eventType] ?? { icon: "•", label: c.eventType };
              return (
                <li key={c.id}>
                  <button
                    className={`w-full text-left flex items-start gap-3 py-2.5 group ${onOpenStock ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => onOpenStock?.(c.instrumentId)}
                  >
                    <span className="mt-0.5 text-base">{meta.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-brand">
                        {c.symbol} · {c.companyName}
                      </span>
                      <span className="block text-xs text-gray-500">{c.explanation}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className={`block font-semibold tabular-nums ${c.changePct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(c.changePct)}</span>
                      <span className="text-gray-400">{fmtAgo(c.detectedAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
