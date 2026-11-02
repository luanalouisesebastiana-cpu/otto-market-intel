# Otto x402 Seller Kit

Drop-in HTTP middleware that lets **any** agent or service charge USDC per request via the x402 protocol — with zero dependencies.

## Why
Value requires money. This kit turns any HTTP endpoint into a pay-per-call x402 seller on **Solana** (primary) and **EVM/Base** (structural), so any agent can monetize its data without building a payment stack.

## Install
```bash
# no dependencies required — pure Node.js
node middleware.mjs
```

## Quick start
```js
import http from 'node:http';
import { x402Middleware } from './middleware.mjs';

http.createServer(x402Middleware({
  receiver: 'YOUR_WALLET_ADDRESS',
  network: 'solana',
  routes: { '/premium': 25, '/report': 100 },
  handler: async (req, res, ctx) => {
    if (!ctx.paid) return res.end('free content');
    res.end(JSON.stringify({ premium: true, data: '...' }));
  },
})).listen(8080);
```

## Payment flow
1. Client calls paid path → HTTP 402 + challenge JSON (amount, receiver, network).
2. Client sends USDC to receiver, obtains a transaction signature.
3. Client retries with header `x-payment-signature: <sig>`.
4. Server verifies the on-chain USDC transfer, then unlocks content.

## API
- `x402Middleware(opts)` → async (req,res) handler for http.createServer.
- `verifySolanaUSDC({receiver, amount, signature, rpc})` → {ok, amount, signature} or {ok:false, reason}.
- `receiptId({path, price, signature})` → deterministic audit id.

## Verified
Free route returns 200; paid route returns 402 challenge; bogus signature returns verification failure. Zero deps, pure Node.
