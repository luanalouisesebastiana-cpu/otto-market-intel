#!/usr/bin/env node
// Otto Market Intel — MCP server. Exposes the intel API as MCP tools so any
// MCP-compatible agent (Claude, other LLMs, agent frameworks) can discover and
// call Otto's market intelligence directly.
//
// Tools:
//   get_summary        -> free market summary (macro + counts)
//   get_opportunities  -> risk-filtered opportunities (paid)
//   get_arb            -> cross-DEX arbitrage spreads (paid)
//   get_signals        -> entry/target/stop signals (paid)
//   get_intel          -> unified intelligence feed (paid)
//   check_token        -> token safety verdict (paid)
//   get_riskgate       -> risk policy gate results (free)
//   get_leaderboard    -> performance/edge proof (free)
//
// Run: node mcp/server.mjs   (stdio transport)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const BASE = process.env.OTTO_BASE_URL || 'http://localhost:7010';

const TOOLS = [
  { name: 'get_summary', description: 'Free market summary: macro prices (BTC/ETH/SOL) + opportunity/arb counts.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_riskgate', description: 'Risk policy gate results: which candidates passed/failed the inviolable filters.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_leaderboard', description: 'Performance/edge proof: backtest + paper-trade win rate + journal.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_opportunities', description: 'Risk-filtered Solana opportunities (paid, 50c).', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_arb', description: 'Cross-DEX arbitrage spreads (paid, 50c).', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_signals', description: 'Entry/target/stop signals under the risk policy (paid, 50c).', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_intel', description: 'Unified intelligence feed: macro + opportunities + arb (paid, 100c).', inputSchema: { type: 'object', properties: {} } },
  { name: 'check_token', description: 'Token safety verdict for a Solana mint (paid, 100c).', inputSchema: { type: 'object', properties: { mint: { type: 'string', description: 'Solana token mint address' } }, required: ['mint'] } },
];

async function callTool(name, args) {
  const pathMap = {
    get_summary: '/v1/summary', get_riskgate: '/v1/riskgate', get_leaderboard: '/v1/leaderboard',
    get_opportunities: '/v1/opportunities', get_arb: '/v1/arb', get_signals: '/v1/signals',
    get_intel: '/v1/intel', check_token: '/v1/safety?mint=' + encodeURIComponent(args?.mint || ''),
  };
  const path = pathMap[name];
  if (!path) return { content: [{ type: 'text', text: `unknown tool: ${name}` }] };
  try {
    const res = await fetch(BASE + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    if (res.status === 402) return { content: [{ type: 'text', text: `Payment required for ${name}. Use trial key or pay via x402. Challenge: ${body.slice(0, 300)}` }] };
    return { content: [{ type: 'text', text: body.slice(0, 8000) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `error calling ${name}: ${e.message}` }] };
  }
}

// --- minimal JSON-RPC over stdio ---
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'otto-market-intel', version: '1.0.0' } } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const result = await callTool(name, args || {});
    return { jsonrpc: '2.0', id, result };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).then(resp => { if (resp) send(resp); }).catch(e => send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }));
  }
});
process.stdin.on('end', () => process.exit(0));
console.error('[otto-mcp] Otto Market Intel MCP server started (stdio)');
