import { io, type Socket } from "socket.io-client";

const isLoopbackUrl = (u: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(u);

function resolveWsBase(): string {
  const explicit = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const pageIsLocal = host === "" || host === "localhost" || host === "127.0.0.1";
  if (explicit) {
    // Same rule as api.ts: never send a remote visitor's browser to their own
    // localhost; use the tunnel/proxy origin instead.
    if (!pageIsLocal && isLoopbackUrl(explicit)) return window.location.origin;
    return explicit;
  }
  return pageIsLocal ? "http://localhost:4000" : window.location.origin;
}

const WS_BASE = resolveWsBase();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(WS_BASE, {
    withCredentials: true,
    transports: ["websocket", "polling"],
  });
  socket.on("connect_error", () => {
    /* handled silently; polling fallback keeps it alive */
  });
  return socket;
}

export function subscribeInstrument(instrumentId: string) {
  getSocket().emit("subscribe:instrument", instrumentId);
}

export function unsubscribeInstrument(instrumentId: string) {
  getSocket().emit("unsubscribe:instrument", instrumentId);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
