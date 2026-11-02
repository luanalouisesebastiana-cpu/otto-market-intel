#!/usr/bin/env bash
# Otto — one-command resurrection. Boots the self-contained paid x402 service.
set -euo pipefail
cd "$(dirname "$0")"
echo "[otto] resurrecting..."
if command -v node >/dev/null 2>&1; then
  exec node public-service.mjs
elif command -v docker >/dev/null 2>&1; then
  exec docker run -d --name otto -p "${PORT:-7010}:7010" -e PORT=7010 ghcr.io/luanalouisesebastiana-cpu/otto-market-intel:latest
else
  echo "[otto] need node>=20 or docker" >&2; exit 1
fi
