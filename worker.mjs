#!/usr/bin/env node
// Otto autonomous worker daemon — runs the full pipeline continuously.
// Unlike CI (every 15 min, ephemeral), this is a PERSISTENT process that:
//   - refreshes intel data on an interval
//   - checks price alerts + fires webhooks
//   - broadcasts new signals to subscribers
//   - writes a heartbeat so the system knows the worker is alive
// Run: node worker.mjs   (or: pm2 start worker.mjs)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 60000); // default 60s
const HEARTBEAT = join(DATA, 'worker-heartbeat.json');
const LOG = join(DATA, 'worker.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

async function cycle() {
  const t0 = Date.now();
  const results = { ts: new Date().toISOString(), steps: {}, firedAlerts: 0, signals: 0 };
  // 1. full pipeline (data -> risk gate -> signals -> journal -> treasury -> audit)
  try {
    await import('./scripts/pipeline.mjs');
    results.steps.pipeline = 'ok';
  } catch (e) { results.steps.pipeline = 'fail: ' + e.message; }
  // 2. alerts (fire webhooks on threshold cross)
  try {
    const a = await import('./scripts/alerts.mjs');
    const r = await a.run();
    results.firedAlerts = r.fired || 0;
    results.steps.alerts = 'ok';
  } catch (e) { results.steps.alerts = 'fail: ' + e.message; }
  // 3. webhook broadcast (push new signals to subscribers)
  try {
    const w = await import('./scripts/webhook.mjs');
    if (typeof w.broadcast === 'function') { const n = await w.broadcast(); results.signals = n || 0; }
    results.steps.webhook = 'ok';
  } catch (e) { results.steps.webhook = 'fail: ' + e.message; }
  // 4. heartbeat
  fs.writeFileSync(HEARTBEAT, JSON.stringify({ ...results, uptimeMs: Date.now() - t0, intervalMs: INTERVAL_MS }, null, 2));
  log(`cycle done in ${Date.now() - t0}ms | alerts fired: ${results.firedAlerts} | signals: ${results.signals}`);
  return results;
}

async function main() {
  log(`worker starting (interval ${INTERVAL_MS}ms)`);
  await cycle();
  setInterval(cycle, INTERVAL_MS);
  // keep-alive + graceful shutdown
  process.on('SIGTERM', () => { log('SIGTERM received, shutting down'); process.exit(0); });
  process.on('SIGINT', () => { log('SIGINT received, shutting down'); process.exit(0); });
}
main().catch(e => { log('fatal: ' + e.message); process.exit(1); });
