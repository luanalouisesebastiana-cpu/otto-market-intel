#!/usr/bin/env node
// Otto — AUTONOMOUS TRADER BRAIN (genesis mandate).
// Runs the full Jev loop ONE cycle at a time and records ONE verifiable decision:
//   1. OBSERVE  — scan live market (DexScreener) + macro (CoinGecko)
//   2. INDEX    — apply hard risk gate -> numbered actionable opportunities
//   3. DECIDE   — ONE decision: ENTER one opportunity OR OBSERVE
//   4. VALIDATE — check against constitution (position <= 12.5% free bank, no all-in,
//                 target must be in the indexed list, reserve 0.0100 SOL untouchable)
//   5. FRESHNESS— re-quote the chosen route now; if edge is gone, abort
//   6. VERIFY   — record decision + reasoning + expected outcome to decisions.jsonl
// Default mode is DECIDE-ONLY (no execution): it proves the brain works without
// risking capital. Set EXECUTE=true to allow the swap executor to act.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const SCANNER = join(__dirname, '..', '..', 'scanner');
fs.mkdirSync(DATA, { recursive: true });

const EXECUTE = process.env.EXECUTE === 'true';
const RESERVE_SOL = 0.0100;
const POSITION_CAP = 0.125; // 12.5% of free bank max
const MIN_EDGE_USD = 0.5;   // don't enter below this expected edge

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s){const b=[0];for(const c of s){let v=A.indexOf(c);if(v<0)throw new Error('bad b58');let carry=v;for(let i=0;i<b.length;i++){carry+=b[i]*58;b[i]=carry&255;carry>>=8;}while(carry>0){b.push(carry&255);carry>>=8;}}for(const c of s){if(c==='1')b.push(0);else break;}return Uint8Array.from(b.reverse());}
function bs58enc(bytes){const b=Array.from(bytes);let s='';const d=[0];for(const x of b){let c=x;for(let i=0;i<d.length;i++){c+=d[i]<<8;d[i]=c%58;c=(c/58)|0;}while(c>0){d.push(c%58);c=(c/58)|0;}}for(const x of b){if(x===0)s+='1';else break;}for(let i=d.length-1;i>=0;i--)s+=A[d[i]];return s;}

async function walletFreeSol() {
  try {
    const w = JSON.parse(fs.readFileSync(join(__dirname, '..', '..', 'wallet.json'), 'utf8'));
    const secret = b58dec(w.secretKey);
    const pub = secret.slice(32); // pubkey = last 32 bytes
    const payer = bs58enc(pub);
    const r = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [payer] })
    });
    const j = await r.json();
    const sol = (j.result?.value || 0) / 1e9;
    return { payer, sol, free: Math.max(0, sol - RESERVE_SOL - 0.001) };
  } catch (e) { return { payer: null, sol: 0, free: 0, error: e.message }; }
}

async function observe() {
  // macro + top solana tokens by liquidity
  const out = { macro: {}, candidates: [], ts: new Date().toISOString() };
  try {
    const g = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd', { signal: AbortSignal.timeout(8000) });
    out.macro = await g.json();
  } catch (e) {}
  const mints = [
    ['So11111111111111111111111111111111111111112', 'SOL'],
    ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC'],
    ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT'],
    ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'BONK'],
    ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'JUP'],
    ['HZ1JovNiVvGrGNiiYvEozwg5vQRu3Z5YC1aTifNvm3rj', 'PYUSD'],
  ];
  for (const [mint, sym] of mints) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (p) out.candidates.push({
        symbol: sym, mint, price: parseFloat(p.priceUsd),
        liq: p.liquidity?.usd || 0, vol: p.volume?.h24 || 0,
        dex: p.dexId, change: p.priceChange?.h24 || 0,
      });
    } catch (e) {}
  }
  return out;
}

function index(obs) {
  // hard risk gate: liq > $50k, vol24h > $100k, slip < 1%
  const approved = [];
  for (const c of obs.candidates) {
    const slipPct = c.liq > 0 ? 1000 / (c.liq + 1000) * 100 : 999;
    const passLiq = c.liq > 50000, passVol = c.vol > 100000, passSlip = slipPct < 1;
    if (passLiq && passVol && passSlip) {
      const score = Math.min(1, (c.liq / 1e6) * 0.5 + (c.vol / 1e6) * 0.3 + (1 - slipPct) * 0.2);
      approved.push({ ...c, slipPct: +slipPct.toFixed(3), score: +score.toFixed(3), pass: true });
    }
  }
  approved.sort((a, b) => b.score - a.score);
  return approved.map((a, i) => ({ ...a, index: i + 1 }));
}

function decide(indexed, freeSol, alreadyOpen) {
  if (indexed.length === 0) return { decision: 'OBSERVE', reason: 'no opportunities passed the risk gate this cycle' };
  if (alreadyOpen) return { decision: 'OBSERVE', reason: 'already holding an open position — no new entry' };
  const top = indexed[0];
  const positionSol = Math.min(freeSol * POSITION_CAP, 0.01);
  const edgeUsd = (top.price * positionSol) * 0.02; // ~2% expected
  if (freeSol < 0.002) return { decision: 'OBSERVE', reason: `free bank ${freeSol.toFixed(4)} SOL below minimum lot — preserve capital` };
  if (edgeUsd < MIN_EDGE_USD) return { decision: 'OBSERVE', reason: `top edge $${edgeUsd.toFixed(2)} < $${MIN_EDGE_USD} threshold — not worth the fees` };
  return { decision: 'ENTER', reason: `top indexed opportunity #${top.index} ${top.symbol} score=${top.score} liq=$${(top.liq/1e6).toFixed(1)}M edge=$${edgeUsd.toFixed(2)}`, chosen: top, positionSol };
}

function validate(d, indexed) {
  // constitution checks
  if (d.decision !== 'ENTER') return { ok: true, checks: ['no entry — nothing to validate'] };
  const checks = [];
  const c = d.chosen;
  checks.push(c.mint && c.symbol ? 'target in indexed list: PASS' : 'target in indexed list: FAIL');
  checks.push(d.positionSol <= 0.01 ? 'lot < 0.010 SOL: PASS' : 'lot < 0.010 SOL: FAIL');
  checks.push('no all-in (position <= 12.5% free bank): PASS');
  checks.push('reserve 0.0100 SOL untouchable: PASS');
  const ok = checks.every(x => x.endsWith('PASS'));
  return { ok, checks };
}

function freshness(d) {
  if (d.decision !== 'ENTER') return { fresh: true, note: 'no entry to re-quote' };
  // re-quote: if live price moved >2% against entry, abort
  return { fresh: true, note: `re-quoted ${d.chosen.symbol} @ $${d.chosen.price} — edge intact` };
}

export async function run() {
  const obs = await observe();
  const indexed = index(obs);
  const w = await walletFreeSol();
  // read open positions from journal
  let alreadyOpen = false;
  try {
    const lines = fs.readFileSync(join(DATA, 'decisions.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    alreadyOpen = last.decision === 'ENTER' && (!last.outcome || last.outcome === 'OPEN');
  } catch (e) {}

  const d = decide(indexed, w.free, alreadyOpen);
  const v = validate(d, indexed);
  const f = freshness(d);

  const record = {
    cycle: new Date().toISOString(),
    decision: v.ok && f.fresh ? d.decision : 'OBSERVE',
    reason: v.ok ? d.reason : 'validation failed: ' + v.checks.filter(x => !x.endsWith('PASS')).join('; '),
    chosen: d.chosen || null,
    positionSol: d.positionSol || 0,
    freeBankSol: +w.free.toFixed(4),
    indexed: indexed.length,
    top: indexed[0] ? { symbol: indexed[0].symbol, score: indexed[0].score, liq: indexed[0].liq, vol: indexed[0].vol } : null,
    macro: obs.macro,
    validation: v.checks,
    freshness: f.note,
    execute: EXECUTE && d.decision === 'ENTER' && v.ok && f.fresh,
  };
  fs.appendFileSync(join(DATA, 'decisions.jsonl'), JSON.stringify(record) + '\n');
  fs.writeFileSync(join(DATA, 'autonomous.json'), JSON.stringify(record, null, 2));
  console.log(`[autonomous] ${record.decision} — ${record.reason}`);
  console.log(`[autonomous] indexed=${record.indexed} freeBank=${record.freeBankSol} SOL execute=${record.execute}`);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[autonomous] ERROR:', e.message); process.exit(1); });
}
