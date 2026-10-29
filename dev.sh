#!/usr/bin/env bash
# Starts the whole Smart-Home-Simulator for development:
#   backend  - uvicorn on 0.0.0.0:8000 (reachable from the local network)
#   frontend - Vite dev server with --host (reachable from the local network)
# Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  PYTHON=python
fi

if ! "$PYTHON" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "Installing backend dependencies ..."
  "$PYTHON" -m pip install -q -r "$ROOT/backend/requirements.txt"
fi

pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && exec "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000) &
pids+=("$!")

if [ -f "$ROOT/frontend/package.json" ]; then
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    echo "Installing frontend dependencies ..."
    (cd "$ROOT/frontend" && npm install)
  fi
  (cd "$ROOT/frontend" && exec npm run dev -- --host) &
  pids+=("$!")
else
  echo "frontend/package.json not found - starting the backend only."
fi

# Stop everything as soon as one of the two exits.
wait -n
