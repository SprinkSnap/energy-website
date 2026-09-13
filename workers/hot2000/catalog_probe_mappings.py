"""Mapping merge, persistence, and conflict reporting for H2K probes."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_probe_models import PROBE_VERSION, FieldMapping, MappingEvidence
from catalog_xml_diff import XmlChange, assess_mapping_confidence

REPO_ROOT = Path(__file__).resolve().parents[2]
MAPPINGS_DIR = REPO_ROOT / "h2k-web-editor" / "catalog" / "mappings"
EVIDENCE_DIR = REPO_ROOT / "h2k-web-editor" / "catalog" / "probe-evidence"

SECTION_FILES = {
    "general": "general.json",
    "weather": "weather.json",
    "specifications": "specifications.json",
    "ventilation": "ventilation.json",
    "heating-cooling": "heating-cooling.json",
    "domestic-hot-water": "domestic-hot-water.json",
    "program": "program.json",
    "envelope-components": "envelope-components.json",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def section_mapping_path(section: str) -> Path:
    filename = SECTION_FILES.get(section, f"{section}.json")
    return MAPPINGS_DIR / filename


def build_mapping_from_diff(
    item: dict[str, Any],
    diff_result: dict[str, Any],
    *,
    hot2000_version: str | None,
    fixture_id: str,
    fixture_hash: str,
    evidence_dir: Path,
) -> FieldMapping | None:
    changes = diff_result.get("changes") or []
    if not changes:
        return None

    xml_changes = [
        XmlChange(
            path=c["path"],
            change_type=c.get("change_type") or c.get("changeType", "attribute-changed"),
            before=c.get("before"),
            after=c.get("after"),
            attribute=c.get("attribute"),
        )
        for c in changes
    ]
    confidence = assess_mapping_confidence(xml_changes)

    primary = changes[0]
    mapping_type = "attribute" if primary.get("attribute") or "/@" in primary.get("path", "") else "text"
    if primary.get("changeType") == "element-added" or primary.get("change_type") == "element-added":
        mapping_type = "presence"

    side_effects = []
    if len(changes) > 1:
        for side in changes[1:]:
            side_effects.append(
                {
                    "path": side.get("path"),
                    "changeType": side.get("changeType") or side.get("change_type"),
                    "before": side.get("before"),
                    "after": side.get("after"),
                    "relationship": "side-effect",
                }
            )

    evidence = MappingEvidence(
        baseline_value=primary.get("before"),
        probe_ui_value=item.get("probeValue") or item.get("probe_value"),
        probe_stored_value=primary.get("after"),
        baseline_hash=fixture_hash,
        diff_file=str(evidence_dir / "filtered-diff.json"),
        raw_diff=diff_result.get("raw"),
        filtered_diff=diff_result,
    )

    return FieldMapping(
        control_id=str(item.get("controlId") or item.get("control_id")),
        screen_key=str(item.get("screenKey") or item.get("screen_key") or ""),
        label=item.get("label"),
        fixture_id=fixture_id,
        hot2000_version=hot2000_version,
        mapping={
            "path": primary.get("path"),
            "type": mapping_type,
            "confidence": confidence,
        },
        evidence=evidence,
        status="mapped" if confidence not in {"ambiguous", "none"} else confidence,
        side_effects=side_effects,
        probe_version=PROBE_VERSION,
    )


def load_section_mappings(section: str) -> list[dict[str, Any]]:
    path = section_mapping_path(section)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "mappings" in data:
            return list(data["mappings"])
    except Exception:
        pass
    return []


def merge_mapping(
    existing: list[dict[str, Any]],
    new_mapping: FieldMapping,
    *,
    fixture_hash: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Merge mapping; return (updated list, new conflicts)."""
    conflicts: list[dict[str, Any]] = []
    entry = new_mapping.to_dict()
    entry["timestamp"] = _now_iso()
    entry["fixtureHash"] = fixture_hash

    new_control_id = new_mapping.control_id
    new_fixture_id = new_mapping.fixture_id
    for idx, prior in enumerate(existing):
        prior_control = prior.get("controlId") or prior.get("control_id")
        prior_fixture = prior.get("fixtureId") or prior.get("fixture_id")
        if prior_control != new_control_id:
            continue
        if prior_fixture != new_fixture_id:
            continue
        prior_path = (prior.get("mapping") or {}).get("path")
        new_path = new_mapping.mapping.get("path")
        if prior_path == new_path:
            prior_conf = (prior.get("mapping") or {}).get("confidence")
            new_conf = new_mapping.mapping.get("confidence")
            if prior_conf == new_conf:
                entry["mapping"]["confidence"] = _increase_confidence(prior_conf, new_conf)
            existing[idx] = entry
            return existing, conflicts
        conflicts.append(
            {
                "controlId": new_mapping.control_id,
                "fixtureId": new_mapping.fixture_id,
                "hot2000Version": new_mapping.hot2000_version,
                "competingPaths": [prior_path, new_path],
                "priorEvidence": prior.get("evidence"),
                "newEvidence": entry.get("evidence"),
                "reason": "conflicting XML paths for same control",
                "timestamp": _now_iso(),
            }
        )
        existing.append(entry)
        return existing, conflicts

    existing.append(entry)
    return existing, conflicts


def _increase_confidence(prior: str | None, new: str | None) -> str:
    order = ["none", "ambiguous", "medium", "high", "exact"]
    try:
        return order[max(order.index(prior or "none"), order.index(new or "none"))]
    except ValueError:
        return new or prior or "medium"


def write_section_mappings(section: str, mappings: list[dict[str, Any]]) -> Path:
    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    path = section_mapping_path(section)
    payload = {
        "section": section,
        "probeVersion": PROBE_VERSION,
        "updatedAt": _now_iso(),
        "mappings": mappings,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def write_conflicts(conflicts: list[dict[str, Any]]) -> Path:
    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    path = MAPPINGS_DIR / "conflicts.json"
    existing: list[dict[str, Any]] = []
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            existing = data if isinstance(data, list) else data.get("conflicts", [])
        except Exception:
            pass
    existing.extend(conflicts)
    path.write_text(
        json.dumps({"updatedAt": _now_iso(), "conflicts": existing}, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def write_evidence_bundle(
    section: str,
    control_id: str,
    bundle: dict[str, Any],
    *,
    job_evidence_dir: Path | None = None,
) -> Path:
    safe_id = control_id.replace("::", "-").replace("/", "-")
    target = EVIDENCE_DIR / section / safe_id
    target.mkdir(parents=True, exist_ok=True)
    manifest_path = target / "manifest.json"
    manifest_path.write_text(json.dumps(bundle.get("manifest", {}), indent=2) + "\n", encoding="utf-8")
    for name, key in (
        ("baseline.xml.json", "baselineFragment"),
        ("raw-diff.json", "rawDiff"),
        ("filtered-diff.json", "filteredDiff"),
        ("result.json", "result"),
    ):
        if key in bundle:
            (target / name).write_text(json.dumps(bundle[key], indent=2) + "\n", encoding="utf-8")
    if job_evidence_dir:
        job_target = job_evidence_dir / section / safe_id
        job_target.mkdir(parents=True, exist_ok=True)
        for child in target.iterdir():
            if child.is_file():
                (job_target / child.name).write_text(child.read_text(encoding="utf-8"), encoding="utf-8")
    return target
