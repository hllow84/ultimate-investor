from app.models.schemas import ValuationResult


def compute_valuation(ticker: str, financials: dict) -> ValuationResult:
    info = financials.get("info", {})
    price = info.get("currentPrice", 0) or 0

    pe = info.get("trailingPE")
    ev_ebitda = info.get("enterpriseToEbitda")
    peg = info.get("pegRatio")
    pb = info.get("priceToBook")
    dcf = _estimate_dcf(info)

    estimates = [v for v in [dcf, _pe_fair_value(info), _pb_fair_value(info)] if v]
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
    growth = info.get("earningsGrowth", 0.05) or 0.05
    if not fcf or not shares or shares == 0:
        return None
    # Simple 10-year DCF with 10% discount rate, 3% terminal growth
    discount_rate = 0.10
    terminal_growth = 0.03
    pv = 0.0
    cf = fcf
    for _ in range(10):
        cf *= (1 + min(growth, 0.25))
        pv += cf / ((1 + discount_rate) ** (_ + 1))
    terminal = (cf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    pv += terminal / ((1 + discount_rate) ** 10)
    return round(pv / shares, 2)


def _pe_fair_value(info: dict) -> float | None:
    eps = info.get("trailingEps")
    sector_pe = 20  # fallback sector average
    if not eps:
        return None
    return round(eps * sector_pe, 2)


def _pb_fair_value(info: dict) -> float | None:
    bvps = info.get("bookValue")
    if not bvps:
        return None
    return round(bvps * 1.5, 2)
