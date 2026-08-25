"""
Saved credit-spread positions + beta-weighted portfolio delta.

Per-row max risk tells you what one spread can lose. It says nothing about which
way the book leans: fifteen bull put spreads on fifteen different names is a large
directional bet, and nothing on the scanner page shows that. This module answers
"if the market drops 1%, roughly what happens to the whole book?" by translating
every open position into an equivalent number of SPY shares.

Method
------
1. Re-price each leg's Black-Scholes delta from the stored strike/IV against the
   *live* underlying and today's time to expiry — not the delta at entry, which
   goes stale the moment the stock moves.
2. Position delta (shares) = 100 x contracts x (long_delta - short_delta), since
   the short leg is sold and the long leg bought.
3. Dollar delta = position delta x spot.
4. Beta-weight against SPY: beta is the OLS slope of the ticker's daily returns
   on SPY's over the past year. Beta-weighted dollar delta / SPY spot gives the
   book's exposure as SPY-share equivalents, which is the only unit in which a
   TSLA spread and a KO spread can be added together.
"""
import logging
import math
from datetime import date, datetime, timezone
from typing import Optional

import yfinance as yf

from app.services.options_scanner import _bs_delta, _num, RISK_FREE_RATE

log = logging.getLogger(__name__)

BENCHMARK = "SPY"
CONTRACT_MULTIPLIER = 100
DEFAULT_IV_PCT = 30.0     # fallback when a position was saved without IV

# sym -> (iso_date, value). Beta over a year barely moves intraday; spot does,
# so it gets a short TTL instead of a daily one.
_beta_cache: dict[str, tuple[str, float]] = {}
_spot_cache: dict[str, tuple[float, float]] = {}
_SPOT_TTL_SECONDS = 120


# ---------------------------------------------------------------------------
# Market data
# ---------------------------------------------------------------------------

def _spot(sym: str) -> float:
    """Current underlying price, cached briefly so a 20-position book isn't 20 fetches."""
    now = datetime.now(timezone.utc).timestamp()
    hit = _spot_cache.get(sym)
    if hit and now - hit[1] < _SPOT_TTL_SECONDS:
        return hit[0]
    try:
        px = _num(yf.Ticker(sym).fast_info.last_price)
    except Exception as e:
        log.debug("spot(%s) failed: %s", sym, e)
        px = 0.0
    if px > 0:
        _spot_cache[sym] = (px, now)
    return px


def _daily_returns(sym: str):
    """Daily simple returns as a pandas Series indexed by naive date, or None."""
    try:
        hist = yf.Ticker(sym).history(period="1y")
        closes = hist["Close"].dropna()
        if len(closes) < 30:
            return None
        closes.index = closes.index.tz_localize(None).normalize()
        return closes.pct_change().dropna()
    except Exception as e:
        log.debug("returns(%s) failed: %s", sym, e)
        return None


def beta_vs_benchmark(sym: str) -> tuple[float, bool]:
    """
    (beta, is_estimated) — OLS slope of sym's daily returns on SPY's over 1 year.

    Returns (1.0, True) when there isn't enough overlapping history to regress,
    so the caller can mark the number as assumed rather than measured.
    """
    if sym.upper() in (BENCHMARK, "^GSPC", "^SPX"):
        # The index and its tracking ETF are the benchmark by definition.
        return 1.0, False

    today = date.today().isoformat()
    hit = _beta_cache.get(sym)
    if hit and hit[0] == today:
        return hit[1], False

    r_sym = _daily_returns(sym)
    r_bm = _daily_returns(BENCHMARK)
    if r_sym is None or r_bm is None:
        return 1.0, True

    try:
        import pandas as pd

        joined = pd.concat([r_sym, r_bm], axis=1, join="inner").dropna()
        if len(joined) < 30:
            return 1.0, True
        a = joined.iloc[:, 0]
        b = joined.iloc[:, 1]
        var_b = float(b.var())
        if var_b <= 0:
            return 1.0, True
        beta = float(a.cov(b)) / var_b
        if not math.isfinite(beta):
            return 1.0, True
        beta = round(max(-5.0, min(5.0, beta)), 2)
        _beta_cache[sym] = (today, beta)
        return beta, False
    except Exception as e:
        log.debug("beta(%s) failed: %s", sym, e)
        return 1.0, True


# ---------------------------------------------------------------------------
# Per-position metrics
# ---------------------------------------------------------------------------

def position_metrics(pos, spot: float, beta: float, beta_estimated: bool,
                     bm_spot: float) -> dict:
    """Live delta / risk figures for one saved position."""
    try:
        expiry_d = datetime.strptime(pos.expiry, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        expiry_d = date.today()
    dte = max((expiry_d - date.today()).days, 0)
    T = dte / 365.0

    short_iv = _num(pos.short_iv_pct, DEFAULT_IV_PCT) / 100.0
    long_iv = _num(pos.long_iv_pct, 0.0) / 100.0 or short_iv
    if short_iv <= 0:
        short_iv = DEFAULT_IV_PCT / 100.0
    if long_iv <= 0:
        long_iv = short_iv

    short_delta = _bs_delta(spot, pos.short_strike, T, RISK_FREE_RATE, short_iv, pos.opt_type)
    long_delta = _bs_delta(spot, pos.long_strike, T, RISK_FREE_RATE, long_iv, pos.opt_type)

    # Short the short leg, long the long leg.
    net_delta_per_share = long_delta - short_delta
    contracts = int(pos.contracts or 1)
    position_delta = net_delta_per_share * CONTRACT_MULTIPLIER * contracts

    dollar_delta = position_delta * spot
    beta_dollar_delta = dollar_delta * beta
    spy_equiv = beta_dollar_delta / bm_spot if bm_spot > 0 else 0.0

    width = abs(pos.short_strike - pos.long_strike)
    credit_total = _num(pos.net_credit) * CONTRACT_MULTIPLIER * contracts
    max_risk_total = max(width - _num(pos.net_credit), 0.0) * CONTRACT_MULTIPLIER * contracts

    # Distance from spot to the short strike, the level that actually matters.
    if pos.opt_type == "put":
        cushion_pct = (spot - pos.short_strike) / spot * 100 if spot > 0 else 0.0
    else:
        cushion_pct = (pos.short_strike - spot) / spot * 100 if spot > 0 else 0.0

    return {
        "id": pos.id,
        "ticker": pos.ticker,
        "opt_type": pos.opt_type,
        "strategy": "Bull Put Spread" if pos.opt_type == "put" else "Bear Call Spread",
        "short_strike": pos.short_strike,
        "long_strike": pos.long_strike,
        "width": round(width, 2),
        "expiry": pos.expiry,
        "dte": dte,
        "contracts": contracts,
        "net_credit": round(_num(pos.net_credit), 2),
        "credit_total": round(credit_total, 2),
        "max_risk_total": round(max_risk_total, 2),
        "manage_price": round(_num(pos.net_credit) * 0.5, 2),
        "days_to_manage_dte": dte - 21,
        "spot": round(spot, 2),
        "cushion_pct": round(cushion_pct, 1),
        "short_delta": round(short_delta, 3),
        "long_delta": round(long_delta, 3),
        "position_delta": round(position_delta, 1),
        "dollar_delta": round(dollar_delta, 0),
        "beta": beta,
        "beta_estimated": beta_estimated,
        "beta_dollar_delta": round(beta_dollar_delta, 0),
        "spy_equiv_shares": round(spy_equiv, 1),
        "opened_at": pos.opened_at.isoformat() if pos.opened_at else None,
        "closed_at": pos.closed_at.isoformat() if pos.closed_at else None,
        "notes": pos.notes,
    }


def portfolio_summary(rows: list[dict], bm_spot: float) -> dict:
    """Aggregate the beta-weighted book."""
    total_beta_dollar = sum(r["beta_dollar_delta"] for r in rows)
    total_raw_dollar = sum(r["dollar_delta"] for r in rows)
    total_risk = sum(r["max_risk_total"] for r in rows)
    total_credit = sum(r["credit_total"] for r in rows)
    spy_equiv = total_beta_dollar / bm_spot if bm_spot > 0 else 0.0

    if total_beta_dollar > 500:
        lean, lean_color = "Net long", "green"
    elif total_beta_dollar < -500:
        lean, lean_color = "Net short", "red"
    else:
        lean, lean_color = "Roughly neutral", "yellow"

    return {
        "positions": len(rows),
        "benchmark": BENCHMARK,
        "benchmark_price": round(bm_spot, 2),
        "beta_dollar_delta": round(total_beta_dollar, 0),
        "raw_dollar_delta": round(total_raw_dollar, 0),
        "spy_equiv_shares": round(spy_equiv, 1),
        "total_max_risk": round(total_risk, 2),
        "total_credit": round(total_credit, 2),
        "lean": lean,
        "lean_color": lean_color,
        # A 1% SPY move moves the book by roughly this much, to first order.
        "pnl_per_1pct_spy": round(total_beta_dollar * 0.01, 0),
        "any_beta_estimated": any(r["beta_estimated"] for r in rows),
    }


def build_portfolio(positions) -> dict:
    """Full payload: per-position metrics + the beta-weighted summary."""
    bm_spot = _spot(BENCHMARK)
    rows: list[dict] = []
    for pos in positions:
        spot = _spot(pos.ticker)
        if spot <= 0:
            log.debug("no spot for %s — skipping from delta summary", pos.ticker)
            continue
        beta, estimated = beta_vs_benchmark(pos.ticker)
        rows.append(position_metrics(pos, spot, beta, estimated, bm_spot))

    rows.sort(key=lambda r: abs(r["beta_dollar_delta"]), reverse=True)
    return {"positions": rows, "summary": portfolio_summary(rows, bm_spot)}


def find_matching(db, user_id: int, ticker: str, opt_type: str,
                  short_strike: float, long_strike: float, expiry: str) -> Optional[object]:
    """An open position with the same legs, so saving twice doesn't duplicate it."""
    from app.db.models import SpreadPosition

    return (
        db.query(SpreadPosition)
        .filter(
            SpreadPosition.user_id == user_id,
            SpreadPosition.ticker == ticker,
            SpreadPosition.opt_type == opt_type,
            SpreadPosition.short_strike == short_strike,
            SpreadPosition.long_strike == long_strike,
            SpreadPosition.expiry == expiry,
            SpreadPosition.closed_at.is_(None),
        )
        .first()
    )
