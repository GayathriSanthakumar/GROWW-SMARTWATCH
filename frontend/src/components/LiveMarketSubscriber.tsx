"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useMarket } from "@/store/market";
import { dataService } from "@/services/DataService";

// App-wide live-feed controller: starts the single DataService stream boundary,
// and polls the authoritative market status so a closed market clears the
// quote overlay (every surface then shows the frozen last-close DB value).
export function LiveMarketSubscriber() {
  const setOpen = useMarket((s) => s.setOpen);

  useEffect(() => {
    dataService.start(); // registers socket normalization + resilience

    let alive = true;
    const refresh = () =>
      api
        .get<{ isOpen: boolean; isPreOpen: boolean }>("/api/market/status")
        .then((d) => alive && setOpen(d.isOpen || d.isPreOpen))
        .catch(() => {});
    refresh();
    const poll = setInterval(refresh, 12000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [setOpen]);

  return null;
}
