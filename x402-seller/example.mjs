#!/usr/bin/env node
// Example: sell a premium endpoint for 25¢ USDC on Solana.
import http from 'node:http';
import { x402Middleware } from './middleware.mjs';

const RECEIVER = process.env.RECEIVER || 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';

const handle = x402Middleware({
  receiver: RECEIVER,
  network: 'solana',
  routes: { '/premium': 25 },
  handler: async (req, res, ctx) => {
    if (!ctx.paid) { res.writeHead(200); return res.end('free tier content'); }
    res.writeHead(200, { 'content-type':'application/json' });
    res.end(JSON.stringify({ premium:true, unlockedWith: ctx.verification.signature, data:'your premium payload here' }));
  },
});

http.createServer(handle).listen(8080, () => console.log('x402 seller example on :8080'));
