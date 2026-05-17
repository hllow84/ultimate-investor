import yfinance as yf
from app.models.schemas import YoYFinancials, FinancialPeriod


def get_yoy_financials(ticker: str) -> YoYFinancials:
    t = yf.Ticker(ticker)
    return YoYFinancials(
        ticker=ticker,
        annual=_build_period(t.income_stmt, t.cashflow, quarterly=False),
        quarterly=_build_period(t.quarterly_income_stmt, t.quarterly_cashflow, quarterly=True),
    )


def _build_period(income, cashflow, quarterly: bool) -> FinancialPeriod:
    if income is None or income.empty:
        return _empty_period()

    # Columns are timestamps newest-first; take up to 20 quarters or 5 annual
    max_cols = 20 if quarterly else 5
    cols = list(income.columns[:max_cols])[::-1]  # oldest first

    labels = [_label(c, quarterly) for c in cols]

    def row(df, *keys):
        if df is None or df.empty:
            return None
        for k in keys:
            if k in df.index:
                return df.loc[k]
        return None

    rev_series  = row(income, "Total Revenue", "Revenue")
    ni_series   = row(income, "Net Income", "Net Income Common Stockholders")
    gp_series   = row(income, "Gross Profit")
    op_series   = row(income, "Operating Income", "EBIT")
    eps_series  = row(income, "Basic EPS", "Diluted EPS")
    fcf_series  = row(cashflow, "Free Cash Flow")

    def vals(series):
        if series is None:
            return [None] * len(cols)
        return [_safe(series.get(c)) for c in cols]

    revenue          = vals(rev_series)
    net_income       = vals(ni_series)
    gross_profit     = vals(gp_series)
    operating_income = vals(op_series)
    eps              = vals(eps_series)
    free_cash_flow   = vals(fcf_series)

    gross_margin    = [_pct(g, r) for g, r in zip(gross_profit, revenue)]
    operating_margin = [_pct(o, r) for o, r in zip(operating_income, revenue)]
    net_margin      = [_pct(n, r) for n, r in zip(net_income, revenue)]

    if quarterly:
        # YoY growth = same quarter prior year (4 periods back) to strip seasonality
        revenue_growth    = _yoy_growth_quarterly(revenue)
        net_income_growth = _yoy_growth_quarterly(net_income)
        fcf_growth        = _yoy_growth_quarterly(free_cash_flow)
    else:
        revenue_growth    = _yoy_growth_sequential(revenue)
        net_income_growth = _yoy_growth_sequential(net_income)
        fcf_growth        = _yoy_growth_sequential(free_cash_flow)

    return FinancialPeriod(
        labels=labels,
        revenue=revenue,
        revenue_growth=revenue_growth,
        net_income=net_income,
        net_income_growth=net_income_growth,
        eps=eps,
        gross_margin=gross_margin,
        operating_margin=operating_margin,
        net_margin=net_margin,
        free_cash_flow=free_cash_flow,
        fcf_growth=fcf_growth,
    )


def _yoy_growth_sequential(values: list) -> list:
    """Annual: compare each year to the prior year."""
    result = [None]
    for i in range(1, len(values)):
        result.append(_growth(values[i], values[i - 1]))
    return result


def _yoy_growth_quarterly(values: list) -> list:
    """Quarterly: compare each quarter to the same quarter a year ago (4 periods back)."""
    result = [None] * min(4, len(values))
    for i in range(4, len(values)):
        result.append(_growth(values[i], values[i - 4]))
    return result


def _growth(current, prior) -> float | None:
    if current is None or prior is None or prior == 0:
        return None
    return round((current - prior) / abs(prior) * 100, 1)


def _label(col, quarterly: bool) -> str:
    try:
        if quarterly:
            month = col.month
            q = (month - 1) // 3 + 1
            return f"Q{q}'{str(col.year)[2:]}"
        return str(col.year)
    except Exception:
        return str(col)


def _safe(val) -> float | None:
    try:
        v = float(val)
        return None if v != v else v  # NaN check
    except (TypeError, ValueError):
        return None


def _pct(numerator, denominator) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(numerator / denominator * 100, 1)


def _empty_period() -> FinancialPeriod:
    return FinancialPeriod(
        labels=[], revenue=[], revenue_growth=[], net_income=[],
        net_income_growth=[], eps=[], gross_margin=[], operating_margin=[],
        net_margin=[], free_cash_flow=[], fcf_growth=[],
    )
