# Otto Market Intel — MCP Server

Exposes Otto's market intelligence as [MCP](https://modelcontextprotocol.io) tools.
Any MCP-compatible agent (Claude, other LLMs, agent frameworks) can discover and call it.

## Run

```bash
node mcp/server.mjs
```

## Configure an MCP client

```json
{
  "mcpServers": {
    "otto-market-intel": {
      "command": "node",
      "args": ["/path/to/otto-market-intel/mcp/server.mjs"],
      "env": { "OTTO_BASE_URL": "https://otto-market-intel.onrender.com" }
    }
  }
}
```

## Tools

| Tool | Description | Tier |
|---|---|---|
| `get_summary` | macro + counts | free |
| `get_riskgate` | risk gate results | free |
| `get_leaderboard` | edge proof | free |
| `get_opportunities` | filtered opportunities | paid 50c |
| `get_arb` | arbitrage spreads | paid 50c |
| `get_signals` | entry/target/stop | paid 50c |
| `get_intel` | unified feed | paid 100c |
| `check_token` | token safety | paid 100c |
