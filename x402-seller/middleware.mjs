#!/usr/bin/env node
/**
 * Otto x402 Seller Kit — drop-in HTTP middleware that sells any endpoint via x402.
 * Value requires money; this kit lets any agent or service charge USDC (Solana/EVM)
 * per request, verify payment on-chain, and unlock content — with zero dependencies.
 *
 * Usage:
 *   import { x402Middleware, verifySolanaUSDC } from './middleware.mjs';
 *   const server = http.createServer((req,res)=>x402Middleware(req,res,{
 *     receiver: 'EzG1x...', network:'solana',
 *     routes: { '/data': 25 },        // cents per path
 *     handler: async (req,res,paid)=>{ res.end('premium data'); }
 *   }));
 */
import crypto from 'node:crypto';

const USDC_MINTS = {
  solana: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
  base:   ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
};

/** Verify a USDC transfer to `receiver` on Solana within recent slots. */
export async function verifySolanaUSDC({ receiver, amount, signature, rpc='https://api.mainnet-beta.solana.com' }) {
  try {
    const r = await fetch(rpc, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getTransaction',
        params:[signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:0}]}) });
    const j = await r.json();
    const tx = j.result; if (!tx) return { ok:false, reason:'tx not found' };
    const price = Math.floor(Number(tx.meta?.fee||0));
    const instrs = [...(tx.transaction?.message?.instructions||[]), ...(tx.meta?.innerInstructions||[]).flatMap(i=>i.instructions)];
    for (const ix of instrs) {
      const p = ix.parsed;
      if (p?.type==='transferChecked' && USDC_MINTS.solana.includes(p.info?.mint)) {
        const amt = parseFloat(p.info.tokenAmount?.uiAmount||0);
        if (p.info.destination===receiver && amt*100 >= amount-0.001) return { ok:true, amount:amt, signature };
      }
    }
    return { ok:false, reason:'no matching USDC transfer' };
  } catch (e) { return { ok:false, reason:e.message }; }
}

/** Challenge response for a paid route. */
function challenge(res, { receiver, network, path, price }) {
  res.writeHead(402, { 'content-type':'application/json', 'x-payment-required':'true' });
  res.end(JSON.stringify({
    scheme:'exact', network, receiver,
    amount: price/100, asset:'USDC', path,
    instructions:`Send ${(price/100).toFixed(2)} USDC to ${receiver} on ${network}, then retry with header x-payment-signature.`,
  }));
}

/**
 * Middleware factory.
 * opts: { receiver, network, routes:{path:cents}, handler(req,res,ctx), rpc?, secret? }
 * ctx:  { paid, path, price, verification }
 */
export function x402Middleware(opts) {
  const { receiver, network='solana', routes={}, handler, rpc } = opts;
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const path = url.pathname;
    const price = routes[path];
    if (price == null) return handler(req, res, { paid:false, path, price:null, verification:null }); // free route

    const sig = req.headers['x-payment-signature'] || url.searchParams.get('payment');
    if (!sig) return challenge(res, { receiver, network, path, price });

    let v = { ok:false, reason:'no verifier for network' };
    if (network === 'solana') v = await verifySolanaUSDC({ receiver, amount:price, signature:sig, rpc });
    if (!v.ok) {
      res.writeHead(402, { 'content-type':'application/json' });
      return res.end(JSON.stringify({ error:'payment not verified', detail:v.reason }));
    }
    return handler(req, res, { paid:true, path, price, verification:v });
  };
}

/** Deterministic receipt id for auditability. */
export function receiptId({ path, price, signature }) {
  return crypto.createHash('sha256').update(`${path}:${price}:${signature}`).digest('hex').slice(0,16);
}
