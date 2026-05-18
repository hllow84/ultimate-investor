import re
import httpx
import yfinance as yf
from datetime import datetime
from app.config import settings
from app.models.schemas import YoYFinancials, FinancialPeriod

EDGAR_BASE = "https://data.sec.gov"
EDGAR_HEADERS = {"User-Agent": "Ultimate Investor hllow84@gmail.com"}
FMP_BASE = "https://financialmodelingprep.com/stable"

# Process-lifetime caches (survives across requests)
_cik_map: dict[str, int] | None = None
_facts_cache: dict[int, dict] = {}


# ── Orchestration ─────────────────────────────────────────────────────────────

def get_yoy_financials(ticker: str) -> YoYFinancials:
    try:
        result = _edgar_financials(ticker)
        if len(result.annual.labels) >= 3:
            return result
    except Exception:
        pass
    if settings.fmp_api_key:
        try:
            return _fmp_financials(ticker)
        except Exception:
            pass
    return _yfinance_financials(ticker)


# ── EDGAR ─────────────────────────────────────────────────────────────────────

def _edgar_cik_map() -> dict[str, int]:
    global _cik_map
    if _cik_map is None:
        r = httpx.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=EDGAR_HEADERS, timeout=15,
        )
        r.raise_for_status()
        _cik_map = {v["ticker"].upper(): int(v["cik_str"]) for v in r.json().values()}
    return _cik_map


def _edgar_facts(cik: int) -> dict:
    if cik not in _facts_cache:
        cik_str = str(cik).zfill(10)
        r = httpx.get(
            f"{EDGAR_BASE}/api/xbrl/companyfacts/CIK{cik_str}.json",
            headers=EDGAR_HEADERS, timeout=20,
        )
        r.raise_for_status()
        _facts_cache[cik] = r.json()
    return _facts_cache[cik]


def _pick(usgaap: dict, *names: str, units: str = "USD") -> list[dict]:
    """Return entries from the concept with the most recent data (handles concept migrations like ASC 606)."""
    best: list[dict] = []
    best_date = ""
    for name in names:
        entries = usgaap.get(name, {}).get("units", {}).get(units, [])
        if not entries:
            continue
        max_date = max((e.get("end", "") for e in entries), default="")
        if max_date > best_date:
            best_date = max_date
            best = entries
    return best


def _days(start: str, end: str) -> int:
    try:
        return (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days
    except Exception:
        return 0


def _annual_map(entries: list[dict]) -> dict[str, float]:
    """End-date → value for 10-K annual entries.
    Accepts frame=CY{year} OR start→end spanning 340–380 days (catches unframed filings)."""
    best: dict[str, dict] = {}
    for e in entries:
        if not e.get("form", "").startswith("10-K"):
            continue
        frame = e.get("frame", "")
        start = e.get("start", "")
        end   = e.get("end", "")
        is_annual = bool(re.match(r"^CY\d{4}$", frame)) or (
            start and end and 340 <= _days(start, end) <= 380
        )
        if is_annual and end:
            if end not in best or e.get("filed", "") > best[end].get("filed", ""):
                best[end] = e
    return {k: v["val"] for k, v in best.items()}


def _quarterly_map(entries: list[dict]) -> dict[str, float]:
    """End-date → value for 10-Q single-quarter entries.
    Accepts frame=CY{year}Q{n} OR start→end spanning 70–100 days."""
    best: dict[str, dict] = {}
    for e in entries:
        if not e.get("form", "").startswith("10-Q"):
            continue
        frame = e.get("frame", "")
        start = e.get("start", "")
        end   = e.get("end", "")
        is_quarter = bool(re.match(r"^CY\d{4}Q\d$", frame)) or (
            start and end and 70 <= _days(start, end) <= 100
        )
        if is_quarter and end:
            if end not in best or e.get("filed", "") > best[end].get("filed", ""):
                best[end] = e
    return {k: v["val"] for k, v in best.items()}


def _edgar_financials(ticker: str) -> YoYFinancials:
    cik = _edgar_cik_map().get(ticker.upper())
    if not cik:
        raise ValueError(f"No CIK for {ticker}")

    usgaap = _edgar_facts(cik).get("facts", {}).get("us-gaap", {})

    rev   = _pick(usgaap, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet")
    gp    = _pick(usgaap, "GrossProfit")
    op    = _pick(usgaap, "OperatingIncomeLoss")
    ni    = _pick(usgaap, "NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic")
    eps   = _pick(usgaap, "EarningsPerShareDiluted", "EarningsPerShareBasic", units="USD/shares")
    opcf  = _pick(usgaap, "NetCashProvidedByUsedInOperatingActivities")
    capex = _pick(usgaap, "PaymentsToAcquirePropertyPlantAndEquipment")

    return YoYFinancials(
        ticker=ticker,
        annual=_edgar_period(rev, gp, op, ni, eps, opcf, capex, quarterly=False),
        quarterly=_edgar_period(rev, gp, op, ni, eps, opcf, capex, quarterly=True),
    )


def _edgar_period(rev_e, gp_e, op_e, ni_e, eps_e, opcf_e, capex_e, quarterly: bool) -> FinancialPeriod:
    get_map = _quarterly_map if quarterly else _annual_map
    max_n   = 20 if quarterly else 5

    rev_m   = get_map(rev_e)
    gp_m    = get_map(gp_e)
    op_m    = get_map(op_e)
    ni_m    = get_map(ni_e)
    eps_m   = get_map(eps_e)
    opcf_m  = get_map(opcf_e)
    capex_m = get_map(capex_e)

    # Use revenue dates as anchor — some quarters may be missing (fiscal Q4 in 10-K)
    end_dates = sorted(rev_m.keys())[-max_n:]
    if not end_dates:
        return _empty_period()

    # If the most recent period is stale (>3 years old), the concept is wrong for this company
    if quarterly and end_dates[-1] < str(datetime.now().year - 3):
        return _empty_period()

    labels           = [_edgar_label(d, quarterly) for d in end_dates]
    revenue          = [_safe(rev_m.get(d)) for d in end_dates]
    gross_profit     = [_safe(gp_m.get(d)) for d in end_dates]
    operating_income = [_safe(op_m.get(d)) for d in end_dates]
    net_income       = [_safe(ni_m.get(d)) for d in end_dates]
    eps_list         = [_safe(eps_m.get(d)) for d in end_dates]

    # FCF = operating cash flow − capex (capex is a positive outflow in EDGAR)
    fcf_list = []
    for d in end_dates:
        o = opcf_m.get(d)
        c = capex_m.get(d)
        if o is not None and c is not None:
            fcf_list.append(float(o - c))
        elif o is not None:
            fcf_list.append(float(o))
        else:
            fcf_list.append(None)

    gross_margin     = [_pct(g, r) for g, r in zip(gross_profit, revenue)]
    operating_margin = [_pct(o, r) for o, r in zip(operating_income, revenue)]
    net_margin       = [_pct(n, r) for n, r in zip(net_income, revenue)]

    if quarterly:
        revenue_growth    = _yoy_growth_quarterly(revenue)
        net_income_growth = _yoy_growth_quarterly(net_income)
        fcf_growth        = _yoy_growth_quarterly(fcf_list)
    else:
        revenue_growth    = _yoy_growth_sequential(revenue)
        net_income_growth = _yoy_growth_sequential(net_income)
        fcf_growth        = _yoy_growth_sequential(fcf_list)

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
        free_cash_flow=fcf_list,
        fcf_growth=fcf_growth,
    )


def _edgar_label(date_str: str, quarterly: bool) -> str:
    try:
        month = int(date_str[5:7])
        year_short = date_str[2:4]
        if quarterly:
            q = (month - 1) // 3 + 1
            return f"Q{q}'{year_short}"
        return date_str[:4]
    except Exception:
        return date_str


# ── FMP ───────────────────────────────────────────────────────────────────────

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
    inc_q = _fmp_fetch(f"/income-statement?symbol={ticker}&period=quarter&limit=5")
    cf_q  = _fmp_fetch(f"/cash-flow-statement?symbol={ticker}&period=quarter&limit=5")
    inc_a = _fmp_fetch(f"/income-statement?symbol={ticker}&period=annual&limit=5")
    cf_a  = _fmp_fetch(f"/cash-flow-statement?symbol={ticker}&period=annual&limit=5")

    return YoYFinancials(
        ticker=ticker,
        annual=_fmp_period(inc_a, cf_a, quarterly=False),
        quarterly=_fmp_period(inc_q, cf_q, quarterly=True),
    )


def _fmp_period(income: list[dict], cashflow: list[dict], quarterly: bool) -> FinancialPeriod:
    income   = list(reversed(income))
    cf_by_date = {r["date"]: r for r in cashflow}

    labels = []
    revenue = []
    net_income = []
    gross_profit = []
    operating_income = []
    eps_list = []
    free_cash_flow = []

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
        period = row.get("period", "")
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

    def row(df, *keys):
        if df is None or df.empty:
            return None
        for k in keys:
            if k in df.index:
                return df.loc[k]
        return None

    rev_s  = row(income, "Total Revenue", "Revenue")
    ni_s   = row(income, "Net Income", "Net Income Common Stockholders")
    gp_s   = row(income, "Gross Profit")
    op_s   = row(income, "Operating Income", "EBIT")
    eps_s  = row(income, "Basic EPS", "Diluted EPS")
    fcf_s  = row(cashflow, "Free Cash Flow")

    def vals(series):
        if series is None:
            return [None] * len(cols)
        return [_safe(series.get(c)) for c in cols]

    revenue          = vals(rev_s)
    net_income       = vals(ni_s)
    gross_profit     = vals(gp_s)
    operating_income = vals(op_s)
    eps_list         = vals(eps_s)
    free_cash_flow   = vals(fcf_s)

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

    labels = [_yf_label(c, quarterly) for c in cols]

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


# ── Shared helpers ────────────────────────────────────────────────────────────

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
