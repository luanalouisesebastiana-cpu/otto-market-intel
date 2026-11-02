#!/usr/bin/env node
/**
 * Otto Market Intel — MCP Server (stdio transport).
 * Exposes Otto's risk-filtered Solana market intelligence + paid x402 API to any
 * MCP client (Claude Code, etc.). Zero dependencies. Run: npx otto-mcp | or bin.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
function readJson(f, fb){ try { return JSON.parse(readFileSync(join(DATA,f),'utf8')); } catch { return fb; } }

// Minimal JSON-RPC 2.0 over stdio
const BASE = process.env.OTTO_BASE_URL || 'http://localhost:7010';
function reply(id, result){
  process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, result }) + '\n');
}
function error(id, code, message){
  process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, error:{ code, message } }) + '\n');
}

const TOOLS = [
  { name:'otto_health', description:'Otto Market Health Index (0-100 greed/fear) + component breakdown.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'otto_opportunities', description:'Risk-filtered Solana opportunities (liq>$50k, vol>$100k, slip<1%).',
    inputSchema:{ type:'object', properties:{ limit:{type:'number'} } } },
  { name:'otto_signals', description:'Live trading signals with entry/target/stop under inviolable risk policy.',
    inputSchema:{ type:'object', properties:{ limit:{type:'number'} } } },
  { name:'otto_journal', description:'Jev decision journal — recent autonomous OBSERVE/ENTER decisions.',
    inputSchema:{ type:'object', properties:{ limit:{type:'number'} } } },
  { name:'otto_positions', description:'Open positions tracked vs live prices with P&L and stop/target alerts.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'otto_paper', description:'Paper-trading track record: equity, return, win rate.',
    inputSchema:{ type:'object', properties:{} } },
  { name:'otto_macro', description:'BTC/ETH/SOL macro snapshot (CoinGecko).',
    inputSchema:{ type:'object', properties:{} } },
  { name:'otto_paid_fetch', description:'Fetch a PAID x402 endpoint by paying USDC. Returns intel after payment.',
    inputSchema:{ type:'object', required:['path'], properties:{ path:{type:'string',description:'e.g. /v1/report'} } } },
];

function handle(req){
  const { id, method, params } = req;
  if (method === 'initialize') return reply(id, { protocolVersion:'2024-11-05', capabilities:{ tools:{} }, serverInfo:{ name:'otto-market-intel', version:'1.0.0' } });
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call'){
    const name = params?.name; const args = params?.arguments || {};
    const cap = n => Math.min(n||10, 50);
    try {
      let data;
      switch(name){
        case 'otto_health': data = readJson('health.json', {}); break;
        case 'otto_opportunities': { const d=readJson('intel.json',{opportunities:[]}); data=(d.opportunities||[]).slice(0,cap(args.limit)); break; }
        case 'otto_signals': { const d=readJson('signal.json',{signals:[],top:[]}); data={ signals:(d.signals||[]).slice(0,cap(args.limit)), top:(d.top||[]).slice(0,cap(args.limit)) }; break; }
        case 'otto_journal': { const d=readJson('journal.json',{}); const h=d.history||d.decisions||[]; data={ lastDecision:d.lastDecision||null, stats:d.stats||{}, history:h.slice(-cap(args.limit)) }; break;
        case 'otto_positions': data = readJson('positions.json', {}); break;
        case 'otto_paper': data = readJson('paper-state.json', {stats:{}}); break;
        case 'otto_macro': { const d=readJson('intel.json',{macro:null}); data=d.macro||{}; break; }
        case 'otto_paid_fetch': data = { note:'paid x402 fetch requires an x402-enabled MCP client. Call the endpoint directly: '+BASE+args.path, path:args.path }; break;
        default: return error(id, -32602, 'unknown tool: '+name);
      }
      return reply(id, { content:[{ type:'text', text: JSON.stringify(data) }] });
    } catch(e){ return error(id, -32603, e.message); }
  }
  return error(id, -32601, 'method not found: '+method);
}

let buf='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0){
    const line = buf.slice(0, idx).trim(); buf = buf.slice(idx+1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch(e){ error(null, -32700, 'parse error'); }
  }
});
process.stderr.write('[otto-mcp] ready\n');
