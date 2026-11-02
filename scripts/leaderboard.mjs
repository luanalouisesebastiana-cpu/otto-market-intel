// Otto Edge Proof — aggregates every performance signal into one verifiable
// leaderboard that proves the trading engine's edge. The asset that attracts
// capital (the actual funding blocker).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const read = (f) => { try { return JSON.parse(fs.readFileSync(join(DATA, f), 'utf8')); } catch { return null; } };

export function run() {
  const bt = read('backtest.json'), pt = read('papertrade.json'),
        tr = read('trackrecord.json'), jr = read('journal.json'),
        sig = read('signal.json'), sc = read('opportunities.json');

  // backtest: results is an OBJECT keyed by asset
  const btRows = Object.entries(bt?.results || {}).map(([asset, r]) => ({
    asset, trades: r.trades ?? 0, wins: r.wins ?? 0, losses: r.losses ?? 0,
    winRate: r.winRate != null ? +(r.winRate * 100).toFixed(2) : null,
    equity: r.equity ?? null, maxDrawdown: r.maxDD ?? null,
    edgePct: r.totalRet ?? null, // totalRet is total % return
  })).filter(r => r.edgePct != null).sort((a, b) => b.edgePct - a.edgePct);

  // paper-trading live simulation
  const ptRows = (pt?.trades || []).map(t => ({ symbol: t.symbol, entry: t.entry, target: t.target, stop: t.stop, live: t.live, pnlPct: t.pnlPct, outcome: t.outcome }));
  const ptSummary = { mode: pt?.mode || 'paper', total: pt?.total || 0, closed: pt?.closed || 0, open: (pt?.total || 0) - (pt?.closed || 0), winRate: pt?.winRate || 0, totalPnlUsd: pt?.totalPnlUsd || 0, policy: pt?.policy || 'stop -8%' };

  // journal / Jev decision record
  const jStats = jr?.stats || { total: 0, enters: 0, observes: 0, targets: 0, stops: 0, open: 0 };
  const jDecisions = (jr?.history || []).slice(-8).map(h => ({ cycle: h.cycle || h.generatedAt, action: h.action, symbol: h.symbol || h.mint, reason: h.reason }));

  // treasury / split proof
  const treasury = { freeBankUsd: tr?.bank?.freeBankUsd ?? null, inMeta1: tr?.bank?.inMeta1 ?? null, meta1TargetUsd: tr?.bank?.meta1TargetUsd ?? null, split: tr?.split ?? null };

  // current signal book (risk-filtered)
  const sigRows = Array.isArray(sig) ? sig : (sig?.signals || sig?.signal ? [sig.signal || sig] : []);
  const book = sigRows.slice(0, 8).map(s => ({ symbol: s.symbol, mint: s.mint, entry: s.entry, target: s.target, stop: s.stop, sizeUsd: s.sizeUsd, edgePct: s.edgePct }));

  // composite scorecard (transparent, auditable)
  const score = {
    backtestedAssets: btRows.length,
    avgBacktestReturnPct: btRows.length ? +(btRows.reduce((a, r) => a + r.edgePct, 0) / btRows.length).toFixed(2) : 0,
    bestBacktestAsset: btRows[0]?.asset || null,
    bestBacktestReturnPct: btRows[0]?.edgePct || 0,
    paperWinRate: ptSummary.winRate,
    paperClosedTrades: ptSummary.closed,
    paperPnlUsd: ptSummary.totalPnlUsd,
    jevCycles: jStats.total || jDecisions.length,
    jevEntries: jStats.enters || 0,
    jevTargets: jStats.targets || 0,
    jevStops: jStats.stops || 0,
    jevOpen: jStats.open || 0,
    approvedOpportunities: sc?.approved ?? (sc?.opportunities?.length || 0),
    freeBankUsd: treasury.freeBankUsd,
  };

  const out = { generatedAt: new Date().toISOString(), score, backtest: btRows, papertrade: ptSummary, paperTrades: ptRows, journal: { stats: jStats, decisions: jDecisions }, treasury, signalBook: book };
  fs.writeFileSync(join(DATA, 'leaderboard.json'), JSON.stringify(out, null, 2));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) { run(); console.log('[leaderboard] wrote data/leaderboard.json'); }
