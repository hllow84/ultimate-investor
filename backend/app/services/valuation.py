from app.models.schemas import ValuationResult

# Sector-specific P/E multiples (forward earnings)
SECTOR_PE = {
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

# Sector-specific P/B multiples (replaces flat 1.5× for all sectors)
SECTOR_PB = {
    "Technology": 6.0,          # Asset-light, high ROIC
    "Healthcare": 4.0,
    "Financial Services": 1.2,  # Asset-heavy, regulated capital
    "Consumer Cyclical": 3.0,
    "Consumer Defensive": 4.0,
    "Industrials": 2.5,
    "Energy": 1.5,
    "Basic Materials": 1.8,
    "Real Estate": 1.5,         # NAV-based sector
    "Communication Services": 2.5,
    "Utilities": 1.5,
}

# Sector-specific EV/EBITDA multiples
SECTOR_EV_EBITDA = {
    "Technology": 20,
    "Healthcare": 14,
    "Financial Services": 10,
    "Consumer Cyclical": 11,
    "Consumer Defensive": 13,
    "Industrials": 12,
    "Energy": 7,
    "Basic Materials": 8,
    "Real Estate": 18,
    "Communication Services": 11,
    "Utilities": 10,
}

# Sector-specific DCF discount rates
SECTOR_DISCOUNT = {
    "Technology": 0.10,
    "Healthcare": 0.09,
    "Financial Services": 0.10,
    "Consumer Cyclical": 0.10,
    "Consumer Defensive": 0.08,
    "Industrials": 0.09,
    "Energy": 0.11,
    "Basic Materials": 0.10,
    "Real Estate": 0.09,
    "Communication Services": 0.10,
    "Utilities": 0.08,
}

# Relative weights per method — higher = more reliable signal
METHOD_WEIGHTS = {
    "analyst_target": 3,   # market consensus, well-researched
    "forward_pe":     3,   # most widely used by practitioners
    "ev_ebitda":      2,   # capital-structure-neutral
    "dcf":            2,   # fundamentals-based but assumption-sensitive
    "sticker_price":  2,   # Phil Town: growth compounding discounted at 15% MARR
    "graham_number":  1,   # Ben Graham: conservative asset-backed ceiling
    "lynch_fv":       1,   # Peter Lynch: PEG=1 implied fair value
    "trailing_pe":    1,   # backward-looking
    "pb":             1,   # only meaningful for asset-heavy sectors
}


def compute_valuation(ticker: str, financials: dict) -> ValuationResult:
    info = financials.get("info", {})
    price = float(info.get("currentPrice", 0) or 0)

    pe             = info.get("trailingPE")
    forward_pe     = info.get("forwardPE")
    ev_ebitda      = info.get("enterpriseToEbitda")
    peg            = info.get("pegRatio")
    pb             = info.get("priceToBook")
    analyst_target = info.get("targetMeanPrice") or info.get("targetMedianPrice")

    dcf_val      = dcf_fair_value(info)
    fwd_pe_val   = forward_pe_fair_value(info)
    trail_pe_val = trailing_pe_fair_value(info)
    pb_val       = pb_fair_value(info)
    ev_val       = ev_ebitda_fair_value(info)
    sticker_val  = sticker_price_fair_value(info)
    graham_val   = graham_number_value(info)
    lynch_val    = lynch_fair_value(info)

    # Weighted average — drop estimates outside 20%–500% of market price
    candidates: list[tuple[float | None, int]] = [
        (analyst_target, METHOD_WEIGHTS["analyst_target"]),
        (fwd_pe_val,     METHOD_WEIGHTS["forward_pe"]),
        (ev_val,         METHOD_WEIGHTS["ev_ebitda"]),
        (dcf_val,        METHOD_WEIGHTS["dcf"]),
        (sticker_val,    METHOD_WEIGHTS["sticker_price"]),
        (graham_val,     METHOD_WEIGHTS["graham_number"]),
        (lynch_val,      METHOD_WEIGHTS["lynch_fv"]),
        (trail_pe_val,   METHOD_WEIGHTS["trailing_pe"]),
        (pb_val,         METHOD_WEIGHTS["pb"]),
    ]
    if price > 0:
        valid = [(v, w) for v, w in candidates if v is not None and 0.20 * price <= v <= 5.0 * price]
    else:
        valid = [(v, w) for v, w in candidates if v is not None]

    if valid:
        total_w = sum(w for _, w in valid)
        fair_value = round(sum(v * w for v, w in valid) / total_w, 2)
    else:
        fair_value = price

    upside = round(((fair_value - price) / price) * 100, 1) if price else 0

    if upside > 15:
        verdict = "undervalued"
    elif upside < -15:
        verdict = "overvalued"
    else:
        verdict = "fairly valued"

    return ValuationResult(
        ticker=ticker,
        dcf_value=dcf_val,
        ev_ebitda_value=ev_val,
        sticker_price=sticker_val,
        graham_number_value=graham_val,
        lynch_fair_value=lynch_val,
        pe_ratio=pe,
        forward_pe=forward_pe,
        ev_ebitda=ev_ebitda,
        peg_ratio=peg,
        price_to_book=pb,
        analyst_target=round(analyst_target, 2) if analyst_target else None,
        fair_value_estimate=fair_value,
        margin_of_safety_price=round(fair_value * 0.75, 2) if fair_value else None,
        strong_buy_price=round(fair_value * 0.50, 2) if fair_value else None,
        upside_pct=upside,
        verdict=verdict,
    )


# ---------------------------------------------------------------------------
# Shared valuation helpers (also imported by valuation_range.py)
# ---------------------------------------------------------------------------

def dcf_fair_value(info: dict) -> float | None:
    """
    2-stage DCF:
      Stage 1 (yr 1-5) — analyst growth rate, capped 2–25%
      Stage 2 (yr 6-10) — linearly fades to terminal growth (3%)
    Discount rate is sector-specific.
    """
    fcf    = info.get("freeCashflow")
    shares = info.get("sharesOutstanding")
    if not fcf or fcf <= 0 or not shares or shares == 0:
        return None

    raw_growth = info.get("earningsGrowth") or info.get("revenueGrowth") or 0.05
    g1 = max(0.02, min(float(raw_growth), 0.25))   # stage-1 growth

    sector         = info.get("sector", "")
    discount_rate  = SECTOR_DISCOUNT.get(sector, 0.10)
    terminal_g     = 0.03

    pv = 0.0
    cf = float(fcf)

    # Stage 1 — years 1–5
    for i in range(1, 6):
        cf *= (1 + g1)
        pv += cf / ((1 + discount_rate) ** i)

    # Stage 2 — years 6–10, growth fades linearly from g1 → terminal_g
    for i in range(6, 11):
        frac = (10 - i) / 4   # 1.0 at i=6 → 0.0 at i=10
        g2 = terminal_g + frac * (g1 - terminal_g)
        cf *= (1 + g2)
        pv += cf / ((1 + discount_rate) ** i)

    terminal = (cf * (1 + terminal_g)) / (discount_rate - terminal_g)
    pv += terminal / ((1 + discount_rate) ** 10)
    return round(pv / shares, 2)


def forward_pe_fair_value(info: dict) -> float | None:
    """Forward EPS × sector P/E multiple."""
    eps = info.get("forwardEps")
    if not eps or eps <= 0:
        return None
    sector = info.get("sector", "")
    return round(float(eps) * SECTOR_PE.get(sector, 20), 2)


def trailing_pe_fair_value(info: dict) -> float | None:
    """Trailing EPS × sector P/E multiple. Only used when no forward estimate."""
    eps = info.get("trailingEps")
    fwd = info.get("forwardEps")
    if not eps or eps <= 0 or (fwd and fwd > 0):
        return None
    sector = info.get("sector", "")
    return round(float(eps) * SECTOR_PE.get(sector, 20), 2)


def pb_fair_value(info: dict) -> float | None:
    """Book value × sector-appropriate P/B multiple."""
    bvps = info.get("bookValue")
    if not bvps or bvps <= 0:
        return None
    sector = info.get("sector", "")
    multiple = SECTOR_PB.get(sector, 2.5)
    return round(float(bvps) * multiple, 2)


def sticker_price_fair_value(info: dict) -> float | None:
    """
    Phil Town / Rule #1 Sticker Price:
      1. Project EPS 10 years at capped analyst growth rate
      2. Future PE = min(trailing PE, 2 × growth%) — don't overpay for growth
      3. Future Price = Future EPS × Future PE
      4. Discount back at 15% MARR (minimum acceptable rate of return)
    """
    eps = float(info.get("forwardEps") or info.get("trailingEps") or 0)
    if eps <= 0:
        return None
    growth = max(0.05, min(float(info.get("earningsGrowth") or info.get("revenueGrowth") or 0.05), 0.25))
    trailing_pe = float(info.get("trailingPE") or 0)
    growth_pe = growth * 200           # 2 × growth% (e.g. 15% growth → PE 30)
    future_pe = min(trailing_pe, growth_pe) if trailing_pe > 5 else growth_pe
    future_pe = max(future_pe, 8.0)    # floor at 8× — never assume below trough PE
    future_eps = eps * (1 + growth) ** 10
    future_price = future_eps * future_pe
    return round(future_price / (1.15 ** 10), 2)


def graham_number_value(info: dict) -> float | None:
    """
    Ben Graham Number = √(22.5 × EPS × Book Value per Share)
    Derived from: max P/E 15 × max P/B 1.5 = 22.5.
    Represents the upper bound a defensive investor should pay.
    """
    eps  = float(info.get("trailingEps") or info.get("forwardEps") or 0)
    bvps = float(info.get("bookValue") or 0)
    if eps <= 0 or bvps <= 0:
        return None
    return round((22.5 * eps * bvps) ** 0.5, 2)


def lynch_fair_value(info: dict) -> float | None:
    """
    Peter Lynch Fair Value: EPS × growth rate as a whole number.
    e.g. EPS $2, growth 15% → FV = $2 × 15 = $30 (implies PEG = 1.0).
    Only meaningful for growth stocks with 5–50% growth.
    """
    eps    = float(info.get("forwardEps") or info.get("trailingEps") or 0)
    growth = float(info.get("earningsGrowth") or info.get("revenueGrowth") or 0)
    if eps <= 0 or growth <= 0:
        return None
    growth_pct = growth * 100
    if not (5 <= growth_pct <= 50):    # outside Lynch's meaningful range
        return None
    return round(eps * growth_pct, 2)


def ev_ebitda_fair_value(info: dict) -> float | None:
    """
    Equity value implied by EV/EBITDA:
      EV = EBITDA × sector multiple
      Equity value = EV − total debt + cash
      Per-share = equity value / shares outstanding
    """
    ebitda = info.get("ebitda")
    shares = info.get("sharesOutstanding")
    if not ebitda or ebitda <= 0 or not shares or shares == 0:
        return None
    sector   = info.get("sector", "")
    multiple = SECTOR_EV_EBITDA.get(sector, 12)
    debt     = float(info.get("totalDebt",  0) or 0)
    cash     = float(info.get("totalCash",  0) or 0)
    ev       = float(ebitda) * multiple
    equity   = ev - debt + cash
    if equity <= 0:
        return None
    return round(equity / float(shares), 2)
