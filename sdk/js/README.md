# otto-sdk (JavaScript)

```bash
npm install otto-sdk   # or copy index.js
```
```js
import { OttoClient, PaymentRequired } from 'otto-sdk';
const c = new OttoClient();
await c.summary();                    // free
try { await c.intel(); }              // paid -> throws PaymentRequired
catch (e) { if (e instanceof PaymentRequired) console.log(e.challenge.accepts); }
```
