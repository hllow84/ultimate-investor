from app.models.schemas import HealthScore, MoatAnalysis

# Mock implementations — swap for real Claude API calls once ANTHROPIC_API_KEY is set.


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

    verdict = "strong" if overall >= 65 else "moderate" if overall >= 40 else "weak"
    pred_label = "highly predictable" if predictability >= 70 else "moderately predictable" if predictability >= 45 else "unpredictable"
    summary = (
        f"{ticker} shows {verdict} financial health with an overall score of {overall}/100. "
        f"Revenue and earnings are {pred_label} (predictability: {predictability}/100). "
        f"{'Debt levels are well-managed.' if debt >= 60 else 'Debt levels warrant monitoring.'} "
        f"AI narrative unlocks when ANTHROPIC_API_KEY is configured."
    )

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
    sector = info.get("sector", "Unknown")
    margin = info.get("profitMargins", 0) or 0
    moat_score = round(min(10, max(1, margin * 30 + 4)), 1)

    return MoatAnalysis(
        ticker=ticker,
        moat_score=moat_score,
        competitive_advantages=[
            "Brand recognition in " + sector,
            "Established distribution network",
            "Economies of scale",
        ],
        risks=[
            "Competitive pressure from peers",
            "Macroeconomic sensitivity",
            "Regulatory and compliance risk",
        ],
        growth_drivers=[
            "Market expansion opportunities",
            "Product innovation pipeline",
            "Margin improvement potential",
        ],
        ai_summary=(
            f"{ticker} operates in the {sector} sector with a moat score of {moat_score}/10 "
            f"based on profitability signals. Full AI narrative unlocks when ANTHROPIC_API_KEY is configured."
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
