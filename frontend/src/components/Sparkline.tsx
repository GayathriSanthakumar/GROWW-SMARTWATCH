"use client";

import { useMemo } from "react";
import { classifyTrend, type TrendDir } from "@/lib/trend";

// Compact dashboard sparkline (Image-2 style): dense close series, no axes, a
// subtle dotted reference line, and a semantic colour derived from the real
// close series. The caller supplies ACTUAL candle closes — this component never
// synthesises points. Each sparkline scales its own Y-range (render-only).

const COLORS: Record<TrendDir, string> = { up: "#16a34a", down: "#dc2626", flat: "#9ca3af" };

// Gentle Catmull-Rom -> cubic Bézier smoothing: renders a smooth continuous
// line that still passes through every real close (micro-volatility preserved).
function smoothPath(coords: readonly (readonly [number, number])[]): string {
  const n = coords.length;
  if (n < 4) return coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  let d = `M${coords[0][0]},${coords[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Sparkline({
  points,
  height = 30,
  upColor = COLORS.up,
  downColor = COLORS.down,
  flatColor = COLORS.flat,
  label,
  baseline,
  direction,
}: {
  points: number[];
  height?: number;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  label: string;
  baseline?: number | null;
  direction?: TrendDir;
}) {
  const view = useMemo(() => {
    if (!points || points.length < 2) return null;
    // Scale to the SERIES' own range so amplitude is consistent end-to-end (a
    // distant previous-close must never flatten the visible wiggles into a jump
    // + straight tail). The dashed baseline is then clamped into view.
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const pad = 3;
    const W = 100;
    const H = height;
    const step = W / (points.length - 1);
    const y = (v: number) => pad + ((max - v) / range) * (H - pad * 2);
    const coords = points.map((p, i) => [i * step, y(p)] as const);
    const d = smoothPath(coords);
    const clamp = (v: number) => Math.min(H - 1, Math.max(1, v));
    const hasBaseline = baseline != null && isFinite(baseline);
    const baseY = hasBaseline ? clamp(y(baseline as number)) : clamp(y(points[0]));
    return { d, baseY, W, H };
  }, [points, height, baseline]);

  const dir: TrendDir = useMemo(() => direction ?? (points && points.length >= 2 ? classifyTrend(points) : "flat"), [points, direction]);
  if (!view) return null;
  const color = dir === "up" ? upColor : dir === "down" ? downColor : flatColor;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${view.W} ${view.H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      className="overflow-visible"
    >
      <title>{label}</title>
      {/* Draw the line first, then the full-width dashed baseline ON TOP so it is
          always visible across the entire chart width (never hidden by overlap). */}
      <path d={view.d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={0} y1={view.baseY} x2={view.W} y2={view.baseY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" opacity="0.85" />
    </svg>
  );
}
