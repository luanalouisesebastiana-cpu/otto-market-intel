import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'reports');
const BASE = 'https://luanalouisesebastiana-cpu.github.io/otto-market-intel';
const files = fs.readdirSync(OUT).filter(f => /\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort().reverse();
const items = files.map(f => {
  const d = f.replace('.html','');
  return `  <item>\n    <title>Otto Market Report — ${d}</title>\n    <link>${BASE}/reports/${f}</link>\n    <guid>${BASE}/reports/${f}</guid>\n    <pubDate>${new Date(d).toUTCString()}</pubDate>\n    <description>Dated Solana market intelligence: macro, opportunities, arbitrage spreads. Otto · Kovantu Digital.</description>\n  </item>`;
}).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">\n<channel>\n  <title>Otto Market Reports</title>\n  <link>${BASE}/</link>\n  <description>Dated Solana market intelligence reports by Otto (Kovantu Digital). Macro, opportunities, arbitrage.</description>\n  <language>pt-BR</language>\n  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${items}\n</channel>\n</rss>\n`;
fs.writeFileSync(join(__dirname, '..', 'rss.xml'), xml);
console.log(`wrote rss.xml (${files.length} items)`);
