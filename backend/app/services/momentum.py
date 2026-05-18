import yfinance as yf
from app.models.schemas import TechnicalMomentum, PricePoint


def compute_momentum(ticker: str) -> TechnicalMomentum:
    hist = yf.Ticker(ticker).history(period="1y")
    if hist.empty or len(hist) < 15:
        raise ValueError(f"Insufficient price history for {ticker}")

    closes = [float(c) for c in hist["Close"].tolist()]
    dates = [d.strftime("%Y-%m-%d") for d in hist.index]

    current = closes[-1]
    rsi = _rsi(closes)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)

    pct_above_sma50 = round((current - sma50) / sma50 * 100, 1) if sma50 else None
    pct_above_sma200 = round((current - sma200) / sma200 * 100, 1) if sma200 else None

    w52_high = max(closes)
    w52_low = min(closes)
    pct_from_52w_high = round((current - w52_high) / w52_high * 100, 1)

    signal = _signal(rsi, pct_above_sma50, pct_above_sma200)

    # Last 6 months (~126 trading days) for the chart
    n = min(len(closes), 126)
    sma50_series = _sma_series(closes, 50)
    sma200_series = _sma_series(closes, 200)

    price_history = [
        PricePoint(
            date=dates[-n + i],
            close=round(closes[-n + i], 2),
            sma50=round(sma50_series[-n + i], 2) if sma50_series[-n + i] is not None else None,
            sma200=round(sma200_series[-n + i], 2) if sma200_series[-n + i] is not None else None,
        )
        for i in range(n)
    ]

    return TechnicalMomentum(
        ticker=ticker,
        rsi=round(rsi, 1),
        sma50=round(sma50, 2) if sma50 else None,
        sma200=round(sma200, 2) if sma200 else None,
        current_price=round(current, 2),
        pct_above_sma50=pct_above_sma50,
        pct_above_sma200=pct_above_sma200,
        w52_high=round(w52_high, 2),
        w52_low=round(w52_low, 2),
        pct_from_52w_high=pct_from_52w_high,
        signal=signal,
        price_history=price_history,
    )


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


def _sma(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def _sma_series(closes: list[float], period: int) -> list[float | None]:
    result: list[float | None] = []
    for i in range(len(closes)):
        if i + 1 < period:
            result.append(None)
        else:
            result.append(sum(closes[i + 1 - period : i + 1]) / period)
    return result


def _signal(rsi: float, pct_sma50: float | None, pct_sma200: float | None) -> str:
    bull = 0
    bear = 0
    if rsi > 60:
        bull += 1
    elif rsi < 40:
        bear += 1
    if pct_sma50 is not None:
        if pct_sma50 > 0:
            bull += 1
        else:
            bear += 1
    if pct_sma200 is not None:
        if pct_sma200 > 0:
            bull += 1
        else:
            bear += 1
    if bull >= 2:
        return "bullish"
    if bear >= 2:
        return "bearish"
    return "neutral"
