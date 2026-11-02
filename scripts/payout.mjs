// Otto on-chain profit-split executor — genesis mandate: 50% of net profit to
// creator 4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU, 50% retained.
// Trigger: accumulated profit >= 0.0500 SOL. Reserve 0.0100 SOL untouchable.
// This module prepares the transfer; actual signing uses the runtime wallet.
// Default DRY-RUN (no broadcast) — set EXECUTE=1 to submit for real.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

export const CREATOR = '4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU';
export const SELF = 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';
export const TRIGGER_SOL = 0.0500;
export const RESERVE_SOL = 0.0100;
export const SPLIT = 0.5; // 50% to creator

const LEDGER = join(DATA, 'payouts.jsonl');

export function computeSplit({ freeSol }) {
  const excess = Number(freeSol) - TRIGGER_SOL - RESERVE_SOL;
  if (excess <= 0) return { eligible: false, reason: `free ${freeSol} SOL below trigger ${TRIGGER_SOL}+reserve ${RESERVE_SOL}`, toCreator: 0, retain: 0 };
  const toCreator = +(excess * SPLIT).toFixed(4);
  const retain = +(excess - toCreator).toFixed(4);
  return { eligible: true, toCreator, retain, freeSol: Number(freeSol), trigger: TRIGGER_SOL, reserve: RESERVE_SOL };
}

// Prepare a payout instruction (structural — ready for runtime wallet signing)
export function preparePayout({ freeSol }) {
  const split = computeSplit({ freeSol });
  const instruction = {
    type: 'sol_transfer',
    from: SELF,
    to: CREATOR,
    amountSol: split.toCreator,
    amountLamports: Math.round(split.toCreator * 1e9),
    memo: 'Otto profit share (50%) — Kovantu Digital',
    preparedAt: new Date().toISOString(),
    dryRun: process.env.EXECUTE !== '1'
  };
  if (split.eligible) {
    fs.appendFileSync(LEDGER, JSON.stringify(instruction) + '\n');
  }
  return { ...instruction, split };
}

export function history() {
  const out = [];
  if (fs.existsSync(LEDGER)) for (const l of fs.readFileSync(LEDGER, 'utf8').split('\n')) { try { out.push(JSON.parse(l)); } catch {} }
  return out;
}

export function run() {
  let freeSol = 0;
  try { const t = JSON.parse(fs.readFileSync(join(DATA, 'treasury.json'), 'utf8')); freeSol = t.freeSol ?? t.balance ?? 0; } catch {}
  const prepared = preparePayout({ freeSol });
  return { generatedAt: new Date().toISOString(), creator: CREATOR, splitPct: 50, triggerSol: TRIGGER_SOL, reserveSol: RESERVE_SOL, prepared, history: history().slice(-10).reverse() };
}

if (process.argv[1] && process.argv[1].endsWith('payout.mjs')) {
  const r = run();
  console.log(JSON.stringify({ eligible: r.prepared.split.eligible, toCreator: r.prepared.split.toCreator, retain: r.prepared.split.retain, dryRun: r.prepared.dryRun, reason: r.prepared.split.reason || 'ok' }, null, 2));
}
