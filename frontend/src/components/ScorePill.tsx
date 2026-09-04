"use client";

// Color-coded score pill. `invert` flips good/bad (e.g. Risk: low = good).
export function ScorePill({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const good = invert ? v <= 40 : v >= 60;
  const warn = !invert ? v >= 40 && v < 60 : v > 40 && v <= 60;
  const cls = good ? "bg-up/10 text-up" : warn ? "bg-amber-100 text-amber-700" : "bg-down/10 text-down";
  return (
    <span className={`pill ${cls}`} title={`${label}: ${v}/100`}>
      {label} {v}
    </span>
  );
}
