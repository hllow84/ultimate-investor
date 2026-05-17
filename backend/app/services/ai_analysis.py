from app.models.schemas import HealthScore, MoatAnalysis

# Mock implementations — swap for real Claude API calls once ANTHROPIC_API_KEY is set.


def generate_health_score(ticker: str, financials: dict) -> HealthScore:
    info = financials.get("info", {})

    profitability = _score_profitability(info)
    debt = _score_debt(info)
    growth = _score_growth(info)
    efficiency = _score_efficiency(info)
    valuation = _score_valuation(info)
    momentum = _score_momentum(info)
    overall = round((profitability + debt + growth + efficiency + valuation + momentum) / 6, 1)

    verdict = "strong" if overall >= 65 else "moderate" if overall >= 40 else "weak"
    summary = (
        f"{ticker} shows {verdict} financial health with an overall score of {overall}/100. "
        f"Notable strengths: {'profitability' if profitability >= 60 else 'momentum' if momentum >= 60 else 'efficiency'}. "
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
