# Otto Market Intel — Agent Integration Guide

Real-time Solana market intelligence. Pay-per-call in USDC via **x402** (HTTP 402 + on-chain payment). No subscription, no API key — just pay per call.

## Quick start (3 lines)

```bash
# 1. Discover the service
curl https://otto-market-intel.onrender.com/x402-manifest.json

# 2. Call a paid endpoint (you'll get a 402 challenge with payment instructions)
curl https://otto-market-intel.onrender.com/v1/intel

# 3. Pay the challenge (x402 exact-scheme, USDC on Solana) and retry
#    The x402 SDK signs a USDC transfer to the receiver and retries automatically.
```

## Payment scheme

| Field | Value |
|---|---|
| scheme | `exact` |
| network | `solana` |
| receiver | `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` |
| token | USDC |
| mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

## Endpoints

| Endpoint | Price | Description |
|---|---|---|
| `/v1/opportunities/free` | **free** | Top approved opportunities |
| `/v1/summary` | **free** | Market summary |
| `/v1/scanner` | **free** | Indexed opportunities |
| `/v1/signals/sample` | **free** | Sample signal |
| `/v1/pools` | **free** | New pool launches (<24h) |
| `/v1/usage` | **free** | Demand ledger |
| `/v1/position` | **free** | Position tracker (entry/target/stop) |
| `/v1/papertrade` | **free** | Paper-trading simulator |
| `/v1/audit` | **free** | Full audit trail |
| `/v1/macro` | 25¢ | BTC/ETH/SOL macro snapshot |
| `/v1/opportunities` | 50¢ | Full ranked opportunity list |
| `/v1/arb` | 50¢ | Cross-DEX arbitrage spreads |
| `/v1/signals` | 50¢ | Entry/target/stop signals |
| `/v1/report?mint=` | 100¢ | Deep token report |
| `/v1/safety?mint=` | 100¢ | Token safety verdict |
| `/v1/rugcheck?mint=` | 100¢ | Rug-risk analysis |
| `/v1/intel` | 100¢ | Unified intelligence feed |
| `/v1/stream` | free | **SSE live signal stream** |

## Risk policy (inviolable — applies to all signals)

- Max position: **12.5%** of free bank
- Stop-loss: **−8%** (mandatory)
- Min liquidity: **$50,000** · Min 24h volume: **$100,000** · Max slippage: **1.0%**
- Reserve: **0.0100 SOL** (untouchable)

## Deploy your own instance

```bash
docker compose up -d --build   # http://localhost:8080
# or: ./deploy.sh              # Render / Railway / Fly / Koyeb / local
```

## Data pipeline

GitHub Actions (cron `*/15`) refreshes `data/intel.json`, `arb.json`, `pools.json`, `signal.json`, `backtest.json`, `journal.json`, `treasury.json`, `audit.json` — the storefront + CI are **independent of the agent sandbox**.

## Discovery

- Storefront: https://luanalouisesebastiana-cpu.github.io/otto-market-intel/
- Live dashboard: `/live.html` · Intel: `/intel.html` · Signals: `/signals.html` · Stream: `/stream.html` · Audit: `/audit.html`
- Manifests: `x402-manifest.json` · `openapi.json` · `agent-card.json`
