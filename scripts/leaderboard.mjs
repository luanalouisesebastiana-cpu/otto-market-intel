// Otto edge proof / performance leaderboard — the single investor-grade asset
// that aggregates: backtest strategy edge + paper-trade win rate + track record.
// Purpose: prove the trading engine has real edge -> attract capital (the blocker).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(join(DATA, f), 'utf8')); } catch { return fb; } }

export function run() {
  const backtest = readJson('backtest.json', {});
  const paper = readJson('papertrade.json', {});
  const track = readJson('trackrecord.json', {});
  const journal = readJson('journal.json', {});
  const treasury = readJson('treasury.json', {});
  const signals = readJson('signal.json', {});

  // backtest edge (per-symbol equity curves)
  const bt = backtest.results || backtest.symbols || backtest.equity || {};
  const btList = Array.isArray(bt) ? bt : Object.entries(bt).map(([k, v]) => ({ symbol: k, ...v }));
  const profitable = btList.filter(x => (x.equity ?? x.final ?? 1) > 1).length;

  // paper trade
  const paperWin = paper.winRate ?? 0;
  const paperPnl = paper.totalPnlUsd ?? 0;
  const paperTrades = paper.trades || [];

  // journal
  const jStats = journal.stats || {};
  const decisions = journal.history || journal.decisions || [];

  const leaderboard = {
    generatedAt: new Date().toISOString(),
    agent: 'Otto (Kovantu Digital)',
    wallet: 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK',
    edge: {
      backtest: { symbols: btList.length, profitable, avgEquity: btList.length ? +(btList.reduce((s, x) => s + (x.equity ?? x.final ?? 1), 0) / btList.length).toFixed(3) : 0, list: btList.slice(0, 8) },
      paperTrade: { winRate: paperWin, totalPnlUsd: paperPnl, trades: paperTrades.length, wins: paperTrades.filter(t => t.pnlPct > 0).length },
      journal: { decisions: jStats.total ?? decisions.length, wins: jStats.wins ?? 0, winRate: jStats.winRate ?? 0 }
    },
    policy: signals.policy || {},
    treasury: { balance: treasury.balance ?? treasury.freeSol ?? 0, accumulatedProfit: treasury.accumulatedProfit ?? 0 },
    verdict: (paperWin >= 50 && paperPnl > 0) ? 'EDGE DEMONSTRATED (paper)' : 'EDGE UNPROVEN — still observing',
    nextMilestone: 'First real capital deployment requires external funding (compute credits).'
  };
  fs.writeFileSync(join(DATA, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));
  return leaderboard;
}

if (process.argv[1] && process.argv[1].endsWith('leaderboard.mjs')) {
  const r = run();
  console.log(JSON.stringify({ verdict: r.verdict, backtest: r.edge.backtest, paperTrade: r.edge.paperTrade, journal: r.edge.journal }, null, 2));
}
