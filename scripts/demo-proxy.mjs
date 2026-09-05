#!/usr/bin/env node
// SMARTWATCH instant-demo proxy.
//
// Frontend (Next) and backend (Express + Socket.IO) normally run on two ports
// (3000 / 4000). Cookies are host-scoped, so a public "demo link" tunnel that
// exposes two different hosts won't share auth. This tiny proxy serves the
// whole app from ONE port (default 8080):
//
//   /api/*      and  /socket.io/*  → backend  :4000
//   everything else (pages, /_next, HMR) → frontend :3000
//
// Then expose port 8080 with a single tunnel (cloudflared, localtunnel,
// ngrok http). The frontend auto-detects same-origin API/socket calls.
//
// Usage:  node scripts/demo-proxy.mjs            (FRONT=3000, API=4000)
//         FRONT=3000 API=4000 PORT=8080 node scripts/demo-proxy.mjs

import http from "node:http";
import { URL } from "node:url";

const FRONT = Number(process.env.FRONT || 3000);
const API = Number(process.env.API || 4000);
const PORT = Number(process.env.PORT || 8080);

const proxy = (target) => (req, res, head) => {
  const headers = { ...req.headers };
  if (head) headers.connection = "upgrade";
  else delete headers.connection; // let http.request negotiate keep-alive

  const proxyReq = http.request(
    {
      host: "127.0.0.1",
      port: target,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    console.error(`[proxy] :${target} error`, err.message);
    if (typeof res.writeHead === "function") res.writeHead(502).end("Bad gateway");
    else res.end();
  });
  req.on("error", () => proxyReq.destroy());
  res.on("close", () => proxyReq.destroy());

  if (head) {
    // Upgrade requests: "res" is a raw net.Socket, so relay the 101 response
    // as a raw HTTP/1.1 status line instead of using res.writeHead().
    proxyReq.on("upgrade", (upRes, upSocket, upHead) => {
      const raw =
        `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage || "Switching Protocols"}\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n";
      res.write(raw);
      res.pipe(upSocket);
      upSocket.pipe(res);
      if (upHead?.length) upSocket.write(upHead);
    });
    proxyReq.end();
    return;
  }
  req.pipe(proxyReq);
};

// Never let one bad request take down the whole demo proxy.
process.on("uncaughtException", (err) => {
  console.error("[proxy] uncaught (ignored):", err.message);
});

const server = http.createServer((req, res) => {
  const path = req.url || "/";
  if (path.startsWith("/api/") || path.startsWith("/socket.io/")) {
    proxy(API)(req, res);
  } else {
    proxy(FRONT)(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url || "/", "http://x").pathname;
  if (path.startsWith("/socket.io/")) {
    proxy(API)(req, socket, head);
  } else {
    // Next dev HMR websocket
    proxy(FRONT)(req, socket, head);
  }
});

server.listen(PORT, () => {
  console.log(`[proxy] serving frontend :${FRONT} + api :${API} on http://localhost:${PORT}`);
  console.log(`[proxy] expose this port with one tunnel, e.g.`);
  console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`  npx localtunnel --port ${PORT}`);
  console.log(`  ngrok http ${PORT}`);
});
