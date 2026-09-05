import { query } from "../db/pool.js";

// Compares current live state against each user's last-seen baseline and
// emits change_events + notifications ("Personal Market Memory"). Run on an
// interval and on demand from /api/memory/detect.
//
// What counts as a *meaningful* change (thresholds live here so they can be
// tuned per product decision):
//   price_movement  → |move| since last review ≥ 2.0%
//   volume_spike    → volume ≥ 1.5× last-seen volume
//   attention_shift → attention score moved by ≥ 15 points (0–100 scale)
//
// Scaling: the old implementation did per-baseline round-trips (up to ~6 DB
// queries per event). This version performs the whole detect → dedupe → insert
// change_events → insert notifications pipeline for a user in ONE statement.

export async function detectChangesForUser(userId: string): Promise<number> {
  const result = await query<{ created: number }>(
    `WITH candidates AS (
       SELECT u.user_id, u.instrument_id, i.symbol,
              ev.event_type, ev.magnitude, ev.confidence, ev.explanation
       FROM user_instrument_memory u
       JOIN instruments i ON i.id = u.instrument_id
       JOIN price_ticks pt ON pt.instrument_id = u.instrument_id
       LEFT JOIN instrument_scores sc ON sc.instrument_id = u.instrument_id
       CROSS JOIN LATERAL (
         VALUES
           -- price movement ≥ 2%
           ((u.last_seen_price IS NOT NULL AND u.last_seen_price > 0
              AND abs((pt.ltp - u.last_seen_price) / u.last_seen_price) * 100 >= 2),
            'price_movement'::text,
            round(abs(((pt.ltp - u.last_seen_price) / NULLIF(u.last_seen_price, 0)) * 100)::numeric, 2),
            least(95, 50 + abs(((pt.ltp - u.last_seen_price) / NULLIF(u.last_seen_price, 0)) * 100) * 8)::int,
            i.symbol || ' has moved ' ||
              case when pt.ltp >= u.last_seen_price then 'up ' else 'down ' end ||
              trim(to_char(round(abs(((pt.ltp - u.last_seen_price) / NULLIF(u.last_seen_price, 0)) * 100)::numeric, 1), 'FM999D0')) ||
              '% since you last reviewed it (₹' || trim(to_char(round(u.last_seen_price::numeric, 1), 'FM999G999G999D0')) ||
              ' → ₹' || trim(to_char(round(pt.ltp::numeric, 1), 'FM999G999G999D0')) || ')'),
           -- volume spike ≥ 1.5×
           ((u.last_seen_volume IS NOT NULL AND u.last_seen_volume > 0
              AND pt.volume IS NOT NULL AND pt.volume >= u.last_seen_volume * 1.5),
            'volume_spike'::text,
            round((pt.volume / NULLIF(u.last_seen_volume, 0))::numeric, 1),
            70,
            i.symbol || ' volume is ' || trim(to_char(round((pt.volume / NULLIF(u.last_seen_volume, 0))::numeric, 1), 'FM999D0')) ||
              'x your last-seen level — unusual activity'),
           -- attention score shift ≥ 15 points
           ((u.last_seen_attention_score IS NOT NULL AND sc.attention_score IS NOT NULL
              AND abs(sc.attention_score - u.last_seen_attention_score) >= 15),
            'attention_shift'::text,
            (sc.attention_score - u.last_seen_attention_score)::numeric,
            60,
            i.symbol || ' attention score moved ' ||
              case when sc.attention_score >= u.last_seen_attention_score then 'up' else 'down' end ||
              ' by ' || abs(sc.attention_score - u.last_seen_attention_score) || ' points (now ' || sc.attention_score || '/100)')
       ) AS ev(active, event_type, magnitude, confidence, explanation)
       WHERE u.user_id = $1 AND u.last_seen_at IS NOT NULL AND ev.active
     ),
     ev AS (
       INSERT INTO change_events (user_id, instrument_id, event_type, magnitude, confidence, explanation, detected_at)
       SELECT c.user_id, c.instrument_id, c.event_type, c.magnitude, c.confidence, c.explanation, now()
       FROM candidates c
       WHERE NOT EXISTS (
         SELECT 1 FROM change_events ce
         WHERE ce.user_id = c.user_id AND ce.instrument_id = c.instrument_id
           AND ce.event_type = c.event_type AND ce.detected_at > now() - interval '1 hour'
       )
       ORDER BY c.magnitude DESC NULLS LAST
       LIMIT 40
       RETURNING id, user_id, instrument_id, event_type, magnitude, explanation
     ),
     notif AS (
       INSERT INTO notifications (user_id, instrument_id, title, body, created_at)
       SELECT ev.user_id, ev.instrument_id, 'Change detected: ' || i.symbol, ev.explanation, now()
       FROM ev JOIN instruments i ON i.id = ev.instrument_id
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM notif`,
    [userId],
  );
  return result.rows[0]?.created ?? 0;
}
