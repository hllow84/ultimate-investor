from app.models.schemas import ValuationRange
from app.config import settings

_SECTOR_PE = {
    "Technology": 28, "Healthcare": 22, "Financial Services": 14,
    "Consumer Cyclical": 20, "Consumer Defensive": 20, "Industrials": 20,
    "Energy": 12, "Basic Materials": 15, "Real Estate": 35,
    "Communication Services": 22, "Utilities": 18,
}


def compute_valuation_range(ticker: str, financials: dict) -> ValuationRange:
    info = financials.get("info", {})
    price = float(info.get("currentPrice", 0) or 0)

    inputs = _gather_inputs(info)

    if settings.anthropic_api_key:
        return _ai_range(ticker, price, inputs, info)
    return _computed_range(ticker, price, inputs, info)


def _gather_inputs(info: dict) -> dict:
    sector = info.get("sector", "")
    sector_pe = _SECTOR_PE.get(sector, 20)
    forward_eps = float(info.get("forwardEps") or 0)
    trailing_eps = float(info.get("trailingEps") or 0)
    analyst_target = float(info.get("targetMeanPrice") or info.get("targetMedianPrice") or 0)
    fcf = float(info.get("freeCashflow") or 0)
    shares = float(info.get("sharesOutstanding") or 1)
    growth = float(info.get("earningsGrowth") or info.get("revenueGrowth") or 0.05)
    bvps = float(info.get("bookValue") or 0)

    dcf = _dcf(fcf, shares, growth) if fcf > 0 and shares > 0 else None
    forward_pe_val = round(forward_eps * sector_pe, 2) if forward_eps > 0 else None
    # Only use trailing GAAP EPS when no forward estimate exists (GAAP can be suppressed by amortization)
    trailing_pe_val = round(trailing_eps * sector_pe, 2) if trailing_eps > 0 and not forward_pe_val else None
    pb_val = round(bvps * 1.5, 2) if bvps > 0 else None

    return {
        "sector": sector,
        "sector_pe": sector_pe,
        "dcf": dcf,
        "forward_pe_value": forward_pe_val,
        "trailing_pe_value": trailing_pe_val,
        "pb_value": pb_val,
        "analyst_target": analyst_target if analyst_target > 0 else None,
        "forward_eps": forward_eps,
        "growth_rate": round(growth * 100, 1),
    }


def _computed_range(ticker: str, price: float, inputs: dict, info: dict) -> ValuationRange:
    estimates = [v for v in [
        inputs["dcf"],
        inputs["forward_pe_value"],
        inputs["trailing_pe_value"],
        inputs["pb_value"],
        inputs["analyst_target"],
    ] if v is not None and price > 0 and 0.15 * price <= v <= 10 * price]

    if not estimates:
        estimates = [price]

    base = round(sum(estimates) / len(estimates), 2)
    bear = round(min(estimates) * 0.85, 2)
    bull = round(max(estimates) * 1.15, 2)

    sector = inputs.get("sector", "this sector")
    growth = inputs.get("growth_rate", 5)
    analyst = inputs.get("analyst_target")

    return ValuationRange(
        ticker=ticker,
        current_price=price,
        bear=bear,
        base=base,
        bull=bull,
        bear_reasoning=(
            f"Bear case assumes slower growth than expected ({growth}% estimate may not hold), "
            f"margin compression, or multiple contraction. Based on the most conservative "
            f"valuation method adjusted -15%."
        ),
        base_reasoning=(
            f"Base case averages {len(estimates)} valuation method(s): "
            + ", ".join(filter(None, [
                f"DCF ${inputs['dcf']:.0f}" if inputs.get("dcf") else None,
                f"Forward P/E ${inputs['forward_pe_value']:.0f}" if inputs.get("forward_pe_value") else None,
                f"Analyst target ${analyst:.0f}" if analyst else None,
            ])) + ". Represents fair value under current growth assumptions."
        ),
        bull_reasoning=(
            f"Bull case assumes growth accelerates beyond the {growth}% consensus estimate, "
            f"margin expansion, or re-rating to a higher multiple. Based on the most optimistic "
            f"valuation method with a 15% premium."
        ),
        ai_summary=(
            f"Valuation range for {ticker} spans ${bear:.0f}–${bull:.0f} with a base of ${base:.0f}. "
            f"Current price ${price:.0f} is "
            + ("below" if price < base else "above" if price > base else "at")
            + f" the base estimate. Add your ANTHROPIC_API_KEY for AI-driven scenario analysis."
        ),
        inputs=inputs,
    )


def _ai_range(ticker: str, price: float, inputs: dict, info: dict) -> ValuationRange:
    import anthropic, json
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    name = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")

    prompt = f"""You are a senior equity research analyst. Produce a bear/base/bull valuation range for {name} ({ticker}), a {sector} company.

Current price: ${price:.2f}
Valuation inputs:
- DCF intrinsic value: {f"${inputs['dcf']:.2f}" if inputs.get('dcf') else 'N/A'}
- Forward P/E fair value: {f"${inputs['forward_pe_value']:.2f}" if inputs.get('forward_pe_value') else 'N/A'}
- Trailing P/E fair value: {f"${inputs['trailing_pe_value']:.2f}" if inputs.get('trailing_pe_value') else 'N/A'}
- Book value fair value: {f"${inputs['pb_value']:.2f}" if inputs.get('pb_value') else 'N/A'}
- Analyst consensus target: {f"${inputs['analyst_target']:.2f}" if inputs.get('analyst_target') else 'N/A'}
- Sector: {sector} (median P/E: {inputs['sector_pe']}x)
- Consensus growth rate: {inputs['growth_rate']}%

Respond ONLY with valid JSON (no markdown):
{{
  "bear": <float, worst-case intrinsic value>,
  "base": <float, base-case intrinsic value>,
  "bull": <float, best-case intrinsic value>,
  "bear_reasoning": "<1-2 sentences on bear scenario drivers>",
  "base_reasoning": "<1-2 sentences on base scenario and which inputs you weighted most>",
  "bull_reasoning": "<1-2 sentences on bull scenario catalysts>",
  "ai_summary": "<2-3 sentence overall take on valuation vs current price>"
}}"""

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    data = json.loads(msg.content[0].text)
    return ValuationRange(
        ticker=ticker,
        current_price=price,
        inputs=inputs,
        **data,
    )


def _dcf(fcf: float, shares: float, growth: float) -> float:
    growth = max(0.02, min(growth, 0.20))
    discount_rate, terminal_growth = 0.10, 0.03
    pv, cf = 0.0, fcf
    for i in range(1, 11):
        cf *= (1 + growth)
        pv += cf / ((1 + discount_rate) ** i)
    terminal = (cf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    pv += terminal / ((1 + discount_rate) ** 10)
    return round(pv / shares, 2)
