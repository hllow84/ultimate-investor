import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.routers import stocks, analysis, watchlist, alerts, options
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


async def _options_precompute() -> None:
    """Pre-warm the options spread cache shortly after startup, then refresh every 8 hours."""
    from app.services.options_scanner import scan_credit_spreads
    await asyncio.sleep(30)  # let the server fully start first
    while True:
        try:
            log.info("Options scanner: starting daily scan...")
            result = await asyncio.to_thread(scan_credit_spreads)
            log.info("Options scanner: done — %d spread(s) cached for %s", result["count"], result["date"])
        except Exception:
            log.exception("Options scanner error")
        await asyncio.sleep(8 * 3600)  # refresh every 8 hours


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    _migrate()
    alert_task = asyncio.create_task(_alert_checker_loop())
    options_task = asyncio.create_task(_options_precompute())
    log.info("Alert checker started (interval: %ds)", CHECK_INTERVAL_SECONDS)
    log.info("Options scanner pre-compute scheduled (30s after startup)")
    yield
    alert_task.cancel()
    options_task.cancel()
    for t in (alert_task, options_task):
        try:
            await t
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
app.include_router(options.router,   prefix="/api/options",   tags=["options"])


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
