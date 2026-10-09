import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import lab as lab_router_module
from app.services import lab_client


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def good_lab_root(tmp_path: Path) -> Path:
    """A complete, well-formed fake Lab root -- never the real project."""
    root = tmp_path / "fake_lab"

    _write_json(root / "data/phase4_results.json", {
        "strategy_1_momentum": {"long_only": {"CAGR": 0.1, "Sharpe": 0.9}},
    })
    _write_json(root / "data/phase5_scores.json", {
        "1_momentum": {"total": 12, "scores": {"F1_risk_adj_return": 3}},
    })
    _write_json(root / "data/deflated_sharpe.json", {
        "strategy_1_momentum": {"RawSharpe_ann": 0.92, "DeflatedSharpeProb": 0.94},
    })
    _write_json(root / "data/phase6_combination.json", {
        "partB_cross_correlation": {"1_momentum": {"1_momentum": 1.0}},
    })
    _write_json(root / "data/phase7_portfolios.json", {
        "A_equal_weight_longhistory6": {"metrics": {"CAGR": 0.08}},
    })
    _write_json(root / "data/phase7_ablation.json", {
        "baseline_all9_equal_weight": {"CAGR": 0.07},
    })
    _write_json(root / "data/phase7_significance.json", {
        "A_vs_6040": {"jobson_korkie_memmel": {"p_value": 0.2}},
    })

    paper_dir = root / "data/paper_trading"
    paper_dir.mkdir(parents=True, exist_ok=True)

    rec1 = {
        "recorded_at": "2026-08-31T09:00:00.000000Z", "status": "OK",
        "data_as_of": "2026-08-31",
        "realized_since_last_recording": {"note": "first recording", "period": ["2026-08-31", "2026-08-31"]},
        "is_first_recording": True,
    }
    rec2 = {
        "recorded_at": "2026-09-30T09:00:00.000000Z", "status": "OK",
        "data_as_of": "2026-09-30",
        "realized_since_last_recording": {"note": "new month", "period": ["2026-08-31", "2026-09-30"]},
        "is_first_recording": False,
    }
    rec3 = {
        "recorded_at": "2026-09-30T14:00:00.000000Z", "status": "OK",
        "data_as_of": "2026-09-30",
        "realized_since_last_recording": {"note": "no new complete month since last recording", "period": ["2026-09-30", "2026-09-30"]},
        "is_first_recording": False,
    }
    lines = [json.dumps(rec1), json.dumps(rec2), json.dumps(rec3), "{not valid json"]
    (paper_dir / "log.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")

    fresh_ts = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S")
    (paper_dir / "run_status.log").write_text(f"{fresh_ts}Z SUCCESS (log: irrelevant)\n", encoding="utf-8")

    return root


@pytest.fixture
def stale_lab_root(tmp_path: Path) -> Path:
    """A Lab root whose last successful paper-trading run is far in the past."""
    root = tmp_path / "fake_lab_stale"
    paper_dir = root / "data/paper_trading"
    paper_dir.mkdir(parents=True, exist_ok=True)
    rec = {
        "recorded_at": "2025-01-01T09:00:00.000000Z", "status": "OK",
        "data_as_of": "2024-12-31",
        "realized_since_last_recording": {"note": "first recording", "period": ["2024-12-31", "2024-12-31"]},
        "is_first_recording": True,
    }
    (paper_dir / "log.jsonl").write_text(json.dumps(rec) + "\n", encoding="utf-8")
    old_ts = (datetime.now(timezone.utc) - timedelta(days=100)).strftime("%Y-%m-%dT%H:%M:%S")
    (paper_dir / "run_status.log").write_text(f"{old_ts}Z SUCCESS (log: irrelevant)\n", encoding="utf-8")
    return root


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(lab_router_module.router)
    return TestClient(app)


@pytest.fixture
def client(good_lab_root, monkeypatch) -> TestClient:
    monkeypatch.setattr(lab_client.settings, "lab_root", str(good_lab_root))
    return _make_client()


@pytest.fixture
def stale_client(stale_lab_root, monkeypatch) -> TestClient:
    monkeypatch.setattr(lab_client.settings, "lab_root", str(stale_lab_root))
    return _make_client()


@pytest.fixture
def missing_root_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(lab_client.settings, "lab_root", str(tmp_path / "does_not_exist"))
    return _make_client()


@pytest.fixture
def partial_lab_root(tmp_path: Path) -> Path:
    """Lab root that exists but is missing some artifacts and has one malformed file."""
    root = tmp_path / "fake_lab_partial"
    root.mkdir(parents=True)
    (root / "data").mkdir()
    # phase4_results.json deliberately absent -> "missing"
    (root / "data" / "phase5_scores.json").write_text("{not json at all", encoding="utf-8")  # -> "malformed"
    return root


@pytest.fixture
def partial_client(partial_lab_root, monkeypatch) -> TestClient:
    monkeypatch.setattr(lab_client.settings, "lab_root", str(partial_lab_root))
    return _make_client()
