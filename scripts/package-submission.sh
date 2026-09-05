#!/usr/bin/env bash
# Packages the source for the Code by Groww submission upload (< 50 MB).
# Staging via rsync excludes node_modules/.git/builds/logs/real .env secrets.
# Keeps .env.example files. Output: ../GROWW-submission.zip
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd)"
ROOT_DIR="$(basename "$SRC")"          # e.g. GROWW
STAGE="${TMPDIR:-/tmp}/${ROOT_DIR}-stage"
OUT="${SRC}/../${ROOT_DIR}-submission.zip"
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE"

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '**/node_modules' \
  --exclude 'backend/dist' \
  --exclude 'frontend/.next' \
  --exclude 'frontend/out' \
  --exclude 'backend/.env' \
  --exclude 'frontend/.env.local' \
  --exclude '**/.env.*.local' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude '*.zip' \
  "$SRC"/ "$STAGE/$ROOT_DIR"/

( cd "$STAGE" && zip -rq "$OUT" "$ROOT_DIR" )
rm -rf "$STAGE"

echo "Created: $OUT"
echo "Size: $(du -h "$OUT" | cut -f1)"
echo "Files: $(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
echo "Real env files packaged: $(unzip -l "$OUT" | grep -cE '(^|/)[^/]+\.env(\.local)?$' || true)"
echo "Example env files packaged: $(unzip -l "$OUT" | grep -cE '\.env\.example' || true)"
