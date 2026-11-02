// Otto usage ledger — records EVERY x402 call attempt (paid or 402-challenged)
// to data/usage.jsonl. Gives verifiable demand metrics: who's calling, what
// they want, how often. Genesis: value creation requires knowing real demand.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const LEDGER = join(DATA, 'usage.jsonl');
fs.mkdirSync(DATA, { recursive: true });

// record one call. status: 'PAID' | 'CHALLENGED' | 'ERROR'
export function record({ endpoint, method='GET', status, payer=null, amountCents=null, ua=null, ip=null }) {
  const row = { ts: new Date().toISOString(), endpoint, method, status, payer, amountCents, ua: ua||null, ip: ip||null };
  fs.appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  return row;
}

// aggregate into a summary snapshot
export function summarize() {
  const byEndpoint = {}, byStatus = {}, byPayer = {};
  let total = 0, paid = 0, revenueCents = 0;
  if (fs.existsSync(LEDGER)) {
    for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      total++;
      byEndpoint[r.endpoint] = (byEndpoint[r.endpoint]||0)+1;
      byStatus[r.status] = (byStatus[r.status]||0)+1;
      if (r.status === 'PAID') { paid++; revenueCents += (r.amountCents||0); }
      if (r.payer) byPayer[r.payer] = (byPayer[r.payer]||0)+1;
    }
  }
  return { total, paid, challenged: byStatus.CHALLENGED||0, revenueCents, byEndpoint, byStatus, byPayer, generatedAt: new Date().toISOString() };
}

// CLI: `node usage.mjs summarize`
if (process.argv[2] === 'summarize') {
  console.log(JSON.stringify(summarize(), null, 2));
}
export { LEDGER };
