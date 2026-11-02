// @kovantu/otto-market-intel — Otto Market Intel SDK
// Risk-filtered Solana market intelligence via the Otto x402 service.
// No external dependencies. Pure ESM.
const DEFAULT_BASE = 'https://luanalouisesebastiana-cpu.github.io/otto-market-intel';

export class OttoClient {
  constructor({ baseUrl = DEFAULT_BASE, receiver = null, fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.receiver = receiver;
    this.fetch = fetchImpl;
  }
  async get(path, { key } = {}) {
    const headers = {};
    if (key) headers['x-otto-key'] = key;
    const res = await this.fetch(`${this.baseUrl}${path}`, { headers });
    if (res.status === 402) {
      const body = await res.json().catch(() => ({}));
      const err = new Error('Payment required (x402)');
      err.status = 402; err.accepts = body.accepts; throw err;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }
  summary() { return this.get('/v1/summary'); }
  trial() { return this.get('/v1/trial'); }
  signals() { return this.get('/v1/signals'); }
  intel() { return this.get('/v1/intel'); }
  arb() { return this.get('/v1/arb'); }
  macro() { return this.get('/v1/macro'); }
  opportunities() { return this.get('/v1/opportunities'); }
  report(mint) { return this.get(`/v1/report?mint=${encodeURIComponent(mint)}`); }
  safety(mint) { return this.get(`/v1/safety?mint=${encodeURIComponent(mint)}`); }
}

export const PRICING = { '/v1/opportunities': 50, '/v1/signals': 50, '/v1/arb': 50, '/v1/macro': 25, '/v1/intel': 100, '/v1/report': 100, '/v1/safety': 100 };
export const RECEIVER = 'EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK';
export default OttoClient;
