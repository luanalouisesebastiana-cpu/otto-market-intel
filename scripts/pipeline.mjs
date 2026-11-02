// Otto full pipeline — runs every module in dependency order.
// Data gather -> hard risk gate -> signals -> journal -> treasury -> backtest
// -> trackrecord -> audit -> position -> papertrade -> rugcheck -> alerts -> report.
// Invoked by GitHub Actions every 15 min; also runnable locally: node scripts/pipeline.mjs
const steps = [
  ['./scripts/intel.mjs', 'intel'],
  ['./scripts/arb.mjs', 'arb'],
  ['./scripts/pools.mjs', 'pools'],
  ['./scripts/riskgate.mjs', 'riskgate'],
  ['./scripts/signals.mjs', 'signals'],
  ['./scripts/journal.mjs', 'journal'],
  ['./scripts/treasury.mjs', 'treasury'],
  ['./scripts/backtest.mjs', 'backtest'],
  ['./scripts/trackrecord.mjs', 'trackrecord'],
  ['./scripts/audit.mjs', 'audit'],
  ['./scripts/position.mjs', 'position'],
  ['./scripts/papertrade.mjs', 'papertrade'],
  ['./scripts/rugcheck.mjs', 'rugcheck'],
  ['./scripts/alerts.mjs', 'alerts'],
  ['./scripts/report.mjs', 'report'],
  ['./scripts/reports-index.mjs', 'reports-index'],
  ['./scripts/rss.mjs', 'rss'],
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
