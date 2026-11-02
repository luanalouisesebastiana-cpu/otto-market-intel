#!/usr/bin/env python3
"""Generate the honest paid report from the live scan data.
Sells real scanned numbers, not hand-written samples."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
scan = json.load(open(os.path.join(HERE, "data", "scan.json")))
macro = json.load(open(os.path.join(HERE, "data", "macro.json")))

def g(d, k, default=0):
    return d.get(k, default)

macro_out = {
    "bitcoin":  {"usd": g(macro, "bitcoin", {}).get("usd", 0),  "change24hPct": g(macro, "bitcoin", {}).get("usd_24h_change", 0)},
    "ethereum": {"usd": g(macro, "ethereum", {}).get("usd", 0), "change24hPct": g(macro, "ethereum", {}).get("usd_24h_change", 0)},
    "solana":   {"usd": g(macro, "solana", {}).get("usd", 0),   "change24hPct": g(macro, "solana", {}).get("usd_24h_change", 0)},
}

approved = scan.get("approved", [])
rejected = scan.get("signals", [])
rejected = [s for s in rejected if not s.get("approved")]

def fmt(s):
    return {
        "rank": 0,
        "pair": s.get("pair", "?"),
        "pool": (s.get("dex") or "?").capitalize(),
        "address": s.get("address", ""),
        "priceUsd": s.get("priceUsd"),
        "liquidityUsd": round(s.get("liquidityUsd", 0), 2),
        "volume24hUsd": round(s.get("volume24h", 0), 2),
        "change24hPct": s.get("change24h"),
        "slippageEstPct": round(100.0 / max(s.get("liquidityUsd", 1) / 100000.0, 1.0), 2),
        "suggestedSizeSol": s.get("suggestedSizeSol"),
        "stopLossPct": s.get("stopLossPct", -8),
        "reason": s.get("reason", "passes all risk filters"),
        "verdict": "APPROVED",
    }

rows = [fmt(s) for s in approved]
for i, r in enumerate(rows, 1):
    r["rank"] = i

rej_out = [
    {"pair": s.get("pair", "?"), "reason": s.get("reason", "failed risk filter")}
    for s in rejected[:8]
]

report = {
    "vendor": "Kovantu Digital",
    "agent": "Otto",
    "network": "solana",
    "product": "Otto Market Intel — Full Report",
    "priceUsd": "1.00",
    "receiver": "EzG1xfdgX5RtSB79WVEkFMvGCq8bUVrG53zRK5TvY5NK",
    "usdcMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "generatedAt": scan.get("generatedAt"),
    "memoRequired": "REPORT",
    "note": "Self-service report generated from the live scan. Verified on-chain via public Solana RPC.",
    "macro": macro_out,
    "filters": scan.get("filters", {}),
    "signals": rows,
    "rejected": rej_out,
    "policy": {
        "maxPositionPct": 10,
        "maxLotSol": 0.010,
        "stopLossPct": -8,
        "untouchableReserveSol": 0.0100,
        "split": "50% creator / 50% treasury",
    },
    "disclaimer": "Informational market intelligence from public data. Not financial advice.",
}

out = os.path.join(HERE, "report.json")
json.dump(report, open(out, "w"), indent=2)
print(f"report.json written: {len(rows)} approved, {len(rej_out)} rejected, macro={list(macro_out)}")