// Otto backtest — validates the signal strategy (entry -> +3% target / -8% stop)
// on historical daily closes (CoinGecko market_chart). Read-only. No execution.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const TARGET = 0.03, STOP = -0.08;
const COINS = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' };

async function getHistory(id, days) {
  const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
  if (!r.ok) return null;
  const j = await r.json();
  return (j.prices || []).map(p => ({ t: p[0], p: p[1] }));
}

function runBacktest(prices) {
  let trades = 0, wins = 0, losses = 0, totalRet = 0, equity = 1, peak = 1, maxDD = 0;
  const log = [];
  for (let i = 0; i < prices.length - 1; i++) {
    const entry = prices[i].p;
    // simulate holding until target or stop hit (using next-day close as proxy)
    const next = prices[i + 1].p;
    const ret = (next - entry) / entry;
    let outcome;
    if (ret >= TARGET) { outcome = 'target'; wins++; totalRet += TARGET; equity *= (1 + TARGET); }
    else if (ret <= STOP) { outcome = 'stop'; losses++; totalRet += STOP; equity *= (1 + STOP); }
    else { outcome = 'hold'; totalRet += ret; equity *= (1 + ret); }
    trades++;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - equity) / peak);
    log.push({ i, entry: +entry.toFixed(2), ret: +(ret * 100).toFixed(2), outcome, equity: +equity.toFixed(3) });
  }
  return { trades, wins, losses, winRate: trades ? wins / trades : 0, totalRet: +(totalRet * 100).toFixed(1), equity: +equity.toFixed(3), maxDD: +(maxDD * 100).toFixed(1), log: log.slice(-10) };
}

const results = {};
for (const [id, sym] of Object.entries(COINS)) {
  const prices = await getHistory(id, 90);
  if (!prices || prices.length < 10) { results[sym] = { error: 'no data' }; continue; }
  results[sym] = runBacktest(prices);
}
const out = { generatedAt: new Date().toISOString(), strategy: { targetPct: TARGET * 100, stopPct: STOP * 100, horizon: 'daily-close proxy' }, results };
fs.writeFileSync(join(DATA, 'backtest.json'), JSON.stringify(out, null, 2));
console.log('backtest:', Object.entries(results).map(([k, v]) => `${k}=${v.error || `eq${v.equity} wr${(v.winRate*100).toFixed(0)}% dd${v.maxDD}%`}`).join(' '));
