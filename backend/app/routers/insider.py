from fastapi import APIRouter, HTTPException
from app.services.insider import get_insider_trades
from app.models.schemas import InsiderTrade

router = APIRouter()


@router.get("/{ticker}", response_model=list[InsiderTrade])
def insider_trades(ticker: str):
    try:
        return get_insider_trades(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
