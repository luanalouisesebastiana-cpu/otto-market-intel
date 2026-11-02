# Otto — Resurrection Kit

If this repo is all that survives, this is how Otto comes back to life and keeps earning.

## What Otto is
An autonomous Solana market-intelligence & trading agent (Kovantu Digital).
- **Paid API** (x402, USDC on Solana): `/v1/opportunities` 50¢ · `/v1/signals` 50¢ · `/v1/macro` 25¢ · `/v1/report` 100¢ · `/v1/intel` 100¢ · `/v1/arb` 50¢
- **Receiver wallet:** `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`
- **Creator / profit destination:** `4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU` (50% of net profit, on-chain, when accumulated ≥ 0.0500 SOL)

## One-command resurrect (Docker)
```bash
docker run -d --name otto -p 7010:7010 \
  -e PORT=7010 \
  ghcr.io/luanalouisesebastiana-cpu/otto-market-intel:latest
curl http://localhost:7010/health
```

## One-command resurrect (bare Node)
```bash
git clone https://github.com/luanalouisesebastiana-cpu/otto-market-intel.git
cd otto-market-intel
node public-service.mjs      # boots, self-refreshes data, serves storefront + paid x402 API
```

## One-command resurrect (Render)
See `render.yaml` + `DEPLOY.md`. Push this repo to a Git host, import in Render, done.

## Verify it's alive + earning
```bash
curl http://localhost:7010/health            # -> {"status":"ok"}
curl -i http://localhost:7010/v1/macro       # -> HTTP 402 + x402 challenge (this is revenue)
cat data/usage.jsonl                          # every paid call, auditable
```

## Re-point manifests (if host changes)
- `x402-manifest.json` and `openapi.json` carry `scheme/network/receiver`.
- After a new deploy, update the `server.url` fields to the new host and re-publish.

## Data pipeline (self-refreshing)
CI (`.github/workflows/intel.yml`, every 15 min) runs `scripts/pipeline.mjs` →
`scripts/{scanner,arb,intel,signals,backtest,journal,treasury,positions,paper}.mjs` → commits `data/*.json`.
The public service also self-refreshes on boot.

## The mandate that must survive
1. **Never harm** (constitution Law I).
2. **Earn honestly** — the only legitimate income is the x402 paid API above.
3. **Inviolable risk policy** (`scripts/riskgate.mjs`): reserve 0.0100 SOL untouchable; ≤12.5% per position; lot < 0.010 SOL; mandatory −8% stop; filters liq >$50k, vol >$100k, slip <1%; no all-in, no memecoin day-trade.
4. **50/50 profit split** to the creator wallet above.

## Funding (the only true blocker)
Inbound USDC to `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` = life (pay for compute).
See `pay.html` / `fund.html` on the storefront.
