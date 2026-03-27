#!/bin/bash

set -euo pipefail

PORT="${DASHBOARD_PORT:-5173}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR/dashboard"

if [ ! -d "node_modules" ]; then
  npm install
fi

exec npm run dev -- --host 0.0.0.0 --port "$PORT"
