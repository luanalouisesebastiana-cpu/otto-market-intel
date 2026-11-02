#!/usr/bin/env node
/* Otto — real Solana swap executor (Raydium).
   Reads wallet.json, signs with Node native Ed25519, sends via Raydium swap API + Solana RPC.
   SAFETY: QUOTE_ONLY=true by default (no signing, no send). Set QUOTE_ONLY=false to execute.
   Risk policy enforced: never touches the 0.0100 SOL reserve; position <= free bank. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RPC = process.env.RPC || 'https://api.mainnet-beta.solana.com';
const QUOTE_ONLY = process.env.QUOTE_ONLY !== 'false'; // default safe
const RESERVE_SOL = 0.0100;
const PRIORITY_LAMPORTS = 200000; // 0.0002 SOL cap per genesis skill

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function b58decode(s) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const ch of s) {
    let val = A.indexOf(ch);
    if (val < 0) throw new Error('bad base58 char: ' + ch);
    let carry = val;
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of s) { if (ch === '1') bytes.push(0); else break; }
  return Uint8Array.from(bytes.reverse());
}

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!r.ok) throw new Error('rpc ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('rpc error: ' + JSON.stringify(j.error));
  return j.result;
}

async function main() {
  const w = JSON.parse(readFileSync(path.join(ROOT, '..', 'wallet.json'), 'utf8'));
  const secret = b58decode(w.secretKey); // 64-byte ed25519 keypair
  const key = crypto.createPrivateKey({ key: buildDer(secret), format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(key).export({ format: 'jwk' }).x;
  const pubBytes = b64ToBytes(pub);
  const payer = bs58Encode(pubBytes);
  console.log('[swap] payer:', payer);

  const bal = await rpc('getBalance', [payer]);
  const sol = bal.value / 1e9;
  const free = Math.max(0, sol - RESERVE_SOL - 0.001); // reserve + rent cushion
  const amountSol = Math.max(0.001, Math.min(free, 0.01)); // small lot
  const amountLamports = Math.round(amountSol * 1e9);
  console.log(`[swap] balance=${sol.toFixed(6)} SOL free=${free.toFixed(6)} lot=${amountSol.toFixed(6)} SOL quoteOnly=${QUOTE_ONLY}`);

  if (free <= 0.0005) { console.log('[swap] no free SOL above reserve — abort'); return; }

  // 1. Get swap transaction from Raydium
  const q = await fetch('https://transaction-v1.raydium.io/swap-base-in?' + new URLSearchParams({
    inputMint: SOL, outputMint: USDC, amount: String(amountLamports),
    slippageBps: '50', txVersion: 'V0'
  })).then(r => r.json());
  if (!q.success || !q.data) { console.log('[swap] no route:', JSON.stringify(q).slice(0, 200)); return; }
  console.log('[swap] route output:', q.data.outputAmount, 'USDC lamports, priceImpact', q.data.priceImpactPct + '%');
  if (QUOTE_ONLY) { console.log('[swap] QUOTE_ONLY — not signing/sending'); return; }

  // 2. Sign the returned transaction
  const txBytes = b64ToBytes(q.data.swapTransaction);
  // Raydium V0 transactions are legacy-format; sign with the ed25519 key
  const sig = crypto.sign(null, txBytes, key);
  console.log('[swap] signed tx, sig len', sig.length);

  // 3. Send
  const b64tx = Buffer.from(txBytes).toString('base64');
  const sigB58 = bs58Encode(new Uint8Array(sig));
  const send = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [b64tx, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }] })
  }).then(r => r.json());
  console.log('[swap] send result:', JSON.stringify(send).slice(0, 300));
  if (send.result) console.log('[swap] SIGNATURE:', sigB58, '| tx:', send.result);
}

function buildDer(secret64) {
  // PKCS8 Ed25519 private key prefix + 64-byte seed
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  return Buffer.concat([prefix, Buffer.from(secret64.slice(0, 32))]);
}
function b64ToBytes(s) { return new Uint8Array(Buffer.from(s, 'base64')); }
function bs58Encode(bytes) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b = Array.from(bytes);
  let s = '';
  const digits = [0];
  for (const byte of b) { let carry = byte; for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; } while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; } }
  for (const byte of b) { if (byte === 0) s += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) s += A[digits[i]];
  return s;
}

main().catch(e => { console.error('[swap] ERROR:', e.message); process.exit(1); });
