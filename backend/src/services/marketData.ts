import { query } from "../db/pool.js";
import { getCandles, type Candle, type CandleInterval } from "./candleService.js";
import { getMarketStatus } from "./marketStatus.js";
import { config } from "../config.js";

// ────────────────────────────────────────────────────────────────────────────
// Market-data abstraction. The chart and watchlist consume data exclusively
// through this interface, so a licensed broker/exchange feed (Zerodha/Kite,
// Upstox, Angel One, etc.) can replace the demo provider without touching UI.
//
//   MarketDataProvider
//     ├─ getQuote(symbol, exchange)
//     ├─ getHistoricalOHLC(symbol, exchange, interval)
//     ├─ subscribeToLiveUpdates(symbol, exchange)   → unsubscribe()
//     └─ getMarketStatus(exchange)
// ────────────────────────────────────────────────────────────────────────────

export interface Quote {
  symbol: string;
  exchange: "NSE" | "BSE";
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  volume: number;
  avgVolume: number;
  week52High: number;
  week52Low: number;
  asOf: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly mode: "demo" | "live" | "delayed";
  getQuote(symbol: string, exchange: "NSE" | "BSE"): Promise<Quote | null>;
  getHistoricalOHLC(symbol: string, exchange: "NSE" | "BSE", interval: CandleInterval, limit?: number): Promise<Candle[]>;
  subscribeToLiveUpdates(symbol: string, exchange: "NSE" | "BSE", onUpdate: (q: Quote) => void): () => void;
  getMarketStatus(): ReturnType<typeof getMarketStatus>;
}

// Demo provider: reads the seeded / scanner-backed reference data stored in
// Postgres and generates deterministic OHLC history anchored to it. This is
// clearly labelled DEMO — it is NOT a live market feed.
class DemoMarketDataProvider implements MarketDataProvider {
  readonly name = "DemoMarketDataProvider";
  readonly mode = "demo" as const;

  async getQuote(symbol: string, exchange: "NSE" | "BSE"): Promise<Quote | null> {
    const rows = await query<Record<string, unknown>>(
      `SELECT i.symbol, pt.ltp, pt.prev_close, pt.day_open, pt.day_high, pt.day_low, pt.volume,
              pt.avg_volume_20d, pt.week52_high, pt.week52_low, pt.bse_ltp, pt.bse_prev_close, pt.updated_at
       FROM instruments i
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE i.symbol = $1 AND i.is_active = true
       LIMIT 1`,
      [symbol],
    );
    const r = rows.rows[0];
    if (!r) return null;

    const useBse = exchange === "BSE";
    const ltp = useBse ? Number(r.bse_ltp) : Number(r.ltp);
    const prevClose = useBse ? Number(r.bse_prev_close) : Number(r.prev_close);
    if (!ltp) return null;

    return {
      symbol: String(r.symbol),
      exchange,
      ltp,
      prevClose,
      change: +(ltp - prevClose).toFixed(2),
      changePct: prevClose ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0,
      dayHigh: Number(r.day_high) || ltp,
      dayLow: Number(r.day_low) || ltp,
      dayOpen: Number(r.day_open) || ltp,
      volume: Number(r.volume) || 0,
      avgVolume: Number(r.avg_volume_20d) || 0,
      week52High: Number(r.week52_high) || ltp * 1.2,
      week52Low: Number(r.week52_low) || ltp * 0.8,
      asOf: String(r.updated_at ?? new Date().toISOString()),
    };
  }

  async getHistoricalOHLC(_symbol: string, _exchange: "NSE" | "BSE", interval: CandleInterval, limit = 90): Promise<Candle[]> {
    const rows = await query<{ id: string }>(`SELECT id FROM instruments WHERE symbol = $1 LIMIT 1`, [_symbol]);
    if (!rows.rows[0]) return [];
    return getCandles(rows.rows[0].id, interval, limit);
  }

  // Demo provider has no push feed; live updates are driven by the existing
  // Socket.IO tick stream. Subscribe is a no-op that returns an empty cleanup.
  subscribeToLiveUpdates(_symbol: string, _exchange: "NSE" | "BSE", _onUpdate: (q: Quote) => void): () => void {
    return () => {};
  }

  getMarketStatus() {
    return getMarketStatus();
  }
}

let provider: MarketDataProvider | null = null;

// Selects the provider based on configuration. Extend here when real broker
// credentials (e.g. KITE_API_KEY) are present.
export function getProvider(): MarketDataProvider {
  if (provider) return provider;
  if (config.kiteApiKey) {
    // Placeholder for a licensed Zerodha Kite provider.
    // provider = new KiteMarketDataProvider(config.kiteApiKey);
  }
  provider = new DemoMarketDataProvider();
  return provider;
}
