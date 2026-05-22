from fastapi import APIRouter, Query
from app.services.options_scanner import scan_credit_spreads, get_vix, vix_label, CURATED_TICKERS

router = APIRouter()


@router.get("/spreads")
def credit_spreads(refresh: bool = Query(False, description="Force re-scan (bypasses daily cache)")):
    return scan_credit_spreads(force_refresh=refresh)


@router.get("/vix")
def current_vix():
    v = get_vix()
    return {"vix": v, **vix_label(v)}


@router.get("/tickers")
def curated_tickers():
    return {"tickers": CURATED_TICKERS}
