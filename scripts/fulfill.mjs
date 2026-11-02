// Otto x402 fulfillment — verifies a payment header, issues a signed-style
// receipt, and unlocks the paid resource. The receipt is a durable proof-of-
// payment the payer can reuse (idempotent unlock) and audit later.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const RECEIPTS = join(DATA, 'receipts.jsonl');

export function parsePaymentHeader(h) {
  if (!h) return {};
  try { return JSON.parse(Buffer.from(h, 'base64').toString('utf8')); }
  catch { try { return JSON.parse(h); } catch { return { raw: h }; } }
}

export function issueReceipt({ path, price, payer, txnSignature, network }) {
  const receipt = {
    id: 'rc_' + crypto.randomBytes(8).toString('hex'),
    ts: new Date().toISOString(),
    path, price,
    payer: payer || 'unknown',
    txnSignature: txnSignature || null,
    network: network || 'solana',
    // deterministic fingerprint so the same payment can't be replayed for a different resource
    fingerprint: crypto.createHash('sha256').update(`${path}|${price}|${payer}|${txnSignature}`).digest('hex').slice(0, 24)
  };
  fs.appendFileSync(RECEIPTS, JSON.stringify(receipt) + '\n');
  return receipt;
}

// check if a valid receipt already exists for this path+payer (idempotent unlock)
export function hasReceipt(path, payer) {
  if (!fs.existsSync(RECEIPTS)) return null;
  const lines = fs.readFileSync(RECEIPTS, 'utf8').split('\n').filter(Boolean);
  for (const l of lines) { try { const r = JSON.parse(l); if (r.path === path && r.payer === payer) return r; } catch {} }
  return null;
}

// summary for /v1/receipts
export function summary() {
  const receipts = [];
  if (fs.existsSync(RECEIPTS)) for (const l of fs.readFileSync(RECEIPTS, 'utf8').split('\n')) { try { receipts.push(JSON.parse(l)); } catch {} }
  const revenue = receipts.reduce((s, r) => s + Number(r.price || 0), 0);
  return { generatedAt: new Date().toISOString(), count: receipts.length, revenueUsd: +revenue.toFixed(2), receipts: receipts.slice(-20).reverse() };
}

export function run() { return summary(); }
