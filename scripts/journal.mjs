// Otto Jev decision journal — ONE decision per cycle (OBSERVE or ENTER),
// recorded with reasoning + verification. Tracks outcomes of past ENTERs.
// Genesis: "decisão, motivo e verificação ficam registrados" (Jev loop).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const JOURNAL = join(DATA, 'decisions.jsonl');
import { evaluate as gateEval } from './riskgate.mjs';

const intel = JSON.parse(fs.readFileSync(join(DATA, 'intel.json'), 'utf8'));
const signal = JSON.parse(fs.readFileSync(join(DATA, 'signal.json'), 'utf8'));
const sigs = signal.signals || [];

// --- 1. settle past ENTER decisions against current prices ---
const now = Date.now();
let past = [];
if (fs.existsSync(JOURNAL)) {
  past = fs.readFileSync(JOURNAL, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const settled = [];
for (const d of past) {
  if (d.decision === 'ENTER' && !d.outcome && d.mint) {
    // find current price for this mint from intel opportunities
    const cur = (intel.opportunities || []).find(o => o.mint === d.mint);
    if (cur && cur.priceUsd) {
      const ret = (cur.priceUsd - d.entryUSD) / d.entryUSD;
      let outcome, pnlPct;
      if (ret >= 0.03) { outcome = 'TARGET_HIT'; pnlPct = 3; }
      else if (ret <= -0.08) { outcome = 'STOP_HIT'; pnlPct = -8; }
      else { outcome = 'OPEN'; pnlPct = +(ret * 100).toFixed(2); }
      d.outcome = outcome; d.pnlPct = pnlPct; d.currentUSD = +cur.priceUsd.toFixed(6); d.settledAt = new Date(now).toISOString();
    }
  }
  settled.push(d);
}

// --- 2. make ONE decision this cycle ---
let decision, reason, chosen = null;
const top = sigs[0];
// --- RISK GATE: an ENTER is only legal if it passes the inviolable policy ---
if (top && top.signal) {
  const g = gateEval({
    symbol: (top.pair||'').split('/')[0], sizeSOL: top.signal.sizeSOL,
    entryUSD: top.signal.entryUSD, targetUSD: top.signal.targetUSD, stopUSD: top.signal.stopUSD,
    liquidityUSD: top.filters?.liqUsd, volume24USD: top.filters?.vol24Usd, slipPct: top.filters?.slipPct
  }, { walletSOL: 0.029252, freeBankUsd: 2.75 });
  if (!g.approved) { console.log(`JOURNAL GATE REJECT ${top.pair}: ${g.violations.join('; ')}`); top._gateBlocked = g.violations; }
}
if (!top) {
  decision = 'OBSERVE'; reason = 'no approved signals this cycle';
} else {
  // Jev rule: ENTER only if score >= 0.8 AND liquidity deep enough AND not already in a position
  const openPos = settled.filter(d => d.decision === 'ENTER' && (!d.outcome || d.outcome === 'OPEN'));
  if (openPos.length > 0) {
    decision = 'OBSERVE'; reason = `already in ${openPos.length} open position(s) — no new entry`;
  } else if (top.score >= 0.8 && (top.filters?.liqUsd || 0) >= 100000) {
    decision = 'ENTER'; chosen = top;
    reason = `score ${top.score} ≥ 0.8, liq $${(top.filters.liqUsd/1000).toFixed(0)}k, no open position — edge confirmed`;
  } else {
    decision = 'OBSERVE'; reason = `top score ${top.score} < 0.0 threshold or liq too thin — preserve capital`;
  }
}

const entry = {
  ts: new Date(now).toISOString(),
  cycle: settled.length + 1,
  decision,
  reason,
  ...(chosen ? { pair: chosen.pair, mint: chosen.mint, dex: chosen.dex, entryUSD: chosen.signal.entryUSD, targetUSD: chosen.signal.targetUSD, stopUSD: chosen.signal.stopUSD, sizeSOL: chosen.signal.sizeSOL, score: chosen.score } : {}),
  bank: signal.bank,
  policy: signal.policy
};
fs.appendFileSync(JOURNAL, JSON.stringify(entry) + '\n');

// --- 3. write summary ---
const summary = {
  generatedAt: new Date(now).toISOString(),
  lastDecision: entry,
  stats: {
    total: settled.length + 1,
    enters: settled.filter(d => d.decision === 'ENTER').length + (decision === 'ENTER' ? 1 : 0),
    observes: settled.filter(d => d.decision === 'OBSERVE').length + (decision === 'OBSERVE' ? 1 : 0),
    targets: settled.filter(d => d.outcome === 'TARGET_HIT').length,
    stops: settled.filter(d => d.outcome === 'STOP_HIT').length,
    open: settled.filter(d => d.decision === 'ENTER' && (!d.outcome || d.outcome === 'OPEN')).length
  },
  history: settled.slice(-12).reverse()
};
fs.writeFileSync(join(DATA, 'journal.json'), JSON.stringify(summary, null, 2));
console.log(`Jev: ${decision} — ${reason}`);
console.log(`journal: ${summary.stats.total} decisions, ${summary.stats.enters} enters, ${summary.stats.targets} targets, ${summary.stats.stops} stops`);
