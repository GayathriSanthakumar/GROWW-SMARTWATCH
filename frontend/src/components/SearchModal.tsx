"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatPercent } from "@/lib/format";
import type { Instrument } from "@/lib/types";

export function SearchModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setQ("");
      setSelected(new Set());
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api.get<{ results: Instrument[] }>(`/api/instruments/search?q=${encodeURIComponent(q || "")}&limit=15`);
        setResults(d.results);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open, q]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function addSelected() {
    setBusy(true);
    setError("");
    try {
      await onAdd([...selected]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add stocks");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="w-full max-w-lg card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-surface-border">
          <input autoFocus className="input" placeholder="Search stocks by name or symbol…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && <div className="p-4 text-sm text-gray-400">Searching…</div>}
          {results.map((r) => (
            <button key={r.id} onClick={() => toggle(r.id)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-muted text-left">
              <div className="flex items-center gap-3">
                <input type="checkbox" readOnly checked={selected.has(r.id)} className="accent-brand" />
                <div>
                  <div className="text-sm font-medium">{r.symbol}</div>
                  <div className="text-xs text-gray-500">{r.companyName} · {r.sector}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatINR(r.ltp)}</div>
                <div className={`text-xs ${r.changePct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(r.changePct)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-surface-border flex items-center justify-between">
          <span className="text-sm text-gray-500">{selected.size} selected</span>
          {error && <span className="text-xs text-down">{error}</span>}
          <button className="btn-primary" disabled={selected.size === 0 || busy} onClick={addSelected}>
            {busy ? "Adding…" : `Add ${selected.size} stock${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
