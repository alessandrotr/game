#!/usr/bin/env bash
# Host the game from this machine and share it via free Cloudflare quick tunnels.
# Usage: scripts/share.sh      (requires: brew install cloudflared)
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "Install first: brew install cloudflared"; exit 1; }

LOG=$(mktemp -d)
PIDS=()
trap 'kill "${PIDS[@]}" 2>/dev/null || true' EXIT INT TERM

tunnel_url() { # $1 = log file
  for _ in $(seq 1 60); do
    u=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$1" | head -1 || true)
    [ -n "$u" ] && { echo "$u"; return; }
    sleep 1
  done
  echo "Tunnel failed, see $1" >&2; exit 1
}

pnpm --filter @arena/shared build
pnpm --filter @arena/server build

# 1. Server + tunnel
NODE_ENV=production AUTH_SECRET="${AUTH_SECRET:-local-share-secret-change-me}" \
  pnpm --filter @arena/server start >"$LOG/server.log" 2>&1 & PIDS+=($!)
cloudflared tunnel --url http://localhost:2567 >"$LOG/t-server.log" 2>&1 & PIDS+=($!)
SERVER_HTTPS=$(tunnel_url "$LOG/t-server.log")
SERVER_WSS="wss://${SERVER_HTTPS#https://}"

# 2. Client built against that server URL + tunnel
VITE_SERVER_URL="$SERVER_WSS" pnpm --filter @arena/client build
pnpm --filter @arena/client preview >"$LOG/client.log" 2>&1 & PIDS+=($!)
cloudflared tunnel --url http://localhost:4173 >"$LOG/t-client.log" 2>&1 & PIDS+=($!)
CLIENT_URL=$(tunnel_url "$LOG/t-client.log")

echo
echo "  Share this link:  $CLIENT_URL"
echo "  (server: $SERVER_WSS)   Ctrl+C to stop. Logs: $LOG"
wait
