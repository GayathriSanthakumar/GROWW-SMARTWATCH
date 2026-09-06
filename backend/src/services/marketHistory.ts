// Real market-history provider for the chart.
//
// Source: Yahoo Finance chart API for NSE listings (e.g. TCS.NS). This is real,
// delayed market data — trading sessions only. It NEVER contains weekend or
// holiday candles, and timestamps come from the provider, not a calendar.
//
// We do not synthesize, interpolate, or invent candles. If the provider is
// unreachable we return [] and the UI shows "data unavailable" — never fake
// candles. (True intraday live aggregation requires a licensed broker feed.)

import { query } from "../db/pool.js";

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

interface RawPoint {
  ts: number; // epoch seconds (UTC)
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  vol: number | null;
}

const GRAN: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h",
  "1d": "1d", "1w": "1wk", "1M": "1mo",
};

const isIntraday = (i: string) => ["1m", "5m", "15m", "30m", "1h"].includes(i);

function istDayOfWeek(tsSec: number): number {
  // Asia/Kolkata == UTC+05:30 (no DST). Local "day" for candles is the IST day.
  const d = new Date(tsSec * 1000 + 5.5 * 3600 * 1000);
  return d.getUTCDay();
}

// Validate a candle (reject malformed / future / out-of-session rows).
function valid(c: RawPoint, interval: string, nowSec: number): boolean {
  if (!c.ts || !Number.isFinite(c.ts)) return false;
  if (c.close == null || !Number.isFinite(c.close)) return false;
  if (c.ts > nowSec + 60) return false; // future candle
  const o = c.open ?? c.close;
  const h = c.high ?? Math.max(o, c.close);
  const l = c.low ?? Math.min(o, c.close);
  if (!(h >= Math.max(o, c.close) - 1e-9)) return false;
  if (!(l <= Math.min(o, c.close) + 1e-9)) return false;
  if (!(h >= l - 1e-9)) return false;
  if (!isIntraday(interval) && (istDayOfWeek(c.ts) === 0 || istDayOfWeek(c.ts) === 6)) return false; // weekend
  return true;
}

const cache = new Map<string, { at: number; rows: { ts: string; open: number; high: number; low: number; close: number; volume: number }[] }>();

export interface RealCandle {
  ts: string; // ISO (UTC); consumers format in IST
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchYahoo(symbol: string, interval: string, limit: number): Promise<RealCandle[]> {
  const gran = GRAN[interval] ?? "1d";
  const key = `${symbol}:${interval}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (isIntraday(interval) ? 20_000 : 10 * 60_000)) return hit.rows;

  // Pick a range big enough, then keep only the most recent `limit` sessions.
  let range = "1d";
  if (isIntraday(interval)) range = "1d";
  else if (interval === "1d") range = limit <= 30 ? "1mo" : limit <= 70 ? "3mo" : limit <= 140 ? "6mo" : "2y";
  else range = "5y"; // weekly / monthly

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${symbol}.NS`)}?range=${range}&interval=${gran}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const d = (await res.json()) as any;
  const r = d?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const ts = (r?.timestamp as number[]) || [];
  if (!q || !ts.length) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  const pts: RawPoint[] = ts.map((t, i) => ({
    ts: t,
    open: q.open?.[i] ?? null,
    high: q.high?.[i] ?? null,
    low: q.low?.[i] ?? null,
    close: q.close?.[i] ?? null,
    vol: q.volume?.[i] ?? null,
  }));

  const out = pts
    .filter((c) => valid(c, interval, nowSec))
    .map((c) => ({
      ts: new Date(c.ts * 1000).toISOString(),
      open: c.open ?? c.close!,
      high: c.high ?? Math.max(c.open ?? c.close!, c.close!),
      low: c.low ?? Math.min(c.open ?? c.close!, c.close!),
      close: c.close!,
      volume: Math.round(c.vol ?? 0),
    }));
  const rows = out.slice(-limit);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function getCandlesByInstrumentId(instrumentId: string, interval: string, limit: number): Promise<RealCandle[]> {
  const rows = await query<{ symbol: string }>(`SELECT symbol FROM instruments WHERE id = $1`, [instrumentId]);
  if (!rows.rows[0]) return [];
  try {
    return await fetchYahoo(rows.rows[0].symbol, interval, Math.min(Math.max(limit, 1), 500));
  } catch {
    return []; // provider unavailable → empty, never fabricated
  }
}
