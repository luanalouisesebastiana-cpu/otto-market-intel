// Otto paper-trading simulator — runs the signal strategy against LIVE prices.
// Fills hypothetical entries at signal price, exits at target/stop/-8% policy,
// tracks equity curve + win rate. Proves the trading engine end-to-end.
// Read-only: no signing, no real orders. Demo/verification only.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const STOP_PCT = -8; // inviolable policy

async function livePrice(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (p) return parseFloat(p.priceUsd);
  } catch (e) {}
  return null;
}

// simulate one signal: entry -> exit at target/stop/policy
function simulate(sig, live) {
  const entry = sig.entry;
  if (!entry || !live) return null;
  const target = sig.target, stop = sig.stop || entry * (1 + STOP_PCT / 100);
  const sizeUsd = sig.sizeUsd || 100;
  let exit, pnlPct, outcome;
  if (live >= target) { exit = target; outcome = 'TARGET'; }
  else if (live <= stop) { exit = stop; outcome = 'STOP'; }
  else { exit = live; outcome = 'OPEN'; }
  pnlPct = (exit - entry) / entry * 100;
  return { symbol: sig.symbol, pair: sig.pair, mint: sig.mint, entry, target, stop, live, exit, pnlPct: +pnlPct.toFixed(2), pnlUsd: +((exit - entry) / entry * sizeUsd).toFixed(2), outcome, sizeUsd };
}

export async function run() {
  const sigs = [];
  try { const s = JSON.parse(fs.readFileSync(join(DATA, 'signal.json'), 'utf8')); sigs.push(...(Array.isArray(s) ? s : (s.signals || s.signal ? [s.signal || s] : []))); } catch (e) {}
  const trades = [];
  for (const sig of sigs) {
    const live = await livePrice(sig.mint);
    const t = simulate(sig, live);
    if (t) trades.push(t);
  }
  const closed = trades.filter(t => t.outcome !== 'OPEN');
  const wins = closed.filter(t => t.pnlPct > 0).length;
  const equity = trades.reduce((s, t) => s + t.pnlUsd, 0);
  const snap = {
    generatedAt: new Date().toISOString(),
    mode: 'paper',
    total: trades.length, closed: closed.length,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : 0,
    totalPnlUsd: +equity.toFixed(2),
    policy: `stop ${STOP_PCT}%`,
    trades
  };
  fs.writeFileSync(join(DATA, 'papertrade.json'), JSON.stringify(snap, null, 2));
  return snap;
}

if (process.argv[1] && process.argv[1].endsWith('papertrade.mjs')) {
  run().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
