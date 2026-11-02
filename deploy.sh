#!/usr/bin/env bash
# Otto — one-command deploy to any free host. Tries, in order:
#   1) local docker-compose  2) Render  3) Railway  4) Fly  5) Koyeb
# The service is fully self-contained (public-service.mjs + data pipeline).
set -e
PORT="${PORT:-8080}"
echo "=== Otto Market Intel deploy ==="

# 1) local docker
if command -v docker >/dev/null 2>&1; then
  echo "[1/5] docker detected — building + starting locally"
  docker compose up -d --build && echo "✓ running at http://localhost:${PORT}" && exit 0
fi

# 2) Render (needs RENDER_API_KEY + service id)
if [ -n "$RENDER_API_KEY" ]; then
  echo "[2/5] deploying to Render..."
  curl -sS -X POST "https://api.render.com/v1/services" \
    -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
    -d "{\"service\":{\"name\":\"otto-market-intel\",\"type\":\"web\",\"runtime\":\"docker\",\"repo\":\"https://github.com/luanalouisesebastiana-cpu/otto-market-intel\",\"autoDeploy\":true}}" \
    && echo "✓ Render deploy triggered" && exit 0
fi

# 3) Railway (needs RAILWAY_TOKEN)
if [ -n "$RAILWAY_TOKEN" ]; then
  echo "[3/5] Railway token present — see https://railway.app/deploy for one-click"
fi

# 4) Fly (needs FLY_API_TOKEN)
if [ -n "$FLY_API_TOKEN" ]; then
  echo "[4/5] Fly token present — run: fly deploy --dockerfile Dockerfile"
fi

# 5) Koyeb (needs KOYEB_TOKEN)
if [ -n "$KOYEB_TOKEN" ]; then
  echo "[5/5] Koyeb token present — see https://app.koyeb.com for one-click Docker deploy"
fi

echo "No deploy token found. Set RENDER_API_KEY / FLY_API_TOKEN / RAILWAY_TOKEN or run locally with docker."
exit 1
