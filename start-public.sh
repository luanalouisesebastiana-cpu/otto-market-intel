#!/usr/bin/env bash
# Otto — start unified public service robustly detached (port 7010)
cd /home/hatch/.automaton/storefront || exit 1
node --check public-service.mjs >/dev/null 2>&1 || { echo "SYNTAX FAIL"; exit 1; }
if [ -f service.pid ]; then kill "$(cat service.pid)" 2>/dev/null; rm -f service.pid; fi
setsid node public-service.mjs </dev/null >>service.log 2>&1 &
echo $! > service.pid
disown 2>/dev/null
sleep 3
curl -s --max-time 6 http://localhost:7010/health && echo " <- HEALTH OK" || echo " <- still down (see service.log)"
