import { POLICY, normalizeOpp, passesAssetFilters, positionSize, shouldEnter, validatePlan, netAfterFees } from '../scripts/riskgate.mjs';
let pass=0, fail=0;
const t=(name,cond)=>{ cond?pass++:fail++; console.log(`${cond?'✓':'✗'} ${name}`); };

t('rejects low liquidity', !passesAssetFilters(normalizeOpp({liqUsd:1000,vol24Usd:500000,slipPct:0.5,priceUsd:1})).pass);
t('rejects low volume', !passesAssetFilters(normalizeOpp({liqUsd:1e6,vol24Usd:100,slipPct:0.5,priceUsd:1})).pass);
t('rejects high slippage', !passesAssetFilters(normalizeOpp({liqUsd:1e6,vol24Usd:5e5,slipPct:2,priceUsd:1})).pass);
t('passes clean liquid pair', passesAssetFilters(normalizeOpp({liqUsd:1e6,vol24Usd:5e5,slipPct:0.5,priceUsd:1})).pass);
t('position capped by lot', positionSize({freeBankUsd:1000,solPrice:100}) <= POLICY.maxLotSOL*100+0.001);
t('position capped by pct', positionSize({freeBankUsd:1000,solPrice:1000}) <= 125+0.001);
t('blocks entry below edge', !shouldEnter({edgePct:1,openCount:0}).enter);
t('allows entry at edge', shouldEnter({edgePct:3,openCount:0}).enter);
t('blocks entry at capacity', !shouldEnter({edgePct:5,openCount:2}).enter);
t('valid plan passes', validatePlan({entry:100,target:103,stop:92,sizeUSD:1,freeBankUsd:100,solPrice:100}).valid);
t('rejects inverted target/stop', !validatePlan({entry:100,target:97,stop:92,sizeUSD:5,freeBankUsd:100,solPrice:100}).valid);
t('rejects oversize vs fuse', !validatePlan({entry:100,target:103,stop:92,sizeUSD:100,freeBankUsd:100000,solPrice:100}).valid);
t('netAfterFees < size', netAfterFees(100,0.5) < 100);
t('reserve is sacred 0.01 SOL', POLICY.reserveSOL === 0.01);
t('stop is -8%', POLICY.stopPct === -8);
t('maxPosPct is 12.5%', POLICY.maxPosPct === 0.125);

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail?1:0);
