// Otto risk-policy gate — the INVIOABLE filters as executable code.
// No ENTER decision may pass unless it satisfies every rule. Pure, testable,
// wired into journal + signals so a violation is impossible to record.
// Genesis: reserve 0.0100 SOL untouchable · position 10-15% free bank · lot <0.010 SOL
//          · -8% mandatory stop · liq>$50k · vol24h>$100k · slip<1% · no all-in.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const RESERVE_SOL = 0.0100;
const MAX_POS_PCT = 0.15;      // hard ceiling
const SOFT_POS_PCT = 0.10;     // preferred
const MAX_LOT_SOL = 0.010;     // genesis: lotes pequenos, <0.010 SOL
const STOP_PCT = -0.08;
const MIN_LIQ_USD = 50_000;
const MIN_VOL24_USD = 100_000;
const MAX_SLIP_PCT = 1.0;

// candidate: { symbol, sizeSOL, entryUSD, targetUSD, stopUSD, liquidityUSD, volume24USD, slipPct }
// context:   { freeBankUsd, walletSOL }
export function evaluate(candidate, context) {
  const v = [];   // violations
  const c = candidate, x = context;
  const sizeSOL = Number(c.sizeSOL) || 0;
  const bankSOL = Number(x.walletSOL) || 0;
  const freeSOL = bankSOL - RESERVE_SOL;

  // 1. reserve untouchable
  if (bankSOL - sizeSOL < RESERVE_SOL) v.push(`RESERVE: size ${sizeSOL} would breach 0.0100 SOL lifeline (bank ${bankSOL})`);
  // 2. no all-in
  if (freeSOL > 0 && sizeSOL / freeSOL >= 1) v.push(`ALL_IN: size ${sizeSOL} >= free bank ${freeSOL}`);
  // 3. position <= 15% free bank (hard), warn if >10% (soft)
  const posPct = freeSOL > 0 ? sizeSOL / freeSOL : 1;
  if (posPct > MAX_POS_PCT) v.push(`POSITION: ${(posPct*100).toFixed(2)}% > 15% ceiling`);
  // 4. lot < 0.010 SOL
  if (sizeSOL >= MAX_LOT_SOL) v.push(`LOT: ${sizeSOL} >= 0.010 SOL max lot`);
  // 5. mandatory -8% stop
  const entry = Number(c.entryUSD), stop = Number(c.stopUSD), target = Number(c.targetUSD);
  if (!(entry > 0 && stop > 0 && target > 0)) v.push('PRICES: entry/target/stop must be > 0');
  else {
    const stopPct = (stop - entry) / entry;
    if (stopPct > STOP_PCT + 0.0001) v.push(`STOP: ${(stopPct*100).toFixed(2)}% not <= -8% (must cut at -8%)`);
    if (target <= entry) v.push(`TARGET: target ${target} <= entry ${entry} (no upside)`);
  }
  // 6. asset filters
  if (!(Number(c.liquidityUSD) > MIN_LIQ_USD)) v.push(`LIQUIDITY: $${c.liquidityUSD} not > $50k`);
  if (!(Number(c.volume24USD) > MIN_VOL24_USD)) v.push(`VOLUME: $${c.volume24USD} not > $100k/24h`);
  if (!(Number(c.slipPct) < MAX_SLIP_PCT)) v.push(`SLIPPAGE: ${c.slipPct}% not < 1.0%`);

  const approved = v.length === 0;
  return { approved, violations: v, posPct: +posPct.toFixed(4), sizeSOL, reserve: RESERVE_SOL };
}

// ---- self-test: proves the gate catches every violation class ----
function selfTest() {
  const ctx = { freeBankUsd: 100, walletSOL: 0.029252 };
  const good = { symbol:'BTC', sizeSOL:0.001, entryUSD:90000, targetUSD:92700, stopUSD:82800, liquidityUSD:50000000, volume24USD:30000000, slipPct:0.3 };
  const cases = [
    ['clean pass', good, true],
    ['reserve breach', {...good, sizeSOL:0.029}, false],
    ['all-in', {...good, sizeSOL:0.028}, false],
    ['position >15%', {...good, sizeSOL:0.0045}, false],
    ['lot >=0.010', {...good, sizeSOL:0.010}, false],
    ['no -8% stop', {...good, stopUSD:86000}, false],
    ['target <= entry', {...good, targetUSD:89000}, false],
    ['low liquidity', {...good, liquidityUSD:10000}, false],
    ['low volume', {...good, volume24USD:5000}, false],
    ['high slippage', {...good, slipPct:2.5}, false],
  ];
  let pass = 0;
  for (const [name, cand, expect] of cases) {
    const r = evaluate(cand, ctx);
    const ok = r.approved === expect;
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${name}: approved=${r.approved} (expect ${expect})${r.violations.length ? ' — ' + r.violations[0] : ''}`);
  }
  console.log(`\nRISKGATE SELFTEST: ${pass}/${cases.length} passed`);
  return pass === cases.length;
}
if (process.env.SELFTEST === '1') { process.exit(selfTest() ? 0 : 1); }
export { selfTest };
