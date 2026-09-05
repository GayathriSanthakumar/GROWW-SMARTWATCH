// Deterministic trend classification from a real price/candle-close series.
// Uses the whole series (head vs tail terciles) — never just the final point.
export type TrendDir = "up" | "down" | "flat";

function meanSlice(values: number[], from: number, to: number): number {
  const slice = values.slice(from, to);
  if (!slice.length) return values[values.length - 1] ?? 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

export function classifyTrend(closes: number[]): TrendDir {
  const n = closes.length;
  if (n < 4) return "flat";
  const q = Math.max(1, Math.floor(n / 4));
  const head = meanSlice(closes, 0, q);
  const tail = meanSlice(closes, n - q, n);
  if (head <= 0) return "flat";
  const rel = (tail - head) / head;
  if (rel >= 0.004) return "up";
  if (rel <= -0.004) return "down";
  return "flat";
}
