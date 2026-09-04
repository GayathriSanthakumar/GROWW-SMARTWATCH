"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatPercent } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

const TAG_PRESETS = ["Long-term", "Momentum", "Earnings play", "Dividend", "Turnaround", "IPO"];

export function WatchlistItemEditor({ item, watchlistId, onClose, onSaved }: { item: WatchlistItem; watchlistId: string; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  const [entry, setEntry] = useState(item.entryLevel?.toString() ?? "");
  const [exit, setExit] = useState(item.exitLevel?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await api.patch(`/api/watchlists/${watchlistId}/items/${item.id}`, {
        notes: notes || null,
        tags,
        entryLevel: entry ? Number(entry) : null,
        exitLevel: exit ? Number(exit) : null,
      });
      setMsg("Saved ✓");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 400);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg card shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">
            {item.symbol} <span className="text-sm font-normal text-gray-400">{item.companyName}</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-muted text-gray-500">✕</button>
        </div>

        <div className="text-xs text-gray-500 mb-4">
          Added {new Date(item.addedAt).toLocaleDateString("en-IN")}
          {item.addedPrice ? <> · at {formatINR(item.addedPrice)}</> : null}
          {item.cagr != null ? <> · <span className={item.cagr >= 0 ? "text-up font-semibold" : "text-down font-semibold"}>CAGR {formatPercent(item.cagr)}</span></> : null}
        </div>

        <label className="text-xs text-gray-500 block">Tags / labels
          <div className="flex flex-wrap gap-1.5 mt-1.5 mb-3">
            {TAG_PRESETS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)} className={`text-xs px-2.5 py-1 rounded-full border ${tags.includes(t) ? "bg-brand text-white border-brand" : "border-surface-border text-gray-600 hover:bg-surface-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-gray-500 block">Entry level (₹)
            <input className="input mt-1" type="number" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Optional" />
          </label>
          <label className="text-xs text-gray-500 block">Exit / target (₹)
            <input className="input mt-1" type="number" value={exit} onChange={(e) => setExit(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <label className="text-xs text-gray-500 block">Notes / thesis
          <textarea className="input mt-1" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Investment thesis, key ratios to watch, catalysts…" />
        </label>

        {msg && <p className="text-sm text-brand mt-2">{msg}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
