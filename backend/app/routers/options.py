from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import SpreadPosition, User
from app.models.schemas import SpreadPositionCreate
from app.services.auth_service import get_current_user
from app.services.options_scanner import (
    scan_credit_spreads, scan_single_ticker, get_vix, vix_label, CURATED_TICKERS,
)
from app.services import spread_positions

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


# ---------------------------------------------------------------------------
# Saved positions + beta-weighted portfolio delta
# ---------------------------------------------------------------------------

@router.get("/positions")
def list_positions(
    include_closed: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(SpreadPosition).filter(SpreadPosition.user_id == current_user.id)
    if not include_closed:
        q = q.filter(SpreadPosition.closed_at.is_(None))
    rows = q.order_by(SpreadPosition.opened_at.desc()).all()
    return spread_positions.build_portfolio(rows)


@router.post("/positions", status_code=201)
def create_position(
    payload: SpreadPositionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    opt_type = payload.opt_type.lower().strip()
    if opt_type not in ("put", "call"):
        raise HTTPException(status_code=422, detail="opt_type must be 'put' or 'call'")
    if payload.contracts < 1:
        raise HTTPException(status_code=422, detail="contracts must be at least 1")
    if payload.short_strike == payload.long_strike:
        raise HTTPException(status_code=422, detail="short and long strikes must differ")

    ticker = payload.ticker.upper().strip()
    existing = spread_positions.find_matching(
        db, current_user.id, ticker, opt_type,
        payload.short_strike, payload.long_strike, payload.expiry,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"{ticker} {payload.short_strike}/{payload.long_strike} {payload.expiry} is already saved",
        )

    row = SpreadPosition(
        user_id=current_user.id,
        ticker=ticker,
        opt_type=opt_type,
        short_strike=payload.short_strike,
        long_strike=payload.long_strike,
        expiry=payload.expiry,
        contracts=payload.contracts,
        net_credit=payload.net_credit,
        short_iv_pct=payload.short_iv_pct,
        long_iv_pct=payload.long_iv_pct,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "ticker": row.ticker, "expiry": row.expiry}


@router.patch("/positions/{position_id}/close")
def close_position(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SpreadPosition)
        .filter(SpreadPosition.id == position_id, SpreadPosition.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Position not found")
    row.closed_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": row.id, "closed_at": row.closed_at.isoformat()}


@router.delete("/positions/{position_id}", status_code=204)
def delete_position(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SpreadPosition)
        .filter(SpreadPosition.id == position_id, SpreadPosition.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Position not found")
    db.delete(row)
    db.commit()
