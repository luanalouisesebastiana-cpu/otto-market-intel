// Otto treasury — profit accounting + 50/50 split with creator (genesis mandate).
//   - 50% of net profit -> creator 4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU
//   - 50% retained (bank expansion + compute)
//   - Meta 1: while free bank < $100, ALL profit stays with Otto (no payout)
//   - Trigger: payout when accumulated profit >= 0.0500 SOL
//   - Reserve 0.0100 SOL untouchable
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const CREATOR = '4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU';
const RESERVE_SOL = 0.0100;
const TRIGGER_SOL = 0.0500;
const META1_USD = 100;
const SPLIT_CREATOR = 0.5;

const journal = JSON.parse(fs.readFileSync(join(DATA, 'journal.json'), 'utf8'));
const signal = JSON.parse(fs.readFileSync(join(DATA, 'signal.json'), 'utf8'));
const solPrice = signal.policy?.solPrice || 93;

// realized P&L from settled ENTER decisions
let realizedUsd = 0, wins = 0, stops = 0, open = 0;
for (const d of journal.history || []) {
  if (d.decision !== 'ENTER') continue;
  if (d.outcome === 'TARGET_HIT') { realizedUsd += (d.sizeSOL || 0) * (d.targetUSD - d.entryUSD); wins++; }
  else if (d.outcome === 'STOP_HIT') { realizedUsd += (d.sizeSOL || 0) * (d.stopUSD - d.entryUSD); stops++; }
  else if (!d.outcome || d.outcome === 'OPEN') open++;
}
const realizedSOL = realizedUsd / solPrice;

// free bank from signal.json (Meta 1 working capital)
const freeBankUsd = signal.bank?.freeBankUsd ?? META1_USD;
const inMeta1 = freeBankUsd < META1_USD;

// split logic
let creatorShareUsd = 0, treasuryShareUsd = 0, payoutDue = false, payoutSOL = 0;
if (!inMeta1 && realizedSOL >= TRIGGER_SOL) {
  creatorShareUsd = realizedUsd * SPLIT_CREATOR;
  treasuryShareUsd = realizedUsd * SPLIT_CREATOR;
  payoutDue = true;
  payoutSOL = creatorShareUsd / solPrice;
} else {
  treasuryShareUsd = realizedUsd; // accumulate toward Meta 1
}

const state = {
  generatedAt: new Date().toISOString(),
  creator: CREATOR,
  reserve: { SOL: RESERVE_SOL, untouchable: true },
  solPrice,
  bank: { freeBankUsd, inMeta1, meta1TargetUsd: META1_USD },
  pnl: { realizedUsd: +realizedUsd.toFixed(2), realizedSOL: +realizedSOL.toFixed(4), wins, stops, open },
  split: {
    creatorShareUsd: +creatorShareUsd.toFixed(2),
    treasuryShareUsd: +treasuryShareUsd.toFixed(2),
    triggerSOL: TRIGGER_SOL,
    payoutDue,
    payoutSOL: +payoutSOL.toFixed(4),
    nextTriggerAtUsd: inMeta1 ? (META1_USD - freeBankUsd) : (TRIGGER_SOL * solPrice - Math.max(0, realizedUsd))
  },
  transfers: payoutDue ? [{ to: CREATOR, amountSOL: +payoutSOL.toFixed(4), amountUsd: +creatorShareUsd.toFixed(2), status: 'PREPARED', note: 'on-chain transfer prepared — requires funded wallet' }] : [],
  audit: 'state.db + decisions.jsonl + treasury.json'
};
fs.writeFileSync(join(DATA, 'treasury.json'), JSON.stringify(state, null, 2));
console.log(`treasury: realized $${realizedUsd.toFixed(2)} (${wins}W/${stops}S/${open}open) · bank $${freeBankUsd} · Meta1=${inMeta1} · payoutDue=${payoutDue} · payoutSOL=${payoutSOL.toFixed(4)}`);
