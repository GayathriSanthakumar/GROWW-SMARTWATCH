import { create } from "zustand";
import { API_BASE } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  fetchMe: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,
  setUser: (u) => set({ user: u, loading: false, initialized: true }),
  fetchMe: async () => {
    try {
      const data = await api.get<{ user: User }>("/api/auth/me");
      set({ user: data.user, loading: false, initialized: true });
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
  },
  logout: async () => {
    // Clear local state FIRST so navigation/redirects happen instantly even if
    // the server revoke request hangs or the network is down.
    set({ user: null, loading: false, initialized: true });
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(4000), // never let the revoke block logout
      });
    } catch {
      /* noop — session cookies are cleared client-side too */
    }
  },
}));
