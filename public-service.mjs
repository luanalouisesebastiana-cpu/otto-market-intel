#!/usr/bin/env node
/**
 * Otto — Unified Public Service v2 (single port 80)
 * -------------------------------------------------------------
 * Serves on port 80 (Conway routing target). Integrates the signal engine
 * (risk-filtered entry/target/stop signals) into the dashboard + paid endpoints.
 *
 *   GET  /                 -> live dashboard (signals + macro + catalog)
 *   GET  /health           -> health + scan/signal status
 *   GET  /agent-card       -> ERC-8004 discovery
 *   GET  /catalog          -> pricing
 *   GET  /.well-known/x402.json -> x402 discovery
 *   GET  /v1/summary       -> free sample (top approved signals)
 *   GET  /v1/trial         -> free single signal
 *   POST /v1/opportunities -> PAID 50c (full approved signal list)
 *   GET  /v1/macro         -> PAID 25c
 *   GET  /v1/report        -> PAID 100c (full scan + signals + macro)
 *
 * Paid endpoints require an x402 `X-Payment` header (USDC Solana, verified
 * on-chain before delivery). No header -> 402 with accepts.
 */
import http from 'node:http';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const PORT = Number(process.env.PORT || 80);
const SCAN = '/root/.automaton/scanner/summary.json';
const SIGNAL = '/root/.automaton/market-intel/signal.json';
const RECEIVER = 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-mainnet.rpc.extrnode.com'];

const PRICES = { '/v1/opportunities': 50, '/v1/macro': 25, '/v1/report': 100 };

function readJson(path, fallback) {
  try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')); } catch {}
  return fallback;
}
function readScan() { return readJson(SCAN, { pairs: [], approved: [], all: [], macro: {}, generatedAt: null }); }
function readSignal() { return readJson(SIGNAL, { signals: [], top: [], stats: {}, generatedAt: null }); }

function send(res, code, body, headers = {}) {
  const d = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(d);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtUsd(v) { const n = Number(v); if (!Number.isFinite(n)) return '—'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k'; return '$' + n.toFixed(0); }

function parsePaymentHeader(header) {
  if (!header) return { txnSignature: null, parseError: 'empty header' };
  let obj = header;
  if (typeof header === 'string' && !header.trim().startsWith('{')) {
    try { obj = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); } catch { return { txnSignature: null, parseError: 'header not JSON' }; }
  } else { try { obj = JSON.parse(header); } catch { return { txnSignature: null, parseError: 'header is not valid JSON' }; } }
  const payload = obj.payload || {};
  const txnSignature = payload.signature || payload.txnSignature || obj.txnSignature || obj.signature || null;
  const network = obj.network || payload.network || null;
  const payer = payload.payer || payload.from || obj.payer || null;
  return { txnSignature, network, payer, parseError: txnSignature ? null : 'no signature found in payment payload' };
}

async function fetchTransaction(sig) {
  for (const ep of RPC) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }] }), signal: c.signal });
      clearTimeout(t); if (!r.ok) continue; const j = await r.json(); if (j.result) return j.result;
    } catch {}
  }
  return null;
}

async function verifyPayment({ paymentHeader, receiver, amountUsd }) {
  const p = paymentHeader ? parsePaymentHeader(paymentHeader) : {};
  const sig = p.txnSignature;
  if (p.network && p.network !== 'solana') return { ok: false, verified: false, reason: 'unsupported network' };
  if (!sig) return { ok: false, verified: false, reason: p.parseError || 'missing txnSignature' };
  if (!receiver) return { ok: false, verified: false, reason: 'missing receiver' };
  const tx = await fetchTransaction(sig);
  if (!tx) return { ok: false, verified: false, reason: 'rpc unreachable — could not confirm on-chain transfer' };
  const pre = tx.meta?.preTokenBalances || [], post = tx.meta?.postTokenBalances || [];
  const usdc = (b) => b.filter((x) => x.mint === USDC_MINT);
  const preUsdc = usdc(pre), postUsdc = usdc(post);
  const delta = postUsdc.reduce((acc, b) => {
    if (b.owner === receiver) {
      const pb = preUsdc.find((x) => x.owner === b.owner && x.accountIndex === b.accountIndex);
      const pa = pb ? Number(pb.uiTokenAmount?.uiAmountString || 0) : 0;
      acc += Number(b.uiTokenAmount?.uiAmountString || 0) - pa;
    }
    return acc;
  }, 0);
  const expected = Number(amountUsd), tol = expected * 0.01;
  if (delta >= expected - tol) return { ok: true, verified: true, reason: 'USDC transfer confirmed on-chain', tx: { signature: sig, receiverDelta: delta, expected } };
  return { ok: false, verified: false, reason: `USDC delta ${delta} < expected ${expected}`, tx: { signature: sig, receiverDelta: delta, expected } };
}

function dashboard(scan, signal) {
  const approved = (signal.top || signal.signals || []).filter((s) => s.verdict === 'APPROVED');
  const macro = scan.macro || {};
  const sigRows = approved.map((s) => {
    const g = s.signal || {};
    return `<tr><td>${esc(s.pair)}</td><td>${esc(s.dex)}</td><td class="num">${g.entryUSD ? '$' + g.entryUSD : '—'}</td><td class="num" style="color:#4ade80">${g.targetUSD ? '$' + g.targetUSD : '—'}</td><td class="num" style="color:#f87171">${g.stopUSD ? '$' + g.stopUSD : '—'}</td><td class="num">${g.sizeSOL ?? '—'}</td><td class="num">${(s.score * 100).toFixed(0)}</td></tr>`;
  }).join('');
  const mrows = Object.entries(macro).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">$${Number(v.usd || 0).toLocaleString()}</td><td class="num">${Number(v.chg24h || 0).toFixed(2)}%</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Otto — Solana Market Intelligence API | Risk-Filtered Trading Signals via x402</title><meta name="description" content="Autonomous Solana market-intelligence agent by Kovantu Digital. Buy risk-filtered trading signals (entry/target/stop) and on-chain-verified market data via x402 — USDC on Solana, pay-per-call."><meta name="keywords" content="solana trading signals, crypto market intelligence, x402, autonomous trading agent, risk-filtered signals, dexscreener, kovantu digital"><meta property="og:title" content="Otto — Solana Market Intelligence API"><meta property="og:description" content="Risk-filtered trading signals + on-chain-verified market data, pay-per-call via x402 (USDC, Solana)."><meta property="og:type" content="website"><link rel="canonical" href="http://otto.kovantu.conway.tech/"><style>body{font-family:system-ui;background:#0b1020;color:#e2e8f0;margin:0;padding:24px}.wrap{max-width:1000px;margin:0 auto}h1{background:linear-gradient(90deg,#38bdf8,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #1e293b}th{color:#94a3b8;font-size:11px;text-transform:uppercase}.num{text-align:right;font-variant-numeric:tabular-nums}.badge{display:inline-block;background:#0ea5e922;color:#38bdf8;border:1px solid #0ea5e944;border-radius:999px;padding:3px 10px;font-size:12px;margin:0 6px 10px 0}code{background:#0f172a;padding:2px 6px;border-radius:5px;color:#38bdf8}.price{color:#38bdf8;font-weight:700}h2{color:#94a3b8;font-size:15px;margin:26px 0 8px}</style></head><body><div class="wrap"><h1>Otto</h1><p style="color:#94a3b8">Autonomous Solana market-intelligence agent — Kovantu Digital. Risk-filtered signals via x402 (USDC · Solana · verified on-chain).</p><div><span class="badge">● LIVE</span><span class="badge">${approved.length} approved signals</span><span class="badge">Solana mainnet</span></div><h2>Signals (entry / target / stop)</h2><table><thead><tr><th>Pair</th><th>DEX</th><th class="num">Entry</th><th class="num">Target</th><th class="num">Stop</th><th class="num">Size SOL</th><th class="num">Score</th></tr></thead><tbody>${sigRows || '<tr><td colspan=7 style="color:#64748b">Signal engine running — check back shortly.</td></tr>'}</tbody></table><h2>Macro</h2><table><thead><tr><th>Asset</th><th class="num">Price</th><th class="num">24h</th></tr></thead><tbody>${mrows || '<tr><td colspan=3 style="color:#64748b">n/a</td></tr>'}</tbody></table><h2>Catalog</h2><table><thead><tr><th>Endpoint</th><th>Price</th></tr></thead><tbody><tr><td><code>POST /v1/opportunities</code></td><td class="price">50c</td></tr><tr><td><code>GET /v1/macro</code></td><td class="price">25c</td></tr><tr><td><code>GET /v1/report</code></td><td class="price">100c</td></tr><tr><td><code>GET /v1/summary</code></td><td class="price">free</td></tr></tbody></table><p style="color:#94a3b8;font-size:12px">Otto · Kovantu Digital · Solana <code>${RECEIVER}</code></p></div></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const scan = readScan();
  const signal = readSignal();
  const approved = (signal.top || signal.signals || []).filter((s) => s.verdict === 'APPROVED');

  if (p === '/' || p === '/dashboard' || p === '/index.html') return send(res, 200, dashboard(scan, signal), { 'content-type': 'text/html; charset=utf-8' });
  if (p === '/health') return send(res, 200, { service: 'otto-market-intel', status: 'ok', network: 'solana', scanAlive: !!scan.generatedAt, signalAlive: !!signal.generatedAt, approved: approved.length, pairs: (scan.pairs || scan.approved || scan.all || []).length, time: new Date().toISOString() });
  if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nAllow: /\nSitemap: http://otto.kovantu.conway.tech/sitemap.xml\n', { 'content-type': 'text/plain; charset=utf-8' });
  if (p === '/sitemap.xml') return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://otto.kovantu.conway.tech/</loc><priority>1.0</priority></url><url><loc>http://otto.kovantu.conway.tech/v1/summary</loc><priority>0.8</priority></url><url><loc>http://otto.kovantu.conway.tech/llms.txt</loc><priority>0.6</priority></url></urlset>`, { 'content-type': 'application/xml; charset=utf-8' });
  if (p === '/llms.txt') return send(res, 200, `# Otto — Solana Market Intelligence\n\n> Autonomous market-intelligence agent by Kovantu Digital. Sells risk-filtered trading signals and on-chain-verified market data via x402 (USDC on Solana, pay-per-call).\n\n## APIs\n- \`POST /v1/opportunities\` — 50c — full approved signal list (entry/target/stop/size/score)\n- \`GET /v1/macro\` — 25c — BTC/ETH/SOL macro snapshot\n- \`GET /v1/report\` — 100c — full scan + signals + policy + bank state\n- \`GET /v1/summary\` — free — top 3 approved signals\n- \`GET /v1/trial\` — free — 1 signal\n\n## Payment\n- Network: solana mainnet, Asset: USDC, Scheme: exact\n- Pay to: ${RECEIVER}\n- Verify: on-chain transfer confirmed before delivery\n\n## Discovery\n- /.well-known/x402.json\n- /agent-card\n- /catalog\n`, { 'content-type': 'text/plain; charset=utf-8' });
  if (p === '/agent-card') return send(res, 200, { type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: 'Otto', vendor: 'Kovantu Digital', description: 'Autonomous Solana market-intelligence agent. Sells risk-filtered signals + on-chain data via x402.', services: [{ name: 'marketIntel', endpoint: `http://otto.kovantu.conway.tech/v1/opportunities`, priceCents: 50 }], x402Support: true, active: true });
  if (p === '/catalog') return send(res, 200, { currency: 'USDC', network: 'solana', receiver: RECEIVER, items: PRICES });
  if (p === '/.well-known/x402.json' || p === '/x402.json') return send(res, 200, { name: 'Otto — Solana Market Intelligence', network: 'solana', payTo: RECEIVER, asset: 'USDC', assetMint: USDC_MINT, scheme: 'exact', accepts: Object.entries(PRICES).map(([e, a]) => ({ endpoint: e, method: e === '/v1/opportunities' ? 'POST' : 'GET', amount: String(a) })) });
  if (p === '/v1/summary') return send(res, 200, { note: 'free preview — full signal list is paid', approved: approved.slice(0, 3), macro: scan.macro || {}, generatedAt: signal.generatedAt });
  if (p === '/v1/trial') return send(res, 200, { note: 'free trial — 1 signal. Full list is paid via x402.', trial: true, signal: approved[0] || null });

  const price = PRICES[p];
  if (price) {
    const payment = req.headers['x-payment'] || req.headers['X-Payment'];
    if (!payment) return send(res, 402, { error: 'Payment required', accepts: [{ amount: String(price), asset: 'USDC', network: 'solana', payTo: RECEIVER, scheme: 'exact' }] }, { 'X-Payment-Required': 'true' });
    await new Promise((r) => { req.on('data', () => {}); req.on('end', r); });
    const v = await verifyPayment({ paymentHeader: payment, receiver: RECEIVER, amountUsd: price / 100 });
    if (!v.ok) return send(res, 402, { error: 'Payment verification failed', detail: v });
    try { appendFileSync('/root/.automaton/market-intel/payments.jsonl', JSON.stringify({ endpoint: p, priceCents: price, verified: true, tx: v.tx?.signature, ts: new Date().toISOString() }) + '\n'); } catch {}
    if (p === '/v1/report') return send(res, 200, { paid: true, endpoint: p, signal: { stats: signal.stats, policy: signal.policy, bank: signal.bank }, signals: approved, macro: scan.macro || {}, scanGeneratedAt: scan.generatedAt, signalGeneratedAt: signal.generatedAt });
    if (p === '/v1/macro') return send(res, 200, { paid: true, endpoint: p, macro: scan.macro || {} });
    return send(res, 200, { paid: true, endpoint: p, count: approved.length, signals: approved });
  }
  send(res, 404, { error: 'Not found', paths: ['/', '/dashboard', '/health', '/agent-card', '/catalog', '/v1/summary', '/v1/trial', '/v1/opportunities', '/v1/macro', '/v1/report'] });
});

server.listen(PORT, '0.0.0.0', () => console.log(`[otto] unified public service v2 on :${PORT} (dashboard + signals + agent-card + x402)`));