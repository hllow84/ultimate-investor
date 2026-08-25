"""
Credit spread scanner — daily-refreshed bull put spreads + bear call spreads.

Uses Black-Scholes delta (pure Python, no scipy) to find short legs near delta 10,
long legs at a range of widths, 30-45 DTE, for a curated list of liquid tickers.

Quote integrity is the priority here: a stale or one-sided quote on either leg
silently manufactures fake edge — a missing long ask makes the long look free, so
the net credit becomes the entire short bid and ROI explodes. Every leg is run
through _quote(), and a row whose quote is unusable reports "quote unavailable"
rather than a number that looks tradable.
"""
import logging
import math
from datetime import date, datetime, time as dtime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import yfinance as yf

from app.services import iv_history

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

# --- Quote integrity / data quality -----------------------------------------
OPENING_RANGE_MINUTES = 45   # first N minutes of the session: quotes least reliable
MIN_OPEN_INTEREST = 10       # below this the chain row is barely a market
WIDE_QUOTE_RATIO = 0.60      # (ask-bid)/mid above this is a warning, not a block
SUSPECT_CREDIT_WIDTH_PCT = 40.0   # credit worth >40% of width...
SUSPECT_DELTA_MAX = 0.15          # ...at a delta this low is not a real market

# --- Trade management --------------------------------------------------------
MANAGE_PROFIT_PCT = 0.50     # close at 50% of credit received
MANAGE_DTE = 21              # and/or at 21 DTE, whichever comes first


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

def _num(value, default: float = 0.0) -> float:
    """
    Coerce a chain cell to a finite float.

    yfinance returns NaN (not None/0) for missing bid/ask. `x or 0` does NOT catch
    that — bool(nan) is True — and every NaN comparison is False, so a NaN would
    slip past the MIN_BID / <= 0 / MIN_ROI guards and poison the JSON response.
    """
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default


def _quote(row) -> dict:
    """
    Validate one option chain row's quote.

    Hard failures (ok=False — nothing is priced off this leg):
      - bid or ask missing / NaN / zero  → no live two-sided market
      - bid > ask                        → crossed; the feed is stale or broken

    Soft warning (ok=True, wide=True): the bid/ask spread is a large fraction of
    the mid. Common and legitimate on deep-OTM long legs, so it annotates rather
    than blocks.
    """
    bid = _num(row.get("bid"))
    ask = _num(row.get("ask"))
    oi = int(_num(row.get("openInterest")))
    vol = int(_num(row.get("volume")))

    if bid <= 0 or ask <= 0:
        return {"ok": False, "issue": "no two-sided quote", "bid": bid, "ask": ask,
                "mid": 0.0, "wide": False, "oi": oi, "volume": vol}
    if bid > ask:
        return {"ok": False, "issue": "crossed quote (bid > ask)", "bid": bid, "ask": ask,
                "mid": 0.0, "wide": False, "oi": oi, "volume": vol}

    mid = (bid + ask) / 2.0
    if mid <= 0:
        return {"ok": False, "issue": "no valid mid", "bid": bid, "ask": ask,
                "mid": 0.0, "wide": False, "oi": oi, "volume": vol}

    return {
        "ok": True, "issue": None, "bid": round(bid, 2), "ask": round(ask, 2),
        "mid": round(mid, 3), "wide": (ask - bid) / mid > WIDE_QUOTE_RATIO,
        "oi": oi, "volume": vol,
    }


def _json_safe(obj):
    """
    Recursively replace non-finite floats (NaN / ±inf) with None.

    Starlette serialises responses with json.dumps(allow_nan=False), so a single
    NaN anywhere raises ValueError and turns the whole endpoint into a 500 —
    the frontend then shows "Failed to load spreads" even though 30+ spreads
    were scanned fine. This is the last line of defence at the cache boundary.
    """
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def _now_et() -> datetime:
    return datetime.now(ZoneInfo("America/New_York"))


def _is_market_open() -> bool:
    """True if NYSE regular session is currently active."""
    try:
        now = _now_et()
        if now.weekday() >= 5:
            return False
        t = now.time()
        return dtime(9, 30) <= t <= dtime(16, 0)
    except Exception:
        return False


def _session_minutes() -> Optional[int]:
    """Minutes elapsed since the 09:30 ET open, or None outside the session."""
    try:
        now = _now_et()
        if now.weekday() >= 5:
            return None
        open_dt = now.replace(hour=9, minute=30, second=0, microsecond=0)
        close_dt = now.replace(hour=16, minute=0, second=0, microsecond=0)
        if not (open_dt <= now <= close_dt):
            return None
        return int((now - open_dt).total_seconds() // 60)
    except Exception:
        return None


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
    short_delta_abs: float, opt_type: str, target_w: float
) -> Optional[dict]:
    """
    Compute one spread-width variant.

    Every width re-reads the chain for its own long strike and that strike's own
    ask, so net_credit genuinely differs per width — it is never the narrow-width
    credit re-labelled. Returns None only when no long strike exists near the
    target width; a strike that exists but has an unusable quote comes back with
    quote_ok=False and null prices so the UI can say "quote unavailable".
    """
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
    long_strike = _num(long_row["strike"])
    if long_strike <= 0:
        return None
    actual_width = round(abs(short_strike - long_strike), 2)

    # Reject if the strike didn't get close to the target width
    if actual_width < target_w * 0.4 or actual_width <= 0:
        return None

    lq = _quote(long_row)
    base = {
        "width": actual_width,
        "long_strike": long_strike,
        "long_bid": lq["bid"],
        "long_ask": lq["ask"],
        "long_oi": lq["oi"],
        "long_volume": lq["volume"],
        "long_iv_pct": round(_num(long_row.get("impliedVolatility")) * 100, 1),
        "quote_ok": lq["ok"],
        "quote_issue": lq["issue"],
        "wide_quote": lq["wide"],
        "net_credit": None,
        "max_risk": None,
        "roi_pct": None,
        "breakeven": None,
        "buffer_pct": None,
        "credit_width_pct": None,
        "manage_price": None,
        "manage_profit": None,
        "suspect": False,
        "suspect_reason": None,
    }

    # Unusable long quote — surface the strike, refuse to price it.
    if not lq["ok"]:
        return base

    long_premium = lq["ask"]   # you buy the long — pay ask
    net_credit = short_premium - long_premium
    if net_credit <= 0:
        return {**base, "quote_ok": False, "quote_issue": "no net credit at this width"}

    max_risk = actual_width - net_credit
    if max_risk <= 0:
        # A credit >= the width is arbitrage-impossible: bad data, not free money.
        return {**base, "quote_ok": False, "quote_issue": "credit exceeds width (bad quote)"}

    roi = (net_credit / max_risk) * 100.0
    be = short_strike - net_credit if opt_type == "put" else short_strike + net_credit
    buffer_pct = round(abs(be - S) / S * 100, 1) if S > 0 else 0.0
    credit_width_pct = round(net_credit / actual_width * 100, 1)

    # Sanity ceiling: at delta <= 0.15 a credit worth >40% of the width is not a
    # market that exists. Flag it rather than presenting it as an opportunity.
    suspect = credit_width_pct > SUSPECT_CREDIT_WIDTH_PCT and short_delta_abs <= SUSPECT_DELTA_MAX
    suspect_reason = (
        f"Credit is {credit_width_pct}% of the ${actual_width:g} width at Δ{short_delta_abs:.2f} — "
        "implausible for a short leg this far out of the money. Verify against your broker."
        if suspect else None
    )

    return {
        **base,
        "net_credit": round(net_credit, 2),
        "max_risk": round(max_risk, 2),
        "roi_pct": round(roi, 1),
        "breakeven": round(be, 2),
        "buffer_pct": buffer_pct,
        "credit_width_pct": credit_width_pct,
        # Manage at 50% of credit: pay this debit to close, bank the difference.
        "manage_price": round(net_credit * (1 - MANAGE_PROFIT_PCT), 2),
        "manage_profit": round(net_credit * MANAGE_PROFIT_PCT, 2),
        "suspect": suspect,
        "suspect_reason": suspect_reason,
    }


def _build_spreads(
    sym: str, S: float, expiry: str, expiry_date: date, dte: int, chain,
    hv30_pct: float = 0.0, iv_stats: Optional[dict] = None,
    next_earnings: Optional[dict] = None, next_exdiv: Optional[dict] = None,
) -> list[dict]:
    """Return one spread record per direction (put/call) with all width variants."""
    T = dte / 365.0
    results = []
    session_min = _session_minutes()
    opening_range = session_min is not None and session_min < OPENING_RANGE_MINUTES

    for opt_type, df in [("put", chain.puts), ("call", chain.calls)]:
        if df is None or df.empty:
            continue

        df = df.copy().reset_index(drop=True)

        # Compute BS delta
        deltas = []
        for _, row in df.iterrows():
            K = _num(row["strike"])
            iv = _num(row.get("impliedVolatility", 0))
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
        short_strike = _num(short_row["strike"])
        short_delta_abs = round(abs(_num(short_row["_delta"])), 3)
        if short_strike <= 0:
            continue

        # The short leg is the anchor: without a real two-sided quote there is
        # nothing to price at any width, so the whole direction is dropped.
        sq = _quote(short_row)
        if not sq["ok"]:
            log.debug("%s %s Δ%.2f short leg unusable: %s", sym, opt_type, short_delta_abs, sq["issue"])
            continue
        short_premium = sq["bid"]   # you sell the short — receive bid
        if short_premium < MIN_BID:
            continue

        # IV / move metrics (same for all widths — depends on the short leg only)
        iv_decimal = _num(short_row.get("impliedVolatility", 0))
        iv_pct = round(iv_decimal * 100, 1)
        exp_move_pct = round(iv_decimal * math.sqrt(T) * 100, 1) if iv_decimal > 0 else 0.0
        exp_move_dollar = round(S * iv_decimal * math.sqrt(T), 2) if iv_decimal > 0 else 0.0
        hv30_pct = _num(hv30_pct)
        hv30_decimal = hv30_pct / 100.0
        hv30_move_pct = round(hv30_decimal * math.sqrt(T) * 100, 1) if hv30_pct > 0 else 0.0
        hv30_move_dollar = round(S * hv30_decimal * math.sqrt(T), 2) if hv30_pct > 0 else 0.0

        strategy = "Bull Put Spread" if opt_type == "put" else "Bear Call Spread"

        # Build width variants — deduplicate when strikes snap to the same level
        widths_list: list[dict] = []
        seen: set[int] = set()
        for tw in TARGET_WIDTHS:
            v = _width_variant(df, S, short_strike, short_premium, short_delta_abs, opt_type, tw)
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

        priced = [w for w in widths_list if w["quote_ok"]]
        if not priced:
            # Every width had a broken long quote — nothing tradable to show.
            log.debug("%s %s: no width had a usable long quote", sym, opt_type)
            continue

        # Gate on the narrowest *clean* width. Suspect rows are excluded from the
        # test so a bad quote can't qualify a spread its real widths would not.
        clean = [w for w in priced if not w["suspect"]]
        gate = clean[0] if clean else priced[0]
        if _num(gate["roi_pct"]) < MIN_ROI:
            continue

        # ---- data-quality assessment --------------------------------------
        flags: list[str] = []
        if opening_range:
            flags.append(f"opening range ({session_min}m after open)")
        if sq["oi"] < MIN_OPEN_INTEREST:
            flags.append(f"thin open interest ({sq['oi']})")
        if opening_range and sq["volume"] <= 0:
            flags.append("no volume yet today")
        if sq["wide"]:
            flags.append("wide bid/ask on short leg")
        if any(w["suspect"] for w in priced):
            flags.append("credit/width ratio implausible")

        # A dead quote on the $100-wide leg says nothing about the $5 default
        # row, so unpriced widths are reported separately rather than as a
        # quality flag — otherwise the badge and the hide-flagged filter fire on
        # rows whose tradable width is perfectly clean.
        unpriced_widths = [w["width"] for w in widths_list if not w["quote_ok"]]

        quality = {
            "market_open": session_min is not None,
            "minutes_since_open": session_min,
            "opening_range": opening_range,
            "short_oi": sq["oi"],
            "short_volume": sq["volume"],
            "short_bid": sq["bid"],
            "short_ask": sq["ask"],
            "low_liquidity": sq["oi"] < MIN_OPEN_INTEREST,
            "unpriced_widths": unpriced_widths,
            "reliable": not flags,
            "flags": flags,
        }

        # ---- ex-dividend early-assignment risk (bear calls only) ----------
        exdiv_risk = None
        if opt_type == "call" and next_exdiv:
            xd = _to_date(next_exdiv.get("date"))
            if xd and date.today() <= xd <= expiry_date:
                # A short call risks early assignment when it is ITM (or close)
                # going into the ex-div date: the holder exercises to capture the
                # dividend and you end up short the stock owing that dividend.
                itm = S > short_strike
                near = short_strike <= S * 1.02
                if itm or near:
                    exdiv_risk = {
                        "date": xd.isoformat(),
                        "days_away": (xd - date.today()).days,
                        "amount": next_exdiv.get("amount"),
                        "moneyness": "ITM" if itm else "near-the-money",
                        "note": (
                            f"Short {short_strike:g} call is "
                            f"{'in the money' if itm else 'within 2% of spot'} and the "
                            f"{xd.isoformat()} ex-dividend date falls before {expiry} — "
                            "early assignment risk; you would owe the dividend."
                        ),
                    }

        # ---- earnings before expiry ---------------------------------------
        earnings = None
        if next_earnings:
            ed = _to_date(next_earnings.get("date"))
            if ed:
                earnings = {
                    "date": ed.isoformat(),
                    "days_away": (ed - date.today()).days,
                    "before_expiry": ed <= expiry_date,
                }

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
            "short_bid": round(short_premium, 2),
            "short_ask": sq["ask"],
            "roi_pct": _num(gate["roi_pct"]),  # narrowest clean width — used for sorting
            "widths": widths_list,
            "quality": quality,
            "iv_rank": (iv_stats or {}).get("iv_rank"),
            "iv_percentile": (iv_stats or {}).get("iv_percentile"),
            "iv_atm_pct": (iv_stats or {}).get("iv_atm_pct"),
            "iv_rank_source": (iv_stats or {}).get("source", "unavailable"),
            "iv_52w_low": (iv_stats or {}).get("iv_low"),
            "iv_52w_high": (iv_stats or {}).get("iv_high"),
            "next_earnings": earnings,
            "exdiv_risk": exdiv_risk,
            # Trade management. Per-width close prices live on each width variant
            # as manage_price / manage_profit; the 21-DTE checkpoint is per spread.
            "manage_dte": MANAGE_DTE,
            "days_to_manage_dte": dte - MANAGE_DTE,
            "manage_date": (expiry_date - timedelta(days=MANAGE_DTE)).isoformat(),
            "manage_profit_pct": int(MANAGE_PROFIT_PCT * 100),
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


def _calendar_dict(ticker_obj) -> dict:
    """yfinance .calendar as a plain dict — it returns a DataFrame (newer) or dict (older)."""
    try:
        cal = ticker_obj.calendar
        if cal is None:
            return {}
        if hasattr(cal, "empty"):      # DataFrame
            return cal.iloc[0].to_dict() if not cal.empty else {}
        return dict(cal)
    except Exception as e:
        log.debug("calendar fetch failed: %s", e)
        return {}


def _next_earnings(cal: dict) -> Optional[dict]:
    """
    Next earnings date regardless of any window — None for indices/ETFs.

    Separate from _stock_events(): the Events column only shows what lands inside
    the spread's lifetime, but the earnings *column* needs the date even when it
    falls after expiry, so "reports before expiration" can be answered either way.
    """
    raw = cal.get("Earnings Date")
    if raw is None:
        return None
    ed = _to_date(raw[0] if isinstance(raw, (list, tuple)) and len(raw) else raw)
    if not ed or ed < date.today():
        return None
    return {"date": ed.isoformat(), "days_away": (ed - date.today()).days}


def _next_exdiv(cal: dict) -> Optional[dict]:
    """Next ex-dividend date + amount regardless of any window."""
    xd = _to_date(cal.get("Ex-Dividend Date"))
    if not xd or xd < date.today():
        return None
    amount = _num(cal.get("Dividend Rate") or cal.get("dividendRate"))
    return {
        "date": xd.isoformat(),
        "days_away": (xd - date.today()).days,
        "amount": round(amount, 2) if amount > 0 else None,
    }


def _stock_events(cal: dict, window_days: int) -> list[dict]:
    """Earnings and ex-dividend events within `window_days` (for the Events column)."""
    cutoff = date.today() + timedelta(days=window_days)
    events: list[dict] = []

    ne = _next_earnings(cal)
    if ne:
        ed = _to_date(ne["date"])
        if ed and ed <= cutoff:
            events.append({"type": "earnings", "date": ne["date"],
                           "label": "Earnings", "days_away": ne["days_away"]})

    xd = _next_exdiv(cal)
    if xd:
        d = _to_date(xd["date"])
        if d and d <= cutoff:
            events.append({"type": "exdiv", "date": xd["date"],
                           "label": "Ex-Div", "days_away": xd["days_away"]})

    return events


# ---------------------------------------------------------------------------
# History-based metrics: HV30 + Technical Summary (single 1y fetch)
# ---------------------------------------------------------------------------

def _rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(c, 0.0) for c in changes[-period:]]
    losses = [abs(min(c, 0.0)) for c in changes[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))


def _sma(closes: list[float], period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def _tech_signal(rsi: float, sma50_pct: Optional[float], sma200_pct: Optional[float]) -> str:
    bull = bear = 0
    if rsi > 60:
        bull += 1
    elif rsi < 40:
        bear += 1
    if sma50_pct is not None:
        bull += 1 if sma50_pct > 0 else 0
        bear += 1 if sma50_pct <= 0 else 0
    if sma200_pct is not None:
        bull += 1 if sma200_pct > 0 else 0
        bear += 1 if sma200_pct <= 0 else 0
    if bull >= 2:
        return "bullish"
    if bear >= 2:
        return "bearish"
    return "neutral"


def _rolling_hv_series(closes: list[float], window: int = 30) -> list[float]:
    """Annualised realised vol over a rolling `window` of trading days, in %."""
    if len(closes) < window + 2:
        return []
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))
            if closes[i - 1] > 0 and closes[i] > 0]
    out: list[float] = []
    for i in range(window, len(rets) + 1):
        w = rets[i - window:i]
        m = sum(w) / len(w)
        var = sum((x - m) ** 2 for x in w) / (len(w) - 1)
        out.append(math.sqrt(var) * math.sqrt(252) * 100)
    return out


def _compute_history_metrics(ticker_obj) -> tuple[float, dict, list[float]]:
    """
    Single 1-year history fetch → (hv30_pct, tech_summary, rolling_hv_series).
    tech_summary keys: signal, rsi, sma50_pct, sma200_pct, w52_high_pct
    Returns (0.0, {}, []) on failure.
    """
    try:
        hist = ticker_obj.history(period="1y")
        closes = hist["Close"].dropna().tolist()
        if len(closes) < 10:
            return 0.0, {}, []

        # HV30 — last 30 trading days (~45 calendar)
        hv_closes = closes[-45:] if len(closes) >= 45 else closes
        log_returns = [math.log(hv_closes[i] / hv_closes[i - 1]) for i in range(1, len(hv_closes))]
        if len(log_returns) >= 2:
            mean = sum(log_returns) / len(log_returns)
            variance = sum((x - mean) ** 2 for x in log_returns) / (len(log_returns) - 1)
            hv30 = round(math.sqrt(variance) * math.sqrt(252) * 100, 1)
        else:
            hv30 = 0.0

        # Technical
        current = closes[-1]
        rsi_val = round(_rsi(closes), 1)
        sma50 = _sma(closes, 50)
        sma200 = _sma(closes, 200)
        sma50_pct = round((current - sma50) / sma50 * 100, 1) if sma50 else None
        sma200_pct = round((current - sma200) / sma200 * 100, 1) if sma200 else None
        w52_high = max(closes)
        w52_high_pct = round((current - w52_high) / w52_high * 100, 1)

        tech = {
            "signal": _tech_signal(rsi_val, sma50_pct, sma200_pct),
            "rsi": rsi_val,
            "sma50_pct": sma50_pct,
            "sma200_pct": sma200_pct,
            "w52_high_pct": w52_high_pct,
        }
        return hv30, tech, _rolling_hv_series(closes)

    except Exception as e:
        log.debug("history metrics failed: %s", e)
        return 0.0, {}, []


def _atm_iv_pct(chain, S: float) -> float:
    """
    At-the-money implied vol, averaged across the nearest call and put.

    ATM IV — not the delta-10 leg's IV — is what IV Rank is conventionally quoted
    against; skew makes a wing's IV a moving target relative to the surface.
    """
    vals: list[float] = []
    for df in (chain.calls, chain.puts):
        if df is None or df.empty:
            continue
        try:
            d = df.copy()
            d["_d"] = (d["strike"].astype(float) - S).abs()
            row = d.loc[d["_d"].idxmin()]
            iv = _num(row.get("impliedVolatility"))
            if iv > 0:
                vals.append(iv * 100)
        except Exception:
            continue
    return round(sum(vals) / len(vals), 1) if vals else 0.0


# ---------------------------------------------------------------------------
# VIX fetch
# ---------------------------------------------------------------------------

def get_vix() -> float:
    try:
        info = yf.Ticker("^VIX").fast_info
        return round(_num(info.last_price), 2)
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
# Per-ticker scan (shared by the curated sweep and the custom-ticker endpoint)
# ---------------------------------------------------------------------------

def _scan_ticker(sym: str, macro: list[dict]) -> list[dict]:
    """Scan one ticker. Raises ValueError on hard failures so callers can report them."""
    ticker = yf.Ticker(sym)
    S = _num(ticker.fast_info.last_price)
    if S <= 0:
        raise ValueError(f"No price data for {sym}")

    options_dates = list(ticker.options)
    if not options_dates:
        raise ValueError(f"{sym} has no options chain")

    expiry = _find_target_expiry(options_dates)
    if not expiry:
        raise ValueError(f"{sym} has no expiry in the 30–45 DTE window")

    expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
    dte = (expiry_date - date.today()).days
    chain = ticker.option_chain(expiry)

    hv30, tech, hv_series = _compute_history_metrics(ticker)

    # IV Rank: record today's ATM IV, then rank the current reading against this
    # ticker's own history (or the realised-vol proxy until that history exists).
    atm_iv = _atm_iv_pct(chain, S)
    if atm_iv > 0:
        iv_history.record_atm_iv(sym, atm_iv)
    iv_stats = iv_history.compute_iv_stats(sym, atm_iv, hv_series)

    cal = _calendar_dict(ticker)
    earnings = _next_earnings(cal)
    exdiv = _next_exdiv(cal)

    spreads = _build_spreads(sym, S, expiry, expiry_date, dte, chain,
                             hv30, iv_stats, earnings, exdiv)

    window = dte + 2
    stock_evts = _stock_events(cal, window)
    macro_evts = [e for e in macro if e["days_away"] <= window]
    all_evts = sorted(stock_evts + macro_evts, key=lambda x: x["days_away"])
    for s in spreads:
        s["events"] = all_evts
        s["tech"] = tech

    return spreads


# ---------------------------------------------------------------------------
# Main scan function with daily in-memory cache
# ---------------------------------------------------------------------------

# (_date_str, spreads_list, vix_float)
_cache: Optional[tuple[str, list[dict], float]] = None


def scan_single_ticker(sym: str) -> dict:
    """Run a live spread scan for one ticker. No caching — always fresh."""
    sym = sym.upper().strip()
    today_str = date.today().isoformat()
    macro = _macro_events(window_days=50)
    try:
        spreads = _scan_ticker(sym, macro)
        spreads = [s for s in spreads if _num(s.get("roi_pct")) > 0]

        if not spreads:
            return {"error": f"{sym} passed filters but no spreads met the criteria (check liquidity / DTE)", "spreads": []}

        return _json_safe({
            "spreads": spreads,
            "ticker": sym,
            "date": today_str,
            "after_hours": not _is_market_open(),
            "minutes_since_open": _session_minutes(),
        })

    except ValueError as e:
        return {"error": str(e), "spreads": []}
    except Exception as e:
        log.warning("scan_single_ticker %s: %s", sym, e)
        return {"error": f"Failed to scan {sym}: {e}", "spreads": []}


def scan_credit_spreads(force_refresh: bool = False) -> dict:
    """Return cached or freshly computed spread opportunities."""
    global _cache
    today_str = date.today().isoformat()

    after_hours = not _is_market_open()
    session_min = _session_minutes()
    opening_range = session_min is not None and session_min < OPENING_RANGE_MINUTES

    def _envelope(spreads: list[dict], vix: float, cached: bool, when: str) -> dict:
        return {
            "spreads": spreads,
            "vix": vix,
            "vix_info": vix_label(vix),
            "cached": cached,
            "after_hours": after_hours,
            "minutes_since_open": session_min,
            "opening_range": opening_range,
            "opening_range_minutes": OPENING_RANGE_MINUTES,
            "date": when,
            "count": len(spreads),
        }

    # After hours: always serve cache if available — live bids are gone so a
    # fresh scan would overwrite good data with near-empty results.
    if after_hours and not force_refresh and _cache:
        return _envelope(_cache[1], _cache[2], True, _cache[0])

    if not force_refresh and _cache and _cache[0] == today_str:
        return _envelope(_cache[1], _cache[2], True, today_str)

    vix = get_vix()
    all_spreads: list[dict] = []

    # Macro events are the same for every ticker — compute once
    macro = _macro_events(window_days=50)

    for sym in CURATED_TICKERS:
        try:
            spreads = _scan_ticker(sym, macro)
            all_spreads.extend(spreads)
            log.info("%s: found %d spread(s)", sym, len(spreads))
        except Exception as e:
            log.warning("Skipping %s: %s", sym, e)

    # Drop any spread with unusable pricing, then make the payload JSON-safe
    all_spreads = [s for s in all_spreads if _num(s.get("roi_pct")) > 0]
    all_spreads = _json_safe(all_spreads)
    all_spreads.sort(key=lambda x: x["roi_pct"], reverse=True)

    # Don't overwrite a good cache with an empty scan (e.g. after-hours bid=0)
    if not all_spreads and _cache and _cache[0] == today_str:
        log.warning("Fresh scan returned 0 spreads — keeping existing cache")
        return _envelope(_cache[1], vix, True, today_str)

    _cache = (today_str, all_spreads, vix)
    return _envelope(all_spreads, vix, False, today_str)
