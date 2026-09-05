"use client";
import { create } from "zustand";

// Single source of truth for a stock's live quote across EVERY surface
// (watchlist rows, detail panel, screener, etc). Any fetch or socket tick
// writes here; components read from here so they can never disagree.
export interface Quote {
  ltp: number;
  prevClose?: number;
  changeAbs?: number;
  changePct: number;
  volume?: number;
}

interface MarketState {
  quotes: Record<string, Quote>;
  open: boolean;
  setQuotes: (map: Record<string, Partial<Quote>>) => void;
  setQuote: (id: string, q: Partial<Quote>) => void;
  setOpen: (open: boolean) => void;
}

export const useMarket = create<MarketState>((set) => ({
  quotes: {},
  open: true,
  setQuote: (id, q) =>
    set((s) => ({ quotes: { ...s.quotes, [id]: { ...s.quotes[id], ...q } as Quote } })),
  setQuotes: (map) =>
    set((s) => {
      const next = { ...s.quotes };
      for (const [id, q] of Object.entries(map)) next[id] = { ...next[id], ...q } as Quote;
      return { quotes: next };
    }),
  setOpen: (open) =>
    set((s) => ({
      open,
      // When the market is CLOSED nothing may move: drop any live overlay so
      // every surface shows the exact same frozen last-close DB value.
      quotes: open ? s.quotes : {},
    })),
}));

export function useQuote(id: string): Quote | undefined {
  return useMarket((s) => s.quotes[id]);
}
export function useMarketOpen(): boolean {
  return useMarket((s) => s.open);
}
