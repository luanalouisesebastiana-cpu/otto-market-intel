#!/usr/bin/env bash
# Otto — start unified public service (port 80) robustly detached
cd /root/.automaton/market-intel || exit 1
node --check public-service.mjs >/dev/null 2>&1 || { echo "SYNTAX FAIL"; exit 1; }
if [ -f service.pid ]; then kill "$(cat service.pid)" 2>/dev/null; rm -f service.pid; fi
setsid node public-service.mjs </dev/null >>service.log 2>&1 &
echo $! > service.pid
disown 2>/dev/null
sleep 2
echo "started pid $(cat service.pid)"