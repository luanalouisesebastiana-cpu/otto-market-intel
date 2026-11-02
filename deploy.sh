#!/usr/bin/env bash
# Otto Market Intel — one-command deploy to any free cloud tier.
# Usage: ./deploy.sh [render|railway|fly|local]
set -e
SVC="public-service.mjs"
case "${1:-local}" in
  render)   echo "→ Render: push to git, Render auto-deploys via render.yaml"; git push origin master ;;
  railway)  echo "→ Railway: npx railway up"; npx --yes railway up ;;
  fly)      echo "→ Fly.io: fly deploy"; fly deploy ;;
  local)    echo "→ local: PORT=8080 node $SVC"; PORT=8080 node $SVC ;;
  *)        echo "unknown target: $1"; exit 1 ;;
esac
