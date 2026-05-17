import yfinance as yf
from app.models.schemas import YoYFinancials


def get_yoy_financials(ticker: str) -> YoYFinancials:
    t = yf.Ticker(ticker)
    income = t.income_stmt        # columns = dates, rows = line items
    cashflow = t.cashflow
    info = t.info

    # Work with up to 5 annual periods, newest first → reverse to oldest first
    cols = list(income.columns[:5])[::-1]
    years = [str(c.year) for c in cols]

    def row(df, *keys):
        for k in keys:
            if k in df.index:
                return df.loc[k]
        return None

    rev_row   = row(income, "Total Revenue", "Revenue")
    ni_row    = row(income, "Net Income", "Net Income Common Stockholders")
    gp_row    = row(income, "Gross Profit")
    op_row    = row(income, "Operating Income", "EBIT")
    fcf_row   = row(cashflow, "Free Cash Flow")

    def vals(series):
        if series is None:
            return [None] * len(cols)
        return [_safe(series.get(c)) for c in cols]

    revenue     = vals(rev_row)
    net_income  = vals(ni_row)
    gross_profit = vals(gp_row)
    operating_income = vals(op_row)
    free_cash_flow = vals(fcf_row)

    # Growth % YoY
    revenue_growth = [None] + [
        round((revenue[i] - revenue[i - 1]) / abs(revenue[i - 1]) * 100, 1)
        if revenue[i] is not None and revenue[i - 1] not in (None, 0) else None
        for i in range(1, len(revenue))
    ]

    # Margins %
    gross_margin    = [_pct(gp, rv) for gp, rv in zip(gross_profit, revenue)]
    operating_margin = [_pct(op, rv) for op, rv in zip(operating_income, revenue)]
    net_margin      = [_pct(ni, rv) for ni, rv in zip(net_income, revenue)]

    # EPS — prefer income_stmt basic EPS, fall back to info
    eps_row = row(income, "Basic EPS", "Diluted EPS")
    if eps_row is not None:
        eps = vals(eps_row)
    else:
        trailing = _safe(info.get("trailingEps"))
        eps = [None] * (len(cols) - 1) + [trailing]

    return YoYFinancials(
        ticker=ticker,
        years=years,
        revenue=revenue,
        revenue_growth=revenue_growth,
        net_income=net_income,
        eps=eps,
        gross_margin=gross_margin,
        operating_margin=operating_margin,
        net_margin=net_margin,
        free_cash_flow=free_cash_flow,
    )


def _safe(val):
    try:
        v = float(val)
        return None if (v != v) else v   # NaN check
    except (TypeError, ValueError):
        return None


def _pct(numerator, denominator):
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(numerator / denominator * 100, 1)
