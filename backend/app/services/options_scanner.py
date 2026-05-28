"""
Credit spread scanner — daily-refreshed bull put spreads + bear call spreads.

Uses Black-Scholes delta (pure Python, no scipy) to find short legs near delta 10,
long legs one strike further OTM, 30-45 DTE, for a curated list of liquid tickers.
"""
import logging
import math
from datetime import date, datetime, time as dtime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import yfinance as yf

log = logging.getLogger(__name__)

CURATED_TICKERS = [
    "^SPX",                                                       # SPX index — cash-settled, European, 60/40 tax
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
MIN_ROI = 2.0            # minimum ROI% — lowered from 5 to account for conservative bid/ask pricing


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

def _bid_price(row) -> float:
    """Price you receive when selling — use for short leg credit."""
    bid = float(row.get("bid", 0) or 0)
    if bid > 0:
        return bid
    return float(row.get("lastPrice", 0) or 0)


def _ask_price(row) -> float:
    """Price you pay when buying — use for long leg cost."""
    ask = float(row.get("ask", 0) or 0)
    if ask > 0:
        return ask
    return float(row.get("lastPrice", 0) or 0)


def _is_market_open() -> bool:
    """True if NYSE regular session is currently active."""
    try:
        now = datetime.now(ZoneInfo("America/New_York"))
        if now.weekday() >= 5:
            return False
        t = now.time()
        return dtime(9, 30) <= t <= dtime(16, 0)
    except Exception:
        return False


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

TARGET_WIDTHS = [5, 10, 25, 50, 100]  # spread widths to show in the expander


def _width_variant(
    df, S: float, short_strike: float, short_premium: float,
    opt_type: str, target_w: float
) -> Optional[dict]:
    """Compute one spread-width variant. Returns None if not viable."""
    if opt_type == "put":
        target_long = short_strike - target_w
        long_cands = df[df["strike"] < short_strike].copy()
    else:
        target_long = short_strike + target_w
        long_cands = df[df["strike"] > short_strike].copy()

    if long_cands.empty:
        return None

    long_cands["_dist"] = (long_cands["strike"] - target_long).abs()
    long_row = long_cands.loc[long_cands["_dist"].idxmin()]
    long_strike = float(long_row["strike"])
    actual_width = round(abs(short_strike - long_strike), 2)

    # Reject if strike didn't get close to the target width
    if actual_width < target_w * 0.4:
        return None

    long_premium = _ask_price(long_row)   # you buy the long — pay ask
    net_credit = short_premium - long_premium
    if net_credit <= 0 or actual_width <= 0:
        return None

    max_risk = actual_width - net_credit
    if max_risk <= 0:
        return None

    roi = (net_credit / max_risk) * 100.0
    be = short_strike - net_credit if opt_type == "put" else short_strike + net_credit
    buffer_pct = round(abs(be - S) / S * 100, 1) if S > 0 else 0.0

    return {
        "width": actual_width,
        "long_strike": long_strike,
        "net_credit": round(net_credit, 2),
        "max_risk": round(max_risk, 2),
        "roi_pct": round(roi, 1),
        "breakeven": round(be, 2),
        "buffer_pct": buffer_pct,
    }


def _build_spreads(sym: str, S: float, expiry: str, dte: int, chain, hv30_pct: float = 0.0) -> list[dict]:
    """Return one spread record per direction (put/call) with all width variants."""
    T = dte / 365.0
    results = []

    for opt_type, df in [("put", chain.puts), ("call", chain.calls)]:
        if df is None or df.empty:
            continue

        df = df.copy().reset_index(drop=True)

        # Compute BS delta
        deltas = []
        for _, row in df.iterrows():
            K = float(row["strike"])
            iv = float(row.get("impliedVolatility", 0) or 0)
            deltas.append(_bs_delta(S, K, T, RISK_FREE_RATE, iv, opt_type))
        df["_delta"] = deltas

        # Short leg candidates
        if opt_type == "put":
            cands = df[(df["_delta"] < -DELTA_RANGE_LOW) & (df["_delta"] > -DELTA_RANGE_HIGH)].copy()
            cands = cands.sort_values("strike", ascending=False)
        else:
            cands = df[(df["_delta"] > DELTA_RANGE_LOW) & (df["_delta"] < DELTA_RANGE_HIGH)].copy()
            cands = cands.sort_values("strike", ascending=True)

        if cands.empty:
            continue

        target_signed = -TARGET_DELTA if opt_type == "put" else TARGET_DELTA
        cands["_diff"] = (cands["_delta"] - target_signed).abs()
        short_row = cands.loc[cands["_diff"].idxmin()]
        short_strike = float(short_row["strike"])
        short_premium = _bid_price(short_row)  # you sell the short — receive bid
        short_bid = short_premium
        short_delta_abs = round(abs(float(short_row["_delta"])), 3)

        if short_bid < MIN_BID or short_premium <= 0:
            continue

        # IV / move metrics (same for all widths — depends on short leg only)
        iv_decimal = float(short_row.get("impliedVolatility", 0) or 0)
        iv_pct = round(iv_decimal * 100, 1)
        exp_move_pct = round(iv_decimal * math.sqrt(T) * 100, 1) if iv_decimal > 0 else 0.0
        exp_move_dollar = round(S * iv_decimal * math.sqrt(T), 2) if iv_decimal > 0 else 0.0
        hv30_decimal = hv30_pct / 100.0
        hv30_move_pct = round(hv30_decimal * math.sqrt(T) * 100, 1) if hv30_pct > 0 else 0.0
        hv30_move_dollar = round(S * hv30_decimal * math.sqrt(T), 2) if hv30_pct > 0 else 0.0

        strategy = "Bull Put Spread" if opt_type == "put" else "Bear Call Spread"

        # Build width variants — deduplicate when strikes snap to the same level
        widths_list: list[dict] = []
        seen: set[int] = set()
        for tw in TARGET_WIDTHS:
            v = _width_variant(df, S, short_strike, short_premium, opt_type, tw)
            if v is None:
                continue
            key = round(v["width"])
            if key in seen:
                continue
            seen.add(key)
            widths_list.append(v)

        if not widths_list:
            continue

        widths_list.sort(key=lambda x: x["width"])

        # Require the narrowest width to meet the minimum ROI threshold
        if widths_list[0]["roi_pct"] < MIN_ROI:
            continue

        results.append({
            "ticker": sym,
            "strategy": strategy,
            "expiry": expiry,
            "dte": dte,
            "stock_price": round(S, 2),
            "short_strike": short_strike,
            "short_delta": short_delta_abs,
            "iv_pct": iv_pct,
            "hv30_pct": hv30_pct,
            "exp_move_pct": exp_move_pct,
            "exp_move_dollar": exp_move_dollar,
            "hv30_move_pct": hv30_move_pct,
            "hv30_move_dollar": hv30_move_dollar,
            "short_bid": round(short_bid, 2),
            "roi_pct": widths_list[0]["roi_pct"],  # narrowest width ROI — used for sorting
            "widths": widths_list,
        })

    return results


# ---------------------------------------------------------------------------
# Upcoming event detection
# ---------------------------------------------------------------------------

# 2026 FOMC meeting end dates (second day = decision day)
_FOMC_2026 = [
    date(2026, 1, 29), date(2026, 3, 19), date(2026, 5, 7),
    date(2026, 6, 18), date(2026, 7, 30), date(2026, 9, 17),
    date(2026, 10, 29), date(2026, 12, 10),
]

# 2026 BLS CPI release dates (approx — BLS announces annually)
_CPI_2026 = [
    date(2026, 1, 15), date(2026, 2, 12), date(2026, 3, 12),
    date(2026, 4, 10), date(2026, 5, 13), date(2026, 6, 11),
    date(2026, 7, 15), date(2026, 8, 12), date(2026, 9, 11),
    date(2026, 10, 13), date(2026, 11, 12), date(2026, 12, 11),
]

# 2026 Non-Farm Payrolls (first Friday of each month)
_NFP_2026 = [
    date(2026, 1, 9), date(2026, 2, 6), date(2026, 3, 6),
    date(2026, 4, 3), date(2026, 5, 1), date(2026, 6, 5),
    date(2026, 7, 10), date(2026, 8, 7), date(2026, 9, 4),
    date(2026, 10, 2), date(2026, 11, 6), date(2026, 12, 4),
]


def _macro_events(window_days: int) -> list[dict]:
    """FOMC, CPI, NFP dates within the next `window_days` calendar days."""
    today = date.today()
    cutoff = today + timedelta(days=window_days)
    events = []
    for d, typ, label in (
        *((d, "fomc", "FOMC") for d in _FOMC_2026),
        *((d, "cpi",  "CPI")  for d in _CPI_2026),
        *((d, "nfp",  "NFP")  for d in _NFP_2026),
    ):
        if today <= d <= cutoff:
            events.append({"type": typ, "date": d.isoformat(),
                           "label": label, "days_away": (d - today).days})
    return events


def _to_date(val) -> Optional[date]:
    """Coerce a yfinance calendar value to a Python date."""
    if val is None:
        return None
    # Check datetime before date — datetime is a subclass of date
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):          # plain datetime.date (no .date() method)
        return val
    if hasattr(val, "date"):           # pandas Timestamp
        return val.date()
    if isinstance(val, str):
        try:
            return datetime.strptime(val[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _stock_events(ticker_obj, window_days: int) -> list[dict]:
    """Earnings and ex-dividend events for one ticker within `window_days`."""
    today = date.today()
    cutoff = today + timedelta(days=window_days)
    events: list[dict] = []
    try:
        cal = ticker_obj.calendar
        if cal is None:
            return events

        # yfinance returns a DataFrame (newer) or dict (older)
        if hasattr(cal, "to_dict"):
            # DataFrame — transpose so keys are column names
            cal = cal.iloc[0].to_dict() if not cal.empty else {}

        # Earnings date
        raw_ed = cal.get("Earnings Date")
        if raw_ed is not None:
            # Can be a list [low, high] or a scalar
            ed = _to_date(raw_ed[0] if isinstance(raw_ed, (list, tuple)) else raw_ed)
            if ed and today <= ed <= cutoff:
                events.append({"type": "earnings", "date": ed.isoformat(),
                               "label": "Earnings", "days_away": (ed - today).days})

        # Ex-dividend date
        raw_xd = cal.get("Ex-Dividend Date")
        if raw_xd is not None:
            xd = _to_date(raw_xd)
            if xd and today <= xd <= cutoff:
                events.append({"type": "exdiv", "date": xd.isoformat(),
                               "label": "Ex-Div", "days_away": (xd - today).days})

    except Exception as e:
        log.debug("Event fetch failed: %s", e)
    return events


# ---------------------------------------------------------------------------
# 30-day Historical Volatility
# ---------------------------------------------------------------------------

def _compute_hv30(ticker_obj) -> float:
    """
    Annualised 30-day Historical Volatility (%).
    Uses close-to-close log returns over the last ~45 calendar days
    (≈ 30 trading days), then annualises: σ_daily × √252 × 100.
    Returns 0.0 on failure.
    """
    try:
        hist = ticker_obj.history(period="45d")
        closes = hist["Close"].dropna().tolist()
        if len(closes) < 10:
            return 0.0
        log_returns = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
        n = len(log_returns)
        if n < 2:
            return 0.0
        mean = sum(log_returns) / n
        variance = sum((x - mean) ** 2 for x in log_returns) / (n - 1)
        return round(math.sqrt(variance) * math.sqrt(252) * 100, 1)
    except Exception as e:
        log.debug("HV30 failed: %s", e)
        return 0.0


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

    after_hours = not _is_market_open()

    if not force_refresh and _cache and _cache[0] == today_str:
        return {
            "spreads": _cache[1],
            "vix": _cache[2],
            "vix_info": vix_label(_cache[2]),
            "cached": True,
            "after_hours": after_hours,
            "date": today_str,
            "count": len(_cache[1]),
        }

    vix = get_vix()
    all_spreads: list[dict] = []

    # Macro events are the same for every ticker — compute once
    macro = _macro_events(window_days=50)

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
            hv30 = _compute_hv30(ticker)
            spreads = _build_spreads(sym, S, expiry, dte, chain, hv30)

            # Collect events within the spread's lifetime (DTE + 2-day buffer)
            window = dte + 2
            stock_evts = _stock_events(ticker, window)
            macro_evts = [e for e in macro if e["days_away"] <= window]
            all_evts = sorted(stock_evts + macro_evts, key=lambda x: x["days_away"])

            for s in spreads:
                s["events"] = all_evts

            all_spreads.extend(spreads)
            log.info("%s: found %d spread(s), %d event(s)", sym, len(spreads), len(all_evts))

        except Exception as e:
            log.warning("Skipping %s: %s", sym, e)

    all_spreads.sort(key=lambda x: x["roi_pct"], reverse=True)

    # Don't overwrite a good cache with an empty scan (e.g. after-hours bid=0)
    if not all_spreads and _cache and _cache[0] == today_str:
        log.warning("Fresh scan returned 0 spreads — keeping existing cache")
        return {
            "spreads": _cache[1],
            "vix": vix,
            "vix_info": vix_label(vix),
            "cached": True,
            "after_hours": after_hours,
            "date": today_str,
            "count": len(_cache[1]),
        }

    _cache = (today_str, all_spreads, vix)

    return {
        "spreads": all_spreads,
        "vix": vix,
        "vix_info": vix_label(vix),
        "cached": False,
        "after_hours": after_hours,
        "date": today_str,
        "count": len(all_spreads),
    }
