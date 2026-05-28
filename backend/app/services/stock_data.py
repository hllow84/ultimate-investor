import yfinance as yf
from app.models.schemas import StockSummary

# Common aliases that users type but yfinance requires the ^ prefix form
_ALIASES: dict[str, str] = {
    "SPX":  "^GSPC",   # S&P 500
    "DJI":  "^DJI",    # Dow Jones Industrial Average
    "NDX":  "^NDX",    # Nasdaq 100
    "COMP": "^IXIC",   # Nasdaq Composite
    "RUT":  "^RUT",    # Russell 2000
    "VIX":  "^VIX",    # CBOE Volatility Index
    "TNX":  "^TNX",    # 10-Year Treasury Yield
    "TYX":  "^TYX",    # 30-Year Treasury Yield
    "FVX":  "^FVX",    # 5-Year Treasury Yield
    "IRX":  "^IRX",    # 13-Week T-Bill
}


def normalize_ticker(ticker: str) -> str:
    """Resolve user-facing alias to the yfinance ticker symbol."""
    return _ALIASES.get(ticker.upper(), ticker.upper())


def get_stock_summary(ticker: str) -> StockSummary:
    yfin = normalize_ticker(ticker)
    t = yf.Ticker(yfin)
    info = t.info
    hist = t.history(period="2d")

    price = hist["Close"].iloc[-1] if not hist.empty else 0.0
    prev = hist["Close"].iloc[-2] if len(hist) > 1 else price
    change_pct = ((price - prev) / prev * 100) if prev else 0.0

    return StockSummary(
        ticker=ticker.upper(),
        name=info.get("longName", ticker),
        price=round(price, 2),
        change_pct=round(change_pct, 2),
        market_cap=info.get("marketCap"),
        sector=info.get("sector"),
        industry=info.get("industry"),
        country=info.get("country"),
        employees=info.get("fullTimeEmployees"),
        website=info.get("website"),
        description=info.get("longBusinessSummary"),
    )


def get_financials(ticker: str) -> dict:
    yfin = normalize_ticker(ticker)
    t = yf.Ticker(yfin)
    return {
        "info": t.info,
        "income_stmt": t.income_stmt.to_dict() if t.income_stmt is not None else {},
        "balance_sheet": t.balance_sheet.to_dict() if t.balance_sheet is not None else {},
        "cash_flow": t.cashflow.to_dict() if t.cashflow is not None else {},
    }


def get_news(ticker: str) -> list[dict]:
    yfin = normalize_ticker(ticker)
    t = yf.Ticker(yfin)
    return t.news or []
