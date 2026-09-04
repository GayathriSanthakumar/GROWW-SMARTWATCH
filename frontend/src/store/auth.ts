import { create } from "zustand";
import { api } from "@/lib/api";
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
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* noop */
    }
    set({ user: null });
  },
}));
