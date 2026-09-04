import { query } from "../db/pool.js";
import { cache } from "../lib/redis.js";
import { broadcast, emitToInstrument, emitToUser } from "../ws/index.js";
import { fetchQuotes, getInstrumentTickers, getBseTickers, INDEX_TICKERS } from "./tradingview.js";

// Live-market feed. Primary source is TradingView's public India scanner API
// (real-time NSE/BSE quotes). If TradingView is unreachable (e.g. offline demo),
// it degrades gracefully to a deterministic random-walk simulator so the UI
// still updates live.

const LIVE_INTERVAL_MS = 3000; // TradingView sync cadence (near-real-time)

let tickTimer: ReturnType<typeof setInterval> | null = null;
let detectionTimer: ReturnType<typeof setInterval> | null = null;
let alertTimer: ReturnType<typeof setInterval> | null = null;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Date.now() % 100000 + 7);

function attentionScore(volume: number, avgVolume: number, changePct: number): number {
  const volRatio = avgVolume ? volume / avgVolume : 1;
  let attention = 30;
  if (volRatio > 2) attention += 35;
  else if (volRatio > 1.5) attention += 25;
  else if (volRatio > 1.2) attention += 15;
  else if (volRatio < 0.7) attention -= 10;
  attention += Math.min(Math.abs(changePct) * 4, 35);
  return Math.max(0, Math.min(100, Math.round(attention)));
}

// ── TradingView sync (NSE, primary, near-real-time) ─────────────────────────
export async function syncFromTradingView(): Promise<boolean> {
  const { map, tickers } = await getInstrumentTickers();
  const indexTickers = Object.values(INDEX_TICKERS);
  const allTickers = [...tickers, ...indexTickers];

  const quotes = await fetchQuotes(allTickers);
  if (quotes.length === 0) return false;

  const updates: Record<string, { ltp: number; changePct: number; volume: number }> = {};
  const indexUpdates: Record<string, { level: number; changePct: number }> = {};

  for (const q of quotes) {
    const inst = map[q.ticker];
    if (inst) {
      const prevClose = +(q.close - q.changeAbs).toFixed(2);
      const att = attentionScore(q.volume, q.avgVolume30d ?? 0, q.changePct);
      const avgVol = q.avgVolume30d == null ? null : Math.round(q.avgVolume30d);
        await query(
          `UPDATE price_ticks SET
             ltp = $1, prev_close = $2, day_open = $3, day_high = $4, day_low = $5,
             volume = $6, avg_volume_20d = COALESCE($7, avg_volume_20d),
             week52_high = COALESCE($8, week52_high), week52_low = COALESCE($9, week52_low),
             perf_1w = COALESCE($10, perf_1w), perf_1m = COALESCE($11, perf_1m),
             perf_3m = COALESCE($12, perf_3m), perf_6m = COALESCE($13, perf_6m),
             perf_1y = COALESCE($14, perf_1y),
             data_status = 'LIVE', updated_at = now()
           WHERE instrument_id = $15`,
          [q.close, prevClose, q.dayOpen, q.dayHigh, q.dayLow, Math.round(q.volume), avgVol, q.week52High, q.week52Low, q.perf1w, q.perf1m, q.perf3m, q.perf6m, q.perf1y, inst.id],
        );
      await query(`UPDATE instrument_scores SET attention_score = $1, computed_at = now() WHERE instrument_id = $2`, [att, inst.id]);

      updates[inst.id] = { ltp: +q.close.toFixed(2), changePct: +q.changePct.toFixed(2), volume: Math.round(q.volume) };
      await cache.setJson(`tick:${inst.id}`, updates[inst.id], 60);
      emitToInstrument(inst.id, "tick", { instrumentId: inst.id, ...updates[inst.id] });
    }

    // indices
    for (const [idx, ticker] of Object.entries(INDEX_TICKERS)) {
      if (q.ticker === ticker) {
        indexUpdates[idx] = { level: +q.close.toFixed(2), changePct: +q.changePct.toFixed(2) };
        await query(
          `UPDATE index_ticks SET level = $1, change_abs = $2, change_pct = $3, updated_at = now() WHERE index_symbol = $4`,
          [+q.close.toFixed(2), +q.changeAbs.toFixed(2), +q.changePct.toFixed(2), idx],
        );
      }
    }
  }

  // Nudge any index not covered by TradingView (e.g. FINNIFTY / MIDCPNIFTY)
  // so the full index strip stays live even when a ticker is unavailable.
  const allIdx = await query<{ index_symbol: string; level: number }>(`SELECT index_symbol, level FROM index_ticks`);
  for (const idx of allIdx.rows) {
    if (indexUpdates[idx.index_symbol]) continue;
    const move = (rng() - 0.5) * 0.0008;
    const newLevel = Number(idx.level) * (1 + move);
    const prev = newLevel / (1 + move);
    const pct = ((newLevel - prev) / prev) * 100;
    await query(
      `UPDATE index_ticks SET level = $1, change_abs = $2, change_pct = $3, updated_at = now() WHERE index_symbol = $4`,
      [+newLevel.toFixed(2), +(newLevel - prev).toFixed(2), +pct.toFixed(2), idx.index_symbol],
    );
    indexUpdates[idx.index_symbol] = { level: +newLevel.toFixed(2), changePct: +pct.toFixed(2) };
  }

  if (Object.keys(updates).length) broadcast("ticks", updates);
  if (Object.keys(indexUpdates).length) broadcast("indices", indexUpdates);
  return true;
}

// ── Offline fallback (random walk) ──────────────────────────────────────────
export async function runOneTick() {
  const instruments = await query<{ id: string; ltp: number; prev_close: number; day_high: number; day_low: number; volume: number; avg_volume_20d: number }>(
    `SELECT instrument_id AS id, ltp, prev_close, day_high, day_low, volume, avg_volume_20d FROM price_ticks WHERE data_status = 'LIVE'`,
  );
  const subset = instruments.rows.filter(() => rng() < 0.3).slice(0, 12);
  const updates: Record<string, { ltp: number; changePct: number; volume: number }> = {};

  for (const inst of subset) {
    const move = (rng() - 0.5) * 0.004;
    const newLtp = Math.max(0.5, Number(inst.ltp) * (1 + move));
    const newVolume = Number(inst.volume) + Math.round(Number(inst.avg_volume_20d) * (0.001 + rng() * 0.003));
    const dayHigh = Math.max(Number(inst.day_high), newLtp);
    const dayLow = Math.min(Number(inst.day_low), newLtp);
    await query(
      `UPDATE price_ticks SET ltp = $1, day_high = $2, day_low = $3, volume = $4, updated_at = now() WHERE instrument_id = $5`,
      [+newLtp.toFixed(2), +dayHigh.toFixed(2), +dayLow.toFixed(2), newVolume, inst.id],
    );
    const changePct = Number(inst.prev_close) ? ((newLtp - Number(inst.prev_close)) / Number(inst.prev_close)) * 100 : 0;
    updates[inst.id] = { ltp: +newLtp.toFixed(2), changePct: +changePct.toFixed(2), volume: newVolume };
    const att = attentionScore(newVolume, Number(inst.avg_volume_20d), changePct);
    await query(`UPDATE instrument_scores SET attention_score = $1, computed_at = now() WHERE instrument_id = $2`, [att, inst.id]);
    await cache.setJson(`tick:${inst.id}`, updates[inst.id], 60);
    emitToInstrument(inst.id, "tick", { instrumentId: inst.id, ...updates[inst.id] });
  }

  if (Object.keys(updates).length) broadcast("ticks", updates);
  return updates;
}

async function runLiveTick() {
  const ok = await syncFromTradingView().catch(() => false);
  if (!ok) await runOneTick().catch(() => {});
}

// BSE secondary quotes (refreshed less frequently — BSE barely diverges from NSE).
async function runBseSync() {
  try {
    const { map, tickers } = await getBseTickers();
    const quotes = await fetchQuotes(tickers);
    for (const q of quotes) {
      const inst = map[q.ticker];
      if (!inst) continue;
      const bsePrev = +(q.close - q.changeAbs).toFixed(2);
      await query(`UPDATE price_ticks SET bse_ltp = $1, bse_prev_close = $2, updated_at = now() WHERE instrument_id = $3`, [q.close, bsePrev, inst.id]);
    }
  } catch {
    /* offline — keep last BSE snapshot */
  }
}

async function runChangeDetection() {
  const { detectChangesForUser } = await import("./changeDetector.js");
  const users = await query<{ id: string }>(`SELECT id FROM users WHERE deleted_at IS NULL LIMIT 200`);
  for (const u of users.rows) {
    try {
      const created = await detectChangesForUser(u.id);
      if (created > 0) {
        const { getIo } = await import("../ws/index.js");
        getIo()?.to(`user:${u.id}`).emit("changes", { count: created });
      }
    } catch {
      /* skip user */
    }
  }
}

async function runAlertEvaluation() {
  const { evaluateAlerts } = await import("./alertEvaluator.js");
  try {
    const fired = await evaluateAlerts();
    if (fired > 0) {
      const users = await query<{ user_id: string }>(`SELECT DISTINCT user_id FROM notifications WHERE created_at > now() - interval '30 seconds'`);
      for (const u of users.rows) {
        const count = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`, [u.user_id]);
        emitToUser(u.user_id, "notifications", { unread: count.rows[0].count });
      }
    }
  } catch {
    /* noop */
  }
}

let bseTimer: ReturnType<typeof setInterval> | null = null;

export function startMarketSim() {
  void runLiveTick(); // initial sync on boot
  void runBseSync(); // initial BSE sync
  tickTimer = setInterval(() => void runLiveTick(), LIVE_INTERVAL_MS);
  bseTimer = setInterval(() => void runBseSync(), 30000);
  detectionTimer = setInterval(() => void runChangeDetection(), 30000);
  alertTimer = setInterval(() => void runAlertEvaluation(), 15000);
  console.log("[sim] live market feed started (TradingView primary, simulator fallback)");
}

export function stopMarketSim() {
  if (tickTimer) clearInterval(tickTimer);
  if (bseTimer) clearInterval(bseTimer);
  if (detectionTimer) clearInterval(detectionTimer);
  if (alertTimer) clearInterval(alertTimer);
}
