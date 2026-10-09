"""Read-only API surface over Institutional Long-Horizon Lab research artifacts.

Every endpoint here only reads files from a fixed allowlist
(app.services.lab_client.ALLOWED_ARTIFACTS). No endpoint accepts a caller-
supplied file path, imports Lab code, runs a backtest, or writes to the Lab.
"""

from fastapi import APIRouter, HTTPException

from app.services import lab_client
from app.services.lab_client import LabUnavailableError

router = APIRouter()


def _unavailable(exc: LabUnavailableError):
    raise HTTPException(status_code=503, detail=str(exc))


@router.get("/health")
def health():
    """Lab root + per-artifact availability and freshness, without full content."""
    try:
        root = lab_client.get_lab_root()
        root_status = {"lab_root": str(root), "exists": True}
    except LabUnavailableError as exc:
        return {
            "lab_root": lab_client.settings.lab_root,
            "exists": False,
            "error": str(exc),
            "artifacts": {},
            "paper_trading_freshness": {"status": "unavailable", "error": str(exc)},
        }

    artifacts = {
        key: lab_client.artifact_health(key)
        for key in lab_client.ALLOWED_ARTIFACTS
        if key not in ("paper_trading_log", "paper_trading_run_status")
    }
    return {
        **root_status,
        "artifacts": artifacts,
        "paper_trading_freshness": lab_client.paper_trading_freshness(),
    }


@router.get("/strategies")
def strategies():
    """Per-strategy backtest results (Phase 4) and scorecard (Phase 5/deflated Sharpe)."""
    results = lab_client.read_json_artifact("phase4_results")
    scorecard = lab_client.read_json_artifact("phase5_scores")
    deflated_sharpe = lab_client.read_json_artifact("deflated_sharpe")
    if results.status == "unavailable":
        _unavailable(LabUnavailableError(results.error))
    return {
        "results": results.to_dict(),
        "scorecard": scorecard.to_dict(),
        "deflated_sharpe": deflated_sharpe.to_dict(),
    }


@router.get("/diagnostics")
def diagnostics():
    """Cross-strategy correlation and regime-overlap diagnostics (Phase 6)."""
    combination = lab_client.read_json_artifact("phase6_combination")
    if combination.status == "unavailable":
        _unavailable(LabUnavailableError(combination.error))
    return {"combination": combination.to_dict()}


@router.get("/portfolios")
def portfolios():
    """Portfolio construction (Phase 7), ablation, and significance testing results."""
    portfolios_result = lab_client.read_json_artifact("phase7_portfolios")
    ablation = lab_client.read_json_artifact("phase7_ablation")
    significance = lab_client.read_json_artifact("phase7_significance")
    if portfolios_result.status == "unavailable":
        _unavailable(LabUnavailableError(portfolios_result.error))
    return {
        "portfolios": portfolios_result.to_dict(),
        "ablation": ablation.to_dict(),
        "significance": significance.to_dict(),
    }


@router.get("/paper-trading/log")
def paper_trading_log():
    """Full append-only paper-trading log, with duplicate-period records flagged."""
    result = lab_client.read_paper_trading_log()
    if result.status == "unavailable":
        _unavailable(LabUnavailableError(result.error))
    return result.to_dict()


@router.get("/paper-trading/latest")
def paper_trading_latest():
    """Canonical latest valid paper-trading observation, with the selection rule
    that produced it and an explicit warning if the log is too short to
    represent a meaningful live track record."""
    result = lab_client.read_paper_trading_log()
    if result.status == "unavailable":
        _unavailable(LabUnavailableError(result.error))
    if result.status == "missing":
        return {"status": "missing", "error": result.error, "latest": None}

    distinct_periods = len(result.distinct_data_as_of_periods)
    track_record_note = (
        f"{distinct_periods} distinct observed period(s) "
        f"({result.distinct_data_as_of_periods}) across {result.total_records} "
        "log record(s). A single-digit number of distinct periods is not a "
        "meaningful live track record regardless of how many records exist."
    )
    return {
        "status": "ok",
        "latest": result.canonical_latest,
        "selection_rule": result.canonical_latest_selection_rule,
        "distinct_period_count": distinct_periods,
        "track_record_note": track_record_note,
        "duplicate_period_warning": result.duplicate_period_warning,
        "freshness": lab_client.paper_trading_freshness(),
    }
