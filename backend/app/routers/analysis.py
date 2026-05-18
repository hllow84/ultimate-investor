from fastapi import APIRouter, HTTPException
from app.services.stock_data import get_financials, get_news
from app.services.ai_analysis import generate_health_score, generate_moat_analysis
from app.services.valuation import compute_valuation
from app.services.valuation_range import compute_valuation_range
from app.services.sentiment import analyze_sentiment
from app.services.financials import get_yoy_financials
from app.services.momentum import compute_momentum
from app.models.schemas import (
    HealthScore, ValuationResult, ValuationRange,
    MoatAnalysis, SentimentResult, YoYFinancials, TechnicalMomentum,
)

router = APIRouter()


@router.get("/{ticker}/health", response_model=HealthScore)
def health_score(ticker: str):
    try:
        financials = get_financials(ticker.upper())
        return generate_health_score(ticker.upper(), financials)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/valuation", response_model=ValuationResult)
def valuation(ticker: str):
    try:
        financials = get_financials(ticker.upper())
        return compute_valuation(ticker.upper(), financials)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/valuation-range", response_model=ValuationRange)
def valuation_range(ticker: str):
    try:
        financials = get_financials(ticker.upper())
        return compute_valuation_range(ticker.upper(), financials)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/financials", response_model=YoYFinancials)
def yoy_financials(ticker: str):
    try:
        return get_yoy_financials(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/moat", response_model=MoatAnalysis)
def moat(ticker: str):
    try:
        financials = get_financials(ticker.upper())
        return generate_moat_analysis(ticker.upper(), financials)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/sentiment", response_model=SentimentResult)
def sentiment(ticker: str):
    try:
        news = get_news(ticker.upper())
        return analyze_sentiment(ticker.upper(), news)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/momentum", response_model=TechnicalMomentum)
def momentum(ticker: str):
    try:
        return compute_momentum(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
