import hashlib
import json
from pathlib import Path

import pytest

from app.routers import lab as lab_router_module
from app.services import lab_client


# ---------------------------------------------------------------------------
# A. Read-only / security boundary checks
# ---------------------------------------------------------------------------

def test_router_exposes_only_get_methods():
    for route in lab_router_module.router.routes:
        methods = getattr(route, "methods", set())
        assert methods <= {"GET", "HEAD"}, f"{route.path} exposes non-read method(s): {methods}"


@pytest.mark.parametrize("traversal", [
    "../../etc/passwd",
    "../../../Windows/System32/config/SAM",
    "data/../../../secrets.txt",
    "/etc/passwd",
])
def test_safe_join_rejects_path_traversal(tmp_path, traversal):
    root = tmp_path / "lab"
    root.mkdir()
    (root / "data").mkdir()
    with pytest.raises(ValueError):
        lab_client.safe_join(root.resolve(), traversal)


def test_safe_join_accepts_legitimate_relative_path(tmp_path):
    root = tmp_path / "lab"
    (root / "data").mkdir(parents=True)
    (root / "data" / "f.json").write_text("{}", encoding="utf-8")
    resolved = lab_client.safe_join(root.resolve(), "data/f.json")
    assert resolved == (root / "data" / "f.json").resolve()


def test_no_endpoint_accepts_a_filename_parameter():
    # The entire allowlist model relies on no route taking a path/filename from
    # the caller. Assert every route's path template has no path parameters.
    for route in lab_router_module.router.routes:
        assert "{" not in route.path, f"{route.path} accepts a caller-supplied parameter"


def _hash_tree(root: Path) -> dict[str, str]:
    hashes = {}
    for p in sorted(root.rglob("*")):
        if p.is_file():
            hashes[str(p.relative_to(root))] = hashlib.md5(p.read_bytes()).hexdigest()
    return hashes


def test_no_endpoint_writes_to_lab_files(client, good_lab_root):
    before = _hash_tree(good_lab_root)
    for path in ["/health", "/strategies", "/diagnostics", "/portfolios",
                 "/paper-trading/log", "/paper-trading/latest"]:
        resp = client.get(path)
        assert resp.status_code == 200
    after = _hash_tree(good_lab_root)
    assert before == after


# ---------------------------------------------------------------------------
# B. Endpoints return values matching the source artifacts
# ---------------------------------------------------------------------------

def test_health_reports_lab_root_and_artifacts(client, good_lab_root):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["exists"] is True
    assert body["artifacts"]["phase4_results"]["status"] == "ok"
    assert body["paper_trading_freshness"]["status"] == "ok"
    assert body["paper_trading_freshness"]["is_stale"] is False


def test_strategies_matches_source_file(client, good_lab_root):
    resp = client.get("/strategies")
    assert resp.status_code == 200
    body = resp.json()
    on_disk = json.loads((good_lab_root / "data/phase4_results.json").read_text())
    assert body["results"]["data"] == on_disk
    assert body["results"]["status"] == "ok"
    assert body["scorecard"]["status"] == "ok"
    assert body["deflated_sharpe"]["status"] == "ok"


def test_diagnostics_matches_source_file(client, good_lab_root):
    resp = client.get("/diagnostics")
    body = resp.json()
    on_disk = json.loads((good_lab_root / "data/phase6_combination.json").read_text())
    assert body["combination"]["data"] == on_disk


def test_portfolios_matches_source_files(client, good_lab_root):
    resp = client.get("/portfolios")
    body = resp.json()
    assert body["portfolios"]["data"] == json.loads((good_lab_root / "data/phase7_portfolios.json").read_text())
    assert body["ablation"]["data"] == json.loads((good_lab_root / "data/phase7_ablation.json").read_text())
    assert body["significance"]["data"] == json.loads((good_lab_root / "data/phase7_significance.json").read_text())


# ---------------------------------------------------------------------------
# C. Paper-trading log integrity
# ---------------------------------------------------------------------------

def test_paper_trading_log_preserves_every_line_including_malformed(client):
    resp = client.get("/paper-trading/log")
    body = resp.json()
    assert body["status"] == "ok"
    assert body["total_records"] == 3          # 3 parseable JSON lines
    assert body["malformed_line_count"] == 1    # the "{not valid json" line
    assert len(body["records"]) == 3


def test_paper_trading_log_flags_duplicate_period_explicitly(client):
    resp = client.get("/paper-trading/log")
    body = resp.json()
    by_recorded_at = {r["recorded_at"]: r for r in body["records"]}
    rec_aug = by_recorded_at["2026-08-31T09:00:00.000000Z"]
    rec_sep_1 = by_recorded_at["2026-09-30T09:00:00.000000Z"]
    rec_sep_2 = by_recorded_at["2026-09-30T14:00:00.000000Z"]
    assert rec_aug["is_duplicate_period"] is False
    assert rec_sep_1["is_duplicate_period"] is True
    assert rec_sep_2["is_duplicate_period"] is True
    assert "2026-09-30" in body["distinct_data_as_of_periods"]
    assert body["duplicate_period_warning"] is not None
    assert "2026-09-30" in body["duplicate_period_warning"]


def test_paper_trading_log_line_count_is_not_treated_as_observation_count(client):
    resp = client.get("/paper-trading/log")
    body = resp.json()
    assert body["total_records"] == 3
    assert len(body["distinct_data_as_of_periods"]) == 2  # 2 real periods, not 3


def test_paper_trading_latest_selection_rule_is_documented_and_correct(client):
    resp = client.get("/paper-trading/latest")
    body = resp.json()
    assert body["status"] == "ok"
    # Of the two 2026-09-30 records, the later recorded_at must win.
    assert body["latest"]["recorded_at"] == "2026-09-30T14:00:00.000000Z"
    assert isinstance(body["selection_rule"], str) and len(body["selection_rule"]) > 0
    assert body["distinct_period_count"] == 2
    assert "not a meaningful live track record" in body["track_record_note"]
    assert body["duplicate_period_warning"] is not None


def test_paper_trading_freshness_matches_watchdog_threshold(stale_client):
    resp = stale_client.get("/paper-trading/latest")
    body = resp.json()
    assert body["freshness"]["is_stale"] is True
    assert body["freshness"]["stale_threshold_days"] == 40
    assert lab_client.PAPER_TRADING_MAX_DAYS_SINCE_SUCCESS == 40


# ---------------------------------------------------------------------------
# B (continued). Missing / malformed artifacts produce explicit responses
# ---------------------------------------------------------------------------

def test_missing_artifact_reports_missing_not_empty_data(partial_client):
    resp = partial_client.get("/strategies")
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"]["status"] == "missing"
    assert body["results"]["data"] is None
    assert body["results"]["error"] is not None


def test_malformed_artifact_reports_malformed_not_empty_data(partial_client):
    resp = partial_client.get("/strategies")
    body = resp.json()
    assert body["scorecard"]["status"] == "malformed"
    assert body["scorecard"]["data"] is None
    assert "Invalid JSON" in body["scorecard"]["error"]


def test_missing_lab_root_fails_clearly(missing_root_client):
    resp = missing_root_client.get("/strategies")
    assert resp.status_code == 503

    resp = missing_root_client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["exists"] is False
    assert body["error"]


def test_missing_lab_root_paper_trading_also_fails_clearly(missing_root_client):
    resp = missing_root_client.get("/paper-trading/log")
    assert resp.status_code == 503
    resp = missing_root_client.get("/paper-trading/latest")
    assert resp.status_code == 503
