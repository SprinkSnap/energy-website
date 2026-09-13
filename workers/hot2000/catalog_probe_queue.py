"""Build and persist resumable probe queues from raw desktop capture."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from catalog_probe_eligibility import classify_probe_eligibility, is_probe_eligible
from catalog_probe_models import ProbeItem, ProbeQueueState


def _raw_capture_dir(repo_root: Path) -> Path:
    return repo_root / "h2k-web-editor" / "catalog" / "raw-desktop"


def load_captured_controls(
    repo_root: Path,
    *,
    section_filter: str | None = None,
) -> list[dict[str, Any]]:
    raw_dir = _raw_capture_dir(repo_root)
    controls: list[dict[str, Any]] = []
    if not raw_dir.is_dir():
        return controls
    for path in sorted(raw_dir.glob("*.json")):
        if path.name in {"manifest.json", "navigation.json", "coverage.json"}:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        section = str(data.get("section") or path.stem)
        if section_filter and section != section_filter:
            continue
        screen_key = f"{data.get('hot2000Version', 'unknown')}::{section}"
        for control in data.get("controls", []):
            if isinstance(control, dict):
                control = {**control, "section": section, "screenKey": screen_key}
                controls.append(control)
    return controls


def build_probe_queue(
    controls: list[dict[str, Any]],
    *,
    fixture_id: str = "baseline-general",
    section_filter: str | None = None,
    hot2000_version: str | None = None,
) -> ProbeQueueState:
    state = ProbeQueueState(
        probe_id=uuid.uuid4().hex,
        fixture_id=fixture_id,
        section_filter=section_filter,
        hot2000_version=hot2000_version,
        status="pending",
    )
    seen_parents: set[str] = set()
    for control in controls:
        probe_class, reason = classify_probe_eligibility(control)
        stable_id = str(control.get("stableId") or control.get("stable_id") or control.get("id"))
        item = ProbeItem(
            control_id=stable_id,
            screen_key=str(control.get("screenKey") or control.get("screen_key") or "unknown"),
            section=str(control.get("section") or "unknown"),
            fixture_id=fixture_id,
            control_type=str(control.get("controlType") or control.get("control_type") or ""),
            label=control.get("label") or control.get("name"),
            probe_class=probe_class,
            original_value=control.get("value"),
        )
        if not is_probe_eligible(probe_class):
            state.skipped.append(
                {
                    "controlId": item.control_id,
                    "probeClass": probe_class,
                    "reason": reason,
                    "section": item.section,
                }
            )
            item.status = "skipped"
        state.items.append(item)

        options = control.get("options") or []
        if probe_class == "SAFE_CODED_SELECT" and options and stable_id not in seen_parents:
            seen_parents.add(stable_id)
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                opt_item = ProbeItem(
                    control_id=f"{item.control_id}::opt::{opt.get('index', 0)}",
                    screen_key=item.screen_key,
                    section=item.section,
                    fixture_id=fixture_id,
                    control_type=item.control_type,
                    label=item.label,
                    probe_class="SAFE_CODED_SELECT",
                    original_value=item.original_value,
                    option_index=int(opt.get("index", 0)),
                    option_label=str(opt.get("label") or ""),
                )
                state.items.append(opt_item)

    state.update_totals()
    return state


def save_probe_state(job_dir: Path, state: ProbeQueueState) -> Path:
    probe_dir = job_dir / "probe-work"
    probe_dir.mkdir(parents=True, exist_ok=True)
    path = probe_dir / "queue-state.json"
    state.update_totals()
    path.write_text(json.dumps(state.to_dict(), indent=2) + "\n", encoding="utf-8")
    return path


def _item_from_dict(data: dict[str, Any]) -> ProbeItem:
    return ProbeItem(
        control_id=data.get("controlId") or data.get("control_id", ""),
        screen_key=data.get("screenKey") or data.get("screen_key", ""),
        section=data.get("section", "unknown"),
        fixture_id=data.get("fixtureId") or data.get("fixture_id", "baseline-general"),
        control_type=data.get("controlType") or data.get("control_type", ""),
        label=data.get("label"),
        probe_class=data.get("probeClass") or data.get("probe_class", "MANUAL_REVIEW"),
        original_value=data.get("originalValue") or data.get("original_value"),
        probe_value=data.get("probeValue") or data.get("probe_value"),
        option_index=data.get("optionIndex") or data.get("option_index"),
        option_label=data.get("optionLabel") or data.get("option_label"),
        prerequisites=data.get("prerequisites") or [],
        status=data.get("status", "pending"),
        attempts=int(data.get("attempts") or 0),
        error=data.get("error"),
    )


def load_probe_state(job_dir: Path) -> ProbeQueueState | None:
    path = job_dir / "probe-work" / "queue-state.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        state = ProbeQueueState(
            probe_id=data.get("probeId", ""),
            hot2000_version=data.get("hot2000Version"),
            fixture_id=data.get("fixtureId", "baseline-general"),
            section_filter=data.get("sectionFilter"),
            control_filter=data.get("controlFilter"),
            status=data.get("status", "pending"),
            current_item_id=data.get("currentItemId"),
        )
        for item_data in data.get("items", []):
            state.items.append(_item_from_dict(item_data))
        state.skipped = list(data.get("skipped") or [])
        state.conflicts = list(data.get("conflicts") or [])
        state.totals = dict(data.get("totals") or {})
        return state
    except Exception:
        return None
