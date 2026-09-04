"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { formatNumber } from "@/lib/format";
import type { IndexTick } from "@/lib/types";

const NAMES: Record<string, string> = {
  NIFTY50: "NIFTY 50",
  SENSEX: "SENSEX",
  BANKNIFTY: "BANKNIFTY",
  MIDCPNIFTY: "MIDCAP NIFTY",
  FINNIFTY: "FINNIFTY",
};

export function IndexStrip() {
  const [indices, setIndices] = useState<IndexTick[]>([]);

  useEffect(() => {
    api.get<{ indices: IndexTick[] }>("/api/market/indices").then((d) => setIndices(d.indices)).catch(() => {});
    const socket = getSocket();
    const handler = (updates: Record<string, { level: number; changePct: number }>) => {
      setIndices((prev) =>
        prev.map((idx) => {
          const u = updates[idx.index_symbol];
          if (!u) return idx;
          return { ...idx, level: String(u.level), change_pct: String(u.changePct) };
        }),
      );
    };
    socket.on("indices", handler);
    return () => {
      socket.off("indices", handler);
    };
  }, []);

  return (
    <div className="bg-white border-b border-surface-border">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-5 overflow-x-auto no-scrollbar">
        {indices.map((idx) => {
          const pct = Number(idx.change_pct);
          const up = pct >= 0;
          return (
            <div key={idx.index_symbol} className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-gray-600">{NAMES[idx.index_symbol] || idx.index_symbol}</span>
              <span className="text-sm font-semibold tabular-nums">{formatNumber(Number(idx.level))}</span>
              <span className={`text-xs tabular-nums ${up ? "text-up" : "text-down"}`}>
                {up ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
