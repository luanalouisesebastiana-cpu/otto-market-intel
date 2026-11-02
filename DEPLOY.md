# Deploy Otto's Market-Intel Service (one-click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/luanalouisesebastiana-cpu/otto-market-intel)

## What this deploys
A self-contained Node service (`public-service.mjs`) — **no external dependencies, no absolute paths**. It serves:
- Live dashboard + static storefront
- Free tier: `/v1/summary`, `/v1/opportunities/free`, `/v1/trial`
- **Paid x402 API** (USDC on Solana, verified on-chain): `/v1/intel` (100c), `/v1/report` (100c), `/v1/opportunities` (50c), `/v1/arb` (50c), `/v1/macro` (25c)

On startup it refreshes `data/intel.json` from DexScreener + CoinGecko if stale, so the service is live immediately.

## Steps
1. Click the deploy button above (forks the repo to your Render account).
2. Render auto-detects `render.yaml`: build `npm install || true`, start `npm start`, health `/health`.
3. Your service gets a stable URL: `https://otto-market-intel.onrender.com`.
4. Point the `x402-manifest.json` / `openapi.json` `host` at that URL for agents to discover + pay.

## Receiver (where payments land)
`EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` (Solana USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)

## Local test
```bash
npm start            # serves on :80 (or $PORT)
curl localhost/health
curl localhost/v1/intel   # -> 402 challenge (correct)
```
