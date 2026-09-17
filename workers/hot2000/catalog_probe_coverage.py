"""Extend Phase 2 coverage with Phase 3 probe metrics."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from catalog_probe_models import ProbeQueueState


def build_probe_coverage(
    state: ProbeQueueState,
    existing_coverage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state.update_totals()
    sections: dict[str, dict[str, Any]] = {}
    if existing_coverage and isinstance(existing_coverage.get("sections"), dict):
        sections = dict(existing_coverage["sections"])

    section_stats: dict[str, dict[str, int]] = {}
    for item in state.items:
        section = item.section or "unknown"
        stats = section_stats.setdefault(
            section,
            {
                "capturedControls": 0,
                "probeEligible": 0,
                "mapped": 0,
                "exact": 0,
                "high": 0,
                "medium": 0,
                "ambiguous": 0,
                "noChange": 0,
                "skippedUnsafe": 0,
                "failed": 0,
                "dropdownOptionsMapped": 0,
                "totalDropdownOptions": 0,
                "sideEffectMappings": 0,
                "restorationFailures": 0,
            },
        )
        stats["capturedControls"] += 1
        if item.probe_class.startswith("SAFE_"):
            stats["probeEligible"] += 1
        if item.status == "skipped":
            stats["skippedUnsafe"] += 1
        if item.status == "failed":
            stats["failed"] += 1
        if item.status == "no-change":
            stats["noChange"] += 1
        if "::opt::" in item.control_id:
            stats["totalDropdownOptions"] += 1

    for mapping in state.completed:
        section = _section_for_mapping(mapping, state)
        stats = section_stats.setdefault(section, {"mapped": 0, "exact": 0, "high": 0})
        stats["mapped"] = stats.get("mapped", 0) + 1
        conf = mapping.mapping.get("confidence")
        if conf in stats:
            stats[conf] = stats.get(conf, 0) + 1
        if mapping.side_effects:
            stats["sideEffectMappings"] = stats.get("sideEffectMappings", 0) + 1
        if "::opt::" in mapping.control_id:
            stats["dropdownOptionsMapped"] = stats.get("dropdownOptionsMapped", 0) + 1

    for section, stats in section_stats.items():
        entry = sections.setdefault(section, {"section": section})
        entry.update(stats)
        entry["probeStatus"] = _section_probe_status(stats)

    summary = dict(state.totals)
    summary["dropdownOptionsMapped"] = sum(
        s.get("dropdownOptionsMapped", 0) for s in section_stats.values()
    )
    summary["totalDropdownOptions"] = sum(
        s.get("totalDropdownOptions", 0) for s in section_stats.values()
    )
    summary["sideEffectMappings"] = sum(
        s.get("sideEffectMappings", 0) for s in section_stats.values()
    )

    return {
        "generatedAt": existing_coverage.get("generatedAt") if existing_coverage else None,
        "probeVersion": state.hot2000_version,
        "sections": sections,
        "summary": {**(existing_coverage.get("summary", {}) if existing_coverage else {}), **summary},
        "probe": {
            "probeId": state.probe_id,
            "status": state.status,
            "fixtureId": state.fixture_id,
            "totals": state.totals,
        },
    }


def _section_for_mapping(mapping, state: ProbeQueueState) -> str:
    for item in state.items:
        if item.control_id == mapping.control_id:
            return item.section
    return "unknown"


def _section_probe_status(stats: dict[str, int]) -> str:
    eligible = stats.get("probeEligible", 0)
    mapped = stats.get("mapped", 0)
    if eligible == 0:
        return "no-eligible"
    if mapped >= eligible:
        return "mapped"
    if mapped > 0:
        return "partial"
    return "pending"


def write_probe_coverage(coverage: dict[str, Any], raw_dir: Path) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / "coverage.json"
    path.write_text(json.dumps(coverage, indent=2) + "\n", encoding="utf-8")
    return path
