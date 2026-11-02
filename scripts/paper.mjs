#!/usr/bin/env node
// Otto — Live Paper-Trading Engine. Runs the Jev decision loop against LIVE data,
// simulates entries under the inviolable risk policy, tracks virtual positions
// against live DexScreener prices, and reports paper P&L + win rate.
// This is the strongest edge proof: a verifiable simulated track record.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
import { POLICY as P } from './riskgate.mjs';
const POLICY = { stopPct:P.stopPct, targetPct:P.targetPct, minLiqUsd:P.minLiqUsd, minVol24Usd:P.minVol24Usd, maxSlipPct:P.maxSlipPct, maxPosPct:P.maxPosPct, maxLotSOL:P.maxLotSOL };
const START_BANK = 100; // virtual USD
const STATE_FILE = join(DATA,'paper-state.json');

function load(){ try { return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); } catch(e){ return null; } }
function save(s){ fs.writeFileSync(STATE_FILE, JSON.stringify(s,null,2)); }

async function dex(mint){
  try { const r=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`,{signal:AbortSignal.timeout(7000)});
    const j=await r.json(); const p=(j.pairs||[]).sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];
    if(!p) return null;
    return { price:parseFloat(p.priceUsd||0), liq:p.liquidity?.usd||0, vol:p.volume?.h24||0, dex:p.dexId, change24h:p.priceChange?.h24??null };
  } catch(e){ return null; }
}

export async function run(){
  const st = load() || { bank:START_BANK, cash:START_BANK, positions:[], closed:[], cycle:0, equity:[], startedAt:new Date().toISOString() };
  st.cycle++;

  // 1) manage open paper positions against live prices
  for(const pos of st.positions){
    const live = await dex(pos.mint);
    if(!live){ pos.status='NO_PRICE'; continue; }
    pos.livePrice = live.price; pos.liveLiq = live.liq;
    const pnlPct = (live.price - pos.entry)/pos.entry*100;
    pos.pnlPct = +pnlPct.toFixed(2);
    if(pnlPct <= POLICY.stopPct){ pos.status='STOPPED'; pos.exit=live.price; pos.exitPct=pnlPct; st.closed.push(pos); }
    else if(pnlPct >= POLICY.targetPct){ pos.status='TARGET'; pos.exit=live.price; pos.exitPct=pnlPct; st.closed.push(pos); }
    else pos.status='OPEN';
  }
  st.positions = st.positions.filter(p=>p.status==='OPEN'||p.status==='NO_PRICE');

  // 2) equity = cash + open positions at live value
  let equity = st.cash;
  for(const p of st.positions){ if(p.livePrice) equity += p.sizeUSD * (p.livePrice/p.entry); }
  st.equity.push({ t:new Date().toISOString(), v:+equity.toFixed(2) });
  if(st.equity.length>2000) st.equity = st.equity.slice(-2000);

  // 3) open a new paper position if cash allows and a filtered opp exists
  const opps = (JSON.parse(fs.readFileSync(join(DATA,'intel.json'),'utf8')).opportunities||[]);
  const eligible = opps.filter(o=>o.liqUsd>=POLICY.minLiqUsd && o.vol24Usd>=POLICY.minVol24Usd && (o.slipPct??o.slip??0)<POLICY.maxSlipPct);
  if(eligible.length && st.positions.length<2){
    const o = eligible[0];
    const sizeUSD = Math.min(st.cash*POLICY.maxPosPct, (o.liqUsd||0)*0.001);
    if(sizeUSD>5){
      st.positions.push({ mint:o.mint, pair:o.pair||o.symbol, dex:o.dex, entry:o.priceUsd||o.price,
        sizeUSD:+sizeUSD.toFixed(2), target:+( (o.priceUsd||o.price)*(1+POLICY.targetPct/100) ).toFixed(6),
        stop:+( (o.priceUsd||o.price)*(1+POLICY.stopPct/100) ).toFixed(6),
        openedAt:new Date().toISOString(), status:'OPEN', sourceScore:o.score??null });
      st.cash -= sizeUSD;
    }
  }

  // 4) stats
  const closed = st.closed;
  const wins = closed.filter(p=>p.exitPct>0).length;
  const totalPnl = closed.reduce((s,p)=>s+(p.sizeUSD*(p.exitPct/100)),0);
  st.stats = {
    cycle: st.cycle, open: st.positions.length, closed: closed.length,
    winRate: closed.length? +((wins/closed.length)*100).toFixed(1):0,
    totalPnlUSD:+totalPnl.toFixed(2), equity:+equity.toFixed(2),
    returnPct:+(((equity-START_BANK)/START_BANK)*100).toFixed(2),
    startedAt: st.startedAt,
  };
  save(st);
  console.log(`[paper] equity $${st.stats.equity} (${st.stats.returnPct}%) · ${st.stats.closed} closed · win ${st.stats.winRate}%`);
  return st;
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch(e=>{ console.error('[paper] ERROR:',e.message); process.exit(1); });
