from app.models.schemas import HealthScore, MoatAnalysis
from app.config import settings


def generate_health_score(ticker: str, financials: dict) -> HealthScore:
    info = financials.get("info", {})

    profitability  = _score_profitability(info)
    debt           = _score_debt(info)
    growth         = _score_growth(info)
    efficiency     = _score_efficiency(info)
    valuation      = _score_valuation(info)
    momentum       = _score_momentum(info)
    predictability = _score_predictability(ticker)

    overall = round(
        (profitability + debt + growth + efficiency + valuation + momentum + predictability) / 7, 1
    )

    verdict = "Strong" if overall >= 65 else "Moderate" if overall >= 40 else "Weak"
    summary = verdict

    return HealthScore(
        ticker=ticker,
        overall=overall,
        profitability=profitability,
        debt=debt,
        growth=growth,
        efficiency=efficiency,
        valuation=valuation,
        momentum=momentum,
        predictability=predictability,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# Shared interpolation helper
# ---------------------------------------------------------------------------

def _lerp(v: float, lo: float, hi: float) -> float:
    """
    Normalise v into [0, 1] between lo (worst) and hi (best).
    Works for both ascending (lo < hi) and descending/inverted (lo > hi) metrics.
    """
    if lo == hi:
        return 0.0
    return max(0.0, min(1.0, (v - lo) / (hi - lo)))


# ---------------------------------------------------------------------------
# 1. Profitability  (0-100)
#    4 sub-metrics: net margin, gross margin, operating margin, ROE
#    Strong multi-margin picture — single-metric ROE tricks (leveraged buybacks)
#    no longer dominate the score.
# ---------------------------------------------------------------------------

def _score_profitability(info: dict) -> float:
    net_margin   = float(info.get("profitMargins")    or 0)
    gross_margin = float(info.get("grossMargins")     or 0)
    op_margin    = float(info.get("operatingMargins") or 0)
    roe          = float(info.get("returnOnEquity")   or 0)

    nm = _lerp(net_margin,   0.0,  0.30) * 35   # 0-35 pts  (30% net margin = full score)
    gm = _lerp(gross_margin, 0.0,  0.65) * 25   # 0-25 pts  (65% gross margin = full score)
    om = _lerp(op_margin,    0.0,  0.25) * 25   # 0-25 pts  (25% op margin = full score)
    re = _lerp(roe,          0.0,  0.30) * 15   # 0-15 pts  (30% ROE = full score)

    return round(min(100.0, nm + gm + om + re), 1)


# ---------------------------------------------------------------------------
# 2. Debt Health  (0-100)
#    4 sub-metrics: D/E ratio, current ratio, debt-to-revenue, cash coverage
#    More robust than a single D/E threshold; catches both solvency and liquidity.
# ---------------------------------------------------------------------------

def _score_debt(info: dict) -> float:
    # yfinance returns D/E as percentage (e.g. 172 = 1.72x); divide by 100
    de         = float(info.get("debtToEquity") or 0) / 100.0
    current_r  = float(info.get("currentRatio") or 1.0)
    total_debt = float(info.get("totalDebt")    or 0)
    total_rev  = float(info.get("totalRevenue") or 1)
    total_cash = float(info.get("totalCash")    or 0)

    debt_to_rev  = total_debt / total_rev if total_rev > 0 else 3.0
    cash_coverage = min(total_cash / total_debt, 1.0) if total_debt > 0 else 1.0

    # D/E ratio (0-35): 0x = 35, 2x = 0  (inverted: lo=2.0, hi=0.0)
    de_s  = _lerp(de,          2.0, 0.0) * 35
    # Current ratio (0-30): 0.5 = 0, 2.5 = 30
    cr_s  = _lerp(current_r,   0.5, 2.5) * 30
    # Debt/Revenue (0-25): 2x revenue in debt = 0, 0x = 25  (inverted)
    dr_s  = _lerp(debt_to_rev, 2.0, 0.0) * 25
    # Cash coverage (0-10): cash covers 0% of debt = 0, covers 100% = 10
    cc_s  = _lerp(cash_coverage, 0.0, 1.0) * 10

    return round(min(100.0, de_s + cr_s + dr_s + cc_s), 1)


# ---------------------------------------------------------------------------
# 3. Growth  (0-100)
#    3 sub-metrics: revenue growth, earnings growth, forward EPS growth
#    Negative growth penalised; high-growth properly rewarded.
# ---------------------------------------------------------------------------

def _score_growth(info: dict) -> float:
    rev_g  = float(info.get("revenueGrowth")          or 0)
    earn_g = float(info.get("earningsGrowth")         or 0)
    fwd_g  = float(info.get("earningsQuarterlyGrowth") or info.get("earningsGrowth") or 0)

    rg = _lerp(rev_g,  -0.05, 0.25) * 40   # −5% = 0, +25% = 40
    eg = _lerp(earn_g, -0.10, 0.30) * 40   # −10% = 0, +30% = 40
    fg = _lerp(fwd_g,  -0.10, 0.30) * 20   # forward / quarterly growth signal

    return round(min(100.0, rg + eg + fg), 1)


# ---------------------------------------------------------------------------
# 4. Efficiency  (0-100)
#    3 sub-metrics: ROA, FCF margin, operating leverage (FCF vs net income)
#    Measures how well management converts assets and revenue into real cash.
# ---------------------------------------------------------------------------

def _score_efficiency(info: dict) -> float:
    roa     = float(info.get("returnOnAssets") or 0)
    revenue = float(info.get("totalRevenue")   or 0)
    fcf     = float(info.get("freeCashflow")   or 0)
    net_inc = float(info.get("netIncomeToCommon") or 0)

    fcf_margin = fcf / revenue if revenue > 0 else 0.0
    # FCF quality: FCF > Net Income = strong cash conversion (ratio > 1 is ideal)
    fcf_quality = min(fcf / net_inc, 2.0) / 2.0 if net_inc > 0 and fcf > 0 else 0.0

    roa_s  = _lerp(roa,         0.0,  0.20) * 45   # 0-45 pts (20% ROA = full score)
    fcf_s  = _lerp(fcf_margin,  0.0,  0.20) * 40   # 0-40 pts (20% FCF margin = full score)
    qual_s = fcf_quality * 15                        # 0-15 pts (FCF covers net income)

    return round(min(100.0, roa_s + fcf_s + qual_s), 1)


# ---------------------------------------------------------------------------
# 5. Valuation  (0-100)
#    3 sub-metrics: forward P/E vs sector, PEG ratio, analyst target upside
#    Lower valuation multiples relative to fundamentals = higher score.
# ---------------------------------------------------------------------------

def _score_valuation(info: dict) -> float:
    from app.services.valuation import SECTOR_PE, SECTOR_EV_EBITDA

    sector     = info.get("sector", "")
    forward_pe = float(info.get("forwardPE")       or 0)
    peg        = float(info.get("pegRatio")        or 0)
    price      = float(info.get("currentPrice")    or 0)
    target     = float(info.get("targetMeanPrice") or info.get("targetMedianPrice") or 0)
    ev_ebitda  = float(info.get("enterpriseToEbitda") or 0)

    sector_pe = SECTOR_PE.get(sector, 20)
    sector_ev = SECTOR_EV_EBITDA.get(sector, 12)

    # Forward P/E vs sector (0-35): 0.5× sector = 35pts, 2× sector = 0pts (inverted)
    pe_ratio = forward_pe / sector_pe if forward_pe > 0 and sector_pe > 0 else 1.5
    pe_s = _lerp(pe_ratio, 2.0, 0.5) * 35

    # PEG ratio (0-35): PEG < 0.5 = 35pts, PEG > 3 = 0pts (inverted)
    peg_s = _lerp(peg, 3.0, 0.5) * 35 if peg > 0 else 17.5  # neutral if unavailable

    # Analyst upside (0-30): −20% = 0, +30% = 30
    upside = (target - price) / price if price > 0 and target > 0 else 0
    up_s = _lerp(upside, -0.20, 0.30) * 30

    return round(min(100.0, pe_s + peg_s + up_s), 1)


# ---------------------------------------------------------------------------
# 6. Momentum  (0-100)
#    4 sub-metrics: 52-week range position, vs SMA200, vs SMA50, 52w return
#    Captures both trend strength and price positioning.
# ---------------------------------------------------------------------------

def _score_momentum(info: dict) -> float:
    price    = float(info.get("currentPrice")        or 0)
    w52_low  = float(info.get("fiftyTwoWeekLow")     or price)
    w52_high = float(info.get("fiftyTwoWeekHigh")    or price)
    sma50    = float(info.get("fiftyDayAverage")     or price)
    sma200   = float(info.get("twoHundredDayAverage") or price)
    w52_chg  = float(info.get("52WeekChange")        or 0)

    # 52-week range position (0-25)
    rng   = w52_high - w52_low
    pos_s = _lerp(price, w52_low, w52_high) * 25 if rng > 0 else 12.5

    # vs SMA 200 (0-35): −20% below = 0, +20% above = 35
    sma200_pct = (price - sma200) / sma200 if sma200 > 0 else 0
    s200_s = _lerp(sma200_pct, -0.20, 0.20) * 35

    # vs SMA 50 (0-25): −20% below = 0, +20% above = 25
    sma50_pct = (price - sma50) / sma50 if sma50 > 0 else 0
    s50_s = _lerp(sma50_pct, -0.20, 0.20) * 25

    # 52-week return (0-15): −20% = 0, +40% = 15
    chg_s = _lerp(w52_chg, -0.20, 0.40) * 15

    return round(min(100.0, pos_s + s200_s + s50_s + chg_s), 1)


# ---------------------------------------------------------------------------
# 7. Predictability  (0-100)
#    Unchanged — already the most sophisticated pillar.
#    Analyses 5-year consistency of revenue + earnings growth rates.
# ---------------------------------------------------------------------------

def _score_predictability(ticker: str) -> float:
    try:
        from app.services.financials import get_yoy_financials
        yoy    = get_yoy_financials(ticker)
        annual = yoy.annual

        rev_growth = [g for g in annual.revenue_growth    if g is not None]
        ni_growth  = [g for g in annual.net_income_growth if g is not None]

        if not rev_growth:
            return 50.0

        rev_score = _consistency_score(rev_growth)
        ni_score  = _consistency_score(ni_growth) if ni_growth else rev_score

        combined = rev_score * 0.55 + ni_score * 0.45
        return round(min(100.0, max(0.0, combined)), 1)
    except Exception:
        return 50.0


def _consistency_score(growth_rates: list[float]) -> float:
    if not growth_rates:
        return 50.0

    n      = len(growth_rates)
    mean_g = sum(growth_rates) / n
    var    = sum((g - mean_g) ** 2 for g in growth_rates) / n
    std_g  = var ** 0.5

    # Growth level component (0-50)
    if   mean_g >= 20: growth_score = 50
    elif mean_g >= 10: growth_score = 40
    elif mean_g >= 5:  growth_score = 30
    elif mean_g >= 0:  growth_score = 20
    else:              growth_score = 5

    # Stability component (0-35): lower std dev = better
    if   std_g <= 5:  stability_score = 35
    elif std_g <= 10: stability_score = 28
    elif std_g <= 15: stability_score = 20
    elif std_g <= 25: stability_score = 12
    elif std_g <= 50: stability_score = 5
    else:             stability_score = 0

    # Directionality (0-15): fraction of positive years
    pos_frac       = sum(1 for g in growth_rates if g >= 0) / n
    direction_score = pos_frac * 15

    return growth_score + stability_score + direction_score


# ---------------------------------------------------------------------------
# Moat / Investment Thesis
# ---------------------------------------------------------------------------

def generate_moat_analysis(ticker: str, financials: dict) -> MoatAnalysis:
    info = financials.get("info", {})
    if settings.anthropic_api_key:
        return _ai_moat(ticker, info)
    return _computed_moat(ticker, info)


def _moat_score(info: dict) -> float:
    margin = info.get("profitMargins", 0) or 0
    return round(min(10, max(1, margin * 30 + 4)), 1)


def _ai_moat(ticker: str, info: dict) -> MoatAnalysis:
    import anthropic, json
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    name    = info.get("longName", ticker)
    sector  = info.get("sector", "Unknown")
    industry = info.get("industry", "Unknown")
    margin  = info.get("profitMargins", 0) or 0
    roe     = info.get("returnOnEquity", 0) or 0
    roa     = info.get("returnOnAssets", 0) or 0
    de      = info.get("debtToEquity", 0) or 0
    rev_g   = info.get("revenueGrowth", 0) or 0
    earn_g  = info.get("earningsGrowth", 0) or 0
    pe      = info.get("trailingPE")
    fwd_pe  = info.get("forwardPE")
    mcap    = info.get("marketCap", 0) or 0
    snippet = (info.get("longBusinessSummary") or "")[:400]
    score   = _moat_score(info)

    prompt = f"""You are a senior equity analyst. Write a punchy investment thesis for {name} ({ticker}), a {sector} / {industry} company.

Financials:
- Net margin: {margin*100:.1f}%  |  ROE: {roe*100:.1f}%  |  ROA: {roa*100:.1f}%
- Debt/equity: {de:.0f}  |  Rev growth YoY: {rev_g*100:.1f}%  |  EPS growth YoY: {earn_g*100:.1f}%
- Trailing P/E: {f"{pe:.1f}x" if pe else "N/A"}  |  Forward P/E: {f"{fwd_pe:.1f}x" if fwd_pe else "N/A"}
- Market cap: ${mcap/1e9:.1f}B
- Business: {snippet}

Respond ONLY with valid JSON (no markdown):
{{
  "bull_thesis": ["<bull point 1>", "<bull point 2>", "<bull point 3>", "<bull point 4>"],
  "bear_thesis": ["<bear point 1>", "<bear point 2>", "<bear point 3>"],
  "ai_summary": "<2-3 sentence verdict: what makes this company investable or not, and at what price>"
}}

Rules:
- Be specific to this company — no generic phrases like "brand recognition" or "competitive pressure"
- Each bullet max 12 words, factual and direct
- Bull thesis: mix of durable advantages and near-term catalysts
- Bear thesis: concrete risks tied to the financials above
- ai_summary must mention moat score {score}/10"""

    msg  = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    data = json.loads(msg.content[0].text)
    return MoatAnalysis(ticker=ticker, moat_score=score, **data)


def _computed_moat(ticker: str, info: dict) -> MoatAnalysis:
    sector   = info.get("sector", "Unknown")
    industry = info.get("industry", "") or sector
    margin   = info.get("profitMargins", 0) or 0
    roe      = info.get("returnOnEquity", 0) or 0
    de       = info.get("debtToEquity", 0) or 0
    rev_g    = info.get("revenueGrowth", 0) or 0
    earn_g   = info.get("earningsGrowth", 0) or 0
    mcap     = info.get("marketCap", 0) or 0
    score    = _moat_score(info)

    bull: list[str] = []
    if margin > 0.25:
        bull.append(f"{margin*100:.0f}% net margins — exceptional pricing power")
    elif margin > 0.15:
        bull.append(f"{margin*100:.0f}% net margins outpace most {sector} peers")
    elif margin > 0.05:
        bull.append(f"Positive {margin*100:.0f}% margins with room for operating leverage")
    if roe > 0.20:
        bull.append(f"ROE of {roe*100:.0f}% — highly efficient capital allocation")
    elif roe > 0.10:
        bull.append(f"Solid ROE of {roe*100:.0f}% signals disciplined reinvestment")
    if mcap > 100e9:
        bull.append("Mega-cap scale provides distribution and cost advantages")
    elif mcap > 10e9:
        bull.append("Large-cap position with established market presence")
    if rev_g > 0.15:
        bull.append(f"Revenue growing {rev_g*100:.0f}% YoY — strong top-line momentum")
    elif rev_g > 0.05:
        bull.append(f"Steady {rev_g*100:.0f}% revenue growth supports compounding")
    if earn_g > 0.15:
        bull.append(f"Earnings accelerating {earn_g*100:.0f}% YoY — operating leverage at work")
    generic_bull = [
        f"Established {industry} franchise with recurring demand",
        "Economies of scale support long-term margin expansion",
        f"{sector} sector tailwinds provide multi-year runway",
    ]
    for g in generic_bull:
        if len(bull) >= 4:
            break
        bull.append(g)
    bull = bull[:4]

    bear: list[str] = []
    if de > 150:
        bear.append(f"High leverage ({de:.0f} D/E) limits flexibility in a downturn")
    elif de > 80:
        bear.append(f"Moderate leverage ({de:.0f} D/E) raises rate-sensitivity risk")
    if rev_g < 0:
        bear.append(f"Revenue contracting {abs(rev_g)*100:.0f}% YoY — top-line deterioration")
    elif rev_g < 0.03:
        bear.append("Near-zero revenue growth risks multiple compression")
    if earn_g < -0.10:
        bear.append(f"Earnings declining {abs(earn_g)*100:.0f}% YoY — profitability under pressure")
    generic_bear = [
        f"Competition intensifying across {industry} from peers and new entrants",
        "Macro slowdown could compress margins faster than consensus expects",
        "Regulatory or geopolitical risk inherent to the sector",
    ]
    for g in generic_bear:
        if len(bear) >= 3:
            break
        bear.append(g)
    bear = bear[:3]

    return MoatAnalysis(
        ticker=ticker,
        moat_score=score,
        bull_thesis=bull,
        bear_thesis=bear,
        ai_summary=(
            f"{ticker} ({sector}) earns a moat score of {score}/10 on "
            f"{'strong' if margin > 0.20 else 'moderate'} profitability "
            f"({margin*100:.0f}% net margins, ROE {roe*100:.0f}%). "
            f"{'Revenue momentum is solid.' if rev_g > 0.10 else 'Growth is steady.' if rev_g > 0 else 'Revenue is under pressure.'} "
            f"Add ANTHROPIC_API_KEY for a company-specific AI thesis."
        ),
    )
