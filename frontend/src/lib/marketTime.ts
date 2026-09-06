// Market-aware relative time (Asia/Kolkata). Never blind "Date.now() - ts":
// it uses IST calendar dates so weekend/holiday gaps don't mislabel sessions,
// and appends the actual session date so "Fri, Sep 4" is always shown.

const IST_MS = 5.5 * 3600 * 1000;

function istDayIndex(ms: number): number {
  return Math.floor((ms + IST_MS) / 86400000); // integer IST calendar day
}

function istParts(ms: number): { y: number; mo: number; d: number; hh: number; mm: number } {
  const d = new Date(ms + IST_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}

function shortDate(ms: number): string {
  const p = istParts(ms);
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][p.mo - 1];
  return `${wd}, ${mo} ${p.d}`;
}

/**
 * Returns a market-aware, calendar-correct relative label.
 * - events within the same IST session/minute → "18 min ago"
 * - same IST day → "Today · 3:12 PM IST"
 * - previous IST day → "Yesterday · Fri, Sep 4"
 * - older → "2d ago · Fri, Sep 4"  (counted in IST calendar days, so a Friday
 *   event viewed on Sunday is "2d ago", never "yesterday")
 */
export function formatMarketAwareRelativeTime(eventTimestamp: number | string, nowTimestamp: number | string = Date.now()): string {
  const ts = typeof eventTimestamp === "string" ? new Date(eventTimestamp).getTime() : eventTimestamp;
  const now = typeof nowTimestamp === "string" ? new Date(nowTimestamp).getTime() : nowTimestamp;
  if (!Number.isFinite(ts)) return "—";
  const diffDays = istDayIndex(now) - istDayIndex(ts);
  const elapsedMs = Math.max(0, now - ts);

  if (diffDays === 0) {
    if (elapsedMs < 60 * 60 * 1000) {
      const m = Math.max(1, Math.round(elapsedMs / 60000));
      return m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
    }
    const p = istParts(ts);
    const h12 = ((p.hh + 11) % 12) + 1;
    return `Today · ${h12}:${String(p.mm).padStart(2, "0")} ${p.hh >= 12 ? "PM" : "AM"} IST`;
  }
  if (diffDays === 1) return `Yesterday · ${shortDate(ts)}`;
  return `${diffDays}d ago · ${shortDate(ts)}`;
}
