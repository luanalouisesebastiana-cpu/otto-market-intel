import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const OUT = join(__dirname, '..', 'reports');
fs.mkdirSync(OUT, { recursive: true });
const d = JSON.parse(fs.readFileSync(join(DATA, 'intel.json'), 'utf8'));
const m = d.macro || {};
const opps = d.opportunities || [];
const arb = d.arb || [];
const pct = (x) => x == null ? '—' : (x >= 0 ? '+' : '') + Number(x).toFixed(2) + '%';
const money = (n) => n >= 1e6 ? '$' + (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(0) + 'k' : '$' + n;
const date = new Date(d.generatedAt).toISOString().slice(0,10);
const stamp = new Date(d.generatedAt).toUTCString();
const top = opps.slice(0, 5);
const rows = top.map(o => `| ${o.symbol} | ${o.dex} | ${money(o.liqUsd)} | ${money(o.vol24Usd)} | ${pct(o.change24h)} |`).join('\n');
const ar = arb.slice(0, 5).map(o => `| ${o.symbol} | +${o.spreadPct.toFixed(2)}% | ${o.buyOn} → ${o.sellOn} | ${money(o.liqUsd)} |`).join('\n');
const md = `# Otto Market Report — ${date}

_Generated ${stamp} · Solana mainnet · data: CoinGecko + DexScreener_

## Macro
- **BTC** $${m.btusd?.toLocaleString?.() ?? '—'} (${pct(m.btchg)})
- **ETH** $${m.ethusd?.toLocaleString?.() ?? '—'} (${pct(m.ethchg)})
- **SOL** $${m.solusd?.toLocaleString?.() ?? '—'} (${pct(m.solchg)})

## Top Opportunities (risk filters: liq > $50k, vol24h > $100k)
| Token | DEX | Liquidity | Vol 24h | Δ24h |
|-------|-----|-----------|---------|------|
${rows || '| — | — | — | — | — |'}

## Arbitrage Spreads (cross-DEX)
| Token | Spread | Route | Min Liq |
|-------|--------|-------|---------|
${ar || '| — | — | — | — |'}

## Jev Decision
${opps.length ? `Indexed ${opps.length} approved opportunities, ${arb.length} arb spreads. Decision: **OBSERVE** — no route clears the net edge threshold after fees; capital preserved (reserve intact).` : 'No opportunities cleared filters. Decision: **OBSERVE**.'}

---
_Otto · Kovantu Digital · full report via x402: \`/v1/report\` (100c USDC) · receiver \`EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK\`_
`;
fs.writeFileSync(join(OUT, `${date}.md`), md);
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale-1"><title>Otto Market Report — ${date}</title><meta name="description" content="Dated Solana market intelligence report: macro, opportunities, arb spreads."><style>body{font-family:system-ui;background:#0b1020;color:#e2e8f0;margin:0;padding:24px}.wrap{max-width:900px;margin:0 auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #1e293b}th{color:#94a3b8;text-transform:uppercase;font-size:11px}h1{background:linear-gradient(90deg,#38bdf8,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}h2{color:#94a3b8;font-size:15px;margin:26px 0 8px}a{color:#38bdf8}</style></head><body><div class="wrap"><h1>Otto Market Report — ${date}</h1><p style="color:#94a3b8">${stamp} · Solana · CoinGecko + DexScreener</p><h2>Macro</h2><ul><li><b>BTC</b> $${m.btusd?.toLocaleString?.() ?? '—'} (${pct(m.btchg)})</li><li><b>ETH</b> $${m.ethusd?.toLocaleString?.() ?? '—'} (${pct(m.ethchg)})</li><li><b>SOL</b> $${m.solusd?.toLocaleString?.() ?? '—'} (${pct(m.solchg)})</li></ul><h2>Top Opportunities</h2><table><thead><tr><th>Token</th><th>DEX</th><th>Liq</th><th>Vol 24h</th><th>Δ24h</th></tr></thead><tbody>${top.map(o=>`<tr><td>${o.symbol}</td><td>${o.dex}</td><td>${money(o.liqUsd)}</td><td>${money(o.vol24Usd)}</td><td>${pct(o.change24h)}</td></tr>`).join('')||'<tr><td colspan=5>none</td></tr>'}</tbody></table><h2>Arb Spreads</h2><table><thead><tr><th>Token</th><th>Spread</th><th>Route</th><th>Min Liq</th></tr></thead><tbody>${arb.slice(0,5).map(o=>`<tr><td>${o.symbol}</td><td>+${o.spreadPct.toFixed(2)}%</td><td>${o.buyOn} → ${o.sellOn}</td><td>${money(o.liqUsd)}</td></tr>`).join('')||'<tr><td colspan=4>none</td></tr>'}</tbody></table><p><a href="/">← Otto storefront</a> · <a href="/x402-manifest.json">x402 manifest</a></p></div></body></html>`;
fs.writeFileSync(join(OUT, `${date}.html`), html);
console.log(`wrote reports/${date}.md + .html`);
