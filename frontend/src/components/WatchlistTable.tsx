"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket } from "@/lib/socket";
import { formatINR, formatPercent, formatCompact } from "@/lib/format";
import type { WatchlistItem, Watchlist } from "@/lib/types";
import { Sparkline } from "./Sparkline";
import { RangeSlider52w } from "./RangeSlider52w";
import { ScorePill } from "./ScorePill";
import { VerdictBadge } from "./VerdictBadge";

type SortKey = "symbol" | "ltp" | "changePct" | "volume" | "opportunity" | "risk" | "alphaGrowth";

export function WatchlistTable({
  items,
  watchlists,
  onRowClick,
  onRemove,
  onMove,
  onPin,
  onEditNotes,
}: {
  items: WatchlistItem[];
  watchlists: Watchlist[];
  onRowClick: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (instrumentId: string, targetWatchlistId: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onEditNotes: (id: string) => void;
}) {
  const [live, setLive] = useState<Record<string, { ltp: number; changePct: number }>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [colPicker, setColPicker] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = getSocket();
    const onTicks = (updates: Record<string, { ltp: number; changePct: number }>) => {
      setLive((prev) => ({ ...prev, ...updates }));
      const f: Record<string, "up" | "down"> = {};
      for (const [id, u] of Object.entries(updates)) {
        f[id] = u.changePct >= 0 ? "up" : "down";
      }
      setFlash(f);
      const t = setTimeout(() => setFlash({}), 900);
      return () => clearTimeout(t);
    };
    socket.on("ticks", onTicks);
    return () => {
      socket.off("ticks", onTicks);
    };
  }, []);

  const rows = useMemo(() => {
    const enriched = items.map((it) => {
      const l = live[it.id];
      const ltp = l?.ltp ?? it.ltp;
      const changePct = l?.changePct ?? it.changePct;
      return { ...it, ltp, changePct };
    });
    enriched.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "symbol") {
        av = a.symbol;
        bv = b.symbol;
      } else if (sortKey === "opportunity") {
        av = a.scores.opportunity;
        bv = b.scores.opportunity;
      } else if (sortKey === "risk") {
        av = a.scores.risk;
        bv = b.scores.risk;
      } else if (sortKey === "alphaGrowth") {
        av = a.scores.alphaGrowth;
        bv = b.scores.alphaGrowth;
      } else {
        av = a[sortKey] as number;
        bv = b[sortKey] as number;
      }
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return enriched;
  }, [items, live, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const cols: { key: string; label: string; cell: (r: WatchlistItem) => React.ReactNode; sortable?: SortKey; align?: string }[] = [
    { key: "company", label: "Company", sortable: "symbol", cell: (r) => <CompanyCell r={r} /> },
    { key: "trend", label: "Trend", cell: (r) => <Sparkline points={sparkFrom(r)} /> },
    { key: "ltp", label: "LTP", sortable: "ltp", cell: (r) => <LtpCell r={r} flash={flash[r.id]} />, align: "right" },
    { key: "change", label: "1D %", sortable: "changePct", cell: (r) => <span className={`tabular-nums ${r.changePct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(r.changePct)}</span>, align: "right" },
    { key: "volume", label: "1D Vol", sortable: "volume", cell: (r) => <span className="tabular-nums">{formatCompact(r.volume)}</span>, align: "right" },
    { key: "range", label: "52W Range", cell: (r) => <RangeSlider52w low={r.week52Low} high={r.week52High} current={r.ltp} /> },
    { key: "opp", label: "Opp", sortable: "opportunity", cell: (r) => <ScorePill label="" value={r.scores.opportunity} /> },
    { key: "risk", label: "Risk", sortable: "risk", cell: (r) => <ScorePill label="" value={r.scores.risk} invert /> },
    { key: "verdict", label: "Verdict", cell: (r) => <VerdictBadge verdict={r.scores.aiVerdict} /> },
  ];

  const visibleCols = cols.filter((c) => !hidden.has(c.key));

  return (
    <div className="relative overflow-x-auto">
      <div className="absolute top-0 right-0 z-10">
        <button className="p-2 text-gray-400 hover:text-gray-600" onClick={() => setColPicker((v) => !v)}>⚙</button>
        {colPicker && (
          <div className="absolute right-0 mt-1 card shadow-lg p-3 w-44 z-20">
            <p className="text-xs font-semibold text-gray-500 mb-2">Columns</p>
            {cols.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm py-0.5">
                <input type="checkbox" className="accent-brand" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left text-xs text-gray-500">
            {visibleCols.map((c) => (
              <th key={c.key} className={`py-2 px-3 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>
                {c.sortable ? (
                  <button className="hover:text-gray-800 flex items-center gap-1" onClick={() => toggleSort(c.sortable!)}>
                    {c.label}
                    {sortKey === c.sortable && <span>{sortDir === 1 ? "↑" : "↓"}</span>}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group border-b border-surface-border hover:bg-surface-muted/50 cursor-pointer" onClick={() => onRowClick(r.id)}>
              {visibleCols.map((c) => (
                <td key={c.key} className={`py-2.5 px-3 ${c.align === "right" ? "text-right" : ""} ${c.key === "ltp" || c.key === "change" ? "tabular-nums" : ""}`}>
                  {c.cell(r)}
                </td>
              ))}
              <td className="relative">
                <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-700" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === r.id ? null : r.id); }}>
                  ⋮
                </button>
                {menuFor === r.id && (
                  <div className="absolute right-0 top-8 card shadow-lg py-1 z-30 w-44 text-sm" onClick={(e) => e.stopPropagation()}>
                    <button className="block w-full text-left px-3 py-1.5 hover:bg-surface-muted" onClick={() => { onEditNotes(r.id); setMenuFor(null); }}>
                      ✎ Notes &amp; tags
                    </button>
                    <button className="block w-full text-left px-3 py-1.5 hover:bg-surface-muted" onClick={() => { onPin(r.id, !r.isPinned); setMenuFor(null); }}>
                      {r.isPinned ? "Unpin" : "⭐ Pin"}
                    </button>
                    <div className="px-3 py-1.5 text-xs text-gray-400">Move to…</div>
                    {watchlists.filter((w) => w.id !== r.id).map((w) => (
                      <button key={w.id} className="block w-full text-left px-6 py-1.5 hover:bg-surface-muted" onClick={() => { onMove(r.id, w.id); setMenuFor(null); }}>
                        {w.emoji} {w.name}
                      </button>
                    ))}
                    <button className="block w-full text-left px-3 py-1.5 text-down hover:bg-surface-muted" onClick={() => { onRemove(r.id); setMenuFor(null); }}>
                      Remove
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompanyCell({ r }: { r: WatchlistItem }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-brand-light text-brand grid place-items-center text-xs font-bold">{r.symbol.slice(0, 2)}</div>
      <div>
        <div className="font-semibold text-gray-900">
          {r.symbol} {r.isPinned && "⭐"}
        </div>
        <div className="text-xs text-gray-500">{r.companyName}</div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {r.tags?.slice(0, 2).map((t) => (
            <span key={t} className="pill bg-sky-100 text-sky-700">{t}</span>
          ))}
          {r.cagr != null && (
            <span className={`text-[10px] ${r.cagr >= 0 ? "text-up" : "text-down"}`}>CAGR {r.cagr >= 0 ? "+" : ""}{r.cagr.toFixed(1)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function LtpCell({ r, flash }: { r: WatchlistItem; flash?: "up" | "down" }) {
  return (
    <span className={`font-semibold text-gray-900 rounded px-1 ${flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""}`}>
      {formatINR(r.ltp)}
    </span>
  );
}

function sparkFrom(r: WatchlistItem): number[] {
  const up = r.ltp >= r.dayOpen;
  if (up) return [r.dayOpen, (r.dayOpen + r.dayLow) / 2, r.dayLow, (r.dayLow + r.ltp) / 2, r.ltp];
  return [r.dayOpen, (r.dayOpen + r.dayHigh) / 2, r.dayHigh, (r.dayHigh + r.ltp) / 2, r.ltp];
}
