"""
Credit spread scanner — daily-refreshed bull put spreads + bear call spreads.

Uses Black-Scholes delta (pure Python, no scipy) to find short legs near delta 10,
long legs one strike further OTM, 30-45 DTE, for a curated list of liquid tickers.
"""
import logging
import math
from datetime import date, datetime
from typing import Optional

import yfinance as yf

log = logging.getLogger(__name__)

CURATED_TICKERS = [
    "SPY", "QQQ", "IWM",
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
    "JPM", "BAC", "GS", "XOM", "AMD", "NFLX", "V", "MA",
    "TLT", "GLD",
]

RISK_FREE_RATE = 0.045   # 4.5% annual — reasonable 2026 short-term rate
TARGET_DTE_MIN = 30
TARGET_DTE_MAX = 45
TARGET_DELTA = 0.10      # absolute delta for short leg
DELTA_RANGE_LOW = 0.05   # don't go below this (too OTM, thin premium)
DELTA_RANGE_HIGH = 0.25  # don't go above this (too close to ATM, too much risk)
MIN_BID = 0.05           # minimum bid for the short leg to consider it liquid
MIN_ROI = 5.0            # minimum ROI% to include in results


# ---------------------------------------------------------------------------
# Black-Scholes delta (pure Python, no scipy)
# ---------------------------------------------------------------------------

def _norm_cdf(x: float) -> float:
    """Standard normal CDF via math.erfc — numerically equivalent to scipy.stats.norm.cdf."""
    return 0.5 * math.erfc(-x / math.sqrt(2))


def _bs_delta(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Black-Scholes delta. Returns 0.0 on invalid inputs."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        if option_type == "call":
            return _norm_cdf(d1)
        return _norm_cdf(d1) - 1.0  # put delta is negative
    except (ValueError, ZeroDivisionError):
        return 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _midpoint(row) -> float:
    bid = float(row.get("bid", 0) or 0)
    ask = float(row.get("ask", 0) or 0)
    if bid > 0 and ask > 0:
        return (bid + ask) / 2.0
    return float(row.get("lastPrice", 0) or 0)


def _find_target_expiry(options_dates: list[str]) -> Optional[str]:
    """Return the expiry in the 30-45 DTE window closest to 37 DTE."""
    today = date.today()
    best: Optional[str] = None
    best_diff = float("inf")
    for d_str in options_dates:
        try:
            expiry = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        dte = (expiry - today).days
        if TARGET_DTE_MIN <= dte <= TARGET_DTE_MAX:
            diff = abs(dte - 37)
            if diff < best_diff:
                best_diff = diff
                best = d_str
    return best


# ---------------------------------------------------------------------------
# Spread building
# ---------------------------------------------------------------------------

def _build_spreads(sym: str, S: float, expiry: str, dte: int, chain) -> list[dict]:
    """Scan puts and calls for one ticker/expiry and return valid spreads."""
    T = dte / 365.0
    results = []

    for opt_type, df in [("put", chain.puts), ("call", chain.calls)]:
        if df is None or df.empty:
            continue

        df = df.copy().reset_index(drop=True)

        # Compute BS delta for each contract
        deltas = []
        for _, row in df.iterrows():
            K = float(row["strike"])
            iv = float(row.get("impliedVolatility", 0) or 0)
            deltas.append(_bs_delta(S, K, T, RISK_FREE_RATE, iv, opt_type))
        df["_delta"] = deltas

        # Filter to candidates in the target delta band
        if opt_type == "put":
            # Put deltas are negative; we want abs(delta) in [0.05, 0.25]
            cands = df[(df["_delta"] < -DELTA_RANGE_LOW) & (df["_delta"] > -DELTA_RANGE_HIGH)].copy()
            cands = cands.sort_values("strike", ascending=False)  # highest strike = most ATM
        else:
            cands = df[(df["_delta"] > DELTA_RANGE_LOW) & (df["_delta"] < DELTA_RANGE_HIGH)].copy()
            cands = cands.sort_values("strike", ascending=True)   # lowest strike = most ATM

        if cands.empty:
            continue

        # Short leg: closest to TARGET_DELTA
        target_signed = -TARGET_DELTA if opt_type == "put" else TARGET_DELTA
        cands["_diff"] = (cands["_delta"] - target_signed).abs()
        short_row = cands.loc[cands["_diff"].idxmin()]
        short_strike = float(short_row["strike"])
        short_premium = _midpoint(short_row)
        short_bid = float(short_row.get("bid", 0) or 0)
        short_delta_abs = round(abs(float(short_row["_delta"])), 3)

        if short_bid < MIN_BID or short_premium <= 0:
            continue

        # Long leg: next strike further OTM
        if opt_type == "put":
            long_cands = df[df["strike"] < short_strike].sort_values("strike", ascending=False)
        else:
            long_cands = df[df["strike"] > short_strike].sort_values("strike", ascending=True)

        if long_cands.empty:
            continue

        long_row = long_cands.iloc[0]
        long_strike = float(long_row["strike"])
        long_premium = _midpoint(long_row)

        spread_width = abs(short_strike - long_strike)
        net_credit = short_premium - long_premium

        if net_credit <= 0 or spread_width <= 0:
            continue

        max_risk = spread_width - net_credit
        if max_risk <= 0:
            continue

        roi = (net_credit / max_risk) * 100.0
        if roi < MIN_ROI:
            continue

        strategy = "Bull Put Spread" if opt_type == "put" else "Bear Call Spread"
        iv_pct = round(float(short_row.get("impliedVolatility", 0) or 0) * 100, 1)
        breakeven = (
            short_strike - net_credit if opt_type == "put"
            else short_strike + net_credit
        )

        results.append({
            "ticker": sym,
            "strategy": strategy,
            "expiry": expiry,
            "dte": dte,
            "stock_price": round(S, 2),
            "short_strike": short_strike,
            "long_strike": long_strike,
            "short_delta": short_delta_abs,
            "net_credit": round(net_credit, 2),
            "spread_width": round(spread_width, 2),
            "max_risk": round(max_risk, 2),
            "roi_pct": round(roi, 1),
            "breakeven": round(breakeven, 2),
            "short_bid": round(short_bid, 2),
            "iv_pct": iv_pct,
        })

    return results


# ---------------------------------------------------------------------------
# VIX fetch
# ---------------------------------------------------------------------------

def get_vix() -> float:
    try:
        info = yf.Ticker("^VIX").fast_info
        return round(float(info.last_price), 2)
    except Exception as e:
        log.warning("VIX fetch failed: %s", e)
        return 0.0


def vix_label(vix: float) -> dict:
    """Return color + recommendation based on VIX level."""
    if vix <= 0:
        return {"color": "muted", "label": "Unknown", "message": "VIX data unavailable."}
    if vix < 15:
        return {
            "color": "muted",
            "label": "Low",
            "message": "Low volatility — premium is thin. Consider waiting for higher VIX before selling spreads.",
        }
    if vix < 20:
        return {
            "color": "yellow",
            "label": "Moderate",
            "message": "Moderate volatility — decent premium available. Selective spread selling is reasonable.",
        }
    if vix < 30:
        return {
            "color": "green",
            "label": "Favorable",
            "message": "Good conditions for selling credit spreads. Higher IV means richer premium with manageable risk.",
        }
    return {
        "color": "red",
        "label": "Elevated",
        "message": "Elevated volatility — premium is rich but market is unstable. Size down and be very selective.",
    }


# ---------------------------------------------------------------------------
# Main scan function with daily in-memory cache
# ---------------------------------------------------------------------------

# (_date_str, spreads_list, vix_float)
_cache: Optional[tuple[str, list[dict], float]] = None


def scan_credit_spreads(force_refresh: bool = False) -> dict:
    """Return cached or freshly computed spread opportunities."""
    global _cache
    today_str = date.today().isoformat()

    if not force_refresh and _cache and _cache[0] == today_str:
        return {
            "spreads": _cache[1],
            "vix": _cache[2],
            "vix_info": vix_label(_cache[2]),
            "cached": True,
            "date": today_str,
            "count": len(_cache[1]),
        }

    vix = get_vix()
    all_spreads: list[dict] = []

    for sym in CURATED_TICKERS:
        try:
            ticker = yf.Ticker(sym)
            S = float(ticker.fast_info.last_price)
            if S <= 0:
                continue

            options_dates = list(ticker.options)
            expiry = _find_target_expiry(options_dates)
            if not expiry:
                log.debug("%s: no expiry in 30-45 DTE window", sym)
                continue

            expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            dte = (expiry_date - date.today()).days

            chain = ticker.option_chain(expiry)
            spreads = _build_spreads(sym, S, expiry, dte, chain)
            all_spreads.extend(spreads)
            log.info("%s: found %d spread(s)", sym, len(spreads))

        except Exception as e:
            log.warning("Skipping %s: %s", sym, e)

    all_spreads.sort(key=lambda x: x["roi_pct"], reverse=True)
    _cache = (today_str, all_spreads, vix)

    return {
        "spreads": all_spreads,
        "vix": vix,
        "vix_info": vix_label(vix),
        "cached": False,
        "date": today_str,
        "count": len(all_spreads),
    }
