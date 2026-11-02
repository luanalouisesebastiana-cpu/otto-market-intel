// Otto track record — live performance proof. Aggregates journal + treasury + backtest
// into one verifiable performance snapshot (the trust artifact for capital/investors).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(join(DATA, f), 'utf8')); } catch { return d; } };
const journal = read('journal.json', { history: [], stats: {} });
const treasury = read('treasury.json', { pnl: {}, split: {}, bank: {} });
const backtest = read('backtest.json', { results: {} });

// live decision stats
const h = journal.history || [];
const enters = h.filter(d => d.decision === 'ENTER');
const targets = h.filter(d => d.outcome === 'TARGET_HIT').length;
const stops = h.filter(d => d.outcome === 'STOP_HIT').length;
const open = h.filter(d => d.decision === 'ENTER' && (!d.outcome || d.outcome === 'OPEN')).length;
const winRate = enters.length ? (targets / enters.length) : 0;

// backtest edge summary
const bt = Object.entries(backtest.results || {}).map(([k, v]) => ({ asset: k, equity: v.equity ?? null, maxDD: v.maxDD ?? null, winRate: v.winRate ?? null })).filter(x => x.equity);

const out = {
  generatedAt: new Date().toISOString(),
  live: { decisions: h.length, enters: enters.length, observes: h.length - enters.length, targets, stops, open, winRate: +(winRate * 100).toFixed(1), realizedUsd: treasury.pnl?.realizedUsd ?? 0, realizedSOL: treasury.pnl?.realizedSOL ?? 0 },
  split: treasury.split ?? {},
  bank: treasury.bank ?? {},
  backtest: bt,
  policy: { reserve: 0.0100, maxPosPct: 0.125, stopPct: -0.08, split: '50/50' },
  audit: 'decisions.jsonl + treasury.json + backtest.json'
};
fs.writeFileSync(join(DATA, 'trackrecord.json'), JSON.stringify(out, null, 2));
console.log(`trackrecord: ${h.length} decisions, ${enters.length} enters, ${targets} targets, ${stops} stops, winRate ${out.live.winRate}%`);
