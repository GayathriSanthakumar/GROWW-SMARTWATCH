"use client";
// MarketDataProvider — global real-time state broadcasts (React Context over the
// unified quote store). Provides:
//   - a persistent stream controller (DataService) with REST fallback to
//     /api/v1/stocks/snapshot when a frame is empty/null,
//   - useLiveWatchlist(items) -> per-row LiveMarketTick + computational colors.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMarket, type Quote } from "@/store/market";
import { dataService } from "@/services/DataService";
import { api } from "@/lib/api";
import { calculateMarketMetrics, toLiveTick, type Direction, type LiveMarketTick } from "@/lib/liveMarket";

interface ServerRow {
  id: string;
  symbol: string;
  ltp: number;
  prevClose: number;
  change?: number;
  changePct?: number;
  volume: number;
}

export interface LiveRow {
  id: string;
  symbol: string;
  tick: LiveMarketTick;
  direction: Direction;
  color: "up" | "down" | "neutral";
}

interface MarketContextValue {
  status: string;
  byId: Record<string, Quote>;
  pollSnapshot: (rows: ServerRow[]) => Promise<void>;
}

const MarketCtx = createContext<MarketContextValue>({
  status: "connecting",
  byId: {},
  pollSnapshot: async () => {},
});

export function MarketProvider({ children }: { children: ReactNode }) {
  const quotes = useMarket((s) => s.quotes);
  const open = useMarket((s) => s.open);

  useEffect(() => {
    dataService.start();
  }, []);

  const value = useMemo<MarketContextValue>(() => {
    const pollSnapshot = async (rows: ServerRow[]) => {
      const ids = rows.filter((r) => r.id).map((r) => r.id);
      try {
        const d = await api.post<{ ticks: (LiveMarketTick & { id: string })[] }>("/api/v1/stocks/snapshot", { instrumentIds: ids });
        const map: Record<string, Partial<Quote>> = {};
        for (const t of d.ticks) map[t.id] = { ltp: t.ltp, prevClose: t.prevClose, changeAbs: t.dayChange, changePct: t.dayChangePercent, volume: t.volume };
        useMarket.getState().setQuotes(map);
      } catch {
        /* offline — keep whatever the store has */
      }
    };
    return { status: open ? "live" : "last-close", byId: quotes, pollSnapshot };
  }, [quotes, open]);

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export function useMarketData(): MarketContextValue {
  return useContext(MarketCtx);
}

// Grid-friendly hook: maps watchlist rows to ticks + computational color flags.
export function useLiveWatchlist(items: ServerRow[]): LiveRow[] {
  const { byId } = useMarketData();
  return useMemo(
    () =>
      items.map((it) => {
        const q = byId[it.id];
        const ltp = q?.ltp ?? it.ltp;
        const prevClose = q?.prevClose ?? it.prevClose;
        const volume = q?.volume ?? it.volume;
        const tick = toLiveTick(it.id, it.symbol, ltp, prevClose, volume);
        // live quote overrides (server-derived) win over the open/prev derivation
        if (q?.changeAbs != null) tick.dayChange = q.changeAbs;
        if (q?.changePct != null) tick.dayChangePercent = q.changePct;
        const direction: Direction = tick.dayChange > 0 ? "up" : tick.dayChange < 0 ? "down" : "flat";
        const color = direction === "up" ? "up" : direction === "down" ? "down" : "neutral";
        return { id: it.id, symbol: tick.symbol, tick, direction, color };
      }),
    [items, byId],
  );
}
