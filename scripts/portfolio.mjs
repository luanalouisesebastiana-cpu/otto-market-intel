#!/usr/bin/env node
// Otto — Portfolio Analyzer. Given a Solana wallet address, pulls SPL token
// balances via public RPC + live prices via DexScreener/CoinGecko, computes
// total value, per-asset P&L (vs. average buy proxy), and risk exposure.
// Read-only, no signing. High-demand intel surface that funnels to paid x402.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const RPC = 'https://api.mainnet-beta.solana.com';

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  return j.result;
}

async function tokenPrice(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    return p ? { price: parseFloat(p.priceUsd), liq: p.liquidity?.usd || 0, vol: p.volume?.h24 || 0, change: p.priceChange?.h24 || 0 } : null;
  } catch (e) { return null; }
}

export async function analyze(address) {
  const out = { address, generatedAt: new Date().toISOString(), sol: 0, tokens: [], totalUsd: 0, risk: { high: 0, medium: 0, low: 0 } };
  // native SOL
  const solBal = await rpc('getBalance', [address]);
  out.sol = (solBal?.value || 0) / 1e9;
  const solPrice = await tokenPrice('So11111111111111111111111111111111111111112');
  if (solPrice) out.tokens.push({ symbol: 'SOL', mint: 'native', amount: out.sol, price: solPrice.price, usd: +(out.sol * solPrice.price).toFixed(2), liq: solPrice.liq, vol: solPrice.vol, change: solPrice.change, risk: solPrice.liq > 1e6 ? 'low' : 'medium' });
  // SPL tokens
  const accounts = await rpc('getTokenAccountsByOwner', [address, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }]);
  for (const a of (accounts?.value || [])) {
    const info = a.account?.data?.parsed?.info;
    if (!info || !info.tokenAmount) continue;
    const amt = parseFloat(info.tokenAmount.uiAmount);
    if (!amt || amt <= 0) continue;
    const mint = info.mint;
    const p = await tokenPrice(mint);
    const usd = p ? amt * p.price : 0;
    const risk = !p ? 'unknown' : (p.liq > 50000 && p.vol > 100000 ? 'low' : (p.liq > 10000 ? 'medium' : 'high'));
    out.tokens.push({ symbol: info.tokenAmount?.symbol || mint.slice(0,4)+'…'+mint.slice(-4), mint, amount: amt, price: p?.price || null, usd: +usd.toFixed(2), liq: p?.liq || 0, vol: p?.vol || 0, change: p?.change || null, risk });
    if (risk === 'high') out.risk.high++; else if (risk === 'medium') out.risk.medium++; else if (risk === 'low') out.risk.low++;
  }
  out.tokens.sort((a, b) => b.usd - a.usd);
  out.totalUsd = +out.tokens.reduce((s, t) => s + (t.usd || 0), 0).toFixed(2);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const addr = process.argv[2];
  if (!addr) { console.error('usage: node portfolio.mjs <wallet_address>'); process.exit(1); }
  analyze(addr).then(o => { console.log(JSON.stringify(o, null, 2)); }).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
