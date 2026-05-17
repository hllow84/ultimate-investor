from fastapi import APIRouter, HTTPException
from app.services.stock_data import get_financials, get_news
from app.services.ai_analysis import generate_health_score, generate_moat_analysis
from app.services.valuation import compute_valuation
from app.services.sentiment import analyze_sentiment
from app.models.schemas import HealthScore, ValuationResult, MoatAnalysis, SentimentResult

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
