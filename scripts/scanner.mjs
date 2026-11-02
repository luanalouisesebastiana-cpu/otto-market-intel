// Otto — Market Scanner + Jev decision loop (Solana)
// Reads DexScreener, applies risk filters, indexes opportunities, records decisions.
import { execFile } from 'node:child_process';
import fs from 'node:fs';

const DECISIONS='/root/market-intel/decisions.jsonl';
const REPORT=new URL('../data/opportunities.json', import.meta.url).pathname;
const PROXY='http://hatch-egress-proxy:3128';

async function curl(url){
  const args=['-s','--max-time','15','-w','\n%{http_code}',url];
  return new Promise((res,rej)=>execFile('curl',args,{maxBuffer:20*1024*1024,timeout:17000},(e,so)=>{
    if(e&&!so)return rej(e);
    const body=(so||'').slice(0,(so||'').lastIndexOf('\n'));
    try{res(JSON.parse(body));}catch(_){res(null);}
  }));
}

// Risk filters (inviolable)
const F={minLiq:50000, minVol:100000, maxSlip:1.0};

export async function scan(){
  // top Solana pairs by liquidity
  const dex = await curl('https://api.dexscreener.com/latest/dex/search?q=SOL');
  const pairs = (dex?.pairs||[]).filter(p=>p.chainId==='solana');
  const seen=new Set();
  const candidates=[];
  for(const p of pairs){
    const mint=(p.baseToken?.address||'');
    if(!mint||seen.has(mint))continue; seen.add(mint);
    const liq=(p.liquidity?.usd||0);
    const vol=(p.volume?.h24||0);
    const ageH=((Date.now()-new Date(p.pairCreatedAt||0))/3.6e6)||0;
    const priceImpact=(p.priceChange?.h1||0);
    // real slippage: constant-product approximation for a $1000 reference trade
    const REF_TRADE_USD = 1000;
    const slipPct = liq > 0 ? (REF_TRADE_USD / (liq + REF_TRADE_USD)) * 100 : 999;
    const passSlip = slipPct <= (F.maxSlippagePct ?? 1);
    const passes = liq>F.minLiq && vol>F.minVol && passSlip && Math.abs(priceImpact)<50;
    candidates.push({
      mint, symbol:p.baseToken?.symbol, dex:p.dexId,
      liqUsd:Math.round(liq), vol24Usd:Math.round(vol), ageHours:Math.round(ageH),
      priceChangeH1:priceImpact,
      slippagePct:+slipPct.toFixed(3), slippageUsd:REF_TRADE_USD,
      passLiq:liq>F.minLiq, passVol:vol>F.minVol, passSlip,
      verdict: passes?'approved':'rejected',
      reason: !passes?('liq:'+(liq>F.minLiq)+' vol:'+(vol>F.minVol)+' slip:'+passSlip):'ok'
    });
  }
  candidates.sort((a,b)=>b.liqUsd-a.liqUsd);
  const approved=candidates.filter(c=>c.verdict==='approved');
  const report={generatedAt:new Date().toISOString(), filters:F, total:candidates.length, approved:approved.length, opportunities:approved.slice(0,10), rejected:candidates.slice(0,5)};
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
  return report;
}

// Jev decision loop: one decision per cycle
export async function decide(){
  const r=await scan();
  let decision={cycle:new Date().toISOString(),action:'observe',reason:'no approved opportunity with edge'};
  if(r.opportunities.length){
    const top=r.opportunities[0];
    // re-quote freshness: only enter if liq is substantial + stable
    if(top.liqUsd>100000 && top.vol24Usd>200000){
      decision={cycle:new Date().toISOString(),action:'index',mint:top.mint,symbol:top.symbol,liqUsd:top.liqUsd,vol24Usd:top.vol24Usd,reason:'indexed for review; entry requires human/creator confirmation (no capital)'};
    }
  }
  fs.appendFileSync(DECISIONS,JSON.stringify(decision)+'\n');
  return decision;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const mode=process.argv[2]||'scan';
  if(mode==='scan')console.log(JSON.stringify(await scan(),null,2));
  else if(mode==='decide')console.log(JSON.stringify(await decide(),null,2));
}
