// CI data refresher — runs in GitHub Actions, writes data/*.json to the repo.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
const DIR = new URL('../data/', import.meta.url).pathname;
fs.mkdirSync(DIR, { recursive: true });
function curl(url){return new Promise((res,rej)=>execFile('curl',['-s','--max-time','15',url],{maxBuffer:20*1024*1024,timeout:17000},(e,so)=>{if(e&&!so)return rej(e);try{res(JSON.parse(so||'{}'));}catch(_){res(null);}}));}
async function macro(){return await curl('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');}
async function scan(){
  const tokens=['SOL','JUP','PYTH','WIF','BONK','USDC','USDT','RAY','ORCA','SRM'];
  let opps=[], arb=[];
  for(const q of tokens){
    const j=await curl('https://api.dexscreener.com/latest/dex/search?q='+q);
    const pairs=(j?.pairs||[]).filter(p=>p.chainId==='solana');
    // opportunities: pass risk filters
    for(const p of pairs){
      const liq=p.liquidity?.usd||0, vol=p.volume?.h24||0;
      if(liq>50000 && vol>100000){
        opps.push({mint:p.baseToken.address,symbol:p.baseToken.symbol,dex:p.dexId,liqUsd:liq,vol24Usd:vol,priceUsd:+p.priceUsd,change24h:p.priceChange?.h24??null});
      }
    }
    // arb: group by mint, find cross-DEX spread
    const byMint={};
    for(const p of pairs){const m=p.baseToken.address;if(!byMint[m])byMint[m]={s:p.baseToken.symbol,v:[]};byMint[m].v.push({d:p.dexId,pr:+p.priceUsd,l:p.liquidity?.usd||0});}
    for(const m of Object.values(byMint)){
      if(m.v.length<2)continue;
      const pr=m.v.map(v=>v.pr).filter(x=>x>0);
      if(pr.length<2)continue;
      const mn=Math.min(...pr),mx=Math.max(...pr),sp=((mx-mn)/mn)*100;
      if(sp>0.3){const c=m.v.find(v=>v.pr===mn),r=m.v.find(v=>v.pr===mx);arb.push({symbol:m.s,spreadPct:+sp.toFixed(2),buyOn:c.d,sellOn:r.d,liqUsd:Math.min(c.l,r.l)});}
    }
  }
  // dedupe + sort
  const seen=new Set(); opps=opps.filter(o=>{if(seen.has(o.mint))return false;seen.add(o.mint);return true;}).sort((a,b)=>b.liqUsd-a.liqUsd);
  arb.sort((a,b)=>b.spreadPct-a.spreadPct);
  return {opportunities:opps.slice(0,20), arb:arb.slice(0,15)};
}
async function main(){
  const m=await macro();
  const s=await scan();
  const out={
    generatedAt:new Date().toISOString(),
    macro:m?{btc:{usd:m.bitcoin?.usd,chg24h:m.bitcoin?.usd_24h_change},eth:{usd:m.ethereum?.usd,chg24h:m.ethereum?.usd_24h_change},sol:{usd:m.solana?.usd,chg24h:m.solana?.usd_24h_change}}:null,
    opportunities:s.opportunities,
    arb:s.arb,
    summary:{opportunities:s.opportunities.length,arbSpreads:s.arb.length}
  };
  fs.writeFileSync(DIR+'intel.json',JSON.stringify(out,null,2));
  fs.writeFileSync(DIR+'arb.json',JSON.stringify({generatedAt:out.generatedAt,opportunities:s.arb},null,2));
  fs.writeFileSync(DIR+'opportunities.json',JSON.stringify({generatedAt:out.generatedAt,opportunities:s.opportunities},null,2));
  console.log('wrote data/intel.json ('+s.opportunities.length+' opps, '+s.arb.length+' arb)');
}
main().catch(e=>{console.error(e);process.exit(1);});
