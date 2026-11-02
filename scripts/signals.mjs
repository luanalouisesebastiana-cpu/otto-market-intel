// Otto signal engine — turns approved opportunities into entry/target/stop signals
// under the inviolable risk policy (otto-risk-policy):
//   - position size 10-15% of free bank, lots < 0.010 SOL
//   - mandatory -8% stop-loss
//   - asset filters: liq > $50k, vol24h > $100k, slippage < 1%
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const d = JSON.parse(fs.readFileSync(join(DATA, 'intel.json'), 'utf8'));
const opps = d.opportunities || [];
// free bank: conservative working capital (USD). Reserve 0.01 SOL sacred.
const FREE_BANK_USD = 100;                 // Meta 1 working capital
const MAX_POS_PCT = 0.125;                 // 12.5% of free bank
const SOL_PRICE = d.macro?.solusd || 93;
const MAX_LOT_SOL = 0.010;
const STOP_PCT = -0.08;
const MIN_LIQ = 50000, MIN_VOL = 100000, MAX_SLIP = 0.01;

const approved = [];
for (const o of opps) {
  const liq = o.liqUsd || 0, vol = o.vol24Usd || 0;
  if (liq <= MIN_LIQ) continue;
  if (vol <= MIN_VOL) continue;
  // slippage proxy: inverse liquidity depth heuristic (thin liq -> high slip)
  const slip = Math.min(0.99, 25000 / (liq + 25000)); // ~0.33% at $50k, ~0.05% at $1M
  if (slip >= MAX_SLIP) continue;
  // position size: 12.5% of free bank, capped at 0.010 SOL
  let sizeUsd = FREE_BANK_USD * MAX_POS_PCT;
  let sizeSOL = Math.min(sizeUsd / SOL_PRICE, MAX_LOT_SOL);
  const price = o.priceUsd || 0;
  const entryUSD = price;
  const targetUSD = price * 1.03;           // +3% edge target
  const stopUSD = price * (1 + STOP_PCT);   // -8% mandatory stop
  // score: liquidity depth + volume + freshness proxy
  const score = Math.min(1, (Math.log10(liq / 50000) * 0.4) + (Math.log10(vol / 100000) * 0.3) + (slip < 0.005 ? 0.3 : 0.15));
  approved.push({
    pair: `${o.symbol}/USDC`, mint: o.mint, dex: o.dex,
    verdict: 'APPROVED', score: +score.toFixed(3),
    signal: { entryUSD: +entryUSD.toFixed(6), targetUSD: +targetUSD.toFixed(6), stopUSD: +stopUSD.toFixed(6), sizeSOL: +sizeSOL.toFixed(4), stopPct: STOP_PCT },
    filters: { liqUsd: liq, vol24Usd: vol, slipPct: +(slip * 100).toFixed(3) }
  });
}
approved.sort((a, b) => b.score - a.score);
const out = {
  generatedAt: new Date().toISOString(),
  policy: { maxPosPct: MAX_POS_PCT, maxLotSOL: MAX_LOT_SOL, stopPct: STOP_PCT, minLiqUsd: MIN_LIQ, minVol24Usd: MIN_VOL, maxSlipPct: MAX_SLIP * 100, freeBankUsd: FREE_BANK_USD, solPrice: SOL_PRICE },
  bank: { freeBankUsd: FREE_BANK_USD, reserveSOL: 0.010, maxPositionUsd: FREE_BANK_USD * MAX_POS_PCT },
  stats: { scanned: opps.length, approved: approved.length },
  signals: approved.slice(0, 5),
  top: approved.slice(0, 5)
};
fs.writeFileSync(join(DATA, 'signal.json'), JSON.stringify(out, null, 2));
console.log(`signals: ${approved.length} approved of ${opps.length} (top score ${approved[0]?.score ?? 'n/a'})`);
