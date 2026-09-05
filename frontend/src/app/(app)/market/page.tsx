"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPercent } from "@/lib/format";

interface Breadth {
  advancers: number;
  decliners: number;
  unchanged: number;
  total: number;
}
interface Mover {
  symbol: string;
  companyName: string;
  ltp: number;
  changePct: number;
}
interface Sector {
  sector: string;
  avg_pct: number;
  cnt: number;
}

export default function MarketPage() {
  const [breadth, setBreadth] = useState<Breadth | null>(null);
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [byVolume, setByVolume] = useState<Mover[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api
      .get<{ breadth: Breadth; gainers: Mover[]; losers: Mover[]; byVolume: Mover[] }>("/api/market/overview")
      .then((d) => {
        setBreadth(d.breadth);
        setGainers(d.gainers);
        setLosers(d.losers);
        setByVolume(d.byVolume);
      })
      .catch(() => setLoadError("Couldn't load market overview. Data may be temporarily unavailable."));
    api.get<{ sectors: Sector[] }>("/api/market/sectors").then((d) => setSectors(d.sectors)).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Market Radar</h1>

      {loadError && (
        <div className="card mb-4 p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">{loadError}</div>
      )}

      {breadth && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4"><div className="text-xs text-gray-500">Advancers</div><div className="text-lg font-bold text-up">{breadth.advancers}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Decliners</div><div className="text-lg font-bold text-down">{breadth.decliners}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Unchanged</div><div className="text-lg font-bold">{breadth.unchanged}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Total</div><div className="text-lg font-bold">{breadth.total}</div></div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <MoverCard title="Top Gainers" items={gainers} />
        <MoverCard title="Top Losers" items={losers} />
        <MoverCard title="Most Active" items={byVolume} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Sector performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sectors.map((s) => (
            <div key={s.sector} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
              <span className="text-xs text-gray-600">{s.sector}</span>
              <span className={`text-sm font-semibold ${s.avg_pct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(s.avg_pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoverCard({ title, items }: { title: string; items: Mover[] }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.symbol} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{m.symbol}</div>
              <div className="text-xs text-gray-500">{m.companyName}</div>
            </div>
            <span className={`font-semibold tabular-nums ${m.changePct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(m.changePct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
