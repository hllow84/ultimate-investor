import smtplib
import logging
from datetime import datetime, timezone
from email.message import EmailMessage

import yfinance as yf

from app.config import settings
from app.services.stock_data import normalize_ticker
from app.db.database import SessionLocal
from app.db.models import Alert

log = logging.getLogger(__name__)


def run_alert_check() -> None:
    db = SessionLocal()
    try:
        active = (
            db.query(Alert)
            .filter(Alert.active == True, Alert.triggered_at == None)
            .all()
        )
        if not active:
            return

        tickers = list({a.ticker for a in active})
        prices = _fetch_prices(tickers)
        log.info("Alert check: %d active alerts, %d prices fetched", len(active), len(prices))

        for alert in active:
            price = prices.get(alert.ticker)
            if price is None:
                continue
            if _is_triggered(alert, price):
                _notify(alert, price)
                alert.triggered_at = datetime.now(timezone.utc)
                db.commit()
    except Exception:
        log.exception("Alert check failed")
    finally:
        db.close()


def _is_triggered(alert: Alert, price: float) -> bool:
    if alert.alert_type == "price_above":
        return price >= alert.threshold
    if alert.alert_type == "price_below":
        return price <= alert.threshold
    return False


def _fetch_prices(tickers: list[str]) -> dict[str, float]:
    prices: dict[str, float] = {}
    for ticker in tickers:
        try:
            hist = yf.Ticker(normalize_ticker(ticker)).history(period="1d")
            if not hist.empty:
                prices[ticker] = float(hist["Close"].iloc[-1])
        except Exception:
            log.warning("Could not fetch price for %s", ticker)
    return prices


def _notify(alert: Alert, price: float) -> None:
    direction = "above" if alert.alert_type == "price_above" else "below"
    subject = f"[Ultimate Investor] {alert.ticker} is {direction} ${alert.threshold:.2f}"
    body = (
        f"{alert.ticker} is now ${price:.2f}, which is {direction} your alert "
        f"threshold of ${alert.threshold:.2f}.\n\n"
        f"View: http://localhost:5173/stock/{alert.ticker}\n"
    )

    if settings.smtp_password and settings.smtp_from:
        _send_email(subject, body)
    else:
        log.info("ALERT TRIGGERED (no email configured) — %s", subject)
        print(f"\n{'='*60}\n{subject}\n{body}{'='*60}\n")


def _send_email(subject: str, body: str) -> None:
    to = settings.alert_email_to or settings.smtp_from
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(settings.smtp_from, settings.smtp_password)
            smtp.send_message(msg)
        log.info("Alert email sent to %s: %s", to, subject)
    except Exception:
        log.exception("Failed to send alert email")
