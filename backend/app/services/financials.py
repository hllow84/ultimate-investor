import httpx
import yfinance as yf
from app.config import settings
from app.models.schemas import YoYFinancials, FinancialPeriod

FMP_BASE = "https://financialmodelingprep.com/stable"


def get_yoy_financials(ticker: str) -> YoYFinancials:
    if settings.fmp_api_key:
        try:
            return _fmp_financials(ticker)
        except Exception:
            pass
    return _yfinance_financials(ticker)


# ── FMP path ──────────────────────────────────────────────────────────────────

def _fmp_fetch(path: str) -> list[dict]:
    url = f"{FMP_BASE}{path}&apikey={settings.fmp_api_key}"
    r = httpx.get(url, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list) or not data:
        raise ValueError(f"Empty FMP response for {path}")
    return data


def _fmp_financials(ticker: str) -> YoYFinancials:
    # Free plan caps limit at 5; paid plan supports up to 20 for quarterly
    inc_q   = _fmp_fetch(f"/income-statement?symbol={ticker}&period=quarter&limit=5")
    cf_q    = _fmp_fetch(f"/cash-flow-statement?symbol={ticker}&period=quarter&limit=5")
    inc_a   = _fmp_fetch(f"/income-statement?symbol={ticker}&period=annual&limit=5")
    cf_a    = _fmp_fetch(f"/cash-flow-statement?symbol={ticker}&period=annual&limit=5")

    return YoYFinancials(
        ticker=ticker,
        annual=_fmp_period(inc_a, cf_a, quarterly=False),
        quarterly=_fmp_period(inc_q, cf_q, quarterly=True),
    )


def _fmp_period(income: list[dict], cashflow: list[dict], quarterly: bool) -> FinancialPeriod:
    # FMP returns newest-first; reverse to oldest-first
    income   = list(reversed(income))
    cf_by_date = {r["date"]: r for r in cashflow}

    labels           = []
    revenue          = []
    net_income       = []
    gross_profit     = []
    operating_income = []
    eps_list         = []
    free_cash_flow   = []

    for row in income:
        date_str = row.get("date", "")
        labels.append(_fmp_label(row, quarterly))
        revenue.append(_safe(row.get("revenue")))
        net_income.append(_safe(row.get("netIncome")))
        gross_profit.append(_safe(row.get("grossProfit")))
        operating_income.append(_safe(row.get("operatingIncome")))
        eps_list.append(_safe(row.get("eps")))
        cf_row = cf_by_date.get(date_str, {})
        free_cash_flow.append(_safe(cf_row.get("freeCashFlow")))

    gross_margin     = [_pct(g, r) for g, r in zip(gross_profit, revenue)]
    operating_margin = [_pct(o, r) for o, r in zip(operating_income, revenue)]
    net_margin       = [_pct(n, r) for n, r in zip(net_income, revenue)]

    if quarterly:
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
        eps=eps_list,
        gross_margin=gross_margin,
        operating_margin=operating_margin,
        net_margin=net_margin,
        free_cash_flow=free_cash_flow,
        fcf_growth=fcf_growth,
    )


def _fmp_label(row: dict, quarterly: bool) -> str:
    year = str(row.get("fiscalYear", ""))
    year_short = year[2:] if len(year) == 4 else year
    if quarterly:
        period = row.get("period", "")  # e.g. "Q2"
        return f"{period}'{year_short}" if period else year
    return year


# ── yfinance fallback ─────────────────────────────────────────────────────────

def _yfinance_financials(ticker: str) -> YoYFinancials:
    t = yf.Ticker(ticker)
    return YoYFinancials(
        ticker=ticker,
        annual=_yf_period(t.income_stmt, t.cashflow, quarterly=False),
        quarterly=_yf_period(t.quarterly_income_stmt, t.quarterly_cashflow, quarterly=True),
    )


def _yf_period(income, cashflow, quarterly: bool) -> FinancialPeriod:
    if income is None or income.empty:
        return _empty_period()

    max_cols = 20 if quarterly else 5
    cols = list(income.columns[:max_cols])[::-1]

    labels = [_yf_label(c, quarterly) for c in cols]

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
    eps_list         = vals(eps_series)
    free_cash_flow   = vals(fcf_series)

    gross_margin     = [_pct(g, r) for g, r in zip(gross_profit, revenue)]
    operating_margin = [_pct(o, r) for o, r in zip(operating_income, revenue)]
    net_margin       = [_pct(n, r) for n, r in zip(net_income, revenue)]

    if quarterly:
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
        eps=eps_list,
        gross_margin=gross_margin,
        operating_margin=operating_margin,
        net_margin=net_margin,
        free_cash_flow=free_cash_flow,
        fcf_growth=fcf_growth,
    )


def _yf_label(col, quarterly: bool) -> str:
    try:
        if quarterly:
            q = (col.month - 1) // 3 + 1
            return f"Q{q}'{str(col.year)[2:]}"
        return str(col.year)
    except Exception:
        return str(col)


# ── shared helpers ────────────────────────────────────────────────────────────

def _yoy_growth_sequential(values: list) -> list:
    result = [None]
    for i in range(1, len(values)):
        result.append(_growth(values[i], values[i - 1]))
    return result


def _yoy_growth_quarterly(values: list) -> list:
    result = [None] * min(4, len(values))
    for i in range(4, len(values)):
        result.append(_growth(values[i], values[i - 4]))
    return result


def _growth(current, prior) -> float | None:
    if current is None or prior is None or prior == 0:
        return None
    return round((current - prior) / abs(prior) * 100, 1)


def _safe(val) -> float | None:
    try:
        v = float(val)
        return None if v != v else v
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
