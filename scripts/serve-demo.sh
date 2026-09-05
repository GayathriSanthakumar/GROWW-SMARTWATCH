#!/usr/bin/env bash
# SMARTWATCH demo supervisor: keeps the single-port proxy + Cloudflare tunnel
# alive, and prints the current public URL. Requires `npm run dev` (backend on
# :4000, frontend on :3000) to already be running.
#
# Usage:  bash scripts/serve-demo.sh

set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/tmp/smartwatch-demo.log

probe() { curl -sf -o /dev/null "$1"; }

echo "[serve-demo] checking local services..." | tee "$LOG"
if ! probe http://127.0.0.1:4000/api/market/status; then
  echo "Backend not on :4000. Start it first:  npm run dev" | tee -a "$LOG"; exit 1
fi
if ! probe http://127.0.0.1:3000/; then
  echo "Frontend not on :3000. Start it first:  npm run dev" | tee -a "$LOG"; exit 1
fi

# ---- proxy (auto-restart) -------------------------------------------------
( while true; do
    node "$DIR/scripts/demo-proxy.mjs" >> /tmp/smartwatch-proxy.log 2>&1
    echo "[serve-demo] proxy exited, restarting in 1s" >> "$LOG"
    sleep 1
  done ) &

# ---- Cloudflare tunnel (auto-restart) ------------------------------------
( while true; do
    cloudflared tunnel --url http://localhost:8080 --no-autoupdate \
      --protocol http2 --edge-ip-version 4 > /tmp/cloudflared.log 2>&1
    echo "[serve-demo] tunnel exited, restarting in 2s" >> "$LOG"
    sleep 2
  done ) &

echo "[serve-demo] waiting for tunnel URL..." >> "$LOG"
URL=""
for _ in $(seq 1 40); do
  sleep 2
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1)
  [ -n "$URL" ] && break
done

echo "----------------------------------------------" | tee -a "$LOG"
echo "LIVE URL:  ${URL:-<tunnel failed - see /tmp/cloudflared.log>}?demo=1" | tee -a "$LOG"
echo "Keep this terminal + the npm run dev terminal running." | tee -a "$LOG"
echo "----------------------------------------------" | tee -a "$LOG"

# keep the script alive so the background jobs are children of it
wait
