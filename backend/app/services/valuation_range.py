from app.models.schemas import ValuationRange
from app.config import settings
from app.services.valuation import (
    dcf_fair_value, forward_pe_fair_value, trailing_pe_fair_value,
    pb_fair_value, ev_ebitda_fair_value,
    SECTOR_PE, METHOD_WEIGHTS,
)


def compute_valuation_range(ticker: str, financials: dict) -> ValuationRange:
    info = financials.get("info", {})
    price = float(info.get("currentPrice", 0) or 0)
    inputs = _gather_inputs(info)

    if settings.anthropic_api_key:
        return _ai_range(ticker, price, inputs, info)
    return _computed_range(ticker, price, inputs, info)


def _gather_inputs(info: dict) -> dict:
    sector     = info.get("sector", "")
    sector_pe  = SECTOR_PE.get(sector, 20)
    growth     = float(info.get("earningsGrowth") or info.get("revenueGrowth") or 0.05)
    analyst    = float(info.get("targetMeanPrice") or info.get("targetMedianPrice") or 0) or None

    return {
        "sector":           sector,
        "sector_pe":        sector_pe,
        "dcf":              dcf_fair_value(info),
        "forward_pe_value": forward_pe_fair_value(info),
        "trailing_pe_value":trailing_pe_fair_value(info),
        "pb_value":         pb_fair_value(info),
        "ev_ebitda_value":  ev_ebitda_fair_value(info),
        "analyst_target":   round(analyst, 2) if analyst else None,
        "forward_eps":      float(info.get("forwardEps") or 0),
        "growth_rate":      round(growth * 100, 1),
    }


def _weighted_estimates(inputs: dict, price: float) -> list[float]:
    """Return flat list of values expanded by weight for bear/base/bull logic."""
    candidates = [
        (inputs.get("analyst_target"),   METHOD_WEIGHTS["analyst_target"]),
        (inputs.get("forward_pe_value"), METHOD_WEIGHTS["forward_pe"]),
        (inputs.get("ev_ebitda_value"),  METHOD_WEIGHTS["ev_ebitda"]),
        (inputs.get("dcf"),              METHOD_WEIGHTS["dcf"]),
        (inputs.get("trailing_pe_value"),METHOD_WEIGHTS["trailing_pe"]),
        (inputs.get("pb_value"),         METHOD_WEIGHTS["pb"]),
    ]
    if price > 0:
        valid = [(v, w) for v, w in candidates if v is not None and 0.20 * price <= v <= 5.0 * price]
    else:
        valid = [(v, w) for v, w in candidates if v is not None]
    # Expand by weight so min/max reflect weighted endpoints
    expanded = [v for v, w in valid for _ in range(w)]
    return expanded


def _computed_range(ticker: str, price: float, inputs: dict, info: dict) -> ValuationRange:
    estimates = _weighted_estimates(inputs, price)
    if not estimates:
        estimates = [price]

    total_w = 0
    weighted_sum = 0.0
    candidates = [
        (inputs.get("analyst_target"),   METHOD_WEIGHTS["analyst_target"]),
        (inputs.get("forward_pe_value"), METHOD_WEIGHTS["forward_pe"]),
        (inputs.get("ev_ebitda_value"),  METHOD_WEIGHTS["ev_ebitda"]),
        (inputs.get("dcf"),              METHOD_WEIGHTS["dcf"]),
        (inputs.get("trailing_pe_value"),METHOD_WEIGHTS["trailing_pe"]),
        (inputs.get("pb_value"),         METHOD_WEIGHTS["pb"]),
    ]
    if price > 0:
        valid = [(v, w) for v, w in candidates if v is not None and 0.20 * price <= v <= 5.0 * price]
    else:
        valid = [(v, w) for v, w in candidates if v is not None]

    if valid:
        total_w = sum(w for _, w in valid)
        weighted_sum = sum(v * w for v, w in valid)
        base = round(weighted_sum / total_w, 2)
    else:
        base = price

    raw_vals = [v for v, _ in valid]
    bear = round(min(raw_vals) * 0.85, 2) if raw_vals else round(price * 0.80, 2)
    bull = round(max(raw_vals) * 1.15, 2) if raw_vals else round(price * 1.20, 2)

    growth   = inputs.get("growth_rate", 5)
    analyst  = inputs.get("analyst_target")
    n_methods = len(valid)

    used = ", ".join(filter(None, [
        f"DCF ${inputs['dcf']:.0f}" if inputs.get("dcf") else None,
        f"Fwd P/E ${inputs['forward_pe_value']:.0f}" if inputs.get("forward_pe_value") else None,
        f"EV/EBITDA ${inputs['ev_ebitda_value']:.0f}" if inputs.get("ev_ebitda_value") else None,
        f"Analyst ${analyst:.0f}" if analyst else None,
    ]))

    return ValuationRange(
        ticker=ticker,
        current_price=price,
        bear=bear,
        base=base,
        bull=bull,
        bear_reasoning=(
            f"Bear case uses the most conservative of {n_methods} method(s) with a 15% haircut. "
            f"Assumes the {growth}% consensus growth rate misses, margins compress, or the market "
            f"de-rates to a lower multiple."
        ),
        base_reasoning=(
            f"Base case is a weighted average across {n_methods} method(s): {used}. "
            f"Analyst targets and forward P/E carry highest weight; P/B and trailing P/E carry least."
        ),
        bull_reasoning=(
            f"Bull case uses the most optimistic of {n_methods} method(s) with a 15% premium. "
            f"Assumes growth accelerates beyond the {growth}% estimate, margin expansion, "
            f"or a multiple re-rating driven by improving fundamentals."
        ),
        ai_summary=(
            f"Valuation range for {ticker} spans ${bear:.0f}–${bull:.0f} with a weighted base of ${base:.0f}. "
            f"Current price ${price:.0f} is "
            + ("below" if price < base else "above" if price > base else "at")
            + f" the base estimate. Add your ANTHROPIC_API_KEY for AI-driven scenario analysis."
        ),
        inputs=inputs,
    )


def _ai_range(ticker: str, price: float, inputs: dict, info: dict) -> ValuationRange:
    import anthropic, json
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    name   = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")

    prompt = f"""You are a senior equity research analyst. Produce a bear/base/bull valuation range for {name} ({ticker}), a {sector} company.

Current price: ${price:.2f}
Valuation inputs (weighted: analyst & forward P/E = 3×, EV/EBITDA & DCF = 2×, trailing P/E & P/B = 1×):
- DCF intrinsic value (2-stage, sector discount rate): {f"${inputs['dcf']:.2f}" if inputs.get('dcf') else 'N/A'}
- Forward P/E fair value: {f"${inputs['forward_pe_value']:.2f}" if inputs.get('forward_pe_value') else 'N/A'}
- EV/EBITDA fair value: {f"${inputs['ev_ebitda_value']:.2f}" if inputs.get('ev_ebitda_value') else 'N/A'}
- Trailing P/E fair value: {f"${inputs['trailing_pe_value']:.2f}" if inputs.get('trailing_pe_value') else 'N/A'}
- P/B fair value: {f"${inputs['pb_value']:.2f}" if inputs.get('pb_value') else 'N/A'}
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
