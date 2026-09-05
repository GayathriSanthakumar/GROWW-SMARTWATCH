"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useMarket } from "@/store/market";
import { useLiveWatchlist } from "@/context/MarketContext";
import { changeColorClass } from "@/lib/liveMarket";
import { formatINR, formatPercent, formatCompact } from "@/lib/format";
import type { WatchlistItem, Watchlist, Candle } from "@/lib/types";
import { type TrendDir } from "@/lib/trend";
import { isPriceVerificationPending } from "@/lib/verification";
import { Sparkline } from "./Sparkline";
import { RangeSlider52w } from "./RangeSlider52w";
import { ScorePill } from "./ScorePill";
import { VerdictBadge } from "./VerdictBadge";

type SortKey = "symbol" | "ltp" | "changePct" | "volume" | "opportunity" | "risk" | "alphaGrowth";

export function WatchlistTable({
  items,
  watchlists,
  activeWatchlistId,
  onRowClick,
  onRemove,
  onMove,
  onPin,
  onEditNotes,
}: {
  items: WatchlistItem[];
  watchlists: Watchlist[];
  activeWatchlistId: string;
  onRowClick: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (instrumentId: string, targetWatchlistId: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onEditNotes: (id: string) => void;
}) {
  const setQuotes = useMarket((s) => s.setQuotes);
  const liveRows = useLiveWatchlist(items);
  const quotes = useMemo(() => {
    const m: Record<string, { ltp: number; prevClose: number; changeAbs: number; changePct: number; volume: number }> = {};
    for (const l of liveRows) m[l.id] = { ltp: l.tick.ltp, prevClose: l.tick.prevClose, changeAbs: l.tick.dayChange, changePct: l.tick.dayChangePercent, volume: l.tick.volume };
    return m;
  }, [liveRows]);
  const colorByRow = useMemo(() => {
    const m: Record<string, "up" | "down" | "neutral"> = {};
    for (const l of liveRows) m[l.id] = l.color;
    return m;
  }, [liveRows]);

  // Publish the DB snapshot for every row into the SINGLE quote store. Any
  // server fetch (watchlist load, detail open, screener, portfolio) overwrites
  // the shared cache with the server's value, so a stale live overlay can never
  // outlive the data the server currently owns.
  useEffect(() => {
    if (!items.length) return;
    const map: Record<string, Partial<{ ltp: number; prevClose: number; changeAbs: number; changePct: number; volume: number }>> = {};
    for (const it of items) {
      map[it.id] = {
        ltp: Number(it.ltp),
        prevClose: Number(it.prevClose),
        changeAbs: Number(it.change),
        changePct: Number(it.changePct),
        volume: Number(it.volume),
      };
    }
    setQuotes(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [colPicker, setColPicker] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [trendCloses, setTrendCloses] = useState<Record<string, number[]>>({});
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(false);

  // Fetch REAL intraday candle closes (same session window as the 1D % change)
  // for all visible rows in ONE batched request. The trend line is anchored to
  // the actual previous close so its direction & colour always agree with the
  // displayed 1D change — never a different (e.g. multi-day) window.
  const trendKey = useMemo(() => items.map((i) => i.id).sort().join(","), [items]);
  useEffect(() => {
    if (!items.length) {
      setTrendCloses({});
      setTrendLoading(false);
      setTrendError(false);
      return;
    }
    let alive = true;
    setTrendLoading(true);
    setTrendError(false);
    api
      .post<{ candles: Record<string, Candle[]> }>("/api/instruments/candles/batch", {
        instrumentIds: items.map((i) => i.id),
        interval: "5m",
        limit: 90,
      })
      .then((d) => {
        if (!alive) return;
        const map: Record<string, number[]> = {};
        for (const [id, arr] of Object.entries(d.candles)) {
          if (Array.isArray(arr) && arr.length >= 2) map[id] = arr.map((c) => Number(c.close));
        }
        setTrendCloses(map);
      })
      .catch(() => alive && setTrendError(true))
      .finally(() => alive && setTrendLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendKey]);

  // Persist the user's table preferences (hidden columns + sort) locally so a
  // refresh restores their view. Server-side state (lists, memory) is shared
  // across devices regardless.
  useEffect(() => {
    try {
      const h = localStorage.getItem("smartwatch.cols");
      if (h) setHidden(new Set(JSON.parse(h) as string[]));
      const s = localStorage.getItem("smartwatch.sort");
      if (s) {
        const parsed = JSON.parse(s) as { key?: SortKey; dir?: 1 | -1 };
        if (parsed.key) setSortKey(parsed.key);
        if (parsed.dir) setSortDir(parsed.dir);
      }
    } catch {
      /* ignore malformed prefs */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("smartwatch.cols", JSON.stringify([...hidden]));
    } catch {
      /* noop */
    }
  }, [hidden]);
  useEffect(() => {
    try {
      localStorage.setItem("smartwatch.sort", JSON.stringify({ key: sortKey, dir: sortDir }));
    } catch {
      /* noop */
    }
  }, [sortKey, sortDir]);

  const rows = useMemo(() => {
    const enriched = items.map((it) => {
      const l = quotes[it.id];
      const ltp = l?.ltp ?? it.ltp;
      const changePct = l?.changePct ?? it.changePct;
      const volume = l?.volume ?? it.volume;
      return { ...it, ltp, changePct, volume };
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
  }, [items, quotes, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const cols: { key: string; label: string; cell: (r: WatchlistItem) => React.ReactNode; sortable?: SortKey; align?: string }[] = [
    { key: "company", label: "Company", sortable: "symbol", cell: (r) => <CompanyCell r={r} /> },
    { key: "trend", label: "Trend", cell: (r) => <TrendCell symbol={r.symbol} companyName={r.companyName} closes={trendCloses[r.id]} loading={trendLoading} error={trendError} ltp={r.ltp} prevClose={r.prevClose} changePct={r.changePct} /> },
    { key: "ltp", label: "LTP", sortable: "ltp", cell: (r) => <LtpCell r={r} />, align: "right" },
    { key: "change", label: "1D %", sortable: "changePct", cell: (r) => <span className={`tabular-nums ${changeColorClass(colorByRow[r.id] ?? (r.changePct >= 0 ? "up" : "down"))}`}>{formatPercent(r.changePct)}</span>, align: "right" },
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
                    {watchlists.filter((w) => w.id !== activeWatchlistId).map((w) => (
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
          {r.dataStatus && r.dataStatus !== "LIVE" && <StatusChip status={r.dataStatus} />}
          {isPriceVerificationPending(r.symbol) && (
            <span className="pill bg-amber-50 text-amber-600" title="No external source could verify this stored quote at submission time">verif. pending</span>
          )}
          {r.cagr != null && (
            <span className={`text-[10px] ${r.cagr >= 0 ? "text-up" : "text-down"}`}>CAGR {r.cagr >= 0 ? "+" : ""}{r.cagr.toFixed(1)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  // Per-row chips are for per-stock ANOMALIES only. Global feed freshness
  // (LIVE / DELAYED / DEMO) is owned by the top status bar — showing DELAYED on
  // every row duplicates the same state with a second label.
  const map: Record<string, string> = {
    STALE: "bg-red-100 text-down",
    CONFLICT: "bg-purple-100 text-purple-700",
  };
  const cls = map[status.toUpperCase()];
  if (!cls) return null;
  return <span className={`pill ${cls}`}>{status.toUpperCase()}</span>;
}

function LtpCell({ r, flash }: { r: WatchlistItem; flash?: "up" | "down" }) {
  return (
    <span className={`font-semibold text-gray-900 rounded px-1 ${flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""}`}>
      {formatINR(r.ltp)}
    </span>
  );
}

function TrendCell({
  symbol,
  companyName,
  closes,
  loading,
  error,
  ltp,
  prevClose,
  changePct,
}: {
  symbol: string;
  companyName: string;
  closes: number[] | undefined;
  loading: boolean;
  error: boolean;
  ltp: number;
  prevClose: number;
  changePct: number;
}) {
  // Direction & colour come from the SAME numbers as the displayed 1D %:
  // current price vs actual previous close. The rendered series is anchored at
  // the previous close so the visible net move matches that sign too.
  const eps = 1e-9;
  const dir: TrendDir = changePct > eps ? "up" : changePct < -eps ? "down" : "flat";
  const dirWord = dir === "up" ? "upward" : dir === "down" ? "downward" : "flat";
  const label = `${companyName} (${symbol}) today's trend: ${dirWord} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% from previous close ₹${prevClose.toFixed(2)}).`;

  const points: number[] | null = useMemo(() => {
    if (closes && closes.length >= 2) {
      const series = [...closes];
      series[series.length - 1] = ltp; // live last price keeps endpoint == 1D figure
      // Anchor the previous close ONLY when it isn't a big overnight gap — a
      // distant anchor becomes a giant spike that flattens the day's real
      // micro-movement. (Small gaps keep the line starting at yesterday's close,
      // so direction and the 1D% stay visually consistent.)
      const first = series[0];
      if (prevClose > 0 && first > 0 && Math.abs(prevClose - first) / first <= 0.008) series.unshift(prevClose);
      return series;
    }
    if (prevClose > 0 && ltp > 0) return [prevClose, ltp];
    return null;
  }, [closes, ltp, prevClose]);

  return (
    <div className="w-24 sm:w-28" title={label}>
      {loading && closes === undefined ? (
        <div className="h-[30px] w-full rounded bg-surface-muted animate-pulse" aria-label="Loading trend" />
      ) : error ? (
        <span className="text-[10px] text-gray-400">Unavailable</span>
      ) : points ? (
        <Sparkline points={points} baseline={prevClose} direction={dir} label={label} />
      ) : (
        <span className="text-[10px] text-gray-400" title="Not enough historical data">Not enough data</span>
      )}
    </div>
  );
}
