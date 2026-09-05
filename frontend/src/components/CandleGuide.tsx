"use client";

// Comprehensive educational candlestick guide (anatomy, patterns, timeframes,
// volume) used by both the Learn dashboard and the inline chart guide.

const UP = "#16a34a";
const DOWN = "#dc2626";

export function CandleGuide() {
  return (
    <div className="space-y-6 text-sm text-gray-700">
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Anatomy of a candlestick</h3>
        <p className="mb-3">One candle summarises a period&apos;s trading. Four prices define it: <strong>Open</strong>, <strong>High</strong>, <strong>Low</strong> and <strong>Close</strong> (OHLC).</p>
        <div className="flex flex-wrap gap-6 justify-center">
          <AnatomyCandle up />
          <AnatomyCandle />
        </div>
        <ul className="mt-3 space-y-1.5 text-[13px]">
          <li><strong>Open</strong> — the price when the period started.</li>
          <li><strong>Close</strong> — the price when the period ended.</li>
          <li><strong>High</strong> — the highest price traded in the period.</li>
          <li><strong>Low</strong> — the lowest price traded in the period.</li>
          <li><strong>Body</strong> — the rectangle between open and close.</li>
          <li><strong>Upper wick</strong> — line from body top to the high.</li>
          <li><strong>Lower wick</strong> — line from body bottom to the low.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Bullish vs bearish</h3>
        <div className="flex gap-8 flex-wrap">
          <div className="flex items-center gap-3">
            <MiniCandle up />
            <div>
              <div className="font-medium text-up">Bullish (green)</div>
              <div className="text-xs text-gray-500">Close &gt; Open — buyers in control.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MiniCandle />
            <div>
              <div className="font-medium text-down">Bearish (red)</div>
              <div className="text-xs text-gray-500">Close &lt; Open — sellers in control.</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Common candlestick patterns</h3>
        <p className="text-xs text-gray-400 mb-3">Patterns hint at sentiment but are <strong>not guaranteed predictions</strong> — always combine them with other context.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <PatternCard name="Doji" desc="Open ≈ Close. Indecision between buyers and sellers." kind="doji" />
          <PatternCard name="Hammer" desc="Long lower wick after a decline — possible reversal up." kind="hammer" />
          <PatternCard name="Inverted Hammer" desc="Long upper wick after a decline — potential reversal." kind="inverted" />
          <PatternCard name="Shooting Star" desc="Long upper wick after a rally — possible reversal down." kind="shooting" />
          <PatternCard name="Bullish Engulfing" desc="Green candle fully covers the previous red candle." kind="bullEngulf" />
          <PatternCard name="Bearish Engulfing" desc="Red candle fully covers the previous green candle." kind="bearEngulf" />
          <PatternCard name="Morning Star" desc="Down, small body, then up — bullish reversal signal." kind="morning" />
          <PatternCard name="Evening Star" desc="Up, small body, then down — bearish reversal signal." kind="evening" />
          <PatternCard name="Spinning Top" desc="Small body with both wicks — indecision." kind="spinning" />
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Timeframes</h3>
        <p className="text-[13px] mb-2">The timeframe sets how much trading each candle represents.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            ["1 minute", "one minute of trades"],
            ["5 minute", "five minutes of trades"],
            ["15 minute", "fifteen minutes of trades"],
            ["1 hour", "one hour of trades"],
            ["1 day", "a full trading session"],
            ["1 week", "a full trading week"],
            ["1 month", "a full calendar month"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg bg-surface-muted px-3 py-2">
              <div className="font-semibold text-gray-800">{t}</div>
              <div className="text-gray-500">{d}</div>
            </div>
          ))}
        </div>
        <p className="text-[13px] mt-2">Switching timeframe re-aggregates the same underlying trades — a 15m candle is built from three 5m candles (first open, highest high, lowest low, last close).</p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Volume</h3>
        <p className="text-[13px] mb-2">Volume = the number of shares traded in a period. Higher volume means more participation and stronger conviction behind a move.</p>
        <div className="flex gap-6 items-end h-16">
          <div className="flex flex-col items-center"><div className="w-5 rounded-sm bg-up/40" style={{ height: 16 }} /><span className="text-[10px] text-gray-400 mt-1">low</span></div>
          <div className="flex flex-col items-center"><div className="w-5 rounded-sm bg-up/60" style={{ height: 28 }} /><span className="text-[10px] text-gray-400 mt-1">normal</span></div>
          <div className="flex flex-col items-center"><div className="w-5 rounded-sm bg-up/90" style={{ height: 48 }} /><span className="text-[10px] text-gray-400 mt-1">high</span></div>
        </div>
      </section>
    </div>
  );
}

function AnatomyCandle({ up }: { up?: boolean }) {
  const color = up ? UP : DOWN;
  const openY = up ? 66 : 30;
  const closeY = up ? 30 : 66;
  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="150" viewBox="0 0 90 150">
        <line x1="45" y1="12" x2="45" y2="108" stroke={color} strokeWidth="2" />
        <rect x="30" y={Math.min(openY, closeY)} width="30" height={Math.abs(closeY - openY)} fill={color} />
        {/* labels */}
        <line x1="14" y1="12" x2="76" y2="12" stroke="#cbd5e1" strokeDasharray="2 2" />
        <text x="8" y="16" fontSize="8" fill="#64748b">HIGH</text>
        <text x="8" y={closeY + 3} fontSize="8" fill="#64748b">close</text>
        <text x="66" y={openY + 3} fontSize="8" fill="#64748b">open</text>
        <text x="8" y="76" fontSize="8" fill="#64748b">body</text>
        <line x1="14" y1="108" x2="76" y2="108" stroke="#cbd5e1" strokeDasharray="2 2" />
        <text x="8" y="112" fontSize="8" fill="#64748b">LOW</text>
        <text x="8" y="40" fontSize="8" fill="#64748b" transform="rotate(-90 8 40)">upper wick</text>
        <text x="8" y="96" fontSize="8" fill="#64748b" transform="rotate(-90 8 96)">lower wick</text>
      </svg>
      <span className="text-xs text-gray-500 mt-1">{up ? "Bullish" : "Bearish"}</span>
    </div>
  );
}

function MiniCandle({ up }: { up?: boolean }) {
  const color = up ? UP : DOWN;
  return (
    <svg width="28" height="56" viewBox="0 0 28 56">
      <line x1="14" y1="6" x2="14" y2="50" stroke={color} strokeWidth="2" />
      <rect x="7" y={up ? 20 : 14} width="14" height={up ? 22 : 24} fill={color} rx="2" />
    </svg>
  );
}

function PatternCard({ name, desc, kind }: { name: string; desc: string; kind: string }) {
  return (
    <div className="card p-3 flex flex-col items-center text-center">
      <PatternSvg kind={kind} />
      <span className="text-xs font-semibold text-gray-800 mt-2">{name}</span>
      <span className="text-[10px] text-gray-500 leading-tight mt-1">{desc}</span>
    </div>
  );
}

function PatternSvg({ kind }: { kind: string }) {
  const G = "#16a34a";
  const R = "#dc2626";
  const GRAY = "#6b7280";
  const body = (x: number, y: number, h: number, color: string) => (
    <rect x={x} y={y} width="10" height={h} rx="1.5" fill={color} />
  );
  const wick = (x: number, y1: number, y2: number, color: string) => (
    <line x1={x + 5} y1={y1} x2={x + 5} y2={y2} stroke={color} strokeWidth="1.6" />
  );

  switch (kind) {
    case "doji":
      return <svg width="56" height="56" viewBox="0 0 56 56">{wick(23, 8, 48, GRAY)}{body(23, 25, 4, GRAY)}</svg>;
    case "hammer":
      return <svg width="56" height="56" viewBox="0 0 56 56">{wick(23, 12, 46, G)}{body(23, 16, 16, G)}</svg>;
    case "inverted":
      return <svg width="56" height="56" viewBox="0 0 56 56">{wick(23, 8, 42, G)}{body(23, 24, 16, G)}</svg>;
    case "shooting":
      return <svg width="56" height="56" viewBox="0 0 56 56">{wick(23, 8, 42, R)}{body(23, 24, 16, R)}</svg>;
    case "bullEngulf":
      return (
        <svg width="56" height="56" viewBox="0 0 56 56">
          {wick(8, 26, 40, R)}{body(8, 28, 10, R)}
          {wick(23, 16, 46, G)}{body(23, 18, 22, G)}
        </svg>
      );
    case "bearEngulf":
      return (
        <svg width="56" height="56" viewBox="0 0 56 56">
          {wick(8, 18, 34, G)}{body(8, 20, 12, G)}
          {wick(23, 12, 46, R)}{body(23, 16, 24, R)}
        </svg>
      );
    case "morning":
      return (
        <svg width="56" height="56" viewBox="0 0 56 56">
          {wick(6, 14, 38, R)}{body(6, 18, 16, R)}
          {wick(23, 22, 34, GRAY)}{body(23, 25, 6, GRAY)}
          {wick(40, 8, 40, G)}{body(40, 12, 22, G)}
        </svg>
      );
    case "evening":
      return (
        <svg width="56" height="56" viewBox="0 0 56 56">
          {wick(6, 8, 34, G)}{body(6, 12, 20, G)}
          {wick(23, 22, 34, GRAY)}{body(23, 25, 6, GRAY)}
          {wick(40, 16, 42, R)}{body(40, 20, 18, R)}
        </svg>
      );
    case "spinning":
      return <svg width="56" height="56" viewBox="0 0 56 56">{wick(23, 10, 46, GRAY)}{body(23, 24, 8, GRAY)}</svg>;
    default:
      return <svg width="56" height="56" />;
  }
}
