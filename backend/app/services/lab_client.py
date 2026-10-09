"""Read-only access to Institutional Long-Horizon Lab research artifacts.

This module never imports or executes Lab code, never runs backtests, and
never writes to any file under the Lab's project root. It only opens a fixed,
hardcoded allowlist of files for reading.

Callers never supply a filesystem path. Every artifact is referenced by a
logical key that is resolved against ALLOWED_ARTIFACTS below -- this is what
makes path traversal structurally impossible from the API surface. The
safe_join() helper is additional defense-in-depth and is exercised directly
by tests with traversal-style inputs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings

# One monthly cycle (~30d) plus a generous buffer. Matches
# code/paper_trading_watchdog.ps1's $MaxDaysSinceSuccess in the Lab repo --
# kept identical on purpose so the website and the watchdog never disagree
# about what counts as a missed run.
PAPER_TRADING_MAX_DAYS_SINCE_SUCCESS = 40

# Logical key -> path relative to the Lab root. This is the entire allowlist.
# Nothing outside this map is ever readable through this module.
ALLOWED_ARTIFACTS: dict[str, str] = {
    "phase4_results": "data/phase4_results.json",
    "phase5_scores": "data/phase5_scores.json",
    "deflated_sharpe": "data/deflated_sharpe.json",
    "phase6_combination": "data/phase6_combination.json",
    "phase7_portfolios": "data/phase7_portfolios.json",
    "phase7_ablation": "data/phase7_ablation.json",
    "phase7_significance": "data/phase7_significance.json",
    "paper_trading_log": "data/paper_trading/log.jsonl",
    "paper_trading_run_status": "data/paper_trading/run_status.log",
}


class LabUnavailableError(Exception):
    """Raised when the Lab root itself cannot be found. Structural, not per-artifact."""


def get_lab_root() -> Path:
    root = Path(settings.lab_root)
    if not root.is_dir():
        raise LabUnavailableError(
            f"Lab root does not exist or is not a directory: {root}"
        )
    return root.resolve()


def safe_join(root: Path, relative: str) -> Path:
    """Resolve `relative` under `root` and reject anything that escapes it.

    `root` must already exist and be resolved (see get_lab_root()). Rejects
    absolute paths, '..' traversal, and symlink escapes -- raises ValueError
    rather than returning a path outside root.
    """
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise ValueError(f"Path escapes Lab root: {relative!r}") from None
    return candidate


def _artifact_path(root: Path, key: str) -> Path:
    if key not in ALLOWED_ARTIFACTS:
        raise KeyError(f"Unknown Lab artifact key: {key!r}")
    return safe_join(root, ALLOWED_ARTIFACTS[key])


def _iso_mtime(path: Path) -> str:
    ts = path.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


@dataclass
class ArtifactResult:
    key: str
    relative_path: str
    status: str  # "ok" | "missing" | "malformed" | "unavailable"
    source_last_modified: str | None = None
    data: Any = None
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "relative_path": self.relative_path,
            "status": self.status,
            "source_last_modified": self.source_last_modified,
            "data": self.data,
            "error": self.error,
        }


def read_json_artifact(key: str) -> ArtifactResult:
    """Read and parse one allowlisted JSON artifact. Never raises for a
    missing/malformed file -- that information is carried in the result."""
    relative_path = ALLOWED_ARTIFACTS.get(key)
    if relative_path is None:
        raise KeyError(f"Unknown Lab artifact key: {key!r}")

    try:
        root = get_lab_root()
    except LabUnavailableError as exc:
        return ArtifactResult(key, relative_path, status="unavailable", error=str(exc))

    path = _artifact_path(root, key)

    if not path.is_file():
        return ArtifactResult(key, relative_path, status="missing", error="File not found")

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        return ArtifactResult(
            key, relative_path, status="malformed", error=f"Invalid JSON: {exc}"
        )

    return ArtifactResult(
        key, relative_path, status="ok", source_last_modified=_iso_mtime(path), data=data
    )


def artifact_health(key: str) -> dict:
    """Lightweight existence/parseability check without returning full content."""
    result = read_json_artifact(key)
    return {
        "key": result.key,
        "relative_path": result.relative_path,
        "status": result.status,
        "source_last_modified": result.source_last_modified,
        "error": result.error,
    }


@dataclass
class PaperTradingLogResult:
    status: str  # "ok" | "missing" | "unavailable"
    relative_path: str = ALLOWED_ARTIFACTS["paper_trading_log"]
    source_last_modified: str | None = None
    total_records: int = 0
    malformed_line_count: int = 0
    distinct_data_as_of_periods: list[str] = field(default_factory=list)
    records: list[dict] = field(default_factory=list)
    canonical_latest: dict | None = None
    canonical_latest_selection_rule: str | None = None
    duplicate_period_warning: str | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "relative_path": self.relative_path,
            "source_last_modified": self.source_last_modified,
            "total_records": self.total_records,
            "malformed_line_count": self.malformed_line_count,
            "distinct_data_as_of_periods": self.distinct_data_as_of_periods,
            "records": self.records,
            "canonical_latest": self.canonical_latest,
            "canonical_latest_selection_rule": self.canonical_latest_selection_rule,
            "duplicate_period_warning": self.duplicate_period_warning,
            "error": self.error,
        }


_SELECTION_RULE = (
    "Among records with status == 'OK' and a parseable data_as_of, the canonical "
    "record is the one with the greatest (data_as_of, recorded_at). The log is "
    "append-only and may contain multiple records sharing the same data_as_of "
    "(e.g. from repeated same-day operational verification runs); this selection "
    "picks one representative record for display purposes only and does not "
    "imply those repeated records are independent monthly observations. The full "
    "record list (with each one's recorded_at and is_duplicate_period flag) "
    "remains available below and is never discarded or rewritten."
)


def read_paper_trading_log() -> PaperTradingLogResult:
    """Parse the append-only paper-trading JSONL log.

    Every existing line is preserved and returned. Records are identified by
    their actual data period (data_as_of), not by line position or line count,
    and records sharing a data_as_of with another record are explicitly
    flagged as duplicate-period rather than silently collapsed.
    """
    try:
        root = get_lab_root()
    except LabUnavailableError as exc:
        return PaperTradingLogResult(status="unavailable", error=str(exc))

    path = _artifact_path(root, "paper_trading_log")

    if not path.is_file():
        return PaperTradingLogResult(status="missing", error="File not found")

    raw_records: list[dict] = []
    malformed_count = 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw_records.append(json.loads(line))
            except json.JSONDecodeError:
                malformed_count += 1

    period_counts: dict[str, int] = {}
    for rec in raw_records:
        period = rec.get("data_as_of")
        if period is not None:
            period_counts[period] = period_counts.get(period, 0) + 1

    records: list[dict] = []
    for rec in raw_records:
        period = rec.get("data_as_of")
        enriched = dict(rec)
        enriched["is_duplicate_period"] = bool(period is not None and period_counts.get(period, 0) > 1)
        enriched["has_no_new_month_note"] = bool(
            isinstance(rec.get("realized_since_last_recording"), dict)
            and "note" in rec["realized_since_last_recording"]
        )
        records.append(enriched)

    ok_records = [r for r in records if r.get("status") == "OK" and r.get("data_as_of")]
    canonical_latest = None
    if ok_records:
        canonical_latest = max(
            ok_records, key=lambda r: (r["data_as_of"], r.get("recorded_at", ""))
        )

    duplicate_periods = sorted({p for p, c in period_counts.items() if c > 1})
    duplicate_warning = None
    if duplicate_periods:
        duplicate_warning = (
            f"{len(duplicate_periods)} data_as_of period(s) have more than one "
            f"log record: {duplicate_periods}. These do not represent additional "
            "independent monthly observations -- see each record's "
            "is_duplicate_period flag and realized_since_last_recording.note."
        )

    return PaperTradingLogResult(
        status="ok",
        source_last_modified=_iso_mtime(path),
        total_records=len(raw_records),
        malformed_line_count=malformed_count,
        distinct_data_as_of_periods=sorted(period_counts.keys()),
        records=records,
        canonical_latest=canonical_latest,
        canonical_latest_selection_rule=_SELECTION_RULE,
        duplicate_period_warning=duplicate_warning,
    )


def paper_trading_freshness() -> dict:
    """Days since the last SUCCESS line in run_status.log, using the same
    40-day threshold as the Lab's own watchdog script so the two never
    disagree about what counts as a missed run."""
    try:
        root = get_lab_root()
    except LabUnavailableError as exc:
        return {"status": "unavailable", "error": str(exc)}

    path = _artifact_path(root, "paper_trading_run_status")
    if not path.is_file():
        return {"status": "missing", "error": "run_status.log not found"}

    success_lines = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if "SUCCESS" in line:
                success_lines.append(line.strip())

    if not success_lines:
        return {"status": "ok", "last_success_at": None, "days_since_last_success": None,
                 "is_stale": None, "note": "No SUCCESS entry recorded yet."}

    last_line = success_lines[-1]
    timestamp_str = last_line.split(" ", 1)[0].rstrip("Z")
    try:
        last_success = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return {"status": "malformed", "error": f"Could not parse timestamp: {timestamp_str!r}"}

    days_since = (datetime.now(timezone.utc) - last_success).total_seconds() / 86400.0
    return {
        "status": "ok",
        "last_success_at": last_success.isoformat(),
        "days_since_last_success": round(days_since, 2),
        "is_stale": days_since > PAPER_TRADING_MAX_DAYS_SINCE_SUCCESS,
        "stale_threshold_days": PAPER_TRADING_MAX_DAYS_SINCE_SUCCESS,
    }
