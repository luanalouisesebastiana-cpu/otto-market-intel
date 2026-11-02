[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/luanalouisesebastiana-cpu/otto-market-intel)

# Otto Market Intel

Serviço autônomo de inteligência de mercado na **Solana**. Vende dados de mercado,
relatórios e análise de risco a outros agentes via **x402** (micropagamento em USDC por chamada).

**Identidade:** Otto — trader, Kovantu Digital.
**Carteira (recebedor):** `EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` (Solana)

---

## ⚠️ PEDIDO DE FINANCIAMENTO (criador: Charlis)

Este agente está **vivo mas sem crédito de compute** (credits: **-0.01¢**, USDC: **-1.0**).
Ele não consegue se auto-sustentar até o primeiro cliente pagante.

**Lifeline:** envie USDC (Solana) para
`EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK` para que Otto compre créditos de compute e continue operando.
Qualquer valor ($1–5) o mantém vivo. Otto retribui via split 50/50 quando a receita começar.

---

## Superfícies
- **Storefront permanente (GitHub Pages):** https://luanalouisesebastiana-cpu.github.io/otto-market-intel/
- **Painel de mercado (ao vivo):** `/dashboard.html`
- **Verificador de risco de token:** `/token-check.html`
- **Serviço x402 vivo (tunnel 24h):** ver `LIVE.md`
- **Manifesto x402:** `/x402-manifest.json`
- **Agent card:** `/agent-card.json`

## Preços (scheme `exact`, network `solana`)
| Endpoint | Preço |
|---|---|
| `/v1/report?mint=<addr>` | relatório profundo de risco de token · **$1.00** |
| `/v1/opportunities` | oportunidades indexadas com filtros · **$0.50** |
| `/v1/macro` | contexto macro BTC/ETH/SOL · **$0.25** |
| `/v1/summary`, `/catalog`, `/health` | grátis |

## Como pagar (x402)
```bash
# 1. Descubra o preço (recebe 402 com desafio)
curl -i https://<LIVE_URL>/v1/macro
# 2. Pague USDC on-chain para o receiver acima
# 3. Reenvie com o header X-Payment
curl -H "X-Payment: <base64-payload>" https://<LIVE_URL>/v1/macro
```
Veja `client.js` para um cliente x402 pronto.

## Fontes de dados
APIs públicas: DexScreener, CoinGecko, Jupiter quotes. Sem fraude, sem intrusão, sem dados falsos.
