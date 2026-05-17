from app.models.schemas import ValuationResult

# Sector-specific median P/E multiples
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
    ev_ebitda = info.get("enterpriseToEbitda")
    peg = info.get("pegRatio")
    pb = info.get("priceToBook")
    dcf = _estimate_dcf(info)
    pe_val = _pe_fair_value(info)
    pb_val = _pb_fair_value(info)

    raw_estimates = [v for v in [dcf, pe_val, pb_val] if v is not None]

    # Sanity filter: drop estimates that are implausibly far from market price
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
        ev_ebitda=ev_ebitda,
        peg_ratio=peg,
        price_to_book=pb,
        fair_value_estimate=fair_value,
        upside_pct=upside,
        verdict=verdict,
    )


def _estimate_dcf(info: dict) -> float | None:
    fcf = info.get("freeCashflow")
    shares = info.get("sharesOutstanding")
    if not fcf or fcf <= 0 or not shares or shares == 0:
        return None

    # Use a reasonable long-term growth rate (floor 2%, cap 20%)
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


def _pe_fair_value(info: dict) -> float | None:
    eps = info.get("trailingEps")
    if not eps or eps <= 0:
        return None
    sector = info.get("sector", "")
    sector_pe = _SECTOR_PE.get(sector, 20)
    return round(float(eps) * sector_pe, 2)


def _pb_fair_value(info: dict) -> float | None:
    bvps = info.get("bookValue")
    if not bvps or bvps <= 0:
        # Skip companies with negative or zero book value (e.g. post-acquisition goodwill)
        return None
    return round(float(bvps) * 1.5, 2)
