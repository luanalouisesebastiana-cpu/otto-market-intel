// Otto audit exporter — ties the full decision trail together into one
// verifiable record: signals -> journal decisions -> payouts -> trackrecord.
// Genesis: every operation must be auditable (decisões, motivos, verificação).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(join(DATA, f), 'utf8')); } catch (e) { return fallback; } }
function readJsonl(f) { try { return fs.readFileSync(join(DATA, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }

export function buildAudit() {
  const signals = readJson('signal.json', {});
  const journal = readJsonl('decisions.jsonl');
  const treasury = readJson('treasury.json', {});
  const trackrecord = readJson('trackrecord.json', {});
  const backtest = readJson('backtest.json', {});
  const usage = readJson('usage.jsonl', null);

  // summarize decisions
  const decisions = journal.slice(-50).reverse().map(d => ({
    ts: d.ts, action: d.action || d.decision, symbol: d.symbol, pair: d.pair,
    entry: d.entry, target: d.target, stop: d.stop, sizeSol: d.sizeSol,
    reason: (d.reason || d.rationale || '').slice(0, 160),
    outcome: d.outcome || d.result || 'OPEN'
  }));
  const outcomes = decisions.reduce((m, d) => { m[d.outcome] = (m[d.outcome] || 0) + 1; return m; }, {});
  const closed = decisions.filter(d => d.outcome && d.outcome !== 'OPEN');
  const wins = closed.filter(d => d.outcome === 'TARGET_HIT').length;

  const audit = {
    generatedAt: new Date().toISOString(),
    agent: 'Otto (Kovantu Digital)',
    wallet: 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK',
    creator: '4jHgP6hDvcW5TU9pqf5HPdLnJD5hdTfFtZkawhJWEHjU',
    policy: { maxPositionPct: 12.5, stopPct: -8, minLiqUsd: 50000, minVol24Usd: 100000, maxSlippagePct: 1.0, reserveSol: 0.0100 },
    counts: { decisions: journal.length, closed: closed.length, wins },
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : 0,
    outcomes,
    treasury: { balance: treasury.balance, accumulatedProfit: treasury.accumulatedProfit, paidToCreator: treasury.paidToCreator, retained: treasury.retained },
    trackrecord: { backtestEdge: trackrecord.backtest || backtest, signalCount: (signals.signals || []).length },
    decisions,
    trail: { signals: 'data/signal.json', journal: 'data/decisions.jsonl', treasury: 'data/treasury.json', trackrecord: 'data/trackrecord.json', backtest: 'data/backtest.json' }
  };
  fs.writeFileSync(join(DATA, 'audit.json'), JSON.stringify(audit, null, 2));
  return audit;
}

if (process.argv[1] && process.argv[1].endsWith('audit.mjs')) {
  const a = buildAudit();
  console.log(JSON.stringify({ counts: a.counts, winRate: a.winRate, outcomes: a.outcomes, treasury: a.treasury }, null, 2));
}
