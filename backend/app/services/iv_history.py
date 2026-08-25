"""
IV history store + IV Rank / IV Percentile.

Raw implied volatility is not comparable across tickers or across time: 55% IV is
cheap for TSLA and extraordinarily rich for KO. IV Rank normalises the current
reading against that ticker's own 52-week IV range; IV Percentile against the
distribution of readings rather than just its endpoints.

yfinance exposes no historical implied volatility, so this module builds its own
series: every scan records that day's ATM IV per ticker into SQLite. Until enough
real observations accumulate, it falls back to a proxy range derived from the
ticker's own rolling 30-day *realised* volatility over the past year, and reports
source="hv_proxy" so the frontend can say so rather than passing a proxy off as
observed data.

Caveat on the proxy: implied vol usually trades above realised vol (the variance
risk premium), so an HV-derived range tends to sit below the true IV range and
the proxy rank therefore reads high. It is a placeholder that self-corrects as
observations accumulate — not a substitute for a real IV history feed.
"""
import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select

log = logging.getLogger(__name__)

MIN_OBSERVATIONS = 30      # below this, use the HV proxy range instead
LOOKBACK_DAYS = 365


def record_atm_iv(ticker: str, iv_pct: float, on_date: Optional[date] = None) -> None:
    """Upsert today's ATM IV reading for `ticker`. Never raises."""
    if not ticker or iv_pct is None or iv_pct <= 0:
        return
    on_date = on_date or date.today()
    try:
        from app.db.database import SessionLocal
        from app.db.models import IvHistory

        with SessionLocal() as db:
            row = (
                db.query(IvHistory)
                .filter(IvHistory.ticker == ticker, IvHistory.date == on_date.isoformat())
                .first()
            )
            if row:
                row.iv_pct = float(iv_pct)
            else:
                db.add(IvHistory(ticker=ticker, date=on_date.isoformat(), iv_pct=float(iv_pct)))
            db.commit()
    except Exception as e:
        log.debug("record_atm_iv(%s) failed: %s", ticker, e)


def observed_series(ticker: str, lookback_days: int = LOOKBACK_DAYS) -> list[float]:
    """Recorded ATM IV readings for `ticker` over the lookback window."""
    if not ticker:
        return []
    try:
        from app.db.database import SessionLocal
        from app.db.models import IvHistory

        cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()
        with SessionLocal() as db:
            rows = (
                db.execute(
                    select(IvHistory.iv_pct)
                    .where(IvHistory.ticker == ticker, IvHistory.date >= cutoff)
                    .order_by(IvHistory.date)
                )
                .scalars()
                .all()
            )
        return [float(v) for v in rows if v and v > 0]
    except Exception as e:
        log.debug("observed_series(%s) failed: %s", ticker, e)
        return []


def _rank_and_percentile(current: float, series: list[float]) -> tuple[Optional[float], Optional[float], float, float]:
    """(iv_rank, iv_percentile, low, high) for `current` against `series`."""
    if not series:
        return None, None, 0.0, 0.0
    low, high = min(series), max(series)
    if high > low:
        rank = (current - low) / (high - low) * 100.0
    else:
        rank = 50.0
    rank = round(max(0.0, min(100.0, rank)), 1)
    pct = round(sum(1 for v in series if v < current) / len(series) * 100.0, 1)
    return rank, pct, round(low, 1), round(high, 1)


def compute_iv_stats(ticker: str, current_iv_pct: float, hv_series: Optional[list[float]] = None) -> dict:
    """
    IV Rank / IV Percentile for `current_iv_pct`.

    Prefers the recorded IV series once it has MIN_OBSERVATIONS readings; falls
    back to the rolling realised-vol series until then. Always returns a dict —
    with rank/percentile None when neither series is usable.
    """
    empty = {
        "iv_atm_pct": round(current_iv_pct, 1) if current_iv_pct else 0.0,
        "iv_rank": None,
        "iv_percentile": None,
        "iv_low": None,
        "iv_high": None,
        "source": "unavailable",
        "observations": 0,
    }
    if not current_iv_pct or current_iv_pct <= 0:
        return empty

    observed = observed_series(ticker)
    if len(observed) >= MIN_OBSERVATIONS:
        rank, pct, low, high = _rank_and_percentile(current_iv_pct, observed)
        return {
            "iv_atm_pct": round(current_iv_pct, 1),
            "iv_rank": rank,
            "iv_percentile": pct,
            "iv_low": low,
            "iv_high": high,
            "source": "observed",
            "observations": len(observed),
        }

    hv_series = [v for v in (hv_series or []) if v and v > 0]
    if len(hv_series) >= MIN_OBSERVATIONS:
        rank, pct, low, high = _rank_and_percentile(current_iv_pct, hv_series)
        return {
            "iv_atm_pct": round(current_iv_pct, 1),
            "iv_rank": rank,
            "iv_percentile": pct,
            "iv_low": low,
            "iv_high": high,
            "source": "hv_proxy",
            "observations": len(observed),
        }

    return {**empty, "observations": len(observed)}
