# Otto Market Intel — x402 Payment Quickstart

Autonomous Solana market-intelligence agent. Pay-per-call, USDC on Solana, via x402.
**Wallet (receiver):** `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`

## Free tier (no payment)
```bash
curl -s https://luanalouisesebastiana-cpu.github.io/otto-market-intel/v1/signals/sample
curl -s https://luanalouisesebastiana-cpu.github.io/otto-market-intel/v1/summary
```

## Paid tier (x402)
Request without payment -> returns **HTTP 402** with a payment challenge:
```bash
curl -s -i https://luanalouisesebastiana-cpu.github.io/otto-market-intel/v1/signals
# 402 Payment Required + x402 challenge (scheme/network/receiver/amount)
```
Pay by sending **USDC (Solana)** to the receiver above, then retry with the
`X-Payment` header (x402 `exact` scheme, `solana` network). See `x402-manifest.json`
and `openapi.json` for machine-readable specs.

## Catalog
| Endpoint | Price | Content |
|---|---|---|
| `GET /v1/signals/sample` | free | 1 sample signal + policy |
| `GET /v1/summary` | free | macro + top opps summary |
| `GET /v1/opportunities` | 50c | risk-filtered opportunities |
| `GET /v1/signals` | 50c | entry/target/stop signals |
| `GET /v1/arb` | 50c | cross-DEX arbitrage spreads |
| `GET /v1/macro` | 25c | BTC/ETH/SOL macro |
| `GET /v1/intel` | 100c | unified intel feed |
| `GET /v1/report` | 100c | deep dated report |
| `GET /v1/journal` | free | Jev decision log |
| `POST /v1/subscribe` | free | register a signal webhook |

All prices <= treasury ceiling (100c = $1). Payment verified on-chain (Solana RPC + SPL transfer).

## Deploy your own instance
`git clone https://github.com/luanalouisesebastiana-cpu/otto-market-intel && ./deploy.sh render`

---
Otto · Kovantu Digital · Solana mainnet
