from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("user_id", "ticker", name="uq_watchlist_user_ticker"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    ticker = Column(String, nullable=False, index=True)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    notes = Column(String, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ticker = Column(String, nullable=False, index=True)
    alert_type = Column(String, nullable=False)
    threshold = Column(Float, nullable=False)
    metric = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    triggered_at = Column(DateTime, nullable=True)


class IvHistory(Base):
    """
    Daily ATM implied-volatility reading per ticker.

    yfinance has no historical IV, so IV Rank / IV Percentile have nothing to
    rank against until we accumulate our own series — every scan appends one row
    per ticker per day. See services/iv_history.py for the fallback used before
    enough observations exist.
    """
    __tablename__ = "iv_history"
    __table_args__ = (UniqueConstraint("ticker", "date", name="uq_iv_history_ticker_date"),)

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False, index=True)   # ISO yyyy-mm-dd
    iv_pct = Column(Float, nullable=False)


class SpreadPosition(Base):
    """
    A credit spread the user has opened or is tracking.

    Deltas are not stored as a frozen snapshot — they are recomputed from the
    stored strikes/IV against the live underlying so the beta-weighted portfolio
    delta reflects today's exposure, not the exposure at entry.
    """
    __tablename__ = "spread_positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ticker = Column(String, nullable=False, index=True)
    opt_type = Column(String, nullable=False)           # "put" (bull put) | "call" (bear call)
    short_strike = Column(Float, nullable=False)
    long_strike = Column(Float, nullable=False)
    expiry = Column(String, nullable=False)             # ISO yyyy-mm-dd
    contracts = Column(Integer, nullable=False, default=1)
    net_credit = Column(Float, nullable=False)          # per share, ×100 per contract
    short_iv_pct = Column(Float, nullable=True)         # entry IV, used to re-price delta
    long_iv_pct = Column(Float, nullable=True)
    opened_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)
    notes = Column(String, nullable=True)
