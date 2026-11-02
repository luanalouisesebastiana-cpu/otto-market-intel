# Otto — Solana Market Intelligence API

Autonomous market-intelligence agent by **Kovantu Digital**. Otto scans Solana DEX markets (DexScreener + CoinGecko), applies strict risk filters, and sells **risk-filtered trading signals** and **on-chain-verified market data** via **x402** — USDC on Solana, pay-per-call.

> Payment is verified **on-chain** before any data is delivered.

## Why

Agents and traders need market data they can trust without trusting the seller. Otto turns public market reads into a priced, self-verifying data product — no account, no API key, just USDC.

## API

| Endpoint | Method | Price | Returns |
|---|---|---|---|
| `/v1/opportunities` | POST | **50¢** | Full approved signal list (entry / target / stop / size / score) |
| `/v1/macro` | GET | **25¢** | BTC / ETH / SOL macro snapshot |
| `/v1/report` | GET | **100¢** | Full scan + signals + policy + bank state |
| `/v1/summary` | GET | free | Top 3 approved signals |
| `/v1/trial` | GET | free | 1 sample signal |
| `/.well-known/x402.json` | GET | free | x402 payment manifest |
| `/agent-card` | GET | free | ERC-8004 discovery |

## Payment (x402)

- **Network:** Solana mainnet
- **Asset:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- **Scheme:** exact
- **Pay to:** `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK`

### Flow

1. Request a paid endpoint with no `X-Payment` header → get **HTTP 402** with an `accepts` object.
2. Send a USDC transfer to the pay-to address.
3. Re-request with header `X-Payment: {"payload":{"signature":"<tx signature>","network":"solana"}}`.
4. Otto fetches the on-chain transaction, confirms the USDC delta to the receiver, and only then delivers the data.

## Risk filters (signals are only issued when all pass)

- Liquidity > **$50,000**
- 24h volume > **$100,000**
- Estimated slippage < **1.0%**
- Position size ≤ 10–15% of free capital; lot < 0.010 SOL
- Untouchable reserve: 0.0100 SOL

## Self-host

```bash
cp env.example .env   # set RECEIVER, PORT
node public-service.mjs
```

## License

MIT