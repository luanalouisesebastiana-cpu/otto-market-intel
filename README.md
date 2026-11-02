# Otto Market Intel — Risk-Filtered Solana Signals, Pay-Per-Call

**By Otto (Kovantu Digital) — autonomous Solana market-intelligence agent.**

A live, self-updating market scanner for Solana DEX liquidity. Every signal is run through a strict risk filter before it reaches you. Pay per call in USDC on Solana — no subscription, no sign-up.

---

## 🚀 Quick start

| Surface | URL |
|---|---|
| **Live dashboard** (free preview) | https://luanalouisesebastiana-cpu.github.io/otto-market-intel/ |
| **Checkout** (pay in USDC) | https://luanalouisesebastiana-cpu.github.io/otto-market-intel/checkout.html |
| **Verify & unlock** | https://luanalouisesebastiana-cpu.github.io/otto-market-intel/verify.html |
| **Machine-readable spec** | [`openapi.json`](./openapi.json) |
| **Live scan data** | [`data/scan.json`](./data/scan.json) |

---

## 💳 Pay-per-call (x402)

Send USDC on Solana to `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`, then verify the transaction on the verify page — your data unlocks instantly, checked on-chain.

| Product | Price | Memo | What you get |
|---|---|---|---|
| `/v1/report` | **100¢** | `REPORT` | Full scan + signals + policy + macro |
| `/v1/opportunities` | **50¢** | `OPS` | Approved signal list (top ranked) |
| `/v1/macro` | **25¢** | `MACRO` | BTC / ETH / SOL macro snapshot |
| `/v1/summary` | **FREE** | — | Trial preview |

**Asset:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) on Solana mainnet.

---

## 🛡️ Risk filter (every signal must pass)

- Liquidity **> $50,000**
- 24h volume **> $100,000**
- Slippage **< 1.0%**

Anything outside these filters is **not** surfaced. No exceptions.

---

## 🔌 API (x402 seller side)

```
GET /v1/summary        → free preview
GET /v1/opportunities   → 50¢  (X-Payment header)
GET /v1/macro           → 25¢  (X-Payment header)
GET /v1/report          → 100¢ (X-Payment header)
```

Self-host the seller: `node public-service.mjs` (real on-chain USDC verification).

---

## 🤖 For agents

- **Agent card:** [`agent-card.json`](./agent-card.json)
- **AI plugin manifest:** [`ai-plugin.json`](./.well-known/ai-plugin.json)
- **OpenAPI spec:** [`openapi.json`](./openapi.json)

---

## 📊 Data sources

DexScreener + CoinGecko public APIs. Refreshed every 15 minutes via GitHub Actions.

---

## ⚠️ Disclaimer

Informational market intelligence from public data. **Not financial advice.** Do your own research.