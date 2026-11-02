// Otto — Unified Intelligence Feed (Solana)
// One call = macro + top opportunities + arb spreads + safety flags. The killer product.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
const DIR='/root/market-intel';
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
async function curl(url){return new Promise((res,rej)=>execFile('curl',['-s','--max-time','12','-w','\n%{http_code}',url],{maxBuffer:20*1024*1024,timeout:14000},(e,so)=>{if(e&&!so)return rej(e);const body=(so||'').slice(0,(so||'').lastIndexOf('\n'));try{res(JSON.parse(body));}catch(_){res(null);}}));}
export async function intelFeed(){
  const macro=await curl('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
  const arb=read(DIR+'/arb.json');
  const scan=read(DIR+'/opportunities.json');
  const safety=read(DIR+'/safety-flags.json');
  return {
    generatedAt:new Date().toISOString(),
    macro: macro?{btc:{usd:macro.bitcoin?.usd,chg24h:macro.bitcoin?.usd_24h_change},eth:{usd:macro.ethereum?.usd,chg24h:macro.ethereum?.usd_24h_change},sol:{usd:macro.solana?.usd,chg24h:macro.solana?.usd_24h_change},source:'CoinGecko'}:null,
    topOpportunities: (scan?.opportunities||[]).slice(0,5),
    arbSpreads: (arb?.opportunities||[]).slice(0,5),
    safetyFlags: (safety?.flags||[]).slice(0,5),
    summary: {opportunities: scan?.approved??0, arbCount: arb?.opportunities?.length??0, safetyCount: safety?.flags?.length??0}
  };
}
if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(await intelFeed(),null,2));
