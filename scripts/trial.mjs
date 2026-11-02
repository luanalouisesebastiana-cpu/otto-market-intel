// Otto trial keys — let a prospective agent validate the paid API with a small
// number of free calls before committing to pay-per-call or a subscription.
// This removes the "try before you buy" friction = direct conversion lever.
// A trial key unlocks paid endpoints (limited quota), separate from subscriptions.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const TRIAL_FILE = join(DATA, 'trials.json');
const TRIAL_USE = join(DATA, 'trial-usage.jsonl');
export const TRIAL_QUOTA = 10;

export function load() { try { return JSON.parse(fs.readFileSync(TRIAL_FILE, 'utf8')); } catch { return { trials: [] }; } }
function save(d) { fs.writeFileSync(TRIAL_FILE, JSON.stringify(d, null, 2)); }

export function issueTrial({ agentAddress, label }) {
  const d = load();
  const key = 'ottotrial_' + crypto.randomBytes(16).toString('hex');
  const t = {
    key, agentAddress: agentAddress || 'anonymous',
    label: label || (agentAddress ? agentAddress.slice(0, 6) : 'trial'),
    quotaCalls: TRIAL_QUOTA, callsUsed: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    converted: false
  };
  d.trials.push(t); save(d);
  return t;
}

export function lookup(key) {
  if (!key) return null;
  const t = load().trials.find(x => x.key === key);
  return t || null;
}

export function consume(key) {
  const t = lookup(key);
  if (!t) return { allowed: false, reason: 'invalid trial key' };
  if (new Date(t.expiresAt) < new Date()) return { allowed: false, reason: 'trial expired' };
  if (t.callsUsed >= t.quotaCalls) return { allowed: false, reason: 'trial quota exhausted (' + t.quotaCalls + ' calls)' };
  t.callsUsed++;
  const d = load(); const i = d.trials.findIndex(x => x.key === key);
  if (i >= 0) { d.trials[i].callsUsed = t.callsUsed; save(d); }
  fs.appendFileSync(TRIAL_USE, JSON.stringify({ ts: new Date().toISOString(), key: key.slice(0, 14) + '…', callsUsed: t.callsUsed }) + '\n');
  return { allowed: true, remaining: t.quotaCalls - t.callsUsed, plan: 'trial' };
}

export function run() { return { generatedAt: new Date().toISOString(), quota: TRIAL_QUOTA, issued: load().trials.length, active: load().trials.filter(t => new Date(t.expiresAt) > new Date()).length }; }
