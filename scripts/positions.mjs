#!/usr/bin/env node
// Otto — Autonomous Position Manager. Trader core from the genesis mandate.
// Reads decisions.jsonl (Jev journal) for open ENTER entries, tracks each against
// LIVE DexScreener prices, computes real P&L, fires STOP-LOSS / TARGET-HIT alerts.
// Read-only monitoring; emits an action list the executor or a human acts on.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
import { POLICY as P } from './riskgate.mjs';
const RISK = { stopPct: Math.abs(P.stopPct), targetPct: P.targetPct };

async function priceOf(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const pairs = j.pairs || [];
    if (!pairs.length) return null;
    const p = pairs.sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];
    return { price: parseFloat(p.priceUsd||0), liquidity: p.liquidity?.usd||0, dex: p.dexId, change24h: p.priceChange?.h24 ?? null };
  } catch (e) { return null; }
}

function loadDecisions() {
  try {
    const raw = fs.readFileSync(join(DATA,'decisions.jsonl'),'utf8').trim().split('\n').filter(Boolean);
    return raw.map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(Boolean);
  } catch(e){ return []; }
}

export async function run() {
  const decisions = loadDecisions();
  // An ENTER is "open" if no later decision resolved it. Resolve when a subsequent
  // OBSERVE references it as resolved, or when STOP/TARGET was hit (not logged yet).
  // Conservative: track the most recent ENTER that has no terminal marker after it.
  const enters = decisions.filter(d => d.decision === 'ENTER' && d.mint && d.entryUSD);
  const lastEnter = enters[enters.length - 1];
  const positions = [];
  if (lastEnter) {
    const live = await priceOf(lastEnter.mint);
    if (!live || !live.price) {
      positions.push({ ...lastEnter, livePrice:null, pnlPct:null, action:'NO_PRICE', status:'OPEN' });
    } else {
      const entry = parseFloat(lastEnter.entryUSD);
      const pnlPct = ((live.price - entry) / entry) * 100;
      let action = 'HOLD';
      if (pnlPct <= -RISK.stopPct) action = 'STOP_LOSS';
      else if (pnlPct >= RISK.targetPct) action = 'TARGET_HIT';
      positions.push({ ...lastEnter, livePrice:live.price, entry, pnlPct:+pnlPct.toFixed(2),
        liquidity:live.liquidity, change24h:live.change24h, dex:live.dex, action, status:'OPEN' });
    }
  }
  const out = {
    generatedAt: new Date().toISOString(),
    risk: RISK,
    openCount: positions.length,
    alerts: positions.filter(p => p.action==='STOP_LOSS' || p.action==='TARGET_HIT'),
    positions,
    stats: { totalDecisions: decisions.length, enters: enters.length },
  };
  fs.writeFileSync(join(DATA,'positions.json'), JSON.stringify(out, null, 2));
  console.log(`[positions] ${positions.length} open, ${out.alerts.length} alerts (${out.alerts.map(a=>a.action).join(',')||'none'})`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[positions] ERROR:', e.message); process.exit(1); });
}
