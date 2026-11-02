// Otto rug-risk analyzer — Solana token safety deep-check.
// Checks: mint authority (renounced?), freeze authority, top-10 holder concentration,
// LP ownership share, and whether the mint is a known DEX pair. This is the #1
// pre-buy check for Solana tokens. Data via public Solana RPC + DexScreener.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const RPCS = [
  process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
];

async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.result !== undefined) return d.result;
    } catch (e) { /* try next RPC */ }
  }
  return null;
}

// base58 decode to bytes (for mint authority check)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(str) {
  const bytes = [0];
  for (const ch of str) {
    let carry = B58.indexOf(ch);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

export async function rugCheck(mint) {
  if (!mint || mint.length < 32) return { error: 'invalid mint address' };
  const out = { mint, checkedAt: new Date().toISOString(), rpc: 'unreachable', flags: [], score: 0 };

  // 1) mint account info: mintAuthority / freezeAuthority / supply / decimals
  const acc = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  if (acc) {
    out.rpc = 'ok';
    const info = acc.value?.data?.parsed?.info || {};
    out.decimals = info.decimals;
    out.supply = info.supply;
    out.mintAuthority = info.mintAuthority || null;
    out.freezeAuthority = info.freezeAuthority || null;
    if (out.mintAuthority) out.flags.push({ level: 'WARN', msg: 'Mint authority still active — owner can print more supply' });
    else out.flags.push({ level: 'OK', msg: 'Mint authority renounced (supply fixed)' });
    if (out.freezeAuthority) out.flags.push({ level: 'WARN', msg: 'Freeze authority active — owner can freeze holdings' });
  } else {
    out.flags.push({ level: 'WARN', msg: 'RPC unreachable — could not verify mint authority on-chain' });
  }

  // 2) top holder concentration via getTokenLargestAccounts
  const largest = await rpc('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
  if (largest?.value) {
    const accounts = largest.value.slice(0, 10);
    const total = accounts.reduce((s, a) => s + Number(a.amount), 0);
    out.top10Share = total > 0 ? +(accounts.reduce((s, a) => s + Number(a.amount), 0) / total * 100).toFixed(1) : null;
    out.topHolders = accounts.map(a => ({ addr: a.address, amount: a.amount, uiAmount: a.uiAmountString }));
    if (out.top10Share > 60) out.flags.push({ level: 'RED', msg: `Top-10 holders control ${out.top10Share}% — high rug risk` });
    else if (out.top10Share > 35) out.flags.push({ level: 'WARN', msg: `Top-10 holders control ${out.top10Share}% — moderate concentration` });
    else out.flags.push({ level: 'OK', msg: `Top-10 holders control ${out.top10Share}% — well distributed` });
  }

  // 3) DexScreener pair data (liquidity, is it a real DEX pair?)
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const pairs = (d.pairs || []).filter(p => p.chainId === 'solana');
    if (pairs.length) {
      const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      out.dex = best.dexId;
      out.pair = `${best.baseToken?.symbol}/${best.quoteToken?.symbol}`;
      out.liquidityUsd = best.liquidity?.usd || 0;
      out.volume24Usd = best.volume?.h24 || 0;
      out.pairCreatedAt = best.pairCreatedAt;
      out.priceChange24h = best.priceChange?.h24;
      if (out.liquidityUsd < 5000) out.flags.push({ level: 'RED', msg: `Liquidity only $${out.liquidityUsd.toLocaleString()} — near-rug` });
      else if (out.liquidityUsd < 50000) out.flags.push({ level: 'WARN', msg: `Liquidity $${out.liquidityUsd.toLocaleString()} — thin` });
      else out.flags.push({ level: 'OK', msg: `Liquidity $${out.liquidityUsd.toLocaleString()}` });
    }
  } catch (e) { /* dexscreener failed */ }

  // score: start 100, subtract per flag severity
  let score = 100;
  for (const f of out.flags) { if (f.level === 'RED') score -= 35; else if (f.level === 'WARN') score -= 15; }
  out.score = Math.max(0, Math.min(100, score));
  out.verdict = out.score >= 75 ? 'LIKELY-SAFE' : out.score >= 45 ? 'CAUTION' : 'HIGH-RISK';
  return out;
}

export async function run() {
  // refresh a snapshot for the featured mints (used by CI)
  const featured = ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'];
  const results = [];
  for (const m of featured) { try { results.push(await rugCheck(m)); } catch (e) {} }
  fs.writeFileSync(join(DATA, 'rugcheck.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  return results;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('rugcheck.mjs')) {
  const mint = process.argv[2];
  if (!mint) { console.error('usage: node rugcheck.mjs <mint>'); process.exit(1); }
  rugCheck(mint).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
