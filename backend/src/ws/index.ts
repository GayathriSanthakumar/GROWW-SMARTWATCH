import type http from "node:http";
import { Server as SocketServer } from "socket.io";
import { verifyAccessToken } from "../lib/jwt.js";
import { config } from "../config.js";

let io: SocketServer | null = null;

export function initSocket(server: http.Server): SocketServer {
  io = new SocketServer(server, {
    cors: {
      credentials: true,
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (origin === config.frontendUrl) return cb(null, true);
        const devOrTunnel =
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          /\.trycloudflare\.com$|\.ngrok(-free)?\.dev$|\.loca\.lt$|\.ngrok\.io$/.test(origin);
        if (config.nodeEnv !== "production" || devOrTunnel) return cb(null, true);
        return cb(null, false);
      },
    },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("smartwatch_access="))
        ?.split("=")[1] as string);
    if (!token) return next(new Error("unauthorized"));
    try {
      const payload = verifyAccessToken(token);
      (socket as unknown as { userId: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as unknown as { userId: string }).userId;
    socket.join(`user:${userId}`);

    socket.on("subscribe:instrument", (instrumentId: string) => {
      socket.join(`instrument:${instrumentId}`);
    });
    socket.on("unsubscribe:instrument", (instrumentId: string) => {
      socket.leave(`instrument:${instrumentId}`);
    });
    socket.on("disconnect", () => {
      /* noop */
    });
  });

  return io;
}

export function getIo() {
  return io;
}

export function broadcast(event: string, data: unknown) {
  io?.emit(event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToInstrument(instrumentId: string, event: string, data: unknown) {
  // Only fan out to an instrument room if someone is actually listening.
  // With ~800+ instruments ticking every few seconds this avoids emitting
  // into hundreds of empty rooms on every cycle.
  const room = io?.sockets.adapter.rooms.get(`instrument:${instrumentId}`);
  if (room && room.size > 0) io!.to(`instrument:${instrumentId}`).emit(event, data);
}
