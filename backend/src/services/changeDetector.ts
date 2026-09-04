import { query } from "../db/pool.js";

// Compares current live state against each user's last-seen baseline and
// emits change_events (Personal Market Memory). Run on an interval + on demand.

interface Baseline {
  instrumentId: string;
  symbol: string;
  lastSeenPrice: number | null;
  lastSeenVolume: number | null;
  lastSeenAttention: number | null;
}

export async function detectChangesForUser(userId: string) {
  const baselines = await query<Baseline & Record<string, unknown>>(
    `SELECT m.instrument_id AS "instrumentId", i.symbol,
            m.last_seen_price AS "lastSeenPrice", m.last_seen_volume AS "lastSeenVolume",
            m.last_seen_attention_score AS "lastSeenAttention"
     FROM user_instrument_memory m
     JOIN instruments i ON i.id = m.instrument_id
     WHERE m.user_id = $1`,
    [userId],
  );

  if (baselines.rows.length === 0) return 0;

  const instrumentIds = baselines.rows.map((b) => b.instrumentId);
  const ticks = await query<{ instrument_id: string; ltp: number; prev_close: number; volume: number }>(
    `SELECT instrument_id, ltp, prev_close, volume FROM price_ticks WHERE instrument_id = ANY($1::uuid[])`,
    [instrumentIds],
  );
  const tickMap = new Map(ticks.rows.map((t) => [t.instrument_id, t]));

  let created = 0;
  for (const b of baselines.rows) {
    const tick = tickMap.get(b.instrumentId);
    if (!tick) continue;

    const events: { type: string; magnitude: number; confidence: number; explanation: string }[] = [];

    if (b.lastSeenPrice && Number(tick.ltp) !== b.lastSeenPrice) {
      const movePct = ((Number(tick.ltp) - b.lastSeenPrice) / b.lastSeenPrice) * 100;
      if (Math.abs(movePct) >= 2) {
        const dir = movePct >= 0 ? "up" : "down";
        events.push({
          type: "price_movement",
          magnitude: +movePct.toFixed(2),
          confidence: Math.round(Math.min(95, 50 + Math.abs(movePct) * 8)),
          explanation: `${b.symbol} has moved ${Math.abs(movePct).toFixed(1)}% ${dir} since you last reviewed it (₹${b.lastSeenPrice} → ₹${Number(tick.ltp)})`,
        });
      }
    }

    if (b.lastSeenVolume && Number(tick.volume) > b.lastSeenVolume * 1.5) {
      events.push({
        type: "volume_spike",
        magnitude: +(Number(tick.volume) / b.lastSeenVolume).toFixed(1),
        confidence: 70,
        explanation: `${b.symbol} volume is ${(Number(tick.volume) / b.lastSeenVolume).toFixed(1)}x your last-seen level — unusual activity`,
      });
    }

    for (const ev of events) {
      const dup = await query(`SELECT 1 FROM change_events WHERE user_id = $1 AND instrument_id = $2 AND event_type = $3 AND detected_at > now() - interval '1 hour'`, [userId, b.instrumentId, ev.type]);
      if (dup.rows[0]) continue;
      await query(
        `INSERT INTO change_events (user_id, instrument_id, event_type, magnitude, confidence, explanation) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, b.instrumentId, ev.type, ev.magnitude, ev.confidence, ev.explanation],
      );
      await query(
        `INSERT INTO notifications (user_id, instrument_id, title, body) VALUES ($1, $2, $3, $4)`,
        [userId, b.instrumentId, `Change detected: ${b.symbol}`, ev.explanation],
      );
      created++;
    }
  }

  return created;
}
