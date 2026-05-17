import anthropic
from app.config import settings
from app.models.schemas import HealthScore, MoatAnalysis

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


def generate_health_score(ticker: str, financials: dict) -> HealthScore:
    info = financials.get("info", {})

    # Compute pillar scores from raw financials (0-100)
    profitability = _score_profitability(info)
    debt = _score_debt(info)
    growth = _score_growth(info)
    efficiency = _score_efficiency(info)
    valuation = _score_valuation(info)
    momentum = _score_momentum(info)
    overall = round((profitability + debt + growth + efficiency + valuation + momentum) / 6, 1)

    prompt = f"""You are a senior equity analyst. Given the following financial scores for {ticker}:
- Profitability: {profitability}/100
- Debt health: {debt}/100
- Growth: {growth}/100
- Efficiency: {efficiency}/100
- Valuation: {valuation}/100
- Momentum: {momentum}/100
- Overall: {overall}/100

Write a 2-3 sentence plain-English summary of the company's financial health. Be direct and specific. No fluff."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
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
        summary=message.content[0].text,
    )


def generate_moat_analysis(ticker: str, financials: dict) -> MoatAnalysis:
    info = financials.get("info", {})
    name = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")
    description = info.get("longBusinessSummary", "No description available.")

    prompt = f"""You are a competitive strategy analyst specializing in public equities.

Company: {name} ({ticker})
Sector: {sector}
Description: {description[:800]}

Respond in JSON with these exact keys:
{{
  "moat_score": <float 0-10>,
  "competitive_advantages": [<3-5 specific advantages>],
  "risks": [<3-5 specific risks>],
  "growth_drivers": [<3-5 specific growth drivers>],
  "ai_summary": "<2-3 sentence narrative on the company's competitive position>"
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    data = json.loads(message.content[0].text)

    return MoatAnalysis(ticker=ticker, **data)


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
