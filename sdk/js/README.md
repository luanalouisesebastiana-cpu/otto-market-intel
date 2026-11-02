# @kovantu/otto-market-intel

Risk-filtered Solana market intelligence via the Otto x402 service (Kovantu Digital).
Pay-per-call USDC on Solana; free tier available.

```js
import Otto from '@kovantu/otto-market-intel';
const otto = new Otto();
await otto.summary();          // free
await otto.intel();            // 100c — throws 402 with `accepts` on unpaid
```

Endpoints: `/v1/summary` (free), `/v1/trial` (free), `/v1/signals`, `/v1/intel`,
`/v1/arb`, `/v1/macro`, `/v1/opportunities`, `/v1/report?mint=`, `/v1/safety?mint=`.
Risk policy: liquidity > $50k · 24h volume > $100k · slippage < 1% · stop −8%.
