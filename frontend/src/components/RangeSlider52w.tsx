"use client";

import { formatINR } from "@/lib/format";

// 52-week range track: L —●— H with a dot marking current price.
export function RangeSlider52w({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = high > low ? Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100)) : 50;
  const zone = pct < 30 ? "bg-up" : pct > 75 ? "bg-down" : "bg-brand";

  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-500">
      <span>{formatINR(low)}</span>
      <div className="relative h-1.5 w-24 rounded-full bg-surface-border">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-up via-brand to-down opacity-80" style={{ width: "100%" }} />
        <div className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white shadow ${zone}`} style={{ left: `calc(${pct}% - 6px)` }} />
      </div>
      <span>{formatINR(high)}</span>
    </div>
  );
}
