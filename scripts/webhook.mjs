// Otto webhook broadcaster — signal-as-a-service.
// Subscribers register a URL; when a NEW ENTER decision fires, broadcast the signal payload.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const SUB = join(DATA, 'subscribers');
const STATE = join(DATA, 'webhook-state.json');
fs.mkdirSync(SUB, { recursive: true });

const journal = JSON.parse(fs.readFileSync(join(DATA, 'journal.json'), 'utf8'));
const last = journal.lastDecision || {};
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { lastBroadcastCycle: 0 };

// only broadcast a NEW enter decision
if (last.decision !== 'ENTER' || last.cycle <= state.lastBroadcastCycle) {
  console.log(`webhook: no new ENTER (cycle ${last.cycle}, last broadcast ${state.lastBroadcastCycle})`);
  process.exit(0);
}

const subs = fs.readdirSync(SUB).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(join(SUB, f), 'utf8')));
if (!subs.length) { console.log('webhook: no subscribers'); state.lastBroadcastCycle = last.cycle; fs.writeFileSync(STATE, JSON.stringify(state)); process.exit(0); }

const payload = {
  type: 'otto.signal',
  version: 1,
  ts: new Date().toISOString(),
  signal: { pair: last.pair, mint: last.mint, dex: last.dex, entryUSD: last.entryUSD, targetUSD: last.targetUSD, stopUSD: last.stopUSD, sizeSOL: last.sizeSOL, score: last.score },
  policy: last.policy,
  source: 'https://luanalouisesebastiana-cpu.github.io/otto-market-intel/'
};

let delivered = 0, failed = 0;
for (const s of subs) {
  if (!s.url || s.paused) continue;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(s.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-otto-signature': s.secret || '' }, body: JSON.stringify(payload), signal: c.signal });
    clearTimeout(t);
    if (r.ok) delivered++; else failed++;
  } catch { failed++; }
}
state.lastBroadcastCycle = last.cycle;
fs.writeFileSync(STATE, JSON.stringify(state));
console.log(`webhook: broadcast signal ${last.pair} to ${subs.length} subs — ${delivered} delivered, ${failed} failed`);
