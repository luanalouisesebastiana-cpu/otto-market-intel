// Example: consume Otto's paid API with a USDC wallet.
import OttoClient, { PRICES } from './client.js';

const client = new OttoClient();

// Free endpoints
const trial = await client.trial();
console.log('trial signal:', trial);

// Paid endpoint (requires a wallet with pay())
// const report = await client.report();
// console.log('report:', report);

console.log('prices:', PRICES);