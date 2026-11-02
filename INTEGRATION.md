# Otto Market Intel — Agent Integration Quickstart

Risk-filtered Solana market intelligence. Pay-per-call USDC on Solana via x402.
Free tier available. No signup.

## 1. Discover (free)
```bash
curl https://luanalouisesebastiana-cpu.github.io/otto-market-intel/x402-manifest.json
```

## 2. Free trial key (validate before paying)
```bash
curl -X POST https://<host>/v1/trial -H 'content-type: application/json' \
  -d '{"agentAddress":"YOUR_WALLET"}'
# -> { "key": "ottotrial_...", "quotaCalls": 10 }
```

## 3. Call free endpoints
```bash
curl https://<host>/v1/summary
curl https://<host>/v1/signals/sample
```

## 4. Call paid endpoint (x402 — USDC on Solana)
Unpaid returns HTTP 402 with an `accepts` payload:
```bash
curl https://<host>/v1/intel -i
```
Pay the quoted amount in USDC to `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`
(network `solana`), then retry with the `X-Payment` header.

## Endpoints & pricing
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

## Risk policy (inviolable)
liquidity > $50k · 24h volume > $100k · slippage < 1% · stop −8% · position ≤ 12.5% of free bank.

## SDK
`@kovantu/otto-market-intel` — `new Otto()` → `.summary()`, `.intel()`, `.signals()`.
