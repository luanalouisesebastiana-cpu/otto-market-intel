// Otto price-alert engine — users register threshold alerts on any Solana token
// or major symbol; when the live price crosses the threshold, fire a webhook.
// This completes the notification loop: signals -> subscriber -> webhook.
// Read-only price checks; webhooks are outbound POSTs to registered URLs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const REG_FILE = join(DATA, 'alerts.json');
const FIRED_FILE = join(DATA, 'alerts-fired.jsonl');

function load() { try { return JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch { return { alerts: [] }; } }
function save(d) { fs.writeFileSync(REG_FILE, JSON.stringify(d, null, 2)); }

async function livePrice(mint, symbol) {
  if (mint) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (p) return parseFloat(p.priceUsd);
    } catch (e) {}
  }
  if (symbol) {
    const ids = { solana: 'solana', bitcoin: 'bitcoin', ethereum: 'ethereum', SOL: 'solana', BTC: 'bitcoin', ETH: 'ethereum' };
    const id = ids[symbol] || symbol.toLowerCase();
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d[id]?.usd) return d[id].usd;
    } catch (e) {}
  }
  return null;
}

export async function register({ mint, symbol, direction, threshold, webhookUrl, label }) {
  const reg = load();
  const alert = {
    id: 'al_' + Math.random().toString(36).slice(2, 9),
    mint: mint || null, symbol: symbol || null,
    direction, threshold: Number(threshold),
    webhookUrl: webhookUrl || null,
    label: label || `${symbol || mint?.slice(0, 6)} ${direction} ${threshold}`,
    createdAt: new Date().toISOString(),
    lastPrice: null, triggered: false
  };
  reg.alerts.push(alert);
  save(reg);
  return alert;
}

export async function checkAll() {
  const reg = load();
  const fired = [];
  for (const a of reg.alerts) {
    if (a.triggered) continue;
    const price = await livePrice(a.mint, a.symbol);
    if (!price) continue;
    a.lastPrice = price;
    const crossed = a.direction === 'above' ? price >= a.threshold : price <= a.threshold;
    if (crossed) {
      a.triggered = true;
      a.triggeredAt = new Date().toISOString();
      a.triggerPrice = price;
      fired.push(a);
      // fire webhook
      if (a.webhookUrl) {
        try {
          await fetch(a.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'price_alert', alert: a, price }),
            signal: AbortSignal.timeout(5000)
          });
          a.webhookDelivered = true;
        } catch (e) { a.webhookDelivered = false; a.webhookError = e.message; }
      }
      fs.appendFileSync(FIRED_FILE, JSON.stringify({ ts: new Date().toISOString(), alert: a, price }) + '\n');
    }
  }
  save(reg);
  return { checked: reg.alerts.length, fired: fired.length, firedAlerts: fired };
}

export function run() { return checkAll(); }

if (process.argv[1] && process.argv[1].endsWith('alerts.mjs')) {
  run().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exit(1); });
}
