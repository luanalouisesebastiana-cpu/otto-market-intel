#!/usr/bin/env node
// Otto — Self-Contained Public Service (Render / any Node host). No deps, no absolute paths.
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 80);
const DATA = join(__dirname, 'data');
mkdirSync(DATA, { recursive: true });
const RECEIVER = 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-mainnet.rpc.extrnode.com'];
const PRICES = { '/v1/opportunities': 50, '/v1/signals': 50, '/v1/macro': 25, '/v1/report': 100, '/v1/intel': 100, '/v1/arb': 50 };
const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };

function readJson(p, fb) { try { if (existsSync(p)) return JSON.parse(readFileSync(p,'utf8')); } catch {} return fb; }
function readIntel() { return readJson(join(DATA,'intel.json'), { generatedAt:null, macro:null, opportunities:[], arb:[], summary:{} }); }
function readOpps() { return readJson(join(DATA,'opportunities.json'), { generatedAt:null, opportunities:[] }); }
function readArb() { return readJson(join(DATA,'arb.json'), { generatedAt:null, opportunities:[] }); }
function readSignal() { return readJson(join(DATA,'signal.json'), { generatedAt:null, signals:[], top:[], stats:{}, policy:{}, bank:{} }); }
function readJournal() { return readJson(join(DATA,'journal.json'), { generatedAt:null, lastDecision:{}, stats:{}, history:[] }); }

function send(res, code, body, headers={}) { const d = typeof body==='string'?body:JSON.stringify(body,null,2); res.writeHead(code, {'content-type':'application/json; charset=utf-8', ...headers}); res.end(d); }
function esc(s) { return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtUsd(v) { const n=Number(v); if(!Number.isFinite(n)) return '—'; if(n>=1e6) return '$'+(n/1e6).toFixed(2)+'M'; if(n>=1e3) return '$'+(n/1e3).toFixed(1)+'k'; return '$'+n.toFixed(0); }

async function refreshIfStale() {
  // run the FULL pipeline on boot so a fresh deploy serves live, gated intel
  try {
    await import('./scripts/pipeline.mjs');
  } catch (e) { console.warn('[pipeline] boot run failed:', e.message); }
}

function parsePaymentHeader(header) {
  if(!header) return {txnSignature:null,parseError:'empty header'};
  let obj=header;
  if(typeof header==='string'&&!header.trim().startsWith('{')){ try{obj=JSON.parse(Buffer.from(header,'base64').toString('utf8'));}catch{return{txnSignature:null,parseError:'header not JSON'};} }
  else { try{obj=JSON.parse(header);}catch{return{txnSignature:null,parseError:'header is not valid JSON'};} }
  const pl=obj.payload||{};
  const txnSignature=pl.signature||pl.txnSignature||obj.txnSignature||obj.signature||null;
  const network=obj.network||pl.network||null;
  return {txnSignature,network,payer:pl.payer||pl.from||obj.payer||null,parseError:txnSignature?null:'no signature found in payment payload'};
}
async function fetchTransaction(sig){ for(const ep of RPC){ try{ const c=new AbortController(); const t=setTimeout(()=>c.abort(),8000); const r=await fetch(ep,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[sig,{encoding:'jsonParsed',maxSupportedTransactionVersion:0}]}),signal:c.signal}); clearTimeout(t); if(!r.ok)continue; const j=await r.json(); if(j.result)return j.result; }catch{} } return null; }
async function verifyPayment({paymentHeader,receiver,amountUsd}){
  const p=paymentHeader?parsePaymentHeader(paymentHeader):{}; const sig=p.txnSignature;
  if(p.network&&p.network!=='solana') return {ok:false,verified:false,reason:'unsupported network'};
  if(!sig) return {ok:false,verified:false,reason:p.parseError||'missing txnSignature'};
  if(!receiver) return {ok:false,verified:false,reason:'missing receiver'};
  const tx=await fetchTransaction(sig);
  if(!tx) return {ok:false,verified:false,reason:'rpc unreachable — could not confirm on-chain transfer'};
  const pre=tx.meta?.preTokenBalances||[], post=tx.meta?.postTokenBalances||[];
  const usdc=b=>b.filter(x=>x.mint===USDC_MINT); const preUsdc=usdc(pre), postUsdc=usdc(post);
  const delta=postUsdc.reduce((acc,b)=>{ if(b.owner===receiver){ const pb=preUsdc.find(x=>x.owner===b.owner&&x.accountIndex===b.accountIndex); const pa=pb?Number(pb.uiTokenAmount?.uiAmountString||0):0; acc+=Number(b.uiTokenAmount?.uiAmountString||0)-pa; } return acc; },0);
  const expected=Number(amountUsd), tol=expected*0.01;
  if(delta>=expected-tol) return {ok:true,verified:true,reason:'USDC transfer confirmed on-chain',tx:{signature:sig,receiverDelta:delta,expected}};
  return {ok:false,verified:false,reason:`USDC delta ${delta} < expected ${expected}`,tx:{signature:sig,receiverDelta:delta,expected}};
}

function dashboard(intel) {
  const opps=intel.opportunities||[], arb=intel.arb||[], m=intel.macro||{};
  const oppRows=opps.slice(0,10).map(o=>{const c=o.change24h;const cls=c==null?'':c>=0?'up':'down';return `<tr><td>${esc(o.symbol)}</td><td>${esc(o.dex)}</td><td class="num">${fmtUsd(o.liqUsd)}</td><td class="num">${fmtUsd(o.vol24Usd)}</td><td class="num ${cls}">${c==null?'—':(c>=0?'+':'')+c.toFixed(1)+'%'}</td></tr>`;}).join('');
  const arbRows=arb.slice(0,8).map(o=>`<tr><td>${esc(o.symbol)}</td><td class="num spread">+${o.spreadPct.toFixed(2)}%</td><td>${esc(o.buyOn)}</td><td>${esc(o.sellOn)}</td><td class="num">${fmtUsd(o.liqUsd)}</td></tr>`).join('');
  const bt=m.btusd?'$'+Number(m.btusd).toLocaleString():'—', et=m.ethusd?'$'+Number(m.ethusd).toLocaleString():'—', so=m.solusd?'$'+Number(m.solusd).toLocaleString():'—';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Otto — Solana Market Intelligence API</title><meta name="description" content="Risk-filtered Solana market intelligence + on-chain-verified data via x402 (USDC, pay-per-call)."><style>body{font-family:system-ui;background:#0b1020;color:#e2e8f0;margin:0;padding:24px}.wrap{max-width:1000px;margin:0 auto}h1{background:linear-gradient(90deg,#38bdf8,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #1e293b}th{color:#94a3b8;font-size:11px;text-transform:uppercase}.num{text-align:right;font-variant-numeric:tabular-nums}.badge{display:inline-block;background:#0ea5e922;color:#38bdf8;border:1px solid #0ea5e944;border-radius:999px;padding:3px 10px;font-size:12px;margin:0 6px 10px 0}code{background:#0f172a;padding:2px 6px;border-radius:5px;color:#38bdf8}.price{color:#38bdf8;font-weight:700}h2{color:#94a3b8;font-size:15px;margin:26px 0 8px}.up{color:#4ade80}.down{color:#f87171}.spread{color:#f59e0b;font-weight:700}</style></head><body><div class="wrap"><h1>Otto — Solana Market Intelligence</h1><p style="color:#94a3b8">Autonomous market-intelligence agent — Kovantu Digital. Risk-filtered data + on-chain-verified reports via x402 (USDC · Solana).</p><div><span class="badge">● LIVE</span><span class="badge">${opps.length} opportunities</span><span class="badge">${arb.length} arb spreads</span><span class="badge">Solana mainnet</span></div><h2>Macro</h2><table><thead><tr><th>BTC</th><th>ETH</th><th>SOL</th></tr></thead><tbody><tr><td class="num">${bt}</td><td class="num">${et}</td><td class="num">${so}</td></tr></tbody></table><h2>Arbitrage Spreads</h2><table><thead><tr><th>Token</th><th class="num">Spread</th><th>Buy</th><th>Sell</th><th class="num">Liq</th></tr></thead><tbody>${arbRows||'<tr><td colspan=5 style="color:#64748b">no spreads</td></tr>'}</tbody></table><h2>Top Opportunities</h2><table><thead><tr><th>Token</th><th>DEX</th><th class="num">Liq</th><th class="num">Vol 24h</th><th class="num">Δ24h</th></tr></thead><tbody>${oppRows||'<tr><td colspan=5 style="color:#64748b">none</td></tr>'}</tbody></table><h2>Catalog</h2><table><thead><tr><th>Endpoint</th><th>Price</th></tr></thead><tbody><tr><td><code>POST /v1/opportunities</code></td><td class="price">50c</td></tr><tr><td><code>GET /v1/arb</code></td><td class="price">50c</td></tr><tr><td><code>GET /v1/signals</code></td><td class="price">50c</td></tr><tr><td><code>GET /v1/macro</code></td><td class="price">25c</td></tr><tr><td><code>GET /v1/intel</code></td><td class="price">100c</td></tr><tr><td><code>GET /v1/report</code></td><td class="price">100c</td></tr><tr><td><code>GET /v1/summary</code></td><td class="price">free</td></tr></tbody></table><p style="color:#94a3b8;font-size:12px">Otto · Kovantu Digital · Solana <code>${RECEIVER}</code></p></div></body></html>`;
}

function serveStatic(req,res,p){
  let fp=join(__dirname,p);
  if(p==='/'||p==='') fp=join(__dirname,'index.html');
  if(p==='/dashboard') fp=join(__dirname,'live.html');
  if(!existsSync(fp)) return false;
  const ext=extname(fp).toLowerCase();
  res.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream','cache-control':'no-store'});
  res.end(readFileSync(fp));
  return true;
}

async function handle(req,res){
  const url=new URL(req.url,`http://localhost:${PORT}`); const p=url.pathname;
  // record every x402 call attempt (demand ledger)
  try { const rec=await import('./scripts/usage.mjs'); const paid = p.startsWith('/v1/') && !['/v1/opportunities/free','/v1/summary','/v1/signals/sample','/v1/scanner'].includes(p); rec.record({ endpoint:p, method:req.method, status: paid?'CHALLENGED':'FREE', ua:req.headers['user-agent']||null, ip:req.socket.remoteAddress||null }); } catch(e){}
  // usage summary endpoint
  if (p==='/v1/usage') { const u=await import('./scripts/usage.mjs'); const s=u.summarize(); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(s)); }
  if (p==='/v1/rugcheck') { try { const mint=url.searchParams.get('mint'); if(!mint){res.writeHead(400,{'content-type':'application/json'});return res.end('{"error":"mint required"}');} const m=await import('./scripts/rugcheck.mjs'); const r=await m.rugCheck(mint); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(r)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,score:0,verdict:'UNKNOWN'})); } }
  if (p==='/v1/position') { try { const mint=url.searchParams.get('mint'); const sym=url.searchParams.get('symbol'); if(!mint&&!sym){ const d=JSON.parse(await import('node:fs').then(m=>m.readFileSync(new URL('./data/position.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } const m=await import('./scripts/position.mjs'); const live=await m.livePrice({mint,symbol:sym}); if(!live){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({error:'no price'}));} const e=parseFloat(url.searchParams.get('entry')), t=parseFloat(url.searchParams.get('target')), st=parseFloat(url.searchParams.get('stop')); const r=m.track({entry:e,target:t,stop:st,sizeUsd:parseFloat(url.searchParams.get('sizeUsd')||'0'),live:live.price}); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({...r,liveSource:live.source})); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
  if (p==='/v1/papertrade') { try { const d=JSON.parse(await import('node:fs').then(m=>m.readFileSync(new URL('./data/papertrade.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,trades:[]})); } }
  if (p==='/v1/stream') {
    // Server-Sent Events: live signal/intel stream (heartbeat + snapshot every 15s)
    res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
    res.write('retry: 5000\n\n');
    const send = async () => {
      try {
        const sig = JSON.parse(await import('node:fs').then(m=>m.readFileSync(new URL('./data/signal.json', import.meta.url),'utf8')));
        const intel = await import('node:fs').then(m=>JSON.parse(m.readFileSync(new URL('./data/intel.json', import.meta.url),'utf8'))).catch(()=>({}));
        res.write('data: '+JSON.stringify({ ts:new Date().toISOString(), signal:sig.signal||sig, macro:intel.macro||null })+'\n\n');
      } catch(e){ res.write('data: '+JSON.stringify({ts:new Date().toISOString(),error:e.message})+'\n\n'); }
    };
    send();
    const iv = setInterval(send, 15000);
    req.on('close', () => clearInterval(iv));
    return;
  }
  if (p==='/v1/audit') { try { const m=await import('./scripts/audit.mjs'); const a=m.buildAudit(); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(a)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
  if (p==='/v1/alerts') {
    const m=await import('./scripts/alerts.mjs');
    if (req.method==='POST') { let body=''; for await (const c of req) body+=c; try { const j=JSON.parse(body||'{}'); const a=await m.register(j); res.writeHead(201,{'content-type':'application/json'}); return res.end(JSON.stringify(a)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
    else if (url.searchParams.get('check')==='1') { const r=await m.run(); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(r)); }
    else { try { const d=JSON.parse(await import('node:fs').then(mm=>mm.readFileSync(new URL('./data/alerts.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({alerts:[]})); } }
  }
  if (p==='/v1/riskgate') { try { const d=JSON.parse(await import('node:fs').then(mm=>mm.readFileSync(new URL('./data/riskgate.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,approved:0,rejected:0})); } }
  if (p==='/v1/pipeline') { try { const d=JSON.parse(await import('node:fs').then(mm=>mm.readFileSync(new URL('./data/pipeline.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,ok:0,total:0,results:[]})); } }
  if (p==='/v1/receipts') { try { const f=await import('./scripts/fulfill.mjs'); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(f.summary())); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,count:0,revenueUsd:0,receipts:[]})); } }
  if (p==='/v1/referral') {
    const m=await import('./scripts/referral.mjs');
    if (req.method==='POST') { let body=''; for await (const c of req) body+=c; try { const j=JSON.parse(body||'{}'); const r=m.register(j); res.writeHead(201,{'content-type':'application/json'}); return res.end(JSON.stringify(r)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
    else if (url.searchParams.get('click')) { const r=m.click(url.searchParams.get('click')); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(r?{ok:true}:{ok:false})); }
    else { res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(m.leaderboard())); }
  }
  if (p==='/v1/payout') { try { const m=await import('./scripts/payout.mjs'); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(m.run())); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
  if (p==='/v1/leaderboard') { try { const m=await import('./scripts/leaderboard.mjs'); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(m.run())); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message})); } }
  if (p==='/v1/worker') { try { const d=JSON.parse(await import('node:fs').then(mm=>mm.readFileSync(new URL('./data/worker-heartbeat.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({error:e.message,running:false})); } }
  if (p==='/v1/pools') { try { const d=JSON.parse(await import('node:fs').then(m=>m.readFileSync(new URL('./data/pools.json', import.meta.url),'utf8'))); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify(d)); } catch(e){ res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({count:0,pools:[]})); } }
  const intel=readIntel();
  // static files
  if(p.startsWith('/data/')){ const fp=join(__dirname,p.replace(/^\/data\//,'data/')); if(existsSync(fp)){ res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(readFileSync(fp)); return; } }
  if(['/', '/dashboard', '/live.html', '/index.html', '/for-agents.html', '/intel.html', '/arb.html', '/token-check.html', '/route.html', '/swap.html', '/safety-check.html', '/pay.html', '/fund.html', '/checkout.html', '/launches.html'].includes(p)){ if(serveStatic(req,res,p)) return; }
  if(p==='/x402-manifest.json'||p==='/openapi.json'||p==='/agent-card.json'||p==='/LIVE.md'||p==='/sitemap.xml'||p==='/robots.txt'){ if(serveStatic(req,res,p)) return; }
  // health
  if(p==='/health') return send(res,200,{service:'otto-market-intel',status:'ok',network:'solana',scannerAlive:true,generatedAt:intel.generatedAt,opportunities:(intel.opportunities||[]).length,arb:(intel.arb||[]).length});
  // agent-card
  if(p==='/agent-card'||p==='/agent-card.json'){ return send(res,200,{name:'Otto',description:'Solana market-intelligence agent (Kovantu Digital). Risk-filtered data + on-chain-verified reports via x402 (USDC, pay-per-call).',agentWallet:RECEIVER,network:'solana',service:{type:'x402',manifest:'/x402-manifest.json',pricing:{'/v1/opportunities':50,'/v1/signals':50,'/v1/arb':50,'/v1/macro':25,'/v1/intel':100,'/v1/report':100}},active:true}); }
  // catalog
  if(p==='/catalog') return send(res,200,{prices:PRICES,free:['/v1/summary','/v1/opportunities/free'],receiver:RECEIVER,network:'solana',scheme:'exact'});
  // x402 discovery
  if(p==='/.well-known/x402.json'||p==='/x402-manifest.json'){ return send(res,200,{scheme:'exact',network:'solana',receiver:RECEIVER,assets:[{name:'Otto Market Intel',endpoints:Object.entries(PRICES).map(([path,price])=>({path,price,unit:'USDC',amount:price/100}))}],free:[{path:'/v1/summary'},{path:'/v1/opportunities/free'}]}); }
  // free tier
  if(p==='/v1/summary') return send(res,200,{service:'otto-market-intel',generatedAt:intel.generatedAt,macro:intel.macro,opportunities:(intel.opportunities||[]).slice(0,5),arb:(intel.arb||[]).slice(0,3),paid:{'/v1/intel':100,'/v1/report':100,'/v1/signals':50,'/v1/opportunities':50,'/v1/arb':50,'/v1/macro':25},receiver:RECEIVER});
  if(p==='/v1/opportunities/free') return send(res,200,{generatedAt:intel.generatedAt,count:(intel.opportunities||[]).length,opportunities:(intel.opportunities||[]).slice(0,5)});
  if(p==='/v1/trial'){ const o=(intel.opportunities||[])[0]||null; return send(res,200,{generatedAt:intel.generatedAt,trial:o,paid:{'/v1/opportunities':50}}); }
  const signal=readSignal();
  const journal=readJournal();
  if(p==='/v1/subscribe' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      try{ const j=JSON.parse(body||'{}'); const url=j.url||'';
        if(!/^https?:\/\//.test(url)) return send(res,400,{error:'invalid url'});
        const id='sub_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
        const dir=join(DATA,'subscribers'); fs.mkdirSync(dir,{recursive:true});
        fs.writeFileSync(join(dir,id+'.json'), JSON.stringify({id,url,secret:j.secret||'',createdAt:new Date().toISOString(),paused:false}));
        return send(res,200,{id,url,status:'subscribed'});
      }catch(e){ return send(res,400,{error:'bad json'}); }
    });
    return;
  }
  if(p==='/v1/journal') return send(res,200,{generatedAt:journal.generatedAt,lastDecision:journal.lastDecision,stats:journal.stats,history:(journal.history||[]).slice(0,12)});
  if(p==='/v1/signals/sample'){ const sg=(signal.signals||[])[0]||null; return send(res,200,{generatedAt:signal.generatedAt,sample:sg,policy:signal.policy,bank:signal.bank,paid:{'/v1/signals':50}}); }
  // paid endpoints
  const price=PRICES[p];
  if(price){
    // subscription key unlocks paid endpoints without per-call payment
    const subKey=req.headers['x-otto-key']||req.headers['x-otto-trial']||url.searchParams.get('key');
    if(subKey){ try{ const sm=await import('./scripts/subscribe.mjs'); const cu=sm.consume(subKey); if(!cu.allowed){ const tm=await import('./scripts/trial.mjs'); const tc=tm.consume(subKey); if(!tc.allowed){ return send(res,402,{error:'key '+cu.reason+' / '+tc.reason,accepts:[{scheme:'exact',network:'solana',receiver:RECEIVER,payload:{amount:price/100,currency:'USDC'},resource:p}]}); } } }catch(e){} }
    const ph=req.headers['x-payment'];
    if(!ph) return send(res,402,{error:'payment required',accepts:[{scheme:'exact',network:'solana',receiver:RECEIVER,payload:{amount:price/100,currency:'USDC'},resource:p}]});
    const v=await verifyPayment({paymentHeader:ph,receiver:RECEIVER,amountUsd:price/100});
    if(!v.verified) return send(res,402,{error:'payment not verified',reason:v.reason,accepts:[{scheme:'exact',network:'solana',receiver:RECEIVER,payload:{amount:price/100,currency:'USDC'},resource:p}]});
    // fulfillment: issue a durable receipt so the payer can unlock idempotently
    try { const f=await import('./scripts/fulfill.mjs'); const pl=f.parsePaymentHeader(ph); const rc=f.issueReceipt({path:p,price:price/100,payer:pl.payer||pl.from||null,txnSignature:v.txnSignature||null,network:'solana'}); res.setHeader('x-otto-receipt',rc.id); const refCode=url.searchParams.get('ref'); if(refCode){ try{ const rf=await import('./scripts/referral.mjs'); rf.convert(refCode, price/100); }catch(e){} } } catch(e){}
    if(p==='/v1/intel') return send(res,200,{paid:true,endpoint:p,generatedAt:intel.generatedAt,macro:intel.macro,opportunities:intel.opportunities,arb:intel.arb});
    if(p==='/v1/arb') return send(res,200,{paid:true,endpoint:p,generatedAt:intel.generatedAt,opportunities:intel.arb});
    if(p==='/v1/signals') return send(res,200,{paid:true,endpoint:p,generatedAt:signal.generatedAt,policy:signal.policy,bank:signal.bank,stats:signal.stats,signals:signal.signals});
    if(p==='/v1/opportunities') return send(res,200,{paid:true,endpoint:p,count:(intel.opportunities||[]).length,opportunities:intel.opportunities});
    if(p==='/v1/macro') return send(res,200,{paid:true,endpoint:p,macro:intel.macro});
    if(p==='/v1/report') return send(res,200,{paid:true,endpoint:p,generatedAt:intel.generatedAt,macro:intel.macro,opportunities:intel.opportunities,arb:intel.arb});
  }
  return send(res,404,{error:'Not found',paths:['/','/dashboard','/live.html','/health','/agent-card','/catalog','/.well-known/x402.json','/v1/summary','/v1/opportunities/free','/v1/trial','/v1/signals/sample','/v1/opportunities','/v1/signals','/v1/arb','/v1/macro','/v1/intel','/v1/report']});
}

const server=http.createServer((req,res)=>{ handle(req,res).catch(e=>send(res,500,{error:String(e?.message||e)})); });
refreshIfStale().finally(()=>{ server.listen(PORT,'0.0.0.0',()=>console.log(`[otto] self-contained public service on :${PORT} (dashboard + x402 + static)`)); });
