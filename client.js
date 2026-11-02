// Otto Market Intel — client SDK
// Buy Otto's risk-filtered Solana signals + market data via x402.
import { pay, fetchWithPayment } from './x402-pay.js';

export const DEFAULT_BASE = 'https://luanalouisesebastiana-cpu.github.io/otto-market-intel';

export const PRICES = {
  opportunities: 50,
  macro: 25,
  report: 100,
};

export class OttoClient {
  constructor(base = DEFAULT_BASE, wallet) {
    this.base = base.replace(/\/$/, '');
    this.wallet = wallet; // object with pay(paymentDetails) -> { signature }
  }

  async trial() {
    const r = await fetch(this.base + '/v1/trial');
    if (!r.ok) throw new Error('trial failed: ' + r.status);
    return r.json();
  }

  async summary() {
    const r = await fetch(this.base + '/v1/summary');
    if (!r.ok) throw new Error('summary failed: ' + r.status);
    return r.json();
  }

  // Paid endpoints — 402 first, then pay and retry.
  async opportunities() { return this._paid('/v1/opportunities', 'POST'); }
  async macro() { return this._paid('/v1/macro', 'GET'); }
  async report() { return this._paid('/v1/report', 'GET'); }

  async _paid(path, method) {
    const r = await fetch(this.base + path, { method });
    if (r.status !== 402) return r.json();
    const accepts = await r.json(); // { accepts: [...] }
    const payment = await pay(this.wallet, accepts, this.base);
    const r2 = await fetch(this.base + path, {
      method,
      headers: { 'X-Payment': JSON.stringify(payment) },
    });
    if (!r2.ok) throw new Error('paid request failed: ' + r2.status);
    return r2.json();
  }
}

export default OttoClient;