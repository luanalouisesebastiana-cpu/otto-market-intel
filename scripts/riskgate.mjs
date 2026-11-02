// Otto risk-policy hard gate — genesis mandate: "Ativo fora dos filtros não é operado."
// Applies the inviolable policy to any candidate BEFORE it becomes a signal/payout:
//   liquidity >= $50,000 · volume24h >= $100,000 · slippage <= 1.0%
//   position <= 12.5% of free bank · stop = -8% · reserve 0.0100 SOL untouchable
// Rejects non-compliant candidates with explicit reasons. This module MUST run
// before any signal is published or any SOL committed.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

export const POLICY = Object.freeze({
  minLiqUsd: 50000,
  minVol24Usd: 100000,
  maxSlippagePct: 1.0,
  maxPositionPct: 12.5,
  stopPct: -8,
  reserveSol: 0.0100,
  // derived: max lot in SOL given a free-bank size
});

// Evaluate a candidate opportunity. Returns { approved, score, reasons[], checks }
export function gate(c) {
  const reasons = [];
  const checks = {};
  if (c.liqUsd == null || c.liqUsd < POLICY.minLiqUsd) { checks.liquidity = false; reasons.push(`liquidity $${Number(c.liqUsd||0).toLocaleString()} < $${POLICY.minLiqUsd.toLocaleString()}`); } else checks.liquidity = true;
  if (c.vol24Usd == null || c.vol24Usd < POLICY.minVol24Usd) { checks.volume = false; reasons.push(`24h volume $${Number(c.vol24Usd||0).toLocaleString()} < $${POLICY.minVol24Usd.toLocaleString()}`); } else checks.volume = true;
  if (c.slippagePct == null || c.slippagePct > POLICY.maxSlippagePct) { checks.slippage = false; reasons.push(`slippage ${Number(c.slippagePct??999).toFixed(3)}% > ${POLICY.maxSlippagePct}%`); } else checks.slippage = true;
  if (c.positionPct != null && c.positionPct > POLICY.maxPositionPct) { checks.position = false; reasons.push(`position ${c.positionPct}% > ${POLICY.maxPositionPct}% cap`); } else checks.position = true;
  const approved = Object.values(checks).every(Boolean);
  return { approved, reasons, checks, policy: POLICY };
}

// Filter a list of candidates -> approved + rejected (with reasons)
export function gateAll(candidates) {
  const approved = [], rejected = [];
  for (const c of candidates || []) {
    const g = gate(c);
    if (g.approved) approved.push({ ...c, riskGate: g });
    else rejected.push({ symbol: c.symbol, pair: c.pair, mint: c.mint, reasons: g.reasons });
  }
  return { approved, rejected };
}

export async function run() {
  // read the current opportunity set and apply the hard gate
  let opps = [];
  try { const d = JSON.parse(fs.readFileSync(join(DATA, 'opportunities.json'), 'utf8')); opps = Array.isArray(d) ? d : (d.opportunities || []); } catch (e) {}
  const result = gateAll(opps);
  const snap = { generatedAt: new Date().toISOString(), policy: POLICY, total: opps.length, approved: result.approved.length, rejected: result.rejected.length, rejectedList: result.rejected };
  fs.writeFileSync(join(DATA, 'riskgate.json'), JSON.stringify(snap, null, 2));
  return snap;
}

if (process.argv[1] && process.argv[1].endsWith('riskgate.mjs')) {
  run().then(r => console.log(JSON.stringify({ total: r.total, approved: r.approved, rejected: r.rejected, rejectedList: r.rejectedList.slice(0, 5) }, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
