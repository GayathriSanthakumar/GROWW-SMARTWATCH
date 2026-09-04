"use client";

// Educational candlestick explainer with SVG diagrams (SMARTWATCH "Candle Guide").
export function CandleGuide() {
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <p>
        Each <strong>candlestick</strong> shows how a stock&apos;s price moved over one time period (5 min, 1 hour, 1 day, etc.).
      </p>

      <h3 className="font-semibold text-gray-800">Anatomy of a candle</h3>
      <div className="flex flex-wrap gap-8 justify-center py-3">
        <CandleDiagram up />
        <CandleDiagram />
        <CandleDiagram doji />
      </div>

      <ul className="space-y-1.5 text-[13px]">
        <li><strong className="text-up">Green (bullish)</strong> — close was <em>above</em> open; buyers in control.</li>
        <li><strong className="text-down">Red (bearish)</strong> — close was <em>below</em> open; sellers in control.</li>
        <li><strong>Body</strong> — the thick rectangle between open and close.</li>
        <li><strong>Wicks (shadows)</strong> — thin lines above/below marking the high and low.</li>
      </ul>

      <h3 className="font-semibold text-gray-800 pt-2">Common single-candle patterns</h3>
      <div className="flex flex-wrap gap-6 justify-center py-3">
        <PatternCard name="Hammer" desc="Long lower wick after a decline — possible reversal up." wickDown />
        <PatternCard name="Shooting Star" desc="Long upper wick after a rally — possible reversal down." wickUp />
        <PatternCard name="Marubozu" desc="No (or tiny) wicks — strong one-sided conviction." full />
        <PatternCard name="Doji" desc="Tiny body — indecision between buyers and sellers." doji />
      </div>

      <p className="text-[11px] text-gray-400">
        Reading candles in sequence (higher-highs vs lower-lows, reversals, volume) is the basis of chart analysis. Educational content only — not financial advice.
      </p>
    </div>
  );
}

function CandleDiagram({ up, doji }: { up?: boolean; doji?: boolean }) {
  const color = up ? "#16a34a" : doji ? "#6b7280" : "#dc2626";
  const label = up ? "Bullish" : doji ? "Doji" : "Bearish";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="46" height="92" viewBox="0 0 46 92">
        <line x1="23" y1={up ? 10 : 4} x2="23" y2={up ? 80 : 86} stroke={color} strokeWidth="1.5" />
        <rect x="12" y={up ? 34 : 18} width="22" height={up ? 36 : 50} rx="2" fill={color} />
        {doji && <rect x="12" y="42" width="22" height="4" rx="2" fill={color} />}
        <text x="2" y={up ? 12 : 8} fontSize="7" fill="#9ca3af">High</text>
        <text x="2" y={up ? 88 : 90} fontSize="7" fill="#9ca3af">Low</text>
        <text x="6" y={up ? 52 : 46} fontSize="7" fill={color}>body</text>
      </svg>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function PatternCard({ name, desc, wickUp, wickDown, full, doji }: { name: string; desc: string; wickUp?: boolean; wickDown?: boolean; full?: boolean; doji?: boolean }) {
  const color = wickUp ? "#dc2626" : wickDown ? "#16a34a" : doji ? "#6b7280" : "#16a34a";
  return (
    <div className="flex flex-col items-center gap-1 w-32">
      <svg width="64" height="64" viewBox="0 0 64 64">
        {wickDown && (
          <>
            <line x1="32" y1="22" x2="32" y2="54" stroke={color} strokeWidth="2" />
            <rect x="26" y="22" width="12" height="14" rx="1.5" fill={color} />
          </>
        )}
        {wickUp && (
          <>
            <line x1="32" y1="12" x2="32" y2="44" stroke={color} strokeWidth="2" />
            <rect x="26" y="30" width="12" height="14" rx="1.5" fill={color} />
          </>
        )}
        {full && (
          <>
            <line x1="32" y1="12" x2="32" y2="54" stroke={color} strokeWidth="2" />
            <rect x="26" y="16" width="12" height="36" rx="1.5" fill={color} />
          </>
        )}
        {doji && (
          <>
            <line x1="32" y1="12" x2="32" y2="54" stroke={color} strokeWidth="2" />
            <rect x="26" y="30" width="12" height="4" rx="1.5" fill={color} />
          </>
        )}
      </svg>
      <span className="text-xs font-semibold text-gray-700">{name}</span>
      <span className="text-[10px] text-gray-400 text-center leading-tight">{desc}</span>
    </div>
  );
}
