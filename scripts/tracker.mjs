// Otto — live position tracker. Reads open signals from data/signal.json,
// pulls live DexScreener prices, computes unrealized P&L + distance to target/stop,
// and emits an exit decision under the inviolable -8% stop policy.
// Read-only: no signing, no orders. Verification layer for the paper-trade engine.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const STOP_PCT = -8;

async function livePrice(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(9000) });
    const d = await r.json();
    const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (p) return { price: parseFloat(p.priceUsd), source: 'dexscreener', pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`, liq: p.liquidity?.usd };
  } catch (e) {}
  return null;
}

function decide(entry, live, target, stop) {
  if (live >= target) return 'TARGET_HIT';
  if (live <= stop) return 'STOP_HIT';
  return 'OPEN';
}

export async function run() {
  let sigs = [];
  try {
    const s = JSON.parse(fs.readFileSync(join(DATA, 'signal.json'), 'utf8'));
    sigs = Array.isArray(s) ? s : (s.signals || []);
  } catch (e) { return { generatedAt: new Date().toISOString(), positions: [], note: 'no signal.json' }; }

  const positions = [];
  for (const s of sigs) {
    const sig = s.signal || s;
    if (!sig || !sig.entryUSD) continue;
    const live = await livePrice(s.mint);
    if (!live) continue;
    const entry = sig.entryUSD, target = sig.targetUSD, stop = sig.stopUSD || entry * (1 + STOP_PCT / 100);
    const liveUsd = live.price;
    const pnlPct = +((liveUsd - entry) / entry * 100).toFixed(2);
    const sizeSOL = sig.sizeSOL || 0;
    const pnlSOL = +((liveUsd - entry) / entry * sizeSOL).toFixed(6);
    const outcome = decide(entry, liveUsd, target, stop);
    positions.push({
      symbol: s.pair, mint: s.mint, dex: s.dex, verdict: s.verdict,
      entryUSD: entry, targetUSD: target, stopUSD: stop,
      liveUSD: liveUsd, liveSource: live.source, pair: live.pair, liqUsd: live.liq,
      pnlPct, pnlSOL, sizeSOL, outcome,
      distToTargetPct: +((target - liveUsd) / liveUsd * 100).toFixed(2),
      distToStopPct: +((liveUsd - stop) / liveUsd * 100).toFixed(2),
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    policy: { stopPct: STOP_PCT, note: 'exit at target or -8% stop; read-only verification' },
    open: positions.filter(p => p.outcome === 'OPEN').length,
    targetHits: positions.filter(p => p.outcome === 'TARGET_HIT').length,
    stopHits: positions.filter(p => p.outcome === 'STOP_HIT').length,
    positions,
  };
  fs.writeFileSync(join(DATA, 'tracker.json'), JSON.stringify(out, null, 2));
  return out;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(o => {
    console.log(`[tracker] ${o.positions.length} positions | open=${o.open} target=${o.targetHits} stop=${o.stopHits}`);
    for (const p of o.positions) console.log(`  ${p.symbol} ${p.outcome} pnl=${p.pnlPct}% ($${p.liveUSD})`);
  }).catch(e => { console.error('[tracker] ERROR:', e.message); process.exit(1); });
}
