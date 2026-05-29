from app.models.schemas import HealthScore, MoatAnalysis
from app.config import settings


def generate_health_score(ticker: str, financials: dict) -> HealthScore:
    info = financials.get("info", {})

    profitability = _score_profitability(info)
    debt          = _score_debt(info)
    growth        = _score_growth(info)
    efficiency    = _score_efficiency(info)
    valuation     = _score_valuation(info)
    momentum      = _score_momentum(info)
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

    name = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")
    industry = info.get("industry", "Unknown")
    margin = info.get("profitMargins", 0) or 0
    roe = info.get("returnOnEquity", 0) or 0
    roa = info.get("returnOnAssets", 0) or 0
    debt_to_equity = info.get("debtToEquity", 0) or 0
    rev_growth = info.get("revenueGrowth", 0) or 0
    earn_growth = info.get("earningsGrowth", 0) or 0
    pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    market_cap = info.get("marketCap", 0) or 0
    summary_snippet = (info.get("longBusinessSummary") or "")[:400]
    score = _moat_score(info)

    prompt = f"""You are a senior equity analyst. Write a punchy investment thesis for {name} ({ticker}), a {sector} / {industry} company.

Financials:
- Net margin: {margin*100:.1f}%  |  ROE: {roe*100:.1f}%  |  ROA: {roa*100:.1f}%
- Debt/equity: {debt_to_equity:.0f}  |  Rev growth YoY: {rev_growth*100:.1f}%  |  EPS growth YoY: {earn_growth*100:.1f}%
- Trailing P/E: {f"{pe:.1f}x" if pe else "N/A"}  |  Forward P/E: {f"{forward_pe:.1f}x" if forward_pe else "N/A"}
- Market cap: ${market_cap/1e9:.1f}B
- Business: {summary_snippet}

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

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    data = json.loads(msg.content[0].text)
    return MoatAnalysis(ticker=ticker, moat_score=score, **data)


def _computed_moat(ticker: str, info: dict) -> MoatAnalysis:
    sector = info.get("sector", "Unknown")
    industry = info.get("industry", "") or sector
    margin = info.get("profitMargins", 0) or 0
    roe = info.get("returnOnEquity", 0) or 0
    debt_to_equity = info.get("debtToEquity", 0) or 0
    rev_growth = info.get("revenueGrowth", 0) or 0
    earn_growth = info.get("earningsGrowth", 0) or 0
    market_cap = info.get("marketCap", 0) or 0
    score = _moat_score(info)

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
    if market_cap > 100e9:
        bull.append("Mega-cap scale provides distribution and cost advantages")
    elif market_cap > 10e9:
        bull.append("Large-cap position with established market presence")
    if rev_growth > 0.15:
        bull.append(f"Revenue growing {rev_growth*100:.0f}% YoY — strong top-line momentum")
    elif rev_growth > 0.05:
        bull.append(f"Steady {rev_growth*100:.0f}% revenue growth supports compounding")
    if earn_growth > 0.15:
        bull.append(f"Earnings accelerating {earn_growth*100:.0f}% YoY — operating leverage at work")
    # pad to 4 if needed
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
    if debt_to_equity > 150:
        bear.append(f"High leverage ({debt_to_equity:.0f} D/E) limits flexibility in a downturn")
    elif debt_to_equity > 80:
        bear.append(f"Moderate leverage ({debt_to_equity:.0f} D/E) raises rate-sensitivity risk")
    if rev_growth < 0:
        bear.append(f"Revenue contracting {abs(rev_growth)*100:.0f}% YoY — top-line deterioration")
    elif rev_growth < 0.03:
        bear.append("Near-zero revenue growth risks multiple compression")
    if earn_growth < -0.10:
        bear.append(f"Earnings declining {abs(earn_growth)*100:.0f}% YoY — profitability under pressure")
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
            f"{'Revenue momentum is solid.' if rev_growth > 0.10 else 'Growth is steady.' if rev_growth > 0 else 'Revenue is under pressure.'} "
            f"Add ANTHROPIC_API_KEY for a company-specific AI thesis."
        ),
    )


# ── Predictability ────────────────────────────────────────────────────────────

def _score_predictability(ticker: str) -> float:
    """
    Measures revenue and earnings consistency over the last 5 annual periods.
    Rewards: steady growth, low variance, no negative years.
    Penalises: volatile swings, declining revenues/earnings.
    """
    try:
        from app.services.financials import get_yoy_financials
        yoy = get_yoy_financials(ticker)
        annual = yoy.annual

        rev_growth = [g for g in annual.revenue_growth if g is not None]
        ni_growth  = [g for g in annual.net_income_growth if g is not None]

        if not rev_growth:
            return 50.0

        rev_score = _consistency_score(rev_growth)
        ni_score  = _consistency_score(ni_growth) if ni_growth else rev_score

        # Revenue weighted slightly more — earnings can be distorted by one-time items
        combined = rev_score * 0.55 + ni_score * 0.45
        return round(min(100.0, max(0.0, combined)), 1)
    except Exception:
        return 50.0


def _consistency_score(growth_rates: list[float]) -> float:
    """
    Score 0–100 for a series of YoY growth rates.
    Three components (max 50 + 35 + 15 = 100):
      • Growth level  (0–50): higher mean = more valuable franchise
      • Stability     (0–35): lower std dev = easier to model / predict
      • Directionality(0–15): fraction of positive years
    """
    if not growth_rates:
        return 50.0

    n = len(growth_rates)
    mean_g = sum(growth_rates) / n
    variance = sum((g - mean_g) ** 2 for g in growth_rates) / n
    std_g = variance ** 0.5

    # Growth level component
    if mean_g >= 20:   growth_score = 50
    elif mean_g >= 10: growth_score = 40
    elif mean_g >= 5:  growth_score = 30
    elif mean_g >= 0:  growth_score = 20
    else:              growth_score = 5   # shrinking

    # Stability component (penalises volatility in growth rates)
    if std_g <= 5:     stability_score = 35
    elif std_g <= 10:  stability_score = 28
    elif std_g <= 15:  stability_score = 20
    elif std_g <= 25:  stability_score = 12
    elif std_g <= 50:  stability_score = 5
    else:              stability_score = 0

    # Directionality component
    pos_frac = sum(1 for g in growth_rates if g >= 0) / n
    direction_score = pos_frac * 15

    return growth_score + stability_score + direction_score


# ── Other pillar scorers ──────────────────────────────────────────────────────

def _score_profitability(info: dict) -> float:
    margin = info.get("profitMargins", 0) or 0
    roe = info.get("returnOnEquity", 0) or 0
    score = min(100, max(0, (margin * 200) + (roe * 100)))
    return round(score, 1)


def _score_debt(info: dict) -> float:
    ratio = info.get("debtToEquity", 100) or 100
    score = max(0, 100 - min(ratio, 100))
    return round(score, 1)


def _score_growth(info: dict) -> float:
    rev_growth = info.get("revenueGrowth", 0) or 0
    earn_growth = info.get("earningsGrowth", 0) or 0
    score = min(100, max(0, (rev_growth + earn_growth) * 100))
    return round(score, 1)


def _score_efficiency(info: dict) -> float:
    roa = info.get("returnOnAssets", 0) or 0
    score = min(100, max(0, roa * 500))
    return round(score, 1)


def _score_valuation(info: dict) -> float:
    pe = info.get("trailingPE", 30) or 30
    score = max(0, 100 - min(pe * 2, 100))
    return round(score, 1)


def _score_momentum(info: dict) -> float:
    w52_low = info.get("fiftyTwoWeekLow", 1) or 1
    w52_high = info.get("fiftyTwoWeekHigh", 1) or 1
    price = info.get("currentPrice", w52_low) or w52_low
    if w52_high == w52_low:
        return 50.0
    score = ((price - w52_low) / (w52_high - w52_low)) * 100
    return round(score, 1)
