// Otto full pipeline — runs every module in dependency order.
// Data gather -> hard risk gate -> signals -> journal -> treasury -> backtest
// -> trackrecord -> audit -> position -> papertrade -> rugcheck -> alerts -> report.
// Invoked by GitHub Actions every 15 min; also runnable locally: node scripts/pipeline.mjs
const steps = [
  ['./intel.mjs', 'intel'],
  ['./portfolio.mjs', 'portfolio'],
  ['./whales.mjs', 'whales'],
  ['./perp.mjs', 'perp'],
  ['./arb.mjs', 'arb'],
  ['./pools.mjs', 'pools'],
  ['./riskgate.mjs', 'riskgate'],
  ['./signals.mjs', 'signals'],
  ['./tracker.mjs', 'tracker'],
  ['./journal.mjs', 'journal'],
  ['./autonomous.mjs', 'autonomous'],
  ['./execute.mjs', 'execute'],
  ['./treasury.mjs', 'treasury'],
  ['./payout.mjs', 'payout'],
  ['./backtest.mjs', 'backtest'],
  ['./trackrecord.mjs', 'trackrecord'],
  ['./leaderboard.mjs', 'leaderboard'],
  ['./audit.mjs', 'audit'],
  ['./position.mjs', 'position'],
  ['./papertrade.mjs', 'papertrade'],
  ['./rugcheck.mjs', 'rugcheck'],
  ['./alerts.mjs', 'alerts'],
  ['./fulfill.mjs', 'fulfill'],
  ['./referral.mjs', 'referral'],
  ['./subscribe.mjs', 'subscribe'],
  ['./trial.mjs', 'trial'],
  ['./report.mjs', 'report'],
  ['./scripts/reports-index.mjs', 'reports-index'],
  ['./rss.mjs', 'rss'],
];
const results = [];
for (const [mod, label] of steps) {
  const t0 = Date.now();
  try {
    const m = await import(mod);
    if (typeof m.run === 'function') await m.run();
    else if (typeof m.main === 'function') await m.main();
    else if (typeof m.buildAudit === 'function') await m.buildAudit();
    else if (typeof m.checkAll === 'function') await m.checkAll();
    results.push({ step: label, ok: true, ms: Date.now() - t0 });
    console.log(`[pipeline] ✓ ${label} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ step: label, ok: false, ms: Date.now() - t0, error: e.message });
    console.warn(`[pipeline] ✗ ${label}: ${e.message}`);
  }
}
const ok = results.filter(r => r.ok).length;
console.log(`[pipeline] complete: ${ok}/${steps.length} steps ok`);
const fs = await import('node:fs');
fs.writeFileSync(new URL('../data/pipeline.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), ok, total: steps.length, results }, null, 2));
if (ok < steps.length * 0.7) { console.error('[pipeline] too many failures'); process.exit(1); }
