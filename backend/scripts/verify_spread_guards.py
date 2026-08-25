"""
Verification for the credit spread scanner's quote-integrity work.

Run from backend/:  .venv/Scripts/python.exe scripts/verify_spread_guards.py

Part A uses synthetic chains so every guard is exercised deterministically,
including the stale-quote shapes that only appear for a few minutes after the
open. Part B hits the live chain (when the market is open) and checks that
expanding to a wider spread genuinely re-prices the long leg rather than
re-labelling the narrow-width credit.
"""
import sys
from datetime import date, datetime, timedelta

import pandas as pd

sys.path.insert(0, ".")

# Windows consoles default to cp1252; this script prints Δ, →, ≥.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from app.services.options_scanner import (  # noqa: E402
    _quote, _width_variant, _build_spreads, _find_target_expiry,
    SUSPECT_CREDIT_WIDTH_PCT, _is_market_open, _session_minutes,
)

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((PASS if ok else FAIL, name, detail))


# ---------------------------------------------------------------------------
# Part A — synthetic quote guards
# ---------------------------------------------------------------------------

def chain_row(strike, bid, ask, iv=0.25, oi=500, vol=100):
    return {"strike": strike, "bid": bid, "ask": ask,
            "impliedVolatility": iv, "openInterest": oi, "volume": vol}


print("=" * 78)
print("PART A — quote guards (synthetic)")
print("=" * 78)

q = _quote(chain_row(100, 1.20, 1.30))
check("healthy quote accepted", q["ok"] and q["mid"] == 1.25, f"mid={q['mid']}")

q = _quote(chain_row(100, 0.0, 1.30))
check("zero bid rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, 1.20, 0.0))
check("zero ask rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, float("nan"), 1.30))
check("NaN bid rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, 1.20, float("nan")))
check("NaN ask rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, None, None))
check("null bid/ask rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, 1.50, 1.20))
check("crossed quote (bid>ask) rejected", not q["ok"], q["issue"])

q = _quote(chain_row(100, 0.05, 0.60))
check("very wide quote warns but is accepted", q["ok"] and q["wide"],
      f"ok={q['ok']} wide={q['wide']}")


# --- width variants against a synthetic put chain ---------------------------
# Short leg 500 @ bid 2.00. Long legs get progressively cheaper as they go OTM,
# so each width must produce its own distinct credit.
puts = pd.DataFrame([
    chain_row(500, 2.00, 2.10),
    chain_row(495, 1.60, 1.70),
    chain_row(490, 1.20, 1.30),
    chain_row(475, 0.70, 0.80),
    chain_row(450, 0.30, 0.40),
    chain_row(400, 0.10, 0.15),
])

variants = []
for tw in (5, 10, 25, 50, 100):
    v = _width_variant(puts, 500.0, 500.0, 2.00, 0.10, "put", tw)
    if v:
        variants.append(v)

credits = [v["net_credit"] for v in variants if v["quote_ok"]]
check("each width prices its own long leg (distinct credits)",
      len(credits) == len(set(credits)) and len(credits) >= 4,
      f"credits={credits}")
check("credit rises with width (further OTM long is cheaper)",
      credits == sorted(credits),
      f"credits={credits}")

# --- long leg with no ask: the exact shape that faked the 252% SPX ROI ------
bad_puts = puts.copy()
bad_puts.loc[bad_puts["strike"] == 400, "ask"] = 0.0
bad_puts.loc[bad_puts["strike"] == 400, "bid"] = 0.0
v = _width_variant(bad_puts, 500.0, 500.0, 2.00, 0.10, "put", 100)
check("long leg with no ask → quote unavailable, no ROI",
      v is not None and not v["quote_ok"] and v["net_credit"] is None and v["roi_pct"] is None,
      f"issue={v['quote_issue'] if v else 'None'}")

# --- crossed long leg -------------------------------------------------------
crossed = puts.copy()
crossed.loc[crossed["strike"] == 450, "bid"] = 0.90
crossed.loc[crossed["strike"] == 450, "ask"] = 0.40
v = _width_variant(crossed, 500.0, 500.0, 2.00, 0.10, "put", 50)
check("crossed long leg → quote unavailable",
      v is not None and not v["quote_ok"] and "crossed" in (v["quote_issue"] or ""),
      f"issue={v['quote_issue'] if v else 'None'}")

# --- sanity ceiling: implausible credit/width at low delta ------------------
rich = pd.DataFrame([
    chain_row(500, 3.00, 3.10),
    chain_row(495, 0.05, 0.10),
])
v = _width_variant(rich, 500.0, 500.0, 3.00, 0.10, "put", 5)
check(f"credit/width >{SUSPECT_CREDIT_WIDTH_PCT}% at Δ0.10 → flagged suspect",
      v is not None and v["suspect"],
      f"credit_width_pct={v['credit_width_pct'] if v else 'None'}")
check("suspect row carries a verify-vs-broker reason",
      v is not None and v["suspect_reason"] and "broker" in v["suspect_reason"],
      (v["suspect_reason"] or "")[:70] if v else "")

# same ratio but at delta 0.30 is a normal near-the-money spread, not suspect
v = _width_variant(rich, 500.0, 500.0, 3.00, 0.30, "put", 5)
check("same ratio at Δ0.30 is NOT flagged (ceiling is delta-conditional)",
      v is not None and not v["suspect"])

# --- credit exceeding width is bad data, not free money --------------------
absurd = pd.DataFrame([
    chain_row(500, 8.00, 8.10),
    chain_row(495, 0.05, 0.10),
])
v = _width_variant(absurd, 500.0, 500.0, 8.00, 0.10, "put", 5)
check("credit >= width rejected as bad quote",
      v is not None and not v["quote_ok"] and "exceeds width" in (v["quote_issue"] or ""),
      f"issue={v['quote_issue'] if v else 'None'}")


# --- full spread build: short leg with a dead quote drops the direction -----
class FakeChain:
    def __init__(self, puts_df, calls_df):
        self.puts = puts_df
        self.calls = calls_df


expiry_d = date.today() + timedelta(days=35)
dead_short = puts.copy()
dead_short.loc[dead_short["strike"] == 500, "bid"] = 0.0
dead_short.loc[dead_short["strike"] == 500, "ask"] = 0.0
built = _build_spreads(
    "TEST", 560.0, expiry_d.isoformat(), expiry_d, 35,
    FakeChain(dead_short, pd.DataFrame(columns=list(puts.columns))),
)
check("short leg with no two-sided quote → direction dropped entirely",
      built == [], f"got {len(built)} spread(s)")

built = _build_spreads(
    "TEST", 560.0, expiry_d.isoformat(), expiry_d, 35,
    FakeChain(puts, pd.DataFrame(columns=list(puts.columns))),
)
check("healthy chain still produces a spread", len(built) == 1, f"got {len(built)}")
if built:
    s = built[0]
    check("spread carries a quality block", isinstance(s.get("quality"), dict),
          str(s.get("quality", {}).get("flags")))
    check("spread carries management targets",
          s.get("manage_profit_pct") == 50 and "manage_date" in s,
          f"manage_date={s.get('manage_date')} to21DTE={s.get('days_to_manage_dte')}")
    check("each priced width has a 50%-of-credit close price",
          all(w["manage_price"] == round(w["net_credit"] * 0.5, 2)
              for w in s["widths"] if w["quote_ok"]),
          str([(w["net_credit"], w["manage_price"]) for w in s["widths"] if w["quote_ok"]]))


# ---------------------------------------------------------------------------
# Part B — live width-toggle verification
# ---------------------------------------------------------------------------

print()
print("=" * 78)
print("PART B — live width toggle (item 3)")
print("=" * 78)

open_now = _is_market_open()
mins = _session_minutes()
print(f"market_open={open_now}  minutes_since_open={mins}")

try:
    from app.services.options_scanner import _scan_ticker, _macro_events

    sym = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    spreads = _scan_ticker(sym, _macro_events(50))
    if not spreads:
        print(f"  (no spreads returned for {sym} — cannot verify live; "
              f"{'market is closed' if not open_now else 'filters excluded all rows'})")
    for s in spreads:
        print(f"\n  {s['ticker']} {s['strategy']} short {s['short_strike']} "
              f"Δ{s['short_delta']} exp {s['expiry']}")
        print(f"    IV rank {s['iv_rank']} ({s['iv_rank_source']})  "
              f"earnings={s['next_earnings']}  exdiv_risk={'yes' if s['exdiv_risk'] else 'no'}")
        print(f"    quality: {s['quality']['flags'] or 'clean'}")
        seen_credits = []
        for w in s["widths"]:
            if w["quote_ok"]:
                print(f"    ${w['width']:>6g} wide  long {w['long_strike']:<9g} "
                      f"ask {w['long_ask']:<6} credit {w['net_credit']:<6} "
                      f"risk {w['max_risk']:<7} ROI {w['roi_pct']}%"
                      f"{'  [SUSPECT]' if w['suspect'] else ''}")
                seen_credits.append(w["net_credit"])
            else:
                print(f"    ${w['width']:>6g} wide  long {w['long_strike']:<9g} "
                      f"quote unavailable — {w['quote_issue']}")
        if len(seen_credits) >= 2:
            check(f"live: {s['ticker']} {s['strategy']} credit changes across widths",
                  len(set(seen_credits)) > 1, f"credits={seen_credits}")
except Exception as e:
    print(f"  live check skipped: {e}")


# ---------------------------------------------------------------------------

print()
print("=" * 78)
failed = [r for r in results if r[0] == FAIL]
for status, name, detail in results:
    print(f"  [{status}] {name}" + (f"  — {detail}" if detail else ""))
print("=" * 78)
print(f"{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
