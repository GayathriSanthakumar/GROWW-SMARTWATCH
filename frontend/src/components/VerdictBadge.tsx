"use client";

const COLORS: Record<string, { bg: string; text: string }> = {
  buy_lean: { bg: "bg-up/10", text: "text-up" },
  hold: { bg: "bg-sky-100", text: "text-sky-700" },
  watch: { bg: "bg-amber-100", text: "text-amber-700" },
  avoid_lean: { bg: "bg-down/10", text: "text-down" },
};

const LABELS: Record<string, string> = {
  buy_lean: "BUY-lean",
  hold: "HOLD",
  watch: "WATCH",
  avoid_lean: "AVOID-lean",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const c = COLORS[verdict] || COLORS.watch;
  return <span className={`pill ${c.bg} ${c.text}`}>{LABELS[verdict] || "WATCH"}</span>;
}
