from fastapi import APIRouter, HTTPException
from app.services.stock_data import get_stock_summary, get_financials, get_news
from app.models.schemas import StockSummary

router = APIRouter()


@router.get("/{ticker}", response_model=StockSummary)
def stock_summary(ticker: str):
    try:
        return get_stock_summary(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{ticker}/news")
def stock_news(ticker: str):
    try:
        return get_news(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
