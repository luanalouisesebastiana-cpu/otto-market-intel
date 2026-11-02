#!/usr/bin/env node
// Otto — EXECUTE + VERIFY (final half of the genesis Jev loop).
// Reads the last autonomous decision; ONLY acts when ALL of:
//   decision === 'ENTER', validation passed, freshness passed, EXECUTE=true
// Then runs the real swap executor (scripts/swap.mjs with QUOTE_ONLY=false),
// verifies the bank balance changed on-chain, and records outcome.
// Safe default: EXECUTE !== 'true' -> dry-run, no signing, no funds moved.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const ROOT = join(__dirname, '..');

const EXECUTE = process.env.EXECUTE === 'true';
const RESERVE_SOL = 0.0100;
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s){const b=[0];for(const c of s){let v=A.indexOf(c);if(v<0)throw new Error('bad b58');let carry=v;for(let i=0;i<b.length;i++){carry+=b[i]*58;b[i]=carry&255;carry>>=8;}while(carry>0){b.push(carry&255);carry>>=8;}}for(const c of s){if(c==='1')b.push(0);else break;}return Uint8Array.from(b.reverse());}
function bs58enc(bytes){const b=Array.from(bytes);let s='';const d=[0];for(const x of b){let c=x;for(let i=0;i<d.length;i++){c+=d[i]<<8;d[i]=c%58;c=(c/58)|0;}while(c>0){d.push(c%58);c=(c/58)|0;}}for(const x of b){if(x===0)s+='1';else break;}for(let i=d.length-1;i>=0;i--)s+=A[d[i]];return s;}
async function balance() {
  try {
    const w = JSON.parse(fs.readFileSync(join(ROOT, '..', 'wallet.json'), 'utf8'));
    const payer = bs58enc(b58dec(w.secretKey).slice(32));
    const r = await fetch('https://api.mainnet-beta.solana.com', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[payer]}) });
    const j = await r.json();
    return { payer, sol: (j.result?.value||0)/1e9 };
  } catch(e){ return { payer:null, sol:null, error:e.message }; }
}

export async function run() {
  let dec;
  try { dec = JSON.parse(fs.readFileSync(join(DATA,'autonomous.json'),'utf8')); }
  catch(e){ return { ok:false, note:'no autonomous decision to execute' }; }

  const canEnter = dec.decision === 'ENTER' && Array.isArray(dec.validation) && dec.validation.every(x=>x.endsWith('PASS')) && dec.freshness;
  const pre = await balance();

  const record = {
    cycle: new Date().toISOString(),
    decision: dec.decision,
    executeEnabled: EXECUTE,
    acted: false,
    reason: null,
    preBalanceSol: pre.sol,
    postBalanceSol: null,
    deltaSol: null,
    txSignature: null,
  };

  if (!canEnter) { record.reason = 'decision is not a validated ENTER — nothing to execute'; }
  else if (!EXECUTE) { record.reason = 'EXECUTE not enabled — dry-run only (no funds moved)'; }
  else {
    // run the real swap executor (it enforces reserve + fee cap internally)
    try {
      const out = execFileSync('node', [join(ROOT,'scripts','swap.mjs')], { env: { ...process.env, QUOTE_ONLY:'false' }, encoding:'utf8', timeout: 60000 });
      record.txLog = out.split('\n').slice(-4).join('\n');
      const m = out.match(/SIGNATURE:\s*(\S+)/);
      if (m) record.txSignature = m[1];
      record.acted = !!m;
      record.reason = record.acted ? 'swap signed + submitted' : 'swap produced no signature (aborted by safety guard)';
    } catch(e) { record.reason = 'swap executor failed: ' + e.message; }
  }

  // VERIFY: re-read balance, confirm it moved as expected
  const post = await balance();
  record.postBalanceSol = post.sol;
  if (pre.sol != null && post.sol != null) {
    record.deltaSol = +(post.sol - pre.sol).toFixed(6);
    record.verified = record.acted ? (record.deltaSol < 0) : true; // a buy spends SOL
  }
  fs.appendFileSync(join(DATA,'executions.jsonl'), JSON.stringify(record)+'\n');
  fs.writeFileSync(join(DATA,'execution.json'), JSON.stringify(record,null,2));
  console.log(`[execute] ${record.acted?'EXECUTED':'SKIPPED'} — ${record.reason}${record.deltaSol!=null?` | Δ=${record.deltaSol} SOL`:''}`);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[execute] ERROR:', e.message); process.exit(1); });
}
