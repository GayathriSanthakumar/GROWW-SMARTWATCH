"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Watchlist, WatchlistItem } from "@/lib/types";
import { IndexStrip } from "@/components/IndexStrip";
import { WatchlistTabs } from "@/components/WatchlistTabs";
import { WatchlistTable } from "@/components/WatchlistTable";
import { SearchModal } from "@/components/SearchModal";
import { StockDetailPanel } from "@/components/StockDetailPanel";
import { WatchlistItemEditor } from "@/components/WatchlistItemEditor";
import { WhatChangedHub } from "@/components/WhatChangedHub";

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [filter, setFilter] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);

  const loadWatchlists = useCallback(async () => {
    const d = await api.get<{ watchlists: Watchlist[] }>("/api/watchlists");
    setWatchlists(d.watchlists);
    setActiveId((prev) => prev || d.watchlists.find((w) => w.is_default)?.id || d.watchlists[0]?.id || "");
  }, []);

  const loadItems = useCallback(async (id: string) => {
    if (!id) return;
    const d = await api.get<{ items: WatchlistItem[] }>(`/api/watchlists/${id}/items`);
    setItems(d.items);
  }, []);

  useEffect(() => {
    loadWatchlists();
  }, [loadWatchlists]);

  useEffect(() => {
    loadItems(activeId);
  }, [activeId, loadItems]);

  async function selectTab(id: string) {
    setActiveId(id);
    setFilter("");
    setEditMode(false);
    setSelected(new Set());
  }

  async function createWatchlist(name: string, emoji: string) {
    await api.post("/api/watchlists", { name, emoji });
    await loadWatchlists();
  }

  async function renameWatchlist(id: string, name: string) {
    if (!name.trim()) return;
    await api.patch(`/api/watchlists/${id}`, { name: name.trim() });
    loadWatchlists();
  }

  async function deleteWatchlist(id: string) {
    if (!confirm("Delete this watchlist?")) return;
    await api.del(`/api/watchlists/${id}`);
    setActiveId("");
    await loadWatchlists();
  }

  async function reorderWatchlists(ids: string[]) {
    setWatchlists((prev) => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    await api.post("/api/watchlists/reorder", { ids });
  }

  async function addStocks(ids: string[]) {
    let targetId = activeId;
    if (!targetId) {
      const d = await api.get<{ watchlists: Watchlist[] }>("/api/watchlists");
      targetId = d.watchlists.find((w) => w.is_default)?.id || d.watchlists[0]?.id || "";
      if (targetId) setActiveId(targetId);
    }
    if (!targetId) {
      const d = await api.post<{ id: string }>("/api/watchlists", { name: "My list", emoji: "📈" });
      targetId = d.id;
      await loadWatchlists();
      setActiveId(d.id);
    }
    await api.post(`/api/watchlists/${targetId}/items`, { instrumentIds: ids });
    await loadItems(targetId);
    await loadWatchlists();
  }

  async function removeStock(instrumentId: string) {
    await api.del(`/api/watchlists/${activeId}/items/${instrumentId}`);
    loadItems(activeId);
  }

  async function moveStock(instrumentId: string, targetWatchlistId: string) {
    await api.post(`/api/watchlists/${activeId}/items/move`, { instrumentId, targetWatchlistId });
    loadItems(activeId);
    loadWatchlists();
  }

  async function pinStock(instrumentId: string, pinned: boolean) {
    await api.patch(`/api/watchlists/${activeId}/items/${instrumentId}`, { isPinned: pinned });
    loadItems(activeId);
  }

  async function removeSelected() {
    await api.del(`/api/watchlists/${activeId}/items`, { instrumentIds: [...selected] });
    setSelected(new Set());
    setEditMode(false);
    loadItems(activeId);
  }

  const filteredItems = filter ? items.filter((i) => i.symbol.toLowerCase().includes(filter.toLowerCase()) || i.companyName.toLowerCase().includes(filter.toLowerCase())) : items;

  return (
    <div>
      <IndexStrip />
      <WhatChangedHub onOpenStock={setDetailId} />
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">Watchlist</h1>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <span className="text-sm text-gray-500">{selected.size} selected</span>
                <button className="btn-secondary" onClick={removeSelected} disabled={selected.size === 0}>Remove selected</button>
                <button className="text-sm text-gray-500" onClick={() => { setEditMode(false); setSelected(new Set()); }}>Done</button>
              </>
            ) : (
              <>
                <button className="text-sm text-gray-600 hover:bg-surface-muted px-2 py-1 rounded" onClick={() => setEditMode(true)}>Edit</button>
                <button className="btn-primary" onClick={() => setSearchOpen(true)}>+ Add stocks</button>
              </>
            )}
          </div>
        </div>

        <WatchlistTabs
          watchlists={watchlists}
          activeId={activeId}
          onSelect={selectTab}
          onCreate={createWatchlist}
          onRename={renameWatchlist}
          onDelete={deleteWatchlist}
          onReorder={reorderWatchlists}
        />

        <div className="mt-3 mb-2">
          <input className="input max-w-xs" placeholder="Search your watchlist…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>

        <div className="card overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="mb-2">No stocks in this watchlist yet.</p>
              <button className="btn-primary" onClick={() => setSearchOpen(true)}>+ Add Stock</button>
            </div>
          ) : (
            <WatchlistTable items={filteredItems} watchlists={watchlists} activeWatchlistId={activeId} onRowClick={setDetailId} onRemove={removeStock} onMove={moveStock} onPin={pinStock} onEditNotes={(id) => setEditingItem(items.find((i) => i.id === id) ?? null)} />
          )}
        </div>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onAdd={addStocks} />
      {detailId && <StockDetailPanel instrumentId={detailId} onClose={() => setDetailId(null)} />}
      {editingItem && (
        <WatchlistItemEditor item={editingItem} watchlistId={activeId} onClose={() => setEditingItem(null)} onSaved={() => loadItems(activeId)} />
      )}
    </div>
  );
}
