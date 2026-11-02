// Otto referral program — existing callers earn paid-tier credits for bringing
// new payers. Attacks the $0 revenue blocker with a real growth loop.
// Referrer gets a key; when a referee pays (x402 verified) or converts to a
// subscription, the referrer earns credit. Read-only credit ledger, no funds move.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const REF_FILE = join(DATA, 'referrals.json');
const REF_REWARD_USD = 0.50; // credit per converting referee
const REF_CAP = 20;          // max credits per referrer (anti-abuse)

export function load() { try { return JSON.parse(fs.readFileSync(REF_FILE, 'utf8')); } catch { return { referrals: [], rewards: [] }; } }
function save(d) { fs.writeFileSync(REF_FILE, JSON.stringify(d, null, 2)); }

export function issueReferrer({ agentAddress, label }) {
  const d = load();
  const key = 'ottoref_' + crypto.randomBytes(12).toString('hex');
  const r = { key, agentAddress: agentAddress || 'anonymous', label: label || 'referrer', referrals: [], creditsEarnedUsd: 0, createdAt: new Date().toISOString() };
  d.referrals.push(r); save(d); return r;
}

export function lookup(key) {
  if (!key) return null;
  return load().referrals.find(x => x.key === key) || null;
}

// record a referral event; award credit when the referee converts (paid/sub)
export function recordEvent({ refKey, referee, event }) {
  const d = load();
  const r = d.referrals.find(x => x.key === refKey);
  if (!r) return { ok: false, reason: 'invalid referral key' };
  const e = { ts: new Date().toISOString(), referee: referee || 'anonymous', event };
  r.referrals.push(e);
  let credited = false;
  if (event === 'converted' && r.creditsEarnedUsd < REF_CAP) {
    r.creditsEarnedUsd = +(r.creditsEarnedUsd + REF_REWARD_USD).toFixed(2);
    credited = true;
    d.rewards.push({ ts: e.ts, refKey: refKey.slice(0, 14) + '…', referee: e.referee, usd: REF_REWARD_USD });
  }
  save(d);
  return { ok: true, credited, creditsEarnedUsd: r.creditsEarnedUsd, totalReferrals: r.referrals.length };
}

export function stats() {
  const d = load();
  return {
    referrers: d.referrals.length,
    totalReferrals: d.referrals.reduce((a, r) => a + r.referrals.length, 0),
    totalConverted: d.rewards.length,
    totalCreditsUsd: +d.rewards.reduce((a, x) => a + x.usd, 0).toFixed(2),
    top: d.referrals.sort((a, b) => b.creditsEarnedUsd - a.creditsEarnedUsd).slice(0, 10)
      .map(r => ({ label: r.label, referrals: r.referrals.length, creditsUsd: r.creditsEarnedUsd })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'issue') { const r = issueReferrer({ agentAddress: process.argv[3] }); console.log(JSON.stringify(r, null, 2)); }
  else if (cmd === 'event') { console.log(JSON.stringify(recordEvent({ refKey: process.argv[3], referee: process.argv[4], event: process.argv[5] }), null, 2)); }
  else { console.log(JSON.stringify(stats(), null, 2)); }
}
