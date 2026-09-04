"use client";

import { useMemo } from "react";

// Minimal inline sparkline (last N intraday points). No chart lib needed.
export function Sparkline({ points, width = 72, height = 28, upColor = "#16a34a", downColor = "#dc2626" }: { points: number[]; width?: number; height?: number; upColor?: string; downColor?: string }) {
  const { path, flat, color } = useMemo(() => {
    if (!points || points.length < 2) return { path: "", flat: 0, color: upColor };
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const step = width / (points.length - 1);
    const coords = points.map((p, i) => [i * step, height - 2 - ((p - min) / range) * (height - 4)]);
    const d = coords.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
    const first = points[0];
    const last = points[points.length - 1];
    const flatY = height - 2 - ((first - min) / range) * (height - 4);
    return { path: d, flat: flatY, color: last >= first ? upColor : downColor };
  }, [points, width, height, upColor, downColor]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <line x1={0} y1={flat} x2={width} y2={flat} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
