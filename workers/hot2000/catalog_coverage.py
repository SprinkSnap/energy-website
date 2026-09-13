"""Coverage report generation for HOT2000 catalog scans."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

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
    }
    return {"generatedAt": state.updated_at, "sections": sections, "summary": summary}


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


def write_coverage_reports(state: ScanState, raw_dir: Path, docs_dir: Path) -> None:
    coverage = build_coverage(state)
    raw_dir.mkdir(parents=True, exist_ok=True)
    docs_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "coverage.json").write_text(
        json.dumps(coverage, indent=2) + "\n",
        encoding="utf-8",
    )
    md = render_coverage_markdown(coverage)
    (docs_dir / "HOT2000_CAPTURE_COVERAGE.md").write_text(md + "\n", encoding="utf-8")


def render_coverage_markdown(coverage: dict[str, Any]) -> str:
    lines = [
        "# HOT2000 Desktop Capture Coverage",
        "",
        f"Generated: {coverage.get('generatedAt', 'unknown')}",
        "",
        "## Overall summary",
        "",
    ]
    summary = coverage.get("summary", {})
    for key, value in summary.items():
        label = "".join(part.capitalize() for part in key.replace("_", " ").split())
        lines.append(f"- {label}: {value}")
    lines.extend(["", "## Sections", ""])
    for section, data in sorted(coverage.get("sections", {}).items()):
        lines.append(f"### {section}")
        lines.append(f"- Reachability: {data.get('reachability', 'unknown')}")
        lines.append(f"- Status: {data.get('status', 'unknown')}")
        lines.append(f"- Controls: {data.get('controlsCaptured', 0)}")
        lines.append(f"- Dropdowns: {data.get('dropdowns', 0)}")
        lines.append(f"- Options: {data.get('options', 0)}")
        lines.append(f"- Inaccessible: {data.get('inaccessible', 0)}")
        lines.append("")
    return "\n".join(lines)
