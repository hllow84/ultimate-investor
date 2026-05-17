import yfinance as yf
from app.models.schemas import StockSummary


def get_stock_summary(ticker: str) -> StockSummary:
    t = yf.Ticker(ticker)
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
    )


def get_financials(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    return {
        "info": t.info,
        "income_stmt": t.income_stmt.to_dict() if t.income_stmt is not None else {},
        "balance_sheet": t.balance_sheet.to_dict() if t.balance_sheet is not None else {},
        "cash_flow": t.cashflow.to_dict() if t.cashflow is not None else {},
    }


def get_news(ticker: str) -> list[dict]:
    t = yf.Ticker(ticker)
    return t.news or []
