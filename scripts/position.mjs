// Otto position tracker + exit planner — the missing half of the trade lifecycle.
// Given entry/target/stop + live price, computes unrealized P&L, distance to
// target/stop, and an exit decision under the inviolable -8% stop policy.
// Read-only: pulls live price from DexScreener/CoinGecko, never signs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

// live price for a mint (DexScreener) or symbol (CoinGecko)
export async function livePrice({ mint, symbol }) {
  if (mint) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (p) return { price: parseFloat(p.priceUsd), source: 'dexscreener', pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}` };
    } catch (e) {}
  }
  if (symbol) {
    try {
      const g = symbol.toLowerCase();
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${g}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d[g]?.usd) return { price: d[g].usd, source: 'coingecko', pair: `${symbol}/USD` };
    } catch (e) {}
  }
  return null;
}

// compute position state + exit decision
export function track({ entry, target, stop, sizeUsd, live }) {
  const pnlPct = (live - entry) / entry * 100;
  const pnlUsd = (live - entry) / entry * sizeUsd;
  const toTarget = (target - live) / live * 100;
  const toStop = (live - stop) / stop * 100; // negative = below stop
  let decision = 'HOLD', reason = '';
  if (live <= stop) { decision = 'EXIT-STOP'; reason = `Stopped out at ${pnlPct.toFixed(2)}% (policy: -8% max)`; }
  else if (live >= target) { decision = 'EXIT-TARGET'; reason = `Target hit at +${pnlPct.toFixed(2)}% — take profit`; }
  else if (pnlPct <= -8) { decision = 'EXIT-STOP'; reason = 'Breached -8% policy stop'; }
  else if (pnlPct >= 8) { decision = 'TRAIL-STOP'; reason = 'In profit — consider trailing stop to protect gains'; }
  else { decision = 'HOLD'; reason = `Within band. ${toTarget.toFixed(2)}% to target, ${toStop.toFixed(2)}% to stop.`; }
  return { entry, target, stop, sizeUsd, live, pnlPct: +pnlPct.toFixed(2), pnlUsd: +pnlUsd.toFixed(2), toTarget: +toTarget.toFixed(2), toStop: +toStop.toFixed(2), decision, reason };
}

export async function run() {
  // track the active signal (if any) from data/signal.json
  let snap = { generatedAt: new Date().toISOString(), positions: [] };
  try {
    const sig = JSON.parse(fs.readFileSync(join(DATA, 'signal.json'), 'utf8'));
    const s = sig.signal || sig;
    if (s && s.entry && s.target && s.stop) {
      const live = await livePrice({ mint: s.mint, symbol: s.symbol });
      if (live) snap.positions.push({ symbol: s.symbol || s.pair, mint: s.mint, ...track({ entry: s.entry, target: s.target, stop: s.stop, sizeUsd: s.sizeUsd || 0, live: live.price }), liveSource: live.source });
    }
  } catch (e) {}
  fs.writeFileSync(join(DATA, 'position.json'), JSON.stringify(snap, null, 2));
  return snap;
}

if (process.argv[1] && process.argv[1].endsWith('position.mjs')) {
  run().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
