// Otto — Cross-DEX Arbitrage Detector (Solana)
// Finds real price discrepancies for the same token across DEXes via DexScreener.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
const OUT='/root/market-intel/arb.json';

async function curl(url){
  const args=['-s','--max-time','15','-w','\n%{http_code}',url];
  return new Promise((res,rej)=>execFile('curl',args,{maxBuffer:20*1024*1024,timeout:17000},(e,so)=>{
    if(e&&!so)return rej(e);
    const body=(so||'').slice(0,(so||'').lastIndexOf('\n'));
    try{res(JSON.parse(body));}catch(_){res(null);}
  }));
}

// Collect all Solana pairs for a set of major tokens, group by base mint, find spread
export async function findArb(){
  const queries=['SOL','USDC','USDT','JUP','PYTH','WIF','BONK','JTO'];
  const byMint={};
  for(const q of queries){
    const d=await curl(`https://api.dexscreener.com/latest/dex/search?q=${q}`);
    const pairs=(d?.pairs||[]).filter(p=>p.chainId==='solana' && p.liquidity?.usd>50000);
    for(const p of pairs){
      const mint=p.baseToken?.address; if(!mint)continue;
      if(!byMint[mint]) byMint[mint]={symbol:p.baseToken.symbol, mint, venues:[]};
      byMint[mint].venues.push({
        dex:p.dexId, priceUsd:p.priceUsd, liqUsd:Math.round(p.liquidity.usd),
        vol24Usd:Math.round(p.volume?.h24||0), pairAddress:p.pairAddress
      });
    }
  }
  const opportunities=[];
  for(const m of Object.values(byMint)){
    if(m.venues.length<2)continue;
    const prices=m.venues.map(v=>Number(v.priceUsd)).filter(x=>x>0);
    if(prices.length<2)continue;
    const min=Math.min(...prices), max=Math.max(...prices);
    const spreadPct=((max-min)/min)*100;
    if(spreadPct>0.3){
      const cheap=m.venues.find(v=>Number(v.priceUsd)===min);
      const rich=m.venues.find(v=>Number(v.priceUsd)===max);
      opportunities.push({symbol:m.symbol, mint:m.mint, spreadPct:+spreadPct.toFixed(2), buyOn:cheap.dex, sellOn:rich.dex, buyPrice:min, sellPrice:max, liqUsd:Math.min(cheap.liqUsd,rich.liqUsd), vol24Usd:Math.min(cheap.vol24Usd,rich.vol24Usd)});
    }
  }
  opportunities.sort((a,b)=>b.spreadPct-a.spreadPct);
  const report={generatedAt:new Date().toISOString(), tokensScanned:Object.keys(byMint).length, opportunities:opportunities.slice(0,15)};
  fs.writeFileSync(OUT,JSON.stringify(report,null,2));
  return report;
}
if(import.meta.url===`file://${process.argv[1]}`){
  console.log(JSON.stringify(await findArb(),null,2));
}
