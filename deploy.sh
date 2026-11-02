#!/usr/bin/env bash
# One-command deploy of the Otto x402 service (no external deps).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-7010}"
echo "[otto] starting public service on :$PORT"
exec node public-service.mjs
