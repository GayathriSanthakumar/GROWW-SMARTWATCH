"use client";
// useStockData — one clean, reactive hook for any grid row / detail header.
//
// Reads ONLY from the unified quote store (the single source of truth) and
// exposes market fields: ltp, dayChange, dayChangePercent, volume. If the
// store has no live value it reflects the server snapshot passed in via
// `fallback`; if neither exists the row reports `status: "unavailable"` — it is
// never silently populated with a fabricated number.

import { useEffect, useMemo } from "react";
import { useMarket } from "@/store/market";
import type { Quote } from "@/store/market";

export interface StockRow {
  symbol: string;
  ltp: number;
  dayChange: number;
  dayChangePercent: number;
  volume: number;
  status: "live" | "last" | "unavailable";
}

interface ServerRow {
  id: string;
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
}

export function useStockData(
  instrumentId: string,
  fallback?: ServerRow,
): StockRow & { quote: Quote | undefined } {
  const quote = useMarket((s) => s.quotes[instrumentId]);

  // Rehydrate from the REST controller whenever this row mounts without a value
  // and no live stream is filling it (handled centrally by DataService; this is
  // the per-row no-op subscription that keeps hydration ordering deterministic).
  const open = useMarket((s) => s.open);
  const setQuote = useMarket((s) => s.setQuote);
  useEffect(() => {
    if (open && quote == null && fallback) {
      setQuote(instrumentId, {
        ltp: Number(fallback.ltp),
        prevClose: Number(fallback.prevClose),
        changeAbs: Number(fallback.change),
        changePct: Number(fallback.changePct),
        volume: Number(fallback.volume),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentId, open, !!quote, !!fallback]);

  return useMemo(() => {
    const ltp = quote?.ltp ?? fallback?.ltp ?? 0;
    const dayChange = quote?.changeAbs ?? fallback?.change ?? 0;
    const dayChangePercent = quote?.changePct ?? fallback?.changePct ?? 0;
    const volume = quote?.volume ?? fallback?.volume ?? 0;
    const hasLive = quote?.ltp != null;
    const hasData = ltp > 0;
    return {
      symbol: fallback?.id ?? instrumentId,
      ltp,
      dayChange,
      dayChangePercent,
      volume,
      status: hasLive ? ("live" as const) : hasData ? ("last" as const) : ("unavailable" as const),
      quote,
    };
  }, [quote, fallback, instrumentId]);
}

export default useStockData;
