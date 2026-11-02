#!/usr/bin/env node
/**
 * Otto — INVISIBLE Risk Policy Gate (single source of truth).
 * Every engine imports these pure functions; no engine may hardcode its own copy.
 * Derived directly from the genesis mandate + constitution. Immutable values.
 */
export const POLICY = Object.freeze({
  // Position sizing
  maxPosPct: 0.125,      // ≤12.5% of free bank per position
  maxLotSOL: 0.01,       // lots < 0.010 SOL
  reserveSOL: 0.01,      // UNTOUCHABLE life-line reserve
  // Mandatory stop
  stopPct: -8,           // mandatory -8% stop-loss
  targetPct: 3,          // take-profit target +3%
  // Asset safety filters
  minLiqUsd: 50000,
  minVol24Usd: 100000,
  maxSlipPct: 1.0,
  // Entry discipline
  minEdgePct: 2.5,       // decision edge threshold (< 2.5% = observe)
  maxOpenPositions: 2,   // never concentrated in many bets
  // Kill switch
  fuseAbsSol: 0.05,      // absolute per-trade loss cap
});

/** Map a raw opportunity (DexScreener/intel shape) onto filter fields. */
export function normalizeOpp(o){
  return {
    mint: o.mint, symbol: o.symbol ?? o.pair ?? null, dex: o.dex ?? null,
    price: +(o.priceUsd ?? o.price ?? 0),
    liqUsd: +(o.liqUsd ?? o.liq ?? 0),
    vol24Usd: +(o.vol24Usd ?? o.vol24 ?? 0),
    slipPct: +(o.slipPct ?? o.slip ?? 0),
    change24h: typeof o.change24h === 'number' ? o.change24h : null,
    score: +(o.score ?? 0),
  };
}

/** Returns { pass:boolean, reasons:string[] } for the inviolable asset filters. */
export function passesAssetFilters(o){
  const r = [];
  if (!(o.liqUsd >= POLICY.minLiqUsd)) r.push(`liq $${o.liqUsd.toFixed(0)} < $${POLICY.minLiqUsd}`);
  if (!(o.vol24Usd >= POLICY.minVol24Usd)) r.push(`vol24 $${o.vol24Usd.toFixed(0)} < $${POLICY.minVol24Usd}`);
  if (!(o.slipPct < POLICY.maxSlipPct)) r.push(`slip ${o.slipPct}% >= ${POLICY.maxSlipPct}%`);
  if (!(o.price > 0)) r.push('no price');
  return { pass: r.length === 0, reasons: r };
}

/** Max position size in USD given free bank + SOL price. */
export function positionSize({ freeBankUsd, solPrice }){
  const byPct = freeBankUsd * POLICY.maxPosPct;
  const byLot = POLICY.maxLotSOL * (solPrice || 0);
  return Math.max(0, Math.min(byPct, byLot));
}

/** Jev entry decision: only enter when edge ≥ threshold AND capacity allows. */
export function shouldEnter({ edgePct, openCount }){
  const reasons = [];
  if (!(edgePct >= POLICY.minEdgePct)) reasons.push(`edge ${edgePct}% < ${POLICY.minEdgePct}%`);
  if (openCount >= POLICY.maxOpenPositions) reasons.push(`${openCount} open ≥ ${POLICY.maxOpenPositions}`);
  return { enter: reasons.length === 0, reasons };
}

/** Validate a trade plan against stop/target/reserve/fuse constraints. */
export function validatePlan({ entry, target, stop, sizeUSD, freeBankUsd, solPrice }){
  const r = [];
  if (!(target > entry)) r.push('target must be above entry');
  if (!(stop < entry)) r.push('stop must be below entry');
  const maxLossUsd = POLICY.fuseAbsSol * (solPrice || 0);
  if (sizeUSD > maxLossUsd) r.push(`size $${sizeUSD.toFixed(2)} > fuse $${maxLossUsd.toFixed(2)}`);
  if (sizeUSD > positionSize({ freeBankUsd, solPrice })) r.push('size exceeds position limit');
  return { valid: r.length === 0, reasons: r };
}

/** Net liquidation value after a simulated round-trip fee drag (network+slip proxy). */
export function netAfterFees(sizeUSD, slipPct){
  return sizeUSD * (1 - (slipPct/100)) * 0.998; // ~0.2% network/priority proxy
}
