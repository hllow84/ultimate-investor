import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.routers import stocks, analysis, watchlist, alerts, options, auth, insider
from app.db.database import engine, SessionLocal
from app.db import models

log = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 300  # 5 minutes


def _migrate() -> None:
    """Add columns that create_all won't add to existing tables."""
    with engine.connect() as conn:
        # triggered_at on alerts
        try:
            conn.execute(text("ALTER TABLE alerts ADD COLUMN triggered_at DATETIME"))
            conn.commit()
        except Exception:
            pass

        # user_id on watchlist
        try:
            conn.execute(text("ALTER TABLE watchlist ADD COLUMN user_id INTEGER DEFAULT 1"))
            conn.commit()
            log.info("Migration: added user_id column to watchlist")
        except Exception:
            pass

        # user_id on alerts
        try:
            conn.execute(text("ALTER TABLE alerts ADD COLUMN user_id INTEGER DEFAULT 1"))
            conn.commit()
            log.info("Migration: added user_id column to alerts")
        except Exception:
            pass

        # Create a default user (id=1) for any existing rows
        try:
            count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
            if count == 0:
                existing = conn.execute(
                    text("SELECT COUNT(*) FROM watchlist WHERE user_id IS NOT NULL")
                ).scalar()
                if existing and existing > 0:
                    from app.services.auth_service import hash_password
                    conn.execute(
                        text(
                            "INSERT INTO users (id, email, hashed_password, created_at) "
                            "VALUES (1, 'default@localhost', :pwd, datetime('now'))"
                        ),
                        {"pwd": hash_password("changeme")},
                    )
                    conn.commit()
                    log.info("Migration: created default user (id=1) for existing watchlist/alert data")
        except Exception:
            pass

        # Drop old single-column unique index on watchlist.ticker and replace with (user_id, ticker)
        try:
            conn.execute(text("DROP INDEX IF EXISTS ix_watchlist_ticker"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_user_ticker "
                    "ON watchlist(user_id, ticker)"
                )
            )
            conn.commit()
        except Exception:
            pass


async def _alert_checker_loop() -> None:
    from app.services.alert_checker import run_alert_check
    await asyncio.sleep(10)
    while True:
        try:
            await asyncio.to_thread(run_alert_check)
        except Exception:
            log.exception("Alert checker loop error")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def _options_precompute() -> None:
    from app.services.options_scanner import scan_credit_spreads
    await asyncio.sleep(30)
    while True:
        try:
            log.info("Options scanner: starting daily scan...")
            result = await asyncio.to_thread(scan_credit_spreads)
            log.info("Options scanner: done — %d spread(s) cached for %s", result["count"], result["date"])
        except Exception:
            log.exception("Options scanner error")
        await asyncio.sleep(8 * 3600)


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

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(stocks.router,    prefix="/api/stocks",    tags=["stocks"])
app.include_router(analysis.router,  prefix="/api/analysis",  tags=["analysis"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(alerts.router,    prefix="/api/alerts",    tags=["alerts"])
app.include_router(options.router,   prefix="/api/options",   tags=["options"])
app.include_router(insider.router,   prefix="/api/insider",   tags=["insider"])


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
