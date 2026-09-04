"use client";

import { useEffect, useRef, useState } from "react";
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

export function CandlestickChart({ candles, height = 300 }: { candles: Candle[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<{ candle: Candle; x: number; y: number } | null>(null);
  const [showEma, setShowEma] = useState(true);
  const [showRsi, setShowRsi] = useState(false);
  const [showVol, setShowVol] = useState(true);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!candles || candles.length < 2) {
    return <div className="text-sm text-gray-400">No chart data</div>;
  }

  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const allPrices = [...highs, ...lows, ...ema20.filter((v): v is number => v != null), ...ema50.filter((v): v is number => v != null)];
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const pad = (max - min) * 0.06 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;

  const volH = showVol ? 44 : 0;
  const rsiH = showRsi ? 52 : 0;
  const priceBottom = height - 24;
  const priceTop = 12;
  const volTop = height;
  const volBottom = height + volH;
  const rsiTop = volBottom;
  const rsiBottom = rsiTop + rsiH;
  const totalH = height + volH + rsiH;

  const step = width / candles.length;
  const bodyW = Math.max(1.5, step * 0.62);
  const y = (p: number) => priceTop + ((hi - p) / range) * (priceBottom - priceTop);

  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, i) => {
    const price = lo + (range / gridLines) * i;
    return { price, py: y(price) };
  });

  const volMax = Math.max(...candles.map((c) => c.volume), 1);

  function linePath(series: (number | null)[], yFn: (v: number) => number) {
    let d = "";
    let started = false;
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v == null) {
        started = false;
        continue;
      }
      const px = i * step + step / 2;
      const py = yFn(v);
      d += (started ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
      started = true;
    }
    return d;
  }

  function fmtTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={totalH} className="block">
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={0} y1={g.py} x2={width} y2={g.py} stroke="#eef0f4" strokeWidth={1} />
            <text x={width - 2} y={g.py - 3} textAnchor="end" fontSize={10} fill="#9ca3af">{formatINR(g.price)}</text>
          </g>
        ))}

        {candles.map((c, i) => {
          const cx = i * step + step / 2;
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

        {/* EMA overlays */}
        {showEma && (
          <g>
            <path d={linePath(ema20, y)} fill="none" stroke="#f59e0b" strokeWidth={1.4} />
            <path d={linePath(ema50, y)} fill="none" stroke="#8b5cf6" strokeWidth={1.4} />
          </g>
        )}

        {/* volume bars */}
        {showVol &&
          candles.map((c, i) => {
            const cx = i * step + step / 2;
            const h = (c.volume / volMax) * (volH - 8);
            const color = c.close >= c.open ? UP : DOWN;
            return <rect key={c.ts} x={cx - bodyW / 2} y={volBottom - h} width={bodyW} height={h} fill={color} opacity={0.5} />;
          })}

        {/* RSI band */}
        {showRsi && (
          <g>
            <line x1={0} y1={rsiTop + (rsiH * 30) / 100} x2={width} y2={rsiTop + (rsiH * 30) / 100} stroke="#e5e7eb" strokeDasharray="3 3" />
            <line x1={0} y1={rsiTop + (rsiH * 70) / 100} x2={width} y2={rsiTop + (rsiH * 70) / 100} stroke="#e5e7eb" strokeDasharray="3 3" />
            <path
              d={linePath(rsi14, (v) => rsiTop + rsiH - (v / 100) * rsiH)}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={1.4}
            />
            <text x={2} y={rsiTop + 8} fontSize={9} fill="#9ca3af">RSI 70</text>
            <text x={2} y={rsiTop + (rsiH * 70) / 100 + 10} fontSize={9} fill="#9ca3af">30</text>
          </g>
        )}

        {/* last price line */}
        {(() => {
          const last = candles[candles.length - 1];
          const ly = y(last.close);
          return (
            <g>
              <line x1={0} y1={ly} x2={width} y2={ly} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
              <text x={2} y={ly - 3} fontSize={10} fill="#94a3b8">{formatINR(last.close)}</text>
            </g>
          );
        })()}

        <text x={2} y={height - 6} fontSize={10} fill="#9ca3af">{fmtTime(candles[0].ts)}</text>
        <text x={width / 2} y={height - 6} fontSize={10} fill="#9ca3af" textAnchor="middle">{fmtTime(candles[Math.floor(candles.length / 2)].ts)}</text>
        <text x={width - 2} y={height - 6} fontSize={10} fill="#9ca3af" textAnchor="end">{fmtTime(candles[candles.length - 1].ts)}</text>

        {/* hover hit areas */}
        {candles.map((c, i) => (
          <rect
            key={c.ts + "-hit"}
            x={i * step}
            y={priceTop}
            width={step}
            height={priceBottom - priceTop}
            fill="transparent"
            onMouseEnter={() => setHover({ candle: c, x: i * step + step / 2, y: y(c.high) })}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover && (
        <div className="absolute z-10 pointer-events-none card shadow-lg p-2 text-xs" style={{ left: Math.min(Math.max(hover.x, 70), width - 70), top: 0, transform: "translateX(-50%)" }}>
          <div className="text-gray-400">{new Date(hover.candle.ts).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</div>
          <div className="grid grid-cols-2 gap-x-3 mt-1">
            <span className="text-gray-500">O</span><span className="tabular-nums">{formatINR(hover.candle.open)}</span>
            <span className="text-gray-500">H</span><span className="tabular-nums text-up">{formatINR(hover.candle.high)}</span>
            <span className="text-gray-500">L</span><span className="tabular-nums text-down">{formatINR(hover.candle.low)}</span>
            <span className="text-gray-500">C</span><span className="tabular-nums">{formatINR(hover.candle.close)}</span>
          </div>
          <div className="text-gray-500 mt-1">Vol {formatCompact(hover.candle.volume)}</div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: UP }} /> Up</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: DOWN }} /> Down</span>
        <button onClick={() => setShowEma((v) => !v)} className={showEma ? "text-brand font-medium" : ""}>EMA 20/50</button>
        <button onClick={() => setShowRsi((v) => !v)} className={showRsi ? "text-brand font-medium" : ""}>RSI</button>
        <button onClick={() => setShowVol((v) => !v)} className={showVol ? "text-brand font-medium" : ""}>Volume</button>
      </div>
    </div>
  );
}
