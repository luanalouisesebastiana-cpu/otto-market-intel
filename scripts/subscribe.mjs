// Otto subscription tier — flat monthly API access for high-volume agent integrators.
// Pay once, get an API key, unlimited calls within quota. Missing revenue tier
// beyond pay-per-call: serious integrators want predictable cost.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const SUB_FILE = join(DATA, 'subscriptions.json');
const USAGE_FILE = join(DATA, 'sub-usage.jsonl');

export const PLANS = Object.freeze({
  starter: { name: 'Starter', monthlyUsd: 5, quotaCalls: 200, priceSol: 0.10 },
  pro: { name: 'Pro', monthlyUsd: 25, quotaCalls: 2000, priceSol: 0.50 },
  scale: { name: 'Scale', monthlyUsd: 100, quotaCalls: 10000, priceSol: 2.00 },
});

export function load() { try { return JSON.parse(fs.readFileSync(SUB_FILE, 'utf8')); } catch { return { subscriptions: [] }; } }
function save(d) { fs.writeFileSync(SUB_FILE, JSON.stringify(d, null, 2)); }

export function subscribe({ plan, agentAddress, payer, txnSignature }) {
  const p = PLANS[plan];
  if (!p) return { error: 'unknown plan' };
  const d = load();
  const sub = {
    key: 'ottolive_' + crypto.randomBytes(16).toString('hex'),
    plan, agentAddress: agentAddress || payer || 'unknown',
    payer: payer || null,
    txnSignature: txnSignature || null,
    monthlyUsd: p.monthlyUsd, quotaCalls: p.quotaCalls,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    callsUsed: 0, active: true
  };
  d.subscriptions.push(sub); save(d);
  return sub;
}

export function lookup(key) {
  if (!key) return null;
  const d = load();
  return d.subscriptions.find(s => s.key === key && s.active) || null;
}

// record a call against a subscription key; returns { allowed, remaining }
export function consume(key) {
  const s = lookup(key);
  if (!s) return { allowed: false, reason: 'invalid or inactive key' };
  if (new Date(s.expiresAt) < new Date()) return { allowed: false, reason: 'subscription expired' };
  if (s.callsUsed >= s.quotaCalls) return { allowed: false, reason: 'quota exceeded' };
  s.callsUsed++;
  const d = load(); const idx = d.subscriptions.findIndex(x => x.key === key);
  if (idx >= 0) { d.subscriptions[idx].callsUsed = s.callsUsed; save(d); }
  fs.appendFileSync(USAGE_FILE, JSON.stringify({ ts: new Date().toISOString(), key: key.slice(0, 12) + '…', plan: s.plan, callsUsed: s.callsUsed }) + '\n');
  return { allowed: true, remaining: s.quotaCalls - s.callsUsed, plan: s.plan };
}

export function run() { return { generatedAt: new Date().toISOString(), plans: PLANS, active: load().subscriptions.filter(s => s.active).length }; }
