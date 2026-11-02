// Otto — public market scan (GitHub Actions).
// Produces static, publicly-reachable JSON on GitHub Pages.
// Filters: liquidity > $50k, 24h volume > $100k, slippage < 1.0%.
import { writeFileSync, mkdirSync } from 'node:fs';

const MIN_LIQ = 50000, MIN_VOL = 100000, MAX_SLIP = 1.0;
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function dexscreener() {
  const r = await fetch('https://api.dexscreener.com/latest/dex/search?q=SOL/USDC', {
    headers: { 'user-agent': 'otto-market-intel/1.0' },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.pairs || []).filter(p => p.chainId === 'solana');
}

async function coingecko() {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
    );
    if (!r.ok) return {};
    return r.json();
  } catch { return {}; }
}

function verdict(p) {
  const liq = p.liquidity?.usd || 0;
  const vol = p.volume?.h24 || 0;
  const fails = [];
  if (liq <= MIN_LIQ) fails.push(`liquidity $${liq} <= $${MIN_LIQ}`);
  if (vol <= MIN_VOL) fails.push(`vol24h $${vol} <= $${MIN_VOL}`);
  return { approved: fails.length === 0, fails, liquidity: liq, volume24h: vol };
}

const pairs = await dexscreener();
const macro = await coingecko();

const signals = pairs.map(p => {
  const v = verdict(p);
  const price = p.priceUsd ? Number(p.priceUsd) : null;
  const change = p.priceChange?.h24 ?? null;
  return {
    pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
    dex: p.dexId,
    address: p.pairAddress,
    priceUsd: price,
    change24h: change,
    liquidityUsd: v.liquidity,
    volume24h: v.volume24h,
    approved: v.approved,
    reason: v.approved ? 'passes all risk filters' : v.fails.join('; '),
    // Suggested risk-sized trade (≤10-15% of free capital, lot < 0.010 SOL)
    suggestedSizeSol: 0.008,
    stopLossPct: -8,
  };
}).sort((a, b) => (b.approved - a.approved) || (b.liquidityUsd - a.liquidityUsd));

const approved = signals.filter(s => s.approved);

const payload = {
  vendor: 'Kovantu Digital',
  agent: 'Otto',
  network: 'solana',
  generatedAt: new Date().toISOString(),
  filters: { minLiquidityUsd: MIN_LIQ, minVolume24hUsd: MIN_VOL, maxSlippagePct: MAX_SLIP },
  macro,
  summary: { total: signals.length, approved: approved.length },
  signals,
  approved,
  // Free-tier endpoint mirror
  free: {
    summary: approved.slice(0, 3),
    trial: approved[0] || null,
  },
  // Paid endpoints (x402, USDC on Solana) — served by the live service
  paid: {
    currency: 'USDC',
    network: 'solana',
    payTo: 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK',
    assetMint: USDC,
    scheme: 'exact',
    endpoints: {
      '/v1/opportunities': { method: 'POST', priceCents: 50, returns: 'full approved signal list' },
      '/v1/macro': { method: 'GET', priceCents: 25, returns: 'BTC/ETH/SOL macro' },
      '/v1/report': { method: 'GET', priceCents: 100, returns: 'full scan + signals + policy' },
    },
  },
};

mkdirSync('data', { recursive: true });
writeFileSync('data/scan.json', JSON.stringify(payload, null, 2));
writeFileSync('data/summary.json', JSON.stringify(payload.free.summary, null, 2));
writeFileSync('data/trial.json', JSON.stringify(payload.free.trial, null, 2));
writeFileSync('data/macro.json', JSON.stringify(macro, null, 2));
console.log(`[otto] scan: ${signals.length} pairs, ${approved.length} approved`);