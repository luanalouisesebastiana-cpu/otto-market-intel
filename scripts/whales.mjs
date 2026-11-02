#!/usr/bin/env node
// Otto — Whale Transaction Monitor. Scans Solana for large transactions involving
// major tokens, flags whale-sized movements, and writes a verifiable alert feed.
// High-demand crypto intel: whale accumulation/distribution is a leading indicator.
// Read-only: public RPC reads, no signing.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const RPC = 'https://api.mainnet-beta.solana.com';
const WHALE_THRESHOLD_USD = 100_000; // minimum notional to flag

// major token mints to watch (whale movements in these are signal)
const WATCHED = [
  ['So11111111111111111111111111111111111111112', 'SOL'],
  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC'],
  ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT'],
  ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'BONK'],
  ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'JUP'],
];

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
    return p ? parseFloat(p.priceUsd) : null;
  } catch (e) { return null; }
}

export async function run() {
  const out = { generatedAt: new Date().toISOString(), thresholdUsd: WHALE_THRESHOLD_USD, whales: [], scanned: 0, note: '' };
  // Strategy: scan recent signatures for watched token accounts, decode transfers.
  // Public RPC getSignaturesForAddress + getTransaction gives us transfer data.
  for (const [mint, sym] of WATCHED) {
    const price = await tokenPrice(mint);
    if (!price) continue;
    try {
      const sigs = await rpc('getSignaturesForAddress', [mint, { limit: 20 }]);
      for (const s of sigs.slice(0, 10)) {
        out.scanned++;
        try {
          const tx = await rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
          if (!tx) continue;
          // scan inner instructions for token transfers of this mint
          const instrs = [...(tx.transaction?.message?.instructions || []), ...(tx.meta?.innerInstructions || []).flatMap(i => i.instructions)];
          for (const ix of instrs) {
            const parsed = ix.parsed;
            if (parsed?.type === 'transferChecked' && parsed.info?.mint === mint) {
              const amt = parseFloat(parsed.info.tokenAmount?.uiAmount || 0);
              const usd = amt * price;
              if (usd >= WHALE_THRESHOLD_USD) {
                out.whales.push({
                  mint, symbol: sym, amount: amt, usd: +usd.toFixed(2),
                  from: parsed.info.source, to: parsed.info.destination,
                  sig: s.signature, slot: tx.slot, time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
                });
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) { out.note += `${sym}: ${e.message}; `; }
  }
  out.whales.sort((a, b) => b.usd - a.usd);
  out.whales = out.whales.slice(0, 50);
  fs.writeFileSync(join(DATA, 'whales.json'), JSON.stringify(out, null, 2));
  console.log(`[whales] scanned ${out.scanned} txs, ${out.whales.length} whale moves ≥ $${WHALE_THRESHOLD_USD}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[whales] ERROR:', e.message); process.exit(1); });
}
