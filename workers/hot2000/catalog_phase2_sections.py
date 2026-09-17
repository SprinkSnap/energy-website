"""Canonical Phase 2 HOT2000 section definitions (stable ids + navigation labels)."""

from __future__ import annotations

import re
from typing import Any

PHASE2_SECTIONS: list[dict[str, Any]] = [
    {
        "id": "general",
        "label": "General",
        "desktop_nav_aliases": ["General", "&General", "House", "Program Information"],
        "nav_labels": ["General", "&General"],
    },
    {
        "id": "info",
        "label": "Info",
        "nav_labels": ["Info", "&Info"],
    },
    {
        "id": "specifications",
        "label": "Specifications",
        "nav_labels": ["Specifications", "&Specifications"],
    },
    {
        "id": "weather",
        "label": "Weather",
        "nav_labels": ["Weather", "&Weather"],
    },
    {
        "id": "fuel-cost",
        "label": "Fuel Cost",
        "nav_labels": ["Fuel Cost", "Fuel cost", "&Fuel Cost"],
    },
    {
        "id": "unit-mode",
        "label": "Unit & Mode",
        "nav_labels": ["Unit & Mode", "Unit and Mode", "&Unit & Mode"],
    },
    {
        "id": "window-tightness",
        "label": "Window Tightness",
        "nav_labels": ["Window Tightness", "Window tightness", "Tightness", "&Window Tightness"],
    },
    {
        "id": "code-summary",
        "label": "Code Summary",
        "nav_labels": ["Code Summary", "Code summary", "Codes", "&Code Summary"],
    },
    {
        "id": "temperatures",
        "label": "Temperatures",
        "nav_labels": ["Temperatures", "&Temperatures"],
    },
    {
        "id": "base-loads",
        "label": "Base Loads",
        "nav_labels": ["Base Loads", "Base loads", "&Base Loads"],
    },
    {
        "id": "generation",
        "label": "Generation",
        "nav_labels": ["Generation", "&Generation"],
    },
    {
        "id": "natural-air-infiltration",
        "label": "Natural Air Infiltration",
        "nav_labels": ["Natural Air Infiltration", "Natural air infiltration", "&Natural Air Infiltration"],
    },
    {
        "id": "ventilation",
        "label": "Ventilation",
        "nav_labels": ["Ventilation", "&Ventilation"],
    },
    {
        "id": "heating-cooling-system",
        "label": "Heating/Cooling System",
        "nav_labels": [
            "Heating/Cooling System",
            "Heating/Cooling",
            "Heating Cooling System",
            "Heating",
            "Cooling",
            "&Heating/Cooling System",
        ],
    },
    {
        "id": "domestic-hot-water",
        "label": "Domestic Hot Water",
        "nav_labels": ["Domestic Hot Water", "Domestic hot water", "&Domestic Hot Water"],
    },
    {
        "id": "program",
        "label": "Program",
        "nav_labels": ["Program", "&Program"],
    },
]

PHASE2_SECTION_IDS = [section["id"] for section in PHASE2_SECTIONS]


def _normalize_nav_label(label: str) -> str:
    text = re.sub(r"&", "", label or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def get_section_by_id(section_id: str) -> dict[str, Any] | None:
    for section in PHASE2_SECTIONS:
        if section["id"] == section_id:
            return section
    return None


def desktop_nav_alias_set(section_id: str) -> set[str]:
    section = get_section_by_id(section_id)
    if not section:
        return set()
    aliases = section.get("desktop_nav_aliases") or section.get("nav_labels", [])
    return {_normalize_nav_label(label) for label in aliases}


def section_nav_label_set(section_id: str) -> set[str]:
    return desktop_nav_alias_set(section_id)


def is_foreign_section_navigation(label: str, target_section_id: str) -> bool:
    """True when a control label navigates to a different Phase 2 section."""
    normalized = _normalize_nav_label(label)
    if not normalized:
        return False
    if normalized in section_nav_label_set(target_section_id):
        return False
    for section in PHASE2_SECTIONS:
        if section["id"] == target_section_id:
            continue
        if normalized in {_normalize_nav_label(item) for item in section.get("nav_labels", [])}:
            return True
    return False


def parse_section_job_options(job: dict[str, Any]) -> dict[str, Any]:
    raw = str(job.get("catalog_action") or job.get("catalogAction") or "").strip()
    options: dict[str, Any] = {}
    if raw.startswith("capture_section:"):
        import json

        payload = raw.split(":", 1)[1]
        try:
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                options = parsed
        except Exception:
            pass
    section_id = str(options.get("sectionId") or options.get("section") or "").strip()
    section = get_section_by_id(section_id)
    if not section:
        raise ValueError(f"catalog_capture_section job missing valid sectionId (got {section_id!r}).")
    return {
        "sectionId": section["id"],
        "sectionLabel": str(options.get("sectionLabel") or section["label"]),
        "retryGaps": bool(options.get("retryGaps")),
        "fixtureId": str(options.get("fixtureId") or "baseline-general"),
    }
