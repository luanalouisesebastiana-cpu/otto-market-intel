#!/usr/bin/env node
// Otto — Perpetual DEX Monitor. Tracks funding rates, open interest, and mark/index
// prices across Solana perp DEXs (Drift, Zeta, Jupiter perp, Flash). Funding rates
// are the highest-demand serious-trader signal (carry trade + sentiment). Read-only.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

// Drift v2 program exposes markets via getProgramAccounts; use the public API instead.
async function driftMarkets() {
  try {
    const r = await fetch('https://data.api.drift.trade/stats/markets', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { source: 'drift', ok: false, status: r.status };
    const j = await r.json();
    const rows = (Array.isArray(j) ? j : j.data || []).slice(0, 20).map(m => ({
      venue: 'Drift', symbol: m.symbol || m.marketIndex, mark: m.markPrice || m.mark, index: m.indexPrice || m.index,
      funding: m.fundingRate || m.funding, oi: m.openInterest || m.oi, oiLong: m.oiLong, oiShort: m.oiShort,
      volume24h: m.volume24h || m.volume, change24h: m.priceChange24h || m.change24h,
    }));
    return { source: 'drift', ok: true, markets: rows };
  } catch (e) { return { source: 'drift', ok: false, error: e.message }; }
}

async function driftOverview() {
  try {
    const r = await fetch('https://data.api.drift.trade/stats/overview', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Jupiter perp uses its own API; fetch SOL/BTC/ETH perp prices via quote/price endpoints.
async function jupiterPerp() {
  const out = [];
  for (const [symbol, mint] of [['BTC-PERP','9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E'],['SOL-PERP','So11111111111111111111111111111111111111112'],['ETH-PERP','7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKy4b9Z6u1v3']]) {
    try {
      const r = await fetch(`https://lite-api.jup.ag/perps/v1/markets?chains=solana&query=${mint}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const m = (j.markets || j.data || [])[0];
      if (m) out.push({ venue: 'Jupiter Perp', symbol, mark: m.markPrice || m.lastPrice, index: m.indexPrice, funding: m.fundingRate, oi: m.openInterest });
    } catch (e) {}
  }
  return out;
}

export async function run() {
  const out = { generatedAt: new Date().toISOString(), venues: [], markets: [], overview: null, note: '' };
  const d = await driftMarkets();
  out.venues.push(d);
  if (d.ok) out.markets.push(...(d.markets || []));
  out.overview = await driftOverview();
  try { out.markets.push(...(await jupiterPerp())); } catch (e) { out.note += 'jupiter: ' + e.message; }
  // aggregate funding stats
  const funded = out.markets.filter(m => typeof m.funding === 'number');
  out.fundingStats = {
    count: funded.length,
    avg: funded.length ? +(funded.reduce((s, m) => s + m.funding, 0) / funded.length).toFixed(4) : null,
    max: funded.length ? Math.max(...funded.map(m => m.funding)) : null,
    min: funded.length ? Math.min(...funded.map(m => m.funding)) : null,
    highest: funded.sort((a, b) => (b.funding || 0) - (a.funding || 0))[0] || null,
    lowest: funded.sort((a, b) => (a.funding || 0) - (b.funding || 0))[0] || null,
  };
  fs.writeFileSync(join(DATA, 'perp.json'), JSON.stringify(out, null, 2));
  console.log(`[perp] ${out.venues.length} venues, ${out.markets.length} markets, funding avg=${out.fundingStats.avg}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[perp] ERROR:', e.message); process.exit(1); });
}
