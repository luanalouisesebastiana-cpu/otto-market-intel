#!/usr/bin/env node
// Otto — Token Holder Distribution Analyzer. For any SPL mint, computes:
//   - top-N largest holders + their share of supply
//   - whale concentration (top 10 share)
//   - Gini coefficient (inequality of holdings)
//   - effective holder count (accounts with > 0.1% supply)
// Read-only via public RPC getTokenLargestAccounts + getSupply.
// Rug/pull signal: extreme top-10 concentration = dump risk.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const RPC = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

async function rpcOnce(method, params) {
  const r = await fetch(RPC, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) , signal: AbortSignal.timeout(8000)});
  const j = await r.json();
  return j.result;
}
async function rpc(method, params) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { const v = await rpcOnce(method, params); if (v !== undefined && v !== null) return v; }
    catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  throw lastErr || new Error('rpc failed');
}

function gini(values) {
  // values sorted ascending; standard Gini mean-difference formula
  const n = values.length;
  if (!n) return null;
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum === 0) return null;
  let num = 0;
  for (let i = 0; i < n; i++) num += values[i] * (i + 1);
  return +( (2 * num) / (n * sum) - (n + 1) / n ).toFixed(4);
}

export async function analyze(mint) {
  const out = { mint, generatedAt: new Date().toISOString(), topHolders: [], metrics: {}, note: '' };
  try {
    const supply = await rpc('getTokenSupply', [mint]);
    const total = parseFloat(supply?.value?.uiAmount || 0);
    out.totalSupply = total;
    if (!total) { out.note = 'no supply returned'; return out; }
    const largest = await rpc('getTokenLargestAccounts', [mint]);
    const accts = largest?.value || [];
    out.topHolders = accts.slice(0, 20).map((a, i) => ({
      rank: i + 1, address: a.address,
      amount: parseFloat(a.uiAmountString ?? a.amount),
      pct: +((parseFloat(a.uiAmountString ?? a.amount) / total) * 100).toFixed(4),
    }));
    const shares = out.topHolders.map(h => h.amount);
    const top10Share = out.topHolders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
    const top1Share = out.topHolders[0]?.pct || 0;
    // effective holders: accounts holding >= 0.1%
    const eff = out.topHolders.filter(h => h.pct >= 0.1).length;
    out.metrics = {
      top1Pct: +top1Share.toFixed(3),
      top10Pct: +top10Share.toFixed(3),
      effectiveHolders: eff,
      gini: gini(shares.sort((a, b) => a - b)),
    };
    // rug verdict
    if (top10Share > 70 || top1Share > 40) out.verdict = 'HIGH_CONCENTRATION — dump risk';
    else if (top10Share > 50) out.verdict = 'ELEVATED — concentrated';
    else out.verdict = 'DISTRIBUTED — lower concentration risk';
  } catch (e) { out.note = e.message; }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mint = process.argv[2];
  if (!mint) { console.error('usage: node holders.mjs <mint>'); process.exit(1); }
  analyze(mint).then(o => console.log(JSON.stringify(o, null, 2))).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
