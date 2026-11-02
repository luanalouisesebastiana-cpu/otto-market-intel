// Otto referral engine — growth loop for agent-to-agent distribution.
// A referring agent gets a share of every paid call made with their referral code.
// This is the highest-leverage distribution mechanism: existing users bring new ones.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const REF_FILE = join(DATA, 'referrals.json');

export function load() { try { return JSON.parse(fs.readFileSync(REF_FILE, 'utf8')); } catch { return { referrals: [] }; } }
function save(d) { fs.writeFileSync(REF_FILE, JSON.stringify(d, null, 2)); }

// Register a new referral code for a referring agent
export function register({ agentAddress, label, commissionPct = 20 }) {
  const d = load();
  if (d.referrals.find(r => r.address === agentAddress)) return d.referrals.find(r => r.address === agentAddress);
  const ref = {
    code: 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    address: agentAddress,
    label: label || agentAddress.slice(0, 6),
    commissionPct: Math.min(50, Math.max(0, Number(commissionPct) || 20)),
    createdAt: new Date().toISOString(),
    clicks: 0, conversions: 0, earnedUsd: 0
  };
  d.referrals.push(ref); save(d);
  return ref;
}

// Record a click on a referral code
export function click(code) {
  const d = load(); const r = d.referrals.find(x => x.code === code);
  if (r) { r.clicks++; save(d); }
  return r;
}

// Record a paid conversion (called by fulfillment when a referral code is present)
export function convert(code, amountUsd) {
  const d = load(); const r = d.referrals.find(x => x.code === code);
  if (!r) return null;
  r.conversions++;
  r.earnedUsd += (Number(amountUsd) || 0) * r.commissionPct / 100;
  save(d);
  return r;
}

// Leaderboard
export function leaderboard() {
  const d = load();
  return d.referrals
    .map(r => ({ code: r.code, label: r.label, clicks: r.clicks, conversions: r.conversions, earnedUsd: +r.earnedUsd.toFixed(2), rate: r.clicks ? +(r.conversions / r.clicks * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.earnedUsd - a.earnedUsd);
}

export function run() { return { generatedAt: new Date().toISOString(), referrals: load().referrals.length, leaderboard: leaderboard() }; }
