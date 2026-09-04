import { io, type Socket } from "socket.io-client";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";

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
