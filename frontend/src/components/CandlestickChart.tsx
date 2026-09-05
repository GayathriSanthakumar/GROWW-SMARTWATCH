"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatINR, formatCompact } from "@/lib/format";
import { ema, rsi } from "@/lib/indicators";

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const UP = "#16a34a";
const DOWN = "#dc2626";
const DEFAULT_VISIBLE = 60;
const MIN_VISIBLE = 5;

export function CandlestickChart({
  candles,
  height = 300,
  focusTs,
  focusRange,
}: {
  candles: Candle[];
  height?: number;
  focusTs?: string | null;
  focusRange?: [string, string] | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [view, setView] = useState({ start: 0, end: DEFAULT_VISIBLE });
  const [cross, setCross] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [showEma, setShowEma] = useState(true);
  const [showRsi, setShowRsi] = useState(false);
  const [showVol, setShowVol] = useState(true);
  const dragging = useRef<{ startX: number; startView: { start: number; end: number } } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // reset the viewport when a new series arrives (interval / stock change)
  useEffect(() => {
    const n = candles.length;
    setView({ start: Math.max(0, n - DEFAULT_VISIBLE), end: n });
  }, [candles]);

  // "Go to" a specific date/time: centre the view on the nearest candle.
  useEffect(() => {
    if (!focusTs || candles.length < 2) return;
    const t = new Date(focusTs).getTime();
    let idx = 0;
    let best = Infinity;
    candles.forEach((c, i) => {
      const d = Math.abs(new Date(c.ts).getTime() - t);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    setView((v) => {
      const n = candles.length;
      const span = v.end - v.start;
      let start = idx - span / 2;
      let end = idx + span / 2;
      if (end - start < MIN_VISIBLE) {
        start = idx - MIN_VISIBLE / 2;
        end = idx + MIN_VISIBLE / 2;
      }
      if (start < 0) {
        end += -start;
        start = 0;
      }
      if (end > n) {
        start -= end - n;
        end = n;
      }
      return { start: Math.max(0, start), end: Math.min(n, end) };
    });
  }, [focusTs, candles]);

  // "Go to" a custom range: fit the viewport to that range.
  useEffect(() => {
    if (!focusRange || candles.length < 2) return;
    const t0 = new Date(focusRange[0]).getTime();
    const t1 = new Date(focusRange[1]).getTime();
    let i0 = 0;
    let i1 = candles.length - 1;
    candles.forEach((c, i) => {
      const t = new Date(c.ts).getTime();
      if (t <= t0) i0 = i;
      if (t <= t1) i1 = i;
    });
    if (i1 <= i0) i1 = Math.min(candles.length - 1, i0 + MIN_VISIBLE);
    setView({ start: Math.max(0, i0 - 1), end: Math.min(candles.length, i1 + 2) });
  }, [focusRange, candles]);

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const ema20 = useMemo(() => ema(closes, 20), [closes]);
  const ema50 = useMemo(() => ema(closes, 50), [closes]);
  const rsi14 = useMemo(() => rsi(closes, 14), [closes]);

  if (!candles || candles.length < 2) {
    return <div className="text-sm text-gray-400">No chart data</div>;
  }

  const n = candles.length;
  // Clamp the viewport to the current series so a stale zoom/pan state (e.g.
  // right after a timeframe switch to fewer candles) never indexes out of bounds.
  const start = Math.max(0, Math.min(view.start, Math.max(0, n - MIN_VISIBLE)));
  const end = Math.max(start + 1, Math.min(view.end, n));
  const count = Math.max(end - start, 1);
  const step = width / count;

  const iStart = Math.floor(start);
  const iEnd = Math.min(n - 1, Math.ceil(end));
  const visible = candles.slice(iStart, iEnd + 1);

  const vLows = visible.map((c) => c.low);
  const vHighs = visible.map((c) => c.high);
  const vEma = [ema20, ema50].flatMap((s) => s.slice(iStart, iEnd + 1).filter((v): v is number => v != null));
  const min = Math.min(...vLows, ...vEma);
  const max = Math.max(...vHighs, ...vEma);
  const pad = (max - min) * 0.06 || 1;
  let lo = min - pad;
  let hi = max + pad;
  // avoid extreme zoom-in on a flat market — keep a small sensible range
  const ref = candles[n - 1].close || max;
  if (hi - lo < ref * 0.001) {
    lo = ref * (1 - 0.0005);
    hi = ref * (1 + 0.0005);
  }
  const range = hi - lo || 1;

  const volH = showVol ? 44 : 0;
  const rsiH = showRsi ? 52 : 0;
  const priceTop = 14;
  const priceBottom = height - 26;
  const volBottom = height + volH;
  const rsiTop = volBottom;
  const rsiBottom = rsiTop + rsiH;
  const totalH = height + volH + rsiH;

  const x = (i: number) => (i - start + 0.5) * step;
  const y = (p: number) => priceTop + ((hi - p) / range) * (priceBottom - priceTop);

  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, gi) => {
    const price = lo + (range / gridLines) * gi;
    return { price, py: y(price) };
  });

  const volMax = Math.max(...visible.map((c) => c.volume), 1);
  const last = candles[n - 1];
  const lastUp = last.close >= last.open;
  const bodyW = Math.max(1, Math.min(step * 0.7, 40));

  function linePath(series: (number | null)[], yFn: (v: number) => number) {
    let d = "";
    let started = false;
    for (let i = iStart; i <= iEnd; i++) {
      const v = series[i];
      if (v == null) {
        started = false;
        continue;
      }
      const px = x(i);
      const py = yFn(v);
      d += (started ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
      started = true;
    }
    return d;
  }

  function fmtAxisTime(ts: string) {
    const d = new Date(ts);
    const intraday = candles.length > 0 && step < 40; // intraday-looking
    if (intraday) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  function clampView(v: { start: number; end: number }) {
    let { start, end } = v;
    if (end - start < MIN_VISIBLE) end = start + MIN_VISIBLE;
    if (end > n) {
      end = n;
      start = Math.max(0, end - MIN_VISIBLE);
    }
    if (start < 0) {
      start = 0;
      end = Math.min(n, start + MIN_VISIBLE);
    }
    return { start, end };
  }

  function zoom(factor: number, centerX?: number) {
    setView((v) => {
      const span = v.end - v.start;
      const newSpan = Math.max(MIN_VISIBLE, Math.min(n, span * factor));
      const anchor = centerX != null ? v.start + (centerX / width) * span : v.start + span; // default anchor = right edge
      const newStart = anchor - newSpan * (centerX != null ? centerX / width : 1);
      return clampView({ start: newStart, end: newStart + newSpan });
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : width;
    zoom(e.deltaY < 0 ? 0.85 : 1.18, cx);
  }

  function onMouseDown(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { startX: e.clientX - rect.left, startView: { ...view } };
  }

  function onMouseMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (dragging.current) {
      const dx = px - dragging.current.startX;
      const delta = (dx / width) * (dragging.current.startView.end - dragging.current.startView.start);
      const start = dragging.current.startView.start - delta;
      setView(clampView({ start, end: start + (dragging.current.startView.end - dragging.current.startView.start) }));
      return;
    }

    const idx = Math.round(start + (px / width) * (end - start) - 0.5);
    if (idx >= 0 && idx < n && py < height) {
      setCross({ x: px, y: py, idx });
    } else {
      setCross(null);
    }
  }

  function onMouseUp() {
    dragging.current = null;
  }

  const crossCandle = cross ? candles[cross.idx] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        ref={svgRef}
        width={width}
        height={totalH}
        className="block"
        style={{ cursor: dragging.current ? "grabbing" : "crosshair" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          setCross(null);
          onMouseUp();
        }}
      >
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={0} y1={g.py} x2={width} y2={g.py} stroke="#eef0f4" strokeWidth={1} />
            <text x={width - 4} y={g.py - 3} textAnchor="end" fontSize={10} fill="#9ca3af">{formatINR(g.price)}</text>
          </g>
        ))}

        {visible.map((c, k) => {
          const i = iStart + k;
          const cx = x(i);
          const up = c.close >= c.open;
          const color = up ? UP : DOWN;
          const yOpen = y(c.open);
          const yClose = y(c.close);
          return (
            <g key={c.ts}>
              <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <rect x={cx - bodyW / 2} y={Math.min(yOpen, yClose)} width={bodyW} height={Math.max(1, Math.abs(yOpen - yClose))} fill={color} />
            </g>
          );
        })}

        {showEma && (
          <g>
            <path d={linePath(ema20, y)} fill="none" stroke="#f59e0b" strokeWidth={1.4} />
            <path d={linePath(ema50, y)} fill="none" stroke="#8b5cf6" strokeWidth={1.4} />
          </g>
        )}

        {showVol &&
          visible.map((c, k) => {
            const i = iStart + k;
            const cx = x(i);
            const h = (c.volume / volMax) * (volH - 8);
            const color = c.close >= c.open ? UP : DOWN;
            return <rect key={c.ts} x={cx - bodyW / 2} y={volBottom - h} width={bodyW} height={h} fill={color} opacity={0.5} />;
          })}

        {showRsi && (
          <g>
            <line x1={0} y1={rsiTop + (rsiH * 30) / 100} x2={width} y2={rsiTop + (rsiH * 30) / 100} stroke="#e5e7eb" strokeDasharray="3 3" />
            <line x1={0} y1={rsiTop + (rsiH * 70) / 100} x2={width} y2={rsiTop + (rsiH * 70) / 100} stroke="#e5e7eb" strokeDasharray="3 3" />
            <path d={linePath(rsi14, (v) => rsiTop + rsiH - (v / 100) * rsiH)} fill="none" stroke="#06b6d4" strokeWidth={1.4} />
            <text x={2} y={rsiTop + 8} fontSize={9} fill="#9ca3af">70</text>
            <text x={2} y={rsiTop + (rsiH * 70) / 100 + 10} fontSize={9} fill="#9ca3af">30</text>
          </g>
        )}

        {/* current price line + label */}
        {(() => {
          const ly = y(last.close);
          const label = formatINR(last.close);
          const labelW = label.length * 6.4 + 10;
          return (
            <g>
              <line x1={0} y1={ly} x2={width} y2={ly} stroke={lastUp ? UP : DOWN} strokeWidth={1} strokeDasharray="3 3" />
              <rect x={width - labelW - 4} y={ly - 10} width={labelW} height={18} rx={3} fill={lastUp ? UP : DOWN} />
              <text x={width - labelW / 2 - 4} y={ly + 3} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}>{label}</text>
            </g>
          );
        })()}

        {/* time axis */}
        <text x={2} y={height - 8} fontSize={10} fill="#9ca3af">{fmtAxisTime(candles[iStart].ts)}</text>
        <text x={width / 2} y={height - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">{fmtAxisTime(candles[Math.floor((iStart + iEnd) / 2)].ts)}</text>
        <text x={width - 2} y={height - 8} fontSize={10} fill="#9ca3af" textAnchor="end">{fmtAxisTime(candles[iEnd].ts)}</text>

        {/* crosshair */}
        {cross && (
          <g>
            <line x1={cross.x} y1={priceTop} x2={cross.x} y2={volBottom} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" />
            <line x1={0} y1={cross.y} x2={width} y2={cross.y} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" />
            {crossCandle && (
              <>
                <text x={cross.x + 6} y={priceTop + 10} fontSize={10} fill="#6b7280">{new Date(crossCandle.ts).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</text>
                <text x={width - 4} y={cross.y - 4} textAnchor="end" fontSize={10} fill="#6b7280">{formatINR(crossCandle.close)}</text>
              </>
            )}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {cross && crossCandle && (
        <div className="absolute z-10 pointer-events-none card shadow-lg p-2 text-xs" style={{ left: Math.min(Math.max(cross.x, 90), width - 90), top: 8, transform: "translateX(-50%)" }}>
          <div className="text-gray-400">{new Date(crossCandle.ts).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</div>
          <div className="grid grid-cols-2 gap-x-4 mt-1 tabular-nums">
            <span className="text-gray-500">O</span><span>{formatINR(crossCandle.open)}</span>
            <span className="text-gray-500">H</span><span className="text-up">{formatINR(crossCandle.high)}</span>
            <span className="text-gray-500">L</span><span className="text-down">{formatINR(crossCandle.low)}</span>
            <span className="text-gray-500">C</span><span>{formatINR(crossCandle.close)}</span>
          </div>
          <div className="text-gray-500 mt-1">Vol {formatCompact(crossCandle.volume)}</div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
        <button onClick={() => zoom(0.7)} className="px-1.5 rounded border border-surface-border hover:bg-surface-muted">−</button>
        <button onClick={() => zoom(1.4)} className="px-1.5 rounded border border-surface-border hover:bg-surface-muted">+</button>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: UP }} /> Up</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: DOWN }} /> Down</span>
        <button onClick={() => setShowEma((v) => !v)} className={showEma ? "text-brand font-medium" : ""}>EMA 20/50</button>
        <button onClick={() => setShowRsi((v) => !v)} className={showRsi ? "text-brand font-medium" : ""}>RSI</button>
        <button onClick={() => setShowVol((v) => !v)} className={showVol ? "text-brand font-medium" : ""}>Volume</button>
      </div>
    </div>
  );
}
