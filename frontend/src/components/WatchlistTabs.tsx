"use client";

import { useState } from "react";
import type { Watchlist } from "@/lib/types";

export function WatchlistTabs({
  watchlists,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
}: {
  watchlists: Watchlist[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, emoji: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (ids: string[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📈");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  async function submitCreate() {
    if (!newName.trim()) return;
    await onCreate(newName.trim(), newEmoji || "📈");
    setNewName("");
    setNewEmoji("📈");
    setCreating(false);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = watchlists.map((w) => w.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
    setDragId(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
      {watchlists.map((w) => {
        const active = w.id === activeId;
        return (
          <div
            key={w.id}
            draggable
            onDragStart={() => setDragId(w.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(w.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setRenaming(w.id);
              setRenameVal(w.name);
            }}
            className={`shrink-0 ${active ? "border-b-2 border-brand text-brand" : "text-gray-500 border-b-2 border-transparent hover:text-gray-700"}`}
          >
            {renaming === w.id ? (
              <input
                autoFocus
                className="px-3 py-2 text-sm font-medium w-40 focus:outline-none"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={async () => {
                  await onRename(w.id, renameVal);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(w.id, renameVal);
                    setRenaming(null);
                  }
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <button className="px-3 py-2 text-sm font-medium whitespace-nowrap" onClick={() => onSelect(w.id)} title="Right-click to rename/delete">
                {w.emoji} {w.name} <span className="text-xs opacity-60">({w.item_count})</span>
              </button>
            )}
            {renaming === w.id && (
              <button className="text-xs text-down px-2" onClick={() => { onDelete(w.id); setRenaming(null); }}>
                delete
              </button>
            )}
          </div>
        );
      })}

      {creating ? (
        <div className="flex items-center gap-1 shrink-0 px-2">
          <input className="w-10 text-center focus:outline-none" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} />
          <input autoFocus className="w-36 text-sm px-2 py-1 border border-surface-border rounded" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitCreate()} />
          <button className="text-sm text-brand font-medium" onClick={submitCreate}>Add</button>
          <button className="text-sm text-gray-400" onClick={() => setCreating(false)}>✕</button>
        </div>
      ) : (
        <button className="shrink-0 px-3 py-2 text-sm font-medium text-brand hover:bg-brand-light/50 rounded-lg" onClick={() => setCreating(true)}>
          + Watchlist
        </button>
      )}
    </div>
  );
}
