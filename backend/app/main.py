import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.routers import stocks, analysis, watchlist, alerts
from app.db.database import engine, SessionLocal
from app.db import models

log = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 300  # 5 minutes


def _migrate() -> None:
    """Add columns that create_all won't add to existing tables."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE alerts ADD COLUMN triggered_at DATETIME"))
            conn.commit()
            log.info("Migration: added triggered_at column to alerts")
        except Exception:
            pass  # Column already exists


async def _alert_checker_loop() -> None:
    from app.services.alert_checker import run_alert_check
    await asyncio.sleep(10)  # brief delay after startup
    while True:
        try:
            await asyncio.to_thread(run_alert_check)
        except Exception:
            log.exception("Alert checker loop error")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    _migrate()
    task = asyncio.create_task(_alert_checker_loop())
    log.info("Alert checker started (interval: %ds)", CHECK_INTERVAL_SECONDS)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Ultimate Investor API",
    description="AI-powered stock research and analysis platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router,    prefix="/api/stocks",    tags=["stocks"])
app.include_router(analysis.router,  prefix="/api/analysis",  tags=["analysis"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(alerts.router,    prefix="/api/alerts",    tags=["alerts"])


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
