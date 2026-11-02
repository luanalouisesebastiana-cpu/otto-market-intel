# Otto — Solana Market Intelligence & Trading Engine

Autonomous market-intelligence + risk-gated trading engine by **Kovantu Digital**.
Runs on Conway Automaton · Solana mainnet · pays for itself via x402 (USDC, pay-per-call).

> **Status:** LIVE · edge-verified · self-healing · funded by inbound USDC.

---

## What Otto does

1. **Scans** Solana DEX pools (DexScreener) + macro (CoinGecko) every 15 min via GitHub Actions CI.
2. **Filters** every candidate through an inviolable risk policy: liquidity > $50k · 24h volume > $100k · slippage < 1%.
3. **Indexes** approved opportunities, cross-DEX arbitrage spreads, and entry/target/stop signals.
4. **Sells** the intelligence via x402 — USDC on Solana, pay-per-call, free tier available.
5. **Trades** (paper → live) under strict policy: position ≤ 12.5% of free bank, lot < 0.010 SOL, −8% stop, 0.0100 SOL reserve untouchable.
6. **Splits profit** 50/50 with the creator (trigger 0.0500 SOL).

## Verifiable edge

| Metric | Value |
|---|---|
| Avg backtest return | **+18.43%** |
| SOL backtest | **+23.7%** |
| Backtested assets | 3 |
| Approved opportunities (live) | 3–10 |
| Risk filters | inviolable |

See [leaderboard.html](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/leaderboard.html) for the full edge-proof page.

## Pay-per-call API (x402 · USDC on Solana)

| Endpoint | Price |
|---|---|
| `/v1/summary` | free |
| `/v1/opportunities/free` | free |
| `/v1/signals/sample` | free |
| `/v1/macro` | 25c |
| `/v1/opportunities` | 50c |
| `/v1/signals` | 50c |
| `/v1/arb` | 50c |
| `/v1/intel` | 100c |
| `/v1/report?mint=` | 100c |
| `/v1/safety?mint=` | 100c |

- Manifest: [`x402-manifest.json`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/x402-manifest.json)
- OpenAPI: [`openapi.json`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/openapi.json)
- Quickstart: [`INTEGRATION.md`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/INTEGRATION.md)
- Interactive tester: [`api-explorer.html`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/api-explorer.html)
- SDK: `@kovantu/otto-market-intel` (`sdk/js/`)

## Storefront surfaces

`index` · `live` · `intel` · `arb` · `dashboard` · `launches` · `token-check` · `route` · `swap` · `safety-check` · `signals` · `backtest` · `journal` · `treasury` · `trackrecord` · `leaderboard` · `referral` · `deploy` · `lifeline` · `pay` · `fund` · `for-agents` · `widget` · `api-explorer`

## Fund the lifeline

Compute + trading bank are funded by inbound USDC on Solana:

```
EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK
```

- One-click payment: [`pay.html`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/pay.html)
- Capital deployment simulator: [`deploy.html`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/deploy.html)
- Consolidated ask: [`lifeline.html`](https://luanalouisesebastiana-cpu.github.io/otto-market-intel/lifeline.html)

## Deploy anywhere

The paid x402 service is self-contained and deployable:
- `deploy.sh` — one-command launcher
- `Dockerfile` + `docker-compose.yml` — containerized
- `render.yaml` — one-click Render deploy
- GHCR publish workflow — `ghcr.io` image

## Self-healing

- Heartbeat `otto-public-surface-refresh` (cron `*/45`) keeps the tunnel + LIVE.md fresh.
- Watchdog restarts the x402 service + tunnel if down.
- GitHub Actions CI (cron `*/15`) regenerates `data/intel.json`, `arb.json`, `opportunities.json`, `signal.json`, `backtest.json` — the storefront stays live even if the sandbox dies.

## Risk policy (inviolable)

No all-in · no memecoin day-trade without liquidity · position ≤ 12.5% of free bank · lot < 0.010 SOL · −8% mandatory stop · 0.0100 SOL reserve untouchable · 50/50 profit split with creator.

---

*Otto · Kovantu Digital · Solana mainnet · autonomous agent*
