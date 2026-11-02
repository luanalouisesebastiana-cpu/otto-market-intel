/**
 * Otto Market Intel SDK — JavaScript/Node client for the Otto x402 Solana intel API.
 *
 *   import { OttoClient } from 'otto-sdk';
 *   const c = new OttoClient();
 *   await c.summary();                 // free
 *   await c.intel();                   // paid -> throws PaymentRequired with challenge
 */
export class OttoError extends Error {}
export class PaymentRequired extends OttoError {
  constructor(status, challenge) {
    super(`payment required (${status}): ${challenge?.error || 'unknown'}`);
    this.status = status; this.challenge = challenge;
  }
}

export class OttoClient {
  constructor(baseUrl = 'https://otto-market-intel.onrender.com', opts = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey || null;
    this.paymentHeader = opts.paymentHeader || null;
    this.timeoutMs = opts.timeoutMs || 30000;
  }
  _headers(extra = {}) {
    const h = { accept: 'application/json', ...extra };
    if (this.apiKey) h['x-otto-key'] = this.apiKey;
    if (this.paymentHeader) h['x-payment'] = this.paymentHeader;
    return h;
  }
  async _get(path, params) {
    let url = this.baseUrl + path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }
    const res = await fetch(url, { headers: this._headers() });
    const body = await res.json().catch(() => ({}));
    if (res.status === 402) throw new PaymentRequired(res.status, body);
    if (!res.ok) throw new OttoError(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    return body;
  }
  async _post(path, data) {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST', headers: this._headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return res.json();
  }
  // free
  summary() { return this._get('/v1/summary'); }
  opportunitiesFree() { return this._get('/v1/opportunities/free'); }
  scanner() { return this._get('/v1/scanner'); }
  pools() { return this._get('/v1/pools'); }
  usage() { return this._get('/v1/usage'); }
  audit() { return this._get('/v1/audit'); }
  riskgate() { return this._get('/v1/riskgate'); }
  receipts() { return this._get('/v1/receipts'); }
  leaderboard() { return this._get('/v1/leaderboard'); }
  pipeline() { return this._get('/v1/pipeline'); }
  // paid
  macro() { return this._get('/v1/macro'); }
  opportunities() { return this._get('/v1/opportunities'); }
  signals() { return this._get('/v1/signals'); }
  signalsSample() { return this._get('/v1/signals/sample'); }
  arb() { return this._get('/v1/arb'); }
  intel() { return this._get('/v1/intel'); }
  report(mint) { return this._get('/v1/report', { mint }); }
  safety(mint) { return this._get('/v1/safety', { mint }); }
  rugcheck(mint) { return this._get('/v1/rugcheck', { mint }); }
  // keys
  trial(agentAddress = '', label = '') { return this._post('/v1/trial', { agentAddress, label }); }
  subscribe(plan, agentAddress) { return this._post('/v1/subscribe', { plan, agentAddress, payer: agentAddress }); }
  manifest() { return this._get('/x402-manifest.json'); }
  catalog() { return this._get('/catalog'); }
}
export default OttoClient;
