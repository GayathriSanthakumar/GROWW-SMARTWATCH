// DataService — single normalization + streaming boundary for stock quotes.
//
// Production reality of this app: the BACKEND is the real-time engine. It polls
// the TradingView India scanner (NSE/BSE) and broadcasts normalized frames over
// Socket.IO (`ticks`). The browser must not open its own TradingView websocket
// (ToS / no browser auth). This service therefore:
//   1. normalizes ANY incoming packet shape into one QuotePacket
//      (LTP from lp/price/close/ltp; volume from v/vol/volume; day-change
//       derived from the daily open/previous-close benchmark),
//   2. writes into the unified quote store (store/market.ts),
//   3. degrades to a REST snapshot controller if the stream is null/absent.
//
// Day change is always derived from a real benchmark (open, else prev close):
//   pct = (ltp - open) / open * 100   (fallback prevClose)  — never invented.

import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useMarket } from "@/store/market";

export interface QuotePacket {
  instrumentId: string;
  ltp: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  volume: number | null;
  open: number | null;
  prevClose: number | null;
  raw?: Record<string, unknown>;
}

export type FeedStatus = "connecting" | "live" | "rest" | "offline";

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return null;
};

// Normalize a raw real-time frame (broker/TradingView style) into QuotePacket.
export function normalizeTick(raw: Record<string, unknown>, instrumentId: string): QuotePacket {
  const ltp = num(pick(raw, ["lp", "LTP", "price", "close", "ltp"]));
  const open = num(pick(raw, ["open", "day_open", "open_price"]));
  const prevClose = num(pick(raw, ["prev_close", "previous_close", "prevClose", "close_prev"]));
  const volume = num(pick(raw, ["v", "vol", "volume"]));
  const base = open ?? prevClose;

  let dayChange: number | null = null;
  let dayChangePercent: number | null = num(pick(raw, ["changePercent", "change_pct", "changePct"]));
  if (ltp != null && base != null && base > 0) {
    const abs = ltp - base;
    if (dayChangePercent == null) dayChangePercent = (abs / base) * 100;
    dayChange = abs;
  } else if (ltp != null && dayChangePercent != null) {
    dayChange = base != null && base > 0 ? (dayChangePercent / 100) * base : null;
  }

  return { instrumentId, ltp, dayChange, dayChangePercent, volume, open, prevClose, raw };
}

class DataService {
  private started = false;
  status: FeedStatus = "connecting";

  start(): void {
    if (this.started) return;
    this.started = true;    const setQuotes = useMarket.getState().setQuotes;
    const socket = getSocket();

    socket.on("connect", () => {
      this.status = "live";
      useMarket.getState().setOpen(true);
    });

    // Primary real-time controller: broadcast map of instrumentId -> raw tick.
    socket.on("ticks", (updates: Record<string, Record<string, unknown>>) => {
      if (!updates || typeof updates !== "object") return;
      const out: Record<string, Partial<{ ltp: number; prevClose: number; changeAbs: number; changePct: number; volume: number }>> = {};
      let anyLive = false;
      for (const [id, raw] of Object.entries(updates)) {
        const n = normalizeTick(raw || {}, id);
        if (n.ltp == null) continue; // null frames are skipped, never rendered as 0
        anyLive = true;
        out[id] = {
          ltp: n.ltp,
          prevClose: n.prevClose ?? undefined,
          changeAbs: n.dayChange ?? undefined,
          changePct: n.dayChangePercent ?? undefined,
          volume: n.volume ?? undefined,
        };
      }
      if (anyLive) setQuotes(out);
    });

    // Resilience: if the real-time stream is missing/empty for a while, the REST
    // controller (below) re-hydrates the store; the UI grid never breaks.
    socket.on("disconnect", () => {
      this.status = "rest";
      useMarket.getState().setOpen(false);
    });
    socket.on("connect_error", () => {
      this.status = "rest";
      useMarket.getState().setOpen(false);
    });
  }

  // REST fallback controller: hydrates the unified store from the server snapshot.
  async hydrateFromRest(rows: { id: string; ltp: number; prevClose: number; change: number; changePct: number; volume: number }[]): Promise<void> {
    const map: Record<string, Partial<{ ltp: number; prevClose: number; changeAbs: number; changePct: number; volume: number }>> = {};
    for (const r of rows || []) {
      map[r.id] = {
        ltp: Number(r.ltp),
        prevClose: Number(r.prevClose),
        changeAbs: Number(r.change),
        changePct: Number(r.changePct),
        volume: Number(r.volume),
      };
    }
    useMarket.getState().setQuotes(map);
    this.status = "rest";
  }

  // Generic REST quote fetch used by any grid that needs a live fallback read.
  async fetchQuotes(url: string): Promise<void> {
    try {
      const rows = await api.get<{ results: { id: string; ltp: number; prevClose: number; change: number; changePct: number; volume: number }[] }>(url);
      await this.hydrateFromRest(rows.results || []);
    } catch {
      this.status = "offline";
    }
  }

  // Called on logout: allow a fresh subscription on the NEXT login (a new socket
  // instance will be created and listeners re-registered by start()).
  stop(): void {
    this.started = false;
    this.status = "connecting";
  }
}

export const dataService = new DataService();
