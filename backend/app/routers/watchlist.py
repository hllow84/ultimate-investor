from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.database import get_db
from app.db.models import User, WatchlistItem as WatchlistRow
from app.models.schemas import WatchlistItem
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("/", response_model=list[WatchlistItem])
def get_watchlist(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(WatchlistRow)
        .filter(WatchlistRow.user_id == current_user.id)
        .order_by(WatchlistRow.added_at.desc())
        .all()
    )
    return [_to_schema(r) for r in rows]


@router.post("/", response_model=WatchlistItem)
def add_to_watchlist(
    item: WatchlistItem,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticker = item.ticker.upper()
    existing = (
        db.query(WatchlistRow)
        .filter(WatchlistRow.user_id == current_user.id, WatchlistRow.ticker == ticker)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"{ticker} is already in your watchlist")
    row = WatchlistRow(
        user_id=current_user.id,
        ticker=ticker,
        added_at=datetime.now(timezone.utc),
        notes=item.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_schema(row)


@router.delete("/{ticker}")
def remove_from_watchlist(
    ticker: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(WatchlistRow)
        .filter(WatchlistRow.user_id == current_user.id, WatchlistRow.ticker == ticker.upper())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"{ticker.upper()} not found in watchlist")
    db.delete(row)
    db.commit()
    return {"removed": ticker.upper()}


def _to_schema(row: WatchlistRow) -> WatchlistItem:
    return WatchlistItem(
        ticker=row.ticker,
        added_at=row.added_at.isoformat() if row.added_at else None,
        notes=row.notes,
    )
