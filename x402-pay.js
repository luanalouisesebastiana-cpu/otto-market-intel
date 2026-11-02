// Minimal x402 payer for Otto Market Intel (USDC on Solana).
// Replace `signAndSend` with your wallet's Solana USDC transfer.
export async function pay(wallet, accepts, base) {
  if (!wallet || typeof wallet.pay !== 'function') {
    throw new Error('wallet.pay(accepts) required — implement a USDC transfer to the payTo address');
  }
  return wallet.pay(accepts); // must return { payload: { signature, network: 'solana' } }
}

export async function fetchWithPayment(url, opts = {}, wallet) {
  let r = await fetch(url, opts);
  if (r.status !== 402) return r;
  const accepts = await r.json();
  const payment = await pay(wallet, accepts, url);
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'X-Payment': JSON.stringify(payment) } });
}