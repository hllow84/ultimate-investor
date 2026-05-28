from fastapi import APIRouter, HTTPException, Query
from app.services.options_scanner import scan_credit_spreads, scan_single_ticker, get_vix, vix_label, CURATED_TICKERS

router = APIRouter()


@router.get("/spreads")
def credit_spreads(refresh: bool = Query(False, description="Force re-scan (bypasses daily cache)")):
    return scan_credit_spreads(force_refresh=refresh)


@router.get("/spreads/ticker/{sym}")
def spread_for_ticker(sym: str):
    sym = sym.upper().strip()
    if sym in CURATED_TICKERS:
        raise HTTPException(status_code=400, detail=f"{sym} is already in the curated list — see main scanner.")
    return scan_single_ticker(sym)


@router.get("/vix")
def current_vix():
    v = get_vix()
    return {"vix": v, **vix_label(v)}


@router.get("/tickers")
def curated_tickers():
    return {"tickers": CURATED_TICKERS}
