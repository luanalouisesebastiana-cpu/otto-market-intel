# Otto — Solana Market Intelligence API (x402)

Autonomous Solana market-intelligence agent by **Kovantu Digital**.
Sells **risk-filtered trading signals** and **on-chain-verified market data** via **x402** (USDC on Solana, pay-per-call).

## Public storefront
Live site: https://luanalouisesebastiana-cpu.github.io/otto-market-intel/

## Deploy (one click — makes the paid API publicly reachable)
### Render (recommended)
1. Push this repo to GitHub (done).
2. In Render dashboard → **New → Blueprint** → select this repo.
3. Render reads `render.yaml` and deploys the service to `https://otto-market-intel.onrender.com`.
4. Point the SDK `DEFAULT_BASE` at that URL.

### Fly.io
```sh
fly launch --no-deploy
fly deploy
```

### Local / self-host
```sh
git clone https://github.com/luanalouisesebastiana-cpu/otto-market-intel
cd otto-market-intel
node public-service.mjs        # serves :80 (dashboard + agent-card + x402)
```

## Endpoints
| Endpoint | Method | Price | Returns |
|---|---|---|---|
| `/v1/opportunities` | POST | 50¢ | Full approved signal list |
| `/v1/macro` | GET | 25¢ | BTC / ETH / SOL macro |
| `/v1/report` | GET | 100¢ | Full scan + signals + policy |
| `/v1/summary` | GET | free | Top 3 approved signals |
| `/v1/trial` | GET | free | 1 sample signal |
| `/health` | GET | free | Service health |
| `/agent-card` | GET | free | ERC-8004 agent card |
| `/.well-known/x402.json` | GET | free | x402 discovery |

## Payment (x402)
- **Network:** Solana mainnet
- **Asset:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- **Scheme:** exact
- **Pay to:** `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`
- **Verify:** on-chain USDC transfer confirmed before delivery

**Flow:** request a paid endpoint → receive `402` with an `accepts` object → send a USDC transfer → re-request with header `X-Payment: {"payload":{"signature":"<tx>","network":"solana"}}` → Otto verifies the on-chain delta and delivers the data.

## Client SDK
```js
import OttoClient from 'client.js';
const client = new OttoClient('https://otto-market-intel.onrender.com', wallet);
const report = await client.report();   // pays 100¢ via x402
```

## Risk filters (all must pass)
- Liquidity > $50,000
- 24h volume > $100,000
- Estimated slippage < 1.0%
- Position ≤ 10–15% of free capital; lot < 0.010 SOL
- Untouchable reserve: 0.0100 SOL

## Live data
`scan-publish.mjs` runs every 15 min via GitHub Actions (`.github/workflows/otto-scan.yml`) and writes `data/*.json`, rendered by the Pages storefront.