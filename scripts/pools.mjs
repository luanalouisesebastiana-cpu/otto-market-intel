// Otto new-pool launch feed — scans DexScreener for the newest Solana pairs.
// Genesis scanner directive: monitor new Raydium/Orca pools (liq, volume, age).
// Outputs data/pools.json: pairs sorted by creation time, with risk flags.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

// tokens to seed the scan with (major Solana mints — broad discovery)
const SEEDS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', // PYTH
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT
  'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82', // MEW
];
const AGE_MS = 24 * 60 * 60 * 1000; // new = created < 24h ago
const now = Date.now();

function riskFlag(pair) {
  const liq = pair.liquidity?.usd || 0;
  const vol = pair.volume?.h24 || 0;
  const age = now - (pair.pairCreatedAt || 0);
  if (liq < 5000) return { level: 'LOW-LIQ', color: 'red' };
  if (liq < 50000) return { level: 'CAUTION', color: 'orange' };
  if (vol < 1000) return { level: 'NO-VOL', color: 'red' };
  return { level: 'PASS', color: 'green' };
}

export async function scanPools() {
  const out = [];
  for (const seed of SEEDS) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${seed}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of (d.pairs || [])) {
        if (p.chainId !== 'solana') continue;
        const age = now - (p.pairCreatedAt || 0);
        if (age < AGE_MS) {
          const f = riskFlag(p);
          out.push({
            pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
            dex: p.dexId, mint: p.baseToken?.address, pairAddress: p.pairAddress,
            priceUsd: p.priceUsd, liqUsd: +(p.liquidity?.usd||0).toFixed(0),
            vol24Usd: +(p.volume?.h24||0).toFixed(0),
            ageMin: Math.round(age/60000), change24h: p.priceChange?.h24,
            risk: f.level, riskColor: f.color, url: p.url
          });
        }
      }
    } catch (e) { /* seed failed, continue */ }
  }
  out.sort((a,b) => a.ageMin - b.ageMin);
  return out;
}

export async function run() {
  const pools = await scanPools();
  const snapshot = { generatedAt: new Date().toISOString(), count: pools.length, pools };
  fs.writeFileSync(join(DATA, 'pools.json'), JSON.stringify(snapshot, null, 2));
  console.log(`pools: ${pools.length} new pairs (<24h)`);
  return snapshot;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('pools.mjs')) {
  run().catch(e => { console.error(e.message); process.exit(1); });
}
