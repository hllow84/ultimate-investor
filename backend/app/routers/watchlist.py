from fastapi import APIRouter
from app.models.schemas import WatchlistItem

router = APIRouter()

# In-memory store for now; replace with DB in next phase
_watchlist: list[WatchlistItem] = []


@router.get("/", response_model=list[WatchlistItem])
def get_watchlist():
    return _watchlist


@router.post("/", response_model=WatchlistItem)
def add_to_watchlist(item: WatchlistItem):
    from datetime import datetime, timezone
    item.added_at = datetime.now(timezone.utc).isoformat()
    _watchlist.append(item)
    return item


@router.delete("/{ticker}")
def remove_from_watchlist(ticker: str):
    global _watchlist
    _watchlist = [i for i in _watchlist if i.ticker != ticker.upper()]
    return {"removed": ticker.upper()}
