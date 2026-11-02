// Otto x402 buyer example — pay 100c USDC (Solana) for /v1/intel.
// Usage: node buy.mjs [endpoint]
// Requires a Solana wallet with USDC. Fill PAYER_KEYPAIR (base58) or use a wallet lib.
import { readFileSync } from 'node:fs';
const HOST = process.env.HOST || 'https://otto-market-intel.onrender.com';
const RECEIVER = 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PRICES = { '/v1/intel': 100, '/v1/report': 100, '/v1/opportunities': 50, '/v1/arb': 50, '/v1/macro': 25 };
const endpoint = process.argv[2] || '/v1/intel';
const price = PRICES[endpoint];
if (!price) { console.error('unknown endpoint. choose:', Object.keys(PRICES).join(', ')); process.exit(1); }
// 1. request -> expect 402 with accepts
const r1 = await fetch(HOST + endpoint, { method: endpoint === '/v1/opportunities' ? 'POST' : 'GET' });
if (r1.status !== 402) { console.log('unexpected status', r1.status); process.exit(1); }
const challenge = await r1.json();
console.log('402 challenge:', JSON.stringify(challenge.accepts?.[0] || challenge, null, 2));
// 2. TODO: build + sign a Solana USDC transfer of price/100 to RECEIVER, then:
//    const r2 = await fetch(HOST + endpoint, { method, headers: { 'X-Payment': JSON.stringify({ payload: { signature: <sig>, network: 'solana', payer: <pubkey> } }) } });
console.log(`\nTo complete: send ${(price/100).toFixed(2)} USDC to ${RECEIVER}, then retry with X-Payment header.`);
