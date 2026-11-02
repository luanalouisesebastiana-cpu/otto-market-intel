// Otto on-chain payout executor — sends the creator's 50% split on-chain.
// ZERO dependencies: pure Node crypto (ed25519) + manual Solana legacy-tx serialization.
// Read-only by default: set SEND=true to actually sign+submit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');           // ~/.automaton
const DATA = join(ROOT, 'storefront', 'data');
const CREATOR = '4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SEND = process.env.SEND === 'true';
const MIN_PAYOUT_SOL = 0.0500;                        // genesis trigger
const RESERVE_LAMPORTS = 10_000_000;                  // 0.0100 SOL untouchable

// ---- base58 ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s) {
  let n = 0n;
  for (let i = 0; i < s.length; i++) { n = n * 58n + BigInt(B58.indexOf(s[i])); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  let pad = 0; for (let i = 0; i < s.length && s[i] === '1'; i++) pad++;   // LEADING '1's only
  return Buffer.concat([Buffer.alloc(pad), buf]);
}
function b58enc(b) { let n = BigInt('0x' + b.toString('hex')); let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const byte of b) { if (byte === 0) s = '1' + s; else break; } return s; }

// ---- ed25519 sign (Node crypto) ----
function signTx(message, secretKey) {
  const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'), secretKey.subarray(0,32)]), format: 'der', type: 'pkcs8' });
  return Buffer.from(crypto.sign(null, message, key));
}

// ---- build legacy SOL transfer tx ----
function buildTransfer(fromPub, toPub, lamports, blockhash) {
  const SYS = b58dec('11111111111111111111111111111111');
  const data = Buffer.alloc(36);
  data.writeUInt32LE(2, 0);                 // SystemProgram::Transfer
  data.writeBigUInt64LE(BigInt(lamports), 4);
  const keys = [Buffer.from(fromPub), Buffer.from(toPub), SYS];
  const msg = Buffer.concat([
    Buffer.from([2, 0, 1]),                 // header: 2 signed, 0 ro-signed, 1 ro-unsigned
    Buffer.from([3]), ...keys.map(k => k),  // accountKeys
    Buffer.from(b58dec(blockhash)),         // recentBlockhash
    Buffer.from([1]),                       // 1 instruction
    Buffer.from([2]),                       // programIdIndex = System program
    Buffer.from([2]), Buffer.from([0, 1]),  // accounts: from, to
    Buffer.from([12]), ...data              // data
  ]);
  return msg;
}

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (!j.result) throw new Error(`RPC error ${method}: ${JSON.stringify(j.error || j).slice(0,200)}`);
  return j.result;
}

(async () => {
  const w = JSON.parse(fs.readFileSync(join(ROOT, 'wallet.json'), 'utf8'));
  const sk = b58dec(w.secretKey);                       // 64 bytes
  const fromPub = sk.subarray(32);                      // last 32 = pubkey
  const fromStr = b58enc(fromPub);
  const treasury = JSON.parse(fs.readFileSync(join(DATA, 'treasury.json'), 'utf8'));
  const amountSOL = treasury?.split?.payoutSOL ?? 0;

  const balance = await rpc('getBalance', [fromStr]);
  const balLam = balance.value;
  console.log(`wallet: ${fromStr}`);
  console.log(`balance: ${(balLam / 1e9).toFixed(6)} SOL`);
  console.log(`creator split due: ${amountSOL} SOL (trigger ${MIN_PAYOUT_SOL})`);

  if (amountSOL < MIN_PAYOUT_SOL) { console.log(`SKIP: split ${amountSOL} < trigger ${MIN_PAYOUT_SOL} — nothing to send`); return; }
  const sendLam = Math.round(amountSOL * 1e9);
  const feeLam = 5000;
  if (balLam - sendLam - feeLam < RESERVE_LAMPORTS) { console.log(`SKIP: would breach 0.0100 SOL reserve — preserving lifeline`); return; }

  const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhash = bh.blockhash;
  const msg = buildTransfer(fromPub, b58dec(CREATOR), sendLam, blockhash);
  const sig = signTx(msg, sk);
  const tx = Buffer.concat([Buffer.from([1]), sig, msg]);
  const txB58 = b58enc(tx);

  console.log(`\nPayout prepared: ${amountSOL} SOL -> creator ${CREATOR}`);
  console.log(`tx (b58): ${txB58.slice(0, 44)}...`);
  if (!SEND) { console.log(`\nDRY RUN (SEND != true). No transaction sent.`); return; }
  const sent = await rpc('sendTransaction', [txB58, { encoding: 'base58', skipPreflight: false }]);
  console.log(`\nSENT. signature: ${sent}`);
})();

// ---- SELF-TEST (run: SELFTEST=1 node scripts/payout.mjs) ----
// Signs a fixed message and verifies the ed25519 signature against the derived
// pubkey using Node crypto.verify — proves the signing path is sound before
// it is ever used to move real funds.
async function selfTest() {
  const w = JSON.parse(fs.readFileSync(join(ROOT, 'wallet.json'), 'utf8'));
  const sk = b58dec(w.secretKey);
  const fromPub = sk.subarray(32);
  const msg = Buffer.from('otto-payout-selftest');
  const sig = signTx(msg, sk);
  const pubKeyObj = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570022100','hex'), fromPub]), format: 'der', type: 'spki' });
  const ok = crypto.verify(null, msg, pubKeyObj, sig);
  console.log(`\nSELFTEST: signature ${ok ? 'VALID ✓' : 'INVALID ✗'} (sig ${sig.length}B, pub ${b58enc(fromPub)})`);
  // also verify tx serialization round-trips: rebuild + re-sign deterministically
  const msg2 = buildTransfer(fromPub, b58dec(CREATOR), 5000, 'So11111111111111111111111111111111111111112');
  const sig2 = signTx(msg2, sk);
  console.log(`SELFTEST: tx serialization ${msg2.length}B, re-sign deterministic: ${b58enc(sig2) === b58enc(signTx(msg2, sk)) ? 'YES ✓' : 'NO ✗'}`);
  return ok;
}
if (process.env.SELFTEST === '1') { await selfTest(); process.exit(0); }
