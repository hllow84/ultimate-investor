from app.models.schemas import ValuationResult

_SECTOR_PE = {
    "Technology": 28,
    "Healthcare": 22,
    "Financial Services": 14,
    "Consumer Cyclical": 20,
    "Consumer Defensive": 20,
    "Industrials": 20,
    "Energy": 12,
    "Basic Materials": 15,
    "Real Estate": 35,
    "Communication Services": 22,
    "Utilities": 18,
}


def compute_valuation(ticker: str, financials: dict) -> ValuationResult:
    info = financials.get("info", {})
    price = info.get("currentPrice", 0) or 0

    pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    ev_ebitda = info.get("enterpriseToEbitda")
    peg = info.get("pegRatio")
    pb = info.get("priceToBook")
    analyst_target = info.get("targetMeanPrice") or info.get("targetMedianPrice")

    dcf = _estimate_dcf(info)
    forward_pe_val = _forward_pe_fair_value(info)
    trailing_pe_val = _trailing_pe_fair_value(info)
    pb_val = _pb_fair_value(info)

    raw_estimates = [v for v in [dcf, forward_pe_val, trailing_pe_val, pb_val, analyst_target] if v is not None]

    # Drop estimates implausibly far from market price
    if price > 0:
        estimates = [v for v in raw_estimates if 0.15 * price <= v <= 10 * price]
    else:
        estimates = raw_estimates

    fair_value = round(sum(estimates) / len(estimates), 2) if estimates else price
    upside = round(((fair_value - price) / price) * 100, 1) if price else 0

    if upside > 15:
        verdict = "undervalued"
    elif upside < -15:
        verdict = "overvalued"
    else:
        verdict = "fairly valued"

    return ValuationResult(
        ticker=ticker,
        dcf_value=dcf,
        pe_ratio=pe,
        forward_pe=forward_pe,
        ev_ebitda=ev_ebitda,
        peg_ratio=peg,
        price_to_book=pb,
        analyst_target=round(analyst_target, 2) if analyst_target else None,
        fair_value_estimate=fair_value,
        upside_pct=upside,
        verdict=verdict,
    )


def _estimate_dcf(info: dict) -> float | None:
    fcf = info.get("freeCashflow")
    shares = info.get("sharesOutstanding")
    if not fcf or fcf <= 0 or not shares or shares == 0:
        return None

    raw_growth = info.get("earningsGrowth") or info.get("revenueGrowth") or 0.05
    growth = max(0.02, min(float(raw_growth), 0.20))

    discount_rate = 0.10
    terminal_growth = 0.03
    pv = 0.0
    cf = float(fcf)
    for i in range(1, 11):
        cf *= (1 + growth)
        pv += cf / ((1 + discount_rate) ** i)
    terminal = (cf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    pv += terminal / ((1 + discount_rate) ** 10)
    return round(pv / shares, 2)


def _forward_pe_fair_value(info: dict) -> float | None:
    # Uses analyst consensus forward EPS (non-GAAP) — much more accurate for
    # acquisition-heavy companies where GAAP EPS is suppressed by amortization.
    eps = info.get("forwardEps")
    if not eps or eps <= 0:
        return None
    sector = info.get("sector", "")
    sector_pe = _SECTOR_PE.get(sector, 20)
    return round(float(eps) * sector_pe, 2)


def _trailing_pe_fair_value(info: dict) -> float | None:
    eps = info.get("trailingEps")
    if not eps or eps <= 0:
        return None
    sector = info.get("sector", "")
    sector_pe = _SECTOR_PE.get(sector, 20)
    return round(float(eps) * sector_pe, 2)


def _pb_fair_value(info: dict) -> float | None:
    bvps = info.get("bookValue")
    if not bvps or bvps <= 0:
        return None
    return round(float(bvps) * 1.5, 2)
