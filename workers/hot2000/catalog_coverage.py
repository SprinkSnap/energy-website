"""Coverage report generation for HOT2000 catalog scans."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from catalog_models import FINGERPRINT_VERSION, RECORDER_VERSION, SCHEMA_VERSION
from catalog_scan_accounting import classify_scan_result
from catalog_scan_state import ScanState


def build_coverage(state: ScanState) -> dict[str, Any]:
    sections: dict[str, dict[str, Any]] = {}
    for screen_key, screen in state.screens.items():
        section = screen.get("section") or screen.get("title") or screen_key
        entry = sections.setdefault(
            section,
            {
                "section": section,
                "reachability": screen.get("reachability", "automatic"),
                "status": screen.get("status", "pending"),
                "controlsCaptured": 0,
                "controlsTotal": 0,
                "dropdowns": 0,
                "options": 0,
                "inaccessible": 0,
                "failedNavigationActions": 0,
                "screens": [],
            },
        )
        entry["controlsCaptured"] += int(screen.get("controls", 0))
        entry["controlsTotal"] += int(screen.get("controls", 0))
        entry["dropdowns"] += int(screen.get("dropdowns", 0))
        entry["options"] += int(screen.get("options", 0))
        entry["inaccessible"] += int(screen.get("inaccessible", 0))
        entry["screens"].append(screen_key)
        if screen.get("status") == "partial":
            entry["status"] = "partial"
        elif screen.get("status") == "guided-captured":
            entry["reachability"] = "guided"
            entry["status"] = "guided-captured"

    state.update_totals()
    summary = {
        **state.totals,
        "completionPercentage": _completion_percentage(state, sections),
        "resultClassification": classify_scan_result(state),
    }
    return {"generatedAt": state.updated_at, "sections": sections, "summary": summary}


def build_full_coverage_report(
    state: ScanState,
    *,
    job_id: str | None = None,
    worker_id: str | None = None,
    worker_build: str | None = None,
) -> dict[str, Any]:
    state.update_totals()
    coverage = build_coverage(state)
    counters = state.crawl_counters or {}
    return {
        "schemaVersion": SCHEMA_VERSION,
        "scannerVersion": RECORDER_VERSION,
        "fingerprintVersion": FINGERPRINT_VERSION,
        "scanId": state.scan_id,
        "jobId": job_id,
        "workerId": worker_id,
        "workerBuild": worker_build,
        "hot2000Version": state.hot2000_version,
        "fixture": state.fixture,
        "fixtureHash": state.fixture_hash,
        "startedAt": state.started_at,
        "endedAt": state.updated_at,
        "durationSeconds": state.totals.get("elapsedSeconds"),
        "resultClassification": classify_scan_result(state),
        "completionReason": state.completion_reason,
        "screens": {
            "discovered": state.totals.get("screensDiscovered", 0),
            "complete": state.totals.get("screensCaptured", 0),
            "partial": state.totals.get("screensPartial", 0),
            "failed": 0,
        },
        "controls": {
            "discovered": state.totals.get("controlsCaptured", 0),
            "unique": counters.get("controls_unique", 0),
            "accessible": max(
                0,
                int(state.totals.get("controlsCaptured", 0))
                - int(state.totals.get("inaccessibleControls", 0)),
            ),
            "inaccessible": state.totals.get("inaccessibleControls", 0),
        },
        "navigation": {
            "statesDiscovered": state.totals.get("statesDiscovered", 0),
            "statesCompleted": state.totals.get("statesCompleted", 0),
            "statesFailed": state.totals.get("statesFailed", 0),
            "statesSkipped": state.totals.get("statesSkipped", 0),
            "statesPending": state.totals.get("statesPending", 0),
            "actionsDiscovered": state.totals.get("actionsDiscovered", 0),
            "actionsCompleted": state.totals.get("actionsCompleted", 0),
            "actionsFailed": state.totals.get("actionsFailed", 0),
            "actionsSkipped": state.totals.get("actionsSkipped", 0),
            "actionsPending": state.totals.get("actionsPending", 0),
        },
        "interactive": {
            "tabsDiscovered": counters.get("tabs_total", 0),
            "tabsVisited": state.totals.get("tabsVisited", 0),
            "combosDiscovered": counters.get("combos_total", 0),
            "combosOpened": state.totals.get("combosOpened", 0),
            "comboOptionsCaptured": state.totals.get("comboOptionsCaptured", 0),
            "checkboxesDiscovered": counters.get("checkboxes_total", 0),
            "checkboxBranchesExplored": state.totals.get("checkboxBranchesExplored", 0),
            "radioGroupsDiscovered": counters.get("radio_groups_discovered", 0),
            "radioChoicesExplored": state.totals.get("radioChoicesExplored", 0),
            "radioControlsAbsent": counters.get("radio_groups_discovered", 0) == 0,
            "dialogsDiscovered": counters.get("dialogs_total", 0),
            "dialogsVisited": state.totals.get("dialogsVisited", 0),
            "scrollRegionsDiscovered": counters.get("scroll_regions_total", 0),
            "scrollRegionsExplored": state.totals.get("scrollRegionsCompleted", 0),
        },
        "gaps": {
            "inaccessibleControls": len(state.inaccessible_records),
            "partialScreens": state.totals.get("screensPartial", 0),
            "failedActions": state.totals.get("actionsFailed", 0),
            "skippedUnsafeActions": state.totals.get("blockedUnsafeActions", 0),
        },
        "evidence": {
            "rawCaptureDir": "raw-desktop",
            "continuationOf": state.continuation_of,
            "parentJobId": state.parent_job_id,
            "lastScreen": state.last_screen,
            "lastWindow": state.last_window,
            "lastAction": state.last_action,
        },
        "sections": coverage.get("sections", {}),
        "summary": coverage.get("summary", {}),
    }


def _completion_percentage(state: ScanState, sections: dict[str, dict[str, Any]]) -> int:
    if state.progress_percent > 0:
        return state.progress_percent
    if not sections:
        return 0
    captured = sum(
        1
        for s in sections.values()
        if s.get("status") in {"captured", "guided-captured"}
    )
    partial = sum(1 for s in sections.values() if s.get("status") == "partial")
    score = captured + partial * 0.5
    return int(round((score / max(len(sections), 1)) * 100))


def write_coverage_reports(
    state: ScanState,
    raw_dir: Path,
    docs_dir: Path,
    *,
    job_id: str | None = None,
    worker_id: str | None = None,
    worker_build: str | None = None,
) -> dict[str, Any]:
    coverage = build_coverage(state)
    full_report = build_full_coverage_report(
        state,
        job_id=job_id,
        worker_id=worker_id,
        worker_build=worker_build,
    )
    state.coverage_report = full_report
    raw_dir.mkdir(parents=True, exist_ok=True)
    docs_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "coverage.json").write_text(
        json.dumps(coverage, indent=2) + "\n",
        encoding="utf-8",
    )
    (raw_dir / "coverage-report.json").write_text(
        json.dumps(full_report, indent=2) + "\n",
        encoding="utf-8",
    )
    md = render_coverage_markdown(full_report)
    (docs_dir / "HOT2000_CAPTURE_COVERAGE.md").write_text(md + "\n", encoding="utf-8")
    return full_report


def render_coverage_markdown(coverage: dict[str, Any]) -> str:
    lines = [
        "# HOT2000 Desktop Capture Coverage",
        "",
        f"Generated: {coverage.get('generatedAt') or coverage.get('endedAt', 'unknown')}",
        f"Result: {coverage.get('resultClassification', 'unknown')}",
        "",
        "## Overall summary",
        "",
    ]
    summary = coverage.get("summary") or {}
    for key, value in summary.items():
        label = "".join(part.capitalize() for part in key.replace("_", " ").split())
        lines.append(f"- {label}: {value}")
    lines.extend(["", "## Sections", ""])
    for section, data in sorted((coverage.get("sections") or {}).items()):
        lines.append(f"### {section}")
        lines.append(f"- Reachability: {data.get('reachability', 'unknown')}")
        lines.append(f"- Status: {data.get('status', 'unknown')}")
        lines.append(f"- Controls: {data.get('controlsCaptured', 0)}")
        lines.append(f"- Dropdowns: {data.get('dropdowns', 0)}")
        lines.append(f"- Options: {data.get('options', 0)}")
        lines.append(f"- Inaccessible: {data.get('inaccessible', 0)}")
        lines.append("")
    return "\n".join(lines)
