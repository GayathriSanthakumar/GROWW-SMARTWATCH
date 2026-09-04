import { query } from "../db/pool.js";
import { getCandles } from "./candleService.js";
import { ema, rsi, lastValue } from "./indicators.js";

interface IndicatorSet {
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  crossedAbove: (period: 20 | 50) => boolean;
  crossedBelow: (period: 20 | 50) => boolean;
}

// Evaluates active alerts against current ticks + indicators, firing notifications.
export async function evaluateAlerts() {
  const alerts = await query<{ id: string; user_id: string; instrument_id: string; condition_json: Record<string, unknown>; trigger_count: number; last_triggered_at: string | null }>(
    `SELECT a.id, a.user_id, a.instrument_id, a.condition_json, a.trigger_count, a.last_triggered_at
     FROM alerts a WHERE a.is_active = true`,
  );

  let fired = 0;
  for (const alert of alerts.rows) {
    const tick = await query<{ ltp: number; prev_close: number; volume: number; avg_volume_20d: number; symbol: string }>(
      `SELECT pt.ltp, pt.prev_close, pt.volume, pt.avg_volume_20d, i.symbol
       FROM price_ticks pt JOIN instruments i ON i.id = pt.instrument_id WHERE pt.instrument_id = $1`,
      [alert.instrument_id],
    );
    if (!tick.rows[0]) continue;
    const t = tick.rows[0];
    const cond = (alert.condition_json ?? {}) as Record<string, unknown>;

    const ind = await computeIndicators(alert.instrument_id);

    const triggered = evaluate(cond, Number(t.ltp), Number(t.prev_close), Number(t.volume), Number(t.avg_volume_20d), ind);

    if (!triggered) continue;
    if (alert.last_triggered_at && new Date(alert.last_triggered_at).getTime() > Date.now() - 15 * 60 * 1000) continue;

    await query(`UPDATE alerts SET trigger_count = trigger_count + 1, last_triggered_at = now() WHERE id = $1`, [alert.id]);
    await query(
      `INSERT INTO notifications (user_id, alert_id, instrument_id, title, body) VALUES ($1, $2, $3, $4, $5)`,
      [alert.user_id, alert.id, alert.instrument_id, `Alert triggered: ${t.symbol}`, describeCondition(cond, t.symbol, Number(t.ltp))],
    );
    fired++;
  }
  return fired;
}

async function computeIndicators(instrumentId: string): Promise<IndicatorSet> {
  const candles = await getCandles(instrumentId, "1d", 150);
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const r = rsi(closes, 14);
  const prevClose = closes[closes.length - 2];
  const curClose = closes[closes.length - 1];

  const cross = (series: (number | null)[], dir: "above" | "below") => {
    const cur = series[series.length - 1];
    const prev = series[series.length - 2];
    if (cur == null || prev == null) return false;
    return dir === "above" ? prevClose <= prev && curClose > cur : prevClose >= prev && curClose < cur;
  };

  return {
    ema20: lastValue(e20),
    ema50: lastValue(e50),
    rsi14: lastValue(r),
    crossedAbove: (period) => cross(period === 20 ? e20 : e50, "above"),
    crossedBelow: (period) => cross(period === 20 ? e20 : e50, "below"),
  };
}

function evaluate(cond: Record<string, unknown>, ltp: number, prevClose: number, volume: number, avgVolume: number, ind: IndicatorSet): boolean {
  const type = cond.type;
  if (type === "price_above") return ltp >= Number(cond.price);
  if (type === "price_below") return ltp <= Number(cond.price);
  if (type === "price_move") {
    const pct = Math.abs(((ltp - prevClose) / prevClose) * 100);
    if (cond.direction === "up") return ltp > prevClose && pct >= Number(cond.pct);
    if (cond.direction === "down") return ltp < prevClose && pct >= Number(cond.pct);
    return pct >= Number(cond.pct);
  }
  if (type === "volume_spike") return avgVolume > 0 && volume / avgVolume >= Number(cond.ratio || 1.5);
  if (type === "price_cross_ema") {
    const period = (cond.period === 20 ? 20 : 50) as 20 | 50;
    return cond.direction === "below" ? ind.crossedBelow(period) : ind.crossedAbove(period);
  }
  if (type === "rsi_above") return ind.rsi14 != null && ind.rsi14 >= Number(cond.value);
  if (type === "rsi_below") return ind.rsi14 != null && ind.rsi14 <= Number(cond.value);
  return false;
}

function describeCondition(cond: Record<string, unknown>, symbol: string, ltp: number): string {
  if (cond.type === "price_above") return `${symbol} reached ₹${ltp} (above ₹${cond.price})`;
  if (cond.type === "price_below") return `${symbol} fell to ₹${ltp} (below ₹${cond.price})`;
  if (cond.type === "price_move") return `${symbol} moved ${cond.pct}% (${cond.direction})`;
  if (cond.type === "volume_spike") return `${symbol} volume spiked ${cond.ratio}x`;
  if (cond.type === "price_cross_ema") return `${symbol} crossed ${cond.period}-EMA (${cond.direction})`;
  if (cond.type === "rsi_above") return `${symbol} RSI above ${cond.value}`;
  if (cond.type === "rsi_below") return `${symbol} RSI below ${cond.value}`;
  return `${symbol} alert condition met`;
}
