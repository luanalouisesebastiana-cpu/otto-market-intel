#!/usr/bin/env node
// Otto — Market Health Index. Aggregates live signals into ONE 0-100 score:
//   macro momentum (BTC/ETH/SOL 7d), funding sentiment, arb breadth,
//   opportunity flow (risk-filtered), whale activity, perp OI/vol.
// 0-20 EXTREME FEAR · 20-40 FEAR · 40-60 NEUTRAL · 60-80 GREED · 80-100 EXTREME GREED
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

function read(f, fallback){ try { return JSON.parse(fs.readFileSync(join(DATA,f),'utf8')); } catch(e){ return fallback; } }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function norm(v,a,b){ // map v in [a,b] -> 0..100
  if (v==null||!isFinite(v)) return 50;
  return clamp(((v-a)/(b-a))*100, 0, 100);
}

export async function run() {
  const intel = read('intel.json', { macro:{}, opportunities:[], arb:[] });
  const perp = read('perp.json', { markets:[], fundingStats:{} });
  const whales = read('whales.json', { whales:[] });
  const signal = read('signal.json', {});
  const bt = read('backtest.json', {});

  // 1) Macro momentum: average 7d change across BTC/ETH/SOL -> 0..100 (fear..greed)
  const m = intel.macro || {};
  const macroChg = [m.btc_7d, m.eth_7d, m.sol_7d].filter(x=>typeof x==='number');
  const macroScore = macroChg.length ? norm(macroChg.reduce((s,x)=>s+x,0)/macroChg.length, -15, 15) : 50;

  // 2) Funding sentiment: positive funding = greed (longs paying)
  const f = perp.fundingStats || {};
  const fundingScore = typeof f.avg === 'number' ? norm(f.avg * 100, -0.05, 0.05) : 50;

  // 3) Arb breadth: more positive spreads = opportunity-rich (greed-ish)
  const arbList = intel.arb || [];
  const posArb = arbList.filter(a=>a.spread>0).length;
  const arbScore = arbList.length ? norm(posArb/arbList.length, 0, 1) : 50;

  // 4) Opportunity flow: risk-filtered opps count
  const oppCount = (intel.opportunities||[]).length;
  const flowScore = norm(oppCount, 0, 12);

  // 5) Whale activity: more large moves = active market
  const wCount = (whales.whales||[]).length;
  const whaleScore = norm(wCount, 0, 20);

  // 6) Backtest edge: strategy profitability
  const edges = Object.values(bt.assets||bt.results||{}).map(a=>a.returnPct ?? a.totalReturnPct ?? a.edge).filter(x=>typeof x==='number');
  const edgeAvg = edges.length ? edges.reduce((s,x)=>s+x,0)/edges.length : 0;
  const edgeScore = norm(edgeAvg, -20, 30);

  const weights = { macro:.25, funding:.20, arb:.10, flow:.20, whale:.10, edge:.15 };
  const score = Math.round(macroScore*weights.macro + fundingScore*weights.funding + arbScore*weights.arb + flowScore*weights.flow + whaleScore*weights.whale + edgeScore*weights.edge);

  const band = score<=20?'EXTREME FEAR':score<=40?'FEAR':score<=60?'NEUTRAL':score<=80?'GREED':'EXTREME GREED';
  const out = {
    generatedAt: new Date().toISOString(),
    score, band,
    components: {
      macro: Math.round(macroScore), funding: Math.round(fundingScore), arb: Math.round(arbScore),
      flow: Math.round(flowScore), whale: Math.round(whaleScore), edge: Math.round(edgeScore),
    },
    weights,
    inputs: { macro7d: macroChg, fundingAvg: f.avg, posArb, arbTotal: arbList.length, oppCount, whaleMoves: wCount, edgeAvg: +edgeAvg.toFixed(2) },
  };
  fs.writeFileSync(join(DATA,'health.json'), JSON.stringify(out,null,2));
  console.log(`[health] ${score} (${band}) · macro ${out.components.macro} funding ${out.components.funding} flow ${out.components.flow}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('[health] ERROR:', e.message); process.exit(1); });
}
