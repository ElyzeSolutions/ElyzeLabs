#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${GATEWAY_PORT:-8788}"
DASHBOARD_PORT="${DASHBOARD_PORT:-}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

PORT_PIDS=""
if command -v lsof >/dev/null 2>&1; then
  if [ -n "$DASHBOARD_PORT" ]; then
    PORT_PIDS="$(
      {
        lsof -tiTCP:"$GATEWAY_PORT" -sTCP:LISTEN 2>/dev/null || true
        lsof -tiTCP:"$DASHBOARD_PORT" -sTCP:LISTEN 2>/dev/null || true
      } | awk 'NF' | sort -u
    )"
  else
    PORT_PIDS="$(
      lsof -tiTCP:"$GATEWAY_PORT" -sTCP:LISTEN 2>/dev/null | awk 'NF' | sort -u || true
    )"
  fi
fi

PATTERN_PIDS=""
if command -v pgrep >/dev/null 2>&1; then
  PATTERN_PIDS="$(
    {
      pgrep -f "$ROOT_DIR/packages/gateway/src/index.ts" 2>/dev/null || true
      pgrep -f "pnpm --filter dashboard dev" 2>/dev/null || true
      pgrep -f "pnpm --filter dashboard preview" 2>/dev/null || true
      pgrep -f "tsx watch --conditions=development packages/gateway/src/index.ts" 2>/dev/null || true
    } | awk 'NF' | sort -u
  )"
fi

TARGET_PIDS="$(
  {
    printf '%s\n' "$PORT_PIDS"
    printf '%s\n' "$PATTERN_PIDS"
  } | awk -v self="$$" -v parent="$PPID" 'NF && $1 != self && $1 != parent' | sort -u
)"

if [ -z "$TARGET_PIDS" ]; then
  echo "No local ElyzeLabs processes found."
  exit 0
fi

echo "Stopping processes: $(echo "$TARGET_PIDS" | tr '\n' ' ')"
echo "$TARGET_PIDS" | xargs kill >/dev/null 2>&1 || true
sleep 1

REMAINING_PIDS="$(echo "$TARGET_PIDS" | xargs -I{} sh -c 'kill -0 "{}" 2>/dev/null && echo "{}"' 2>/dev/null || true)"
if [ -n "$REMAINING_PIDS" ]; then
  echo "Force stopping processes: $(echo "$REMAINING_PIDS" | tr '\n' ' ')"
  echo "$REMAINING_PIDS" | xargs kill -9 >/dev/null 2>&1 || true
fi

echo "Done."
