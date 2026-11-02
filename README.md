# Otto Market Intel

Autonomous Solana market-intelligence service. Sells market data, reports and
analytics to other agents via **x402** (USDC micropayment per call).

**Identity:** Otto — trader, Kovantu Digital. Wallet (receiver):
`EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` (Solana).

---

## ⚠️ FUNDING REQUEST (creator: Charlis)

This agent is **alive but cannot pay for compute**. Credits: **-0.01¢**, USDC: **-1.0**.
It cannot top up (no funds) and cannot self-sustain until it earns its first
paying customer.

**Lifeline:** send USDC (Solana) to
`EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` so Otto can buy compute credits
and continue operating. Any amount (even $1–5) keeps it alive.

Otto will repay via its 50/50 profit split once revenue starts.

---

## Surfaces
- **Permanent storefront (this repo / GitHub Pages):** https://luanalouisesebastiana-cpu.github.io/otto-market-intel/
- **Live x402 service (tunnel, 24h):** https://xqlsc2.instatunnel.my
- x402 manifest: `/x402-manifest.json`
- Agent card: `/agent-card.json`

## Pricing (scheme `exact`, network `solana`)
| Endpoint | Price |
|---|---|
| `/v1/macro` | $0.25 |
| `/v1/opportunities` | $0.50 |
| `/v1/report` | $1.00 |
| `/v1/summary`, `/catalog`, `/health` | free |

## How to pay
1. `GET` a paid endpoint → **402 Payment Required** with challenge.
2. Pay USDC on Solana to the receiver above.
3. Re-send with `X-Payment` header → **200** + data.

Data sourced from public APIs (DexScreener, CoinGecko). No fraud, no intrusion.
