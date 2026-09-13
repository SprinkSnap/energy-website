"""
HOT2000 H2K probe engine — experimental UI-to-XML mapping via controlled saves.
"""

from __future__ import annotations

import json
import os
import shutil
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable

from catalog_probe_coverage import build_probe_coverage, write_probe_coverage
from catalog_probe_eligibility import choose_probe_value, is_probe_eligible
from catalog_probe_fixtures import (
    create_probe_workspace,
    sha256_file,
    verify_fixture_unchanged,
)
from catalog_probe_mappings import (
    build_mapping_from_diff,
    merge_mapping,
    write_conflicts,
    write_evidence_bundle,
    write_section_mappings,
    load_section_mappings,
)
from catalog_probe_models import PROBE_VERSION, FieldMapping, ProbeItem, ProbeQueueState
from catalog_probe_queue import (
    build_probe_queue,
    load_captured_controls,
    load_probe_state,
    save_probe_state,
)
from catalog_probe_ui import apply_probe_value, capture_validation_dialog, find_control_by_stable_id
from catalog_xml_diff import diff_h2k_xml, sha256_text
from hot2000_lifecycle import close_hot2000, detect_hot2000_version, launch_hot2000, wait_for_model_ready

ProgressFn = Callable[[str, str, str | None], None]
ControlCheckFn = Callable[[], str]


class ProbeStopped(Exception):
    pass


class ProbePaused(Exception):
    pass


def _check_control(control: str) -> None:
    if control == "stopped":
        raise ProbeStopped("Probe stopped by operator.")
    if control == "paused":
        raise ProbePaused("Probe paused by operator.")


def _parse_probe_options(job: dict | None) -> dict[str, Any]:
    if not job:
        return {}
    raw = job.get("catalog_action") or job.get("catalogAction") or ""
    if isinstance(raw, str) and raw.startswith("probe:"):
        try:
            return json.loads(raw[6:])
        except Exception:
            pass
    if isinstance(raw, dict):
        return raw
    return {}


def _parent_control_id(control_id: str) -> str:
    if "::opt::" in control_id:
        return control_id.split("::opt::")[0]
    return control_id


def _verify_h2k_parseable(path: Path) -> bool:
    try:
        ET.parse(path)
        return True
    except Exception:
        return False


def _save_hot2000(session, working_path: Path) -> bool:
    import worker as w

    if not session.main_hwnd or not session.primary_pid:
        return False
    return w.save_in_place(session.main_hwnd, working_path, session.primary_pid)


def _restore_workspace(baseline: Path, working: Path) -> None:
    shutil.copy2(baseline, working)


def _analyze_probe_result(
    baseline_path: Path,
    result_path: Path,
    item: ProbeItem,
    *,
    hot2000_version: str | None,
    fixture_id: str,
    fixture_hash: str,
    evidence_base: Path,
) -> tuple[FieldMapping | None, dict[str, Any]]:
    before_xml = baseline_path.read_text(encoding="utf-8")
    after_xml = result_path.read_text(encoding="utf-8")
    diff = diff_h2k_xml(before_xml, after_xml)
    diff_dict = diff.to_dict()

    evidence_bundle = {
        "manifest": {
            "controlId": item.control_id,
            "fixtureId": fixture_id,
            "fixtureHash": fixture_hash,
            "baselineHash": sha256_file(baseline_path),
            "resultHash": sha256_file(result_path),
            "probeVersion": PROBE_VERSION,
            "hot2000Version": hot2000_version,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "rawDiff": diff_dict.get("raw"),
        "filteredDiff": diff_dict,
        "result": {
            "confidence": diff_dict.get("candidateChanges", 0),
            "probeUiValue": item.probe_value,
            "optionIndex": item.option_index,
            "optionLabel": item.option_label,
        },
    }
    write_evidence_bundle(item.section, item.control_id, evidence_bundle, job_evidence_dir=evidence_base)

    item_dict = item.to_dict()
    mapping = build_mapping_from_diff(
        item_dict,
        diff_dict,
        hot2000_version=hot2000_version,
        fixture_id=fixture_id,
        fixture_hash=fixture_hash,
        evidence_dir=evidence_base / item.section / item.control_id.replace("::", "-"),
    )
    return mapping, diff_dict


def probe_single_item(
    job_id: str,
    job_dir: Path,
    item: ProbeItem,
    state: ProbeQueueState,
    progress: ProgressFn,
    control_check: ControlCheckFn,
) -> None:
    """Probe one queue item with a fresh baseline workspace."""
    if not is_probe_eligible(item.probe_class):
        item.status = "skipped"
        return

    if not verify_fixture_unchanged(state.fixture_id):
        item.status = "failed"
        item.error = "Fixture hash verification failed — master fixture may have changed."
        return

    workspace_info = create_probe_workspace(job_dir, state.fixture_id)
    baseline = workspace_info["baseline"]
    working = workspace_info["working"]
    result_path = workspace_info["workspace"] / f"result-{item.control_id.replace('::', '-')}.h2k"
    evidence_dir = job_dir / "probe-evidence"

    item.status = "preparing"
    item.attempts += 1
    state.current_item_id = item.control_id
    save_probe_state(job_dir, state)

    progress(job_id, "opening", f"Opening fixture for {item.label or item.control_id}")

    session = launch_hot2000(job_id, job_dir, working, progress)
    try:
        wait_for_model_ready(session, job_id, progress)
        _check_control(control_check())

        import worker as w
        from catalog_recorder import _desktop_window

        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        parent_id = _parent_control_id(item.control_id)
        control, ctype = find_control_by_stable_id(main_window, parent_id)

        if control is None:
            item.status = "manual-review"
            item.error = f"Control not found on current screen: {parent_id}"
            return

        item.status = "probing"
        original = item.original_value
        if not item.probe_value:
            if item.option_index is not None:
                item.probe_value = item.option_label or str(item.option_index)
            else:
                item.probe_value = choose_probe_value(item.probe_class, original)

        progress(job_id, "probing", f"Probing {item.label or item.control_id}: {item.probe_value}")

        applied = apply_probe_value(
            control,
            ctype,
            item.probe_class,
            probe_value=item.probe_value,
            option_index=item.option_index,
            option_label=item.option_label,
        )
        item.probe_value = applied

        dialog = capture_validation_dialog(w, session.primary_pid or 0)
        if dialog:
            w.dismiss_blocking_dialogs(session.primary_pid)
            item.status = "failed"
            item.error = f"Validation dialog: {dialog.get('title')}"
            return

        item.status = "saving"
        progress(job_id, "saving", f"Saving probe result for {item.control_id}")
        if not _save_hot2000(session, working):
            item.status = "failed"
            item.error = "HOT2000 save failed."
            return

        shutil.copy2(working, result_path)
        if not _verify_h2k_parseable(result_path):
            item.status = "failed"
            item.error = "Result H2K is not parseable XML."
            return

        item.status = "diffing"
        progress(job_id, "extracting", f"Diffing XML for {item.control_id}")
        mapping, diff_dict = _analyze_probe_result(
            baseline,
            result_path,
            item,
            hot2000_version=state.hot2000_version,
            fixture_id=state.fixture_id,
            fixture_hash=workspace_info["master_hash"],
            evidence_base=evidence_dir,
        )

        if not mapping or mapping.mapping.get("confidence") == "none":
            item.status = "no-change"
            return

        if mapping.mapping.get("confidence") == "ambiguous":
            item.status = "ambiguous"
        else:
            item.status = "mapped"

        state.completed.append(mapping)
        section_mappings = load_section_mappings(item.section)
        merged, conflicts = merge_mapping(
            section_mappings,
            mapping,
            fixture_hash=workspace_info["master_hash"],
        )
        write_section_mappings(item.section, merged)
        if conflicts:
            state.conflicts.extend(conflicts)
            write_conflicts(conflicts)

        # Round-trip restoration check
        restore_path = workspace_info["workspace"] / f"restored-{item.control_id.replace('::', '-')}.h2k"
        _restore_workspace(baseline, working)
        session2 = launch_hot2000(job_id, job_dir, working, progress, kill_stale=True)
        try:
            wait_for_model_ready(session2, job_id, progress)
            if original and item.probe_class not in {"SAFE_CODED_SELECT"}:
                ctrl2, ctype2 = find_control_by_stable_id(
                    desktop.window(handle=session2.main_hwnd), parent_id
                )
                if ctrl2:
                    apply_probe_value(ctrl2, ctype2, item.probe_class, probe_value=original)
            if _save_hot2000(session2, working):
                shutil.copy2(working, restore_path)
                restore_diff = diff_h2k_xml(
                    baseline.read_text(encoding="utf-8"),
                    restore_path.read_text(encoding="utf-8"),
                )
                if restore_diff.filtered_changes:
                    mapping.status = "restoration-failed"
        finally:
            close_hot2000(session2, job_dir)

    finally:
        close_hot2000(session, job_dir)


def run_probe_queue(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    job: dict | None = None,
) -> tuple[str, dict[str, Any]]:
    options = _parse_probe_options(job)
    repo_root = Path(__file__).resolve().parents[2]
    section_filter = options.get("sectionFilter") or options.get("section")
    control_filter = options.get("controlId") or options.get("control_id")
    fixture_id = options.get("fixtureId") or options.get("fixture_id") or "baseline-general"
    retry_mode = options.get("retry")

    state = load_probe_state(job_dir)
    if not state:
        controls = load_captured_controls(repo_root, section_filter=section_filter)
        if control_filter:
            controls = [
                c
                for c in controls
                if str(c.get("stableId") or c.get("stable_id")) == control_filter
                or str(c.get("stableId") or "").startswith(control_filter)
            ]
        state = build_probe_queue(
            controls,
            fixture_id=fixture_id,
            section_filter=section_filter,
            hot2000_version=detect_hot2000_version(),
        )
        state.control_filter = control_filter
        save_probe_state(job_dir, state)

    if retry_mode == "ambiguous":
        for item in state.items:
            if item.status == "ambiguous":
                item.status = "pending"
    elif retry_mode == "failed":
        for item in state.items:
            if item.status == "failed":
                item.status = "pending"

    state.status = "running"
    progress(job_id, "scanning", f"Starting H2K probe queue ({len(state.items)} items)")

    if os.name != "nt":
        state.status = "manual-review"
        payload = _build_result_payload(state, worker_id, offline=True)
        save_probe_state(job_dir, state)
        return json.dumps(payload), _meta_from_state(state, worker_id)

    try:
        for item in state.items:
            if item.status not in {"pending", "ambiguous"}:
                continue
            _check_control(control_check())
            try:
                probe_single_item(job_id, job_dir, item, state, progress, control_check)
            except ProbePaused:
                state.status = "paused"
                save_probe_state(job_dir, state)
                break
            except ProbeStopped:
                state.status = "stopped"
                save_probe_state(job_dir, state)
                break
            except Exception as exc:
                item.status = "failed"
                item.error = str(exc)
            save_probe_state(job_dir, state)
        else:
            state.status = "complete"
            save_probe_state(job_dir, state)
    except ProbePaused:
        state.status = "paused"
        save_probe_state(job_dir, state)
    except ProbeStopped:
        state.status = "stopped"
        save_probe_state(job_dir, state)

    raw_dir = job_dir / "raw-desktop"
    existing_coverage = None
    coverage_path = raw_dir / "coverage.json"
    if coverage_path.is_file():
        try:
            existing_coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    coverage = build_probe_coverage(state, existing_coverage)
    write_probe_coverage(coverage, raw_dir)

    payload = _build_result_payload(state, worker_id)
    return json.dumps(payload), _meta_from_state(state, worker_id)


def _build_result_payload(state: ProbeQueueState, worker_id: str, *, offline: bool = False) -> dict[str, Any]:
    state.update_totals()
    return {
        "probeVersion": PROBE_VERSION,
        "status": state.status,
        "offline": offline,
        "probeId": state.probe_id,
        "fixtureId": state.fixture_id,
        "hot2000Version": state.hot2000_version,
        "totals": state.totals,
        "completed": [m.to_dict() for m in state.completed],
        "skipped": state.skipped,
        "conflicts": state.conflicts,
        "worker": worker_id,
    }


def _meta_from_state(state: ProbeQueueState, worker_id: str) -> dict[str, Any]:
    state.update_totals()
    return {
        "section": "probe",
        "probeStatus": state.status,
        "fixtureId": state.fixture_id,
        "hot2000Version": state.hot2000_version,
        "controlsDiscovered": state.totals.get("eligible", 0),
        "controlsMapped": state.totals.get("mapped", 0),
        "exactMappings": state.totals.get("exact", 0),
        "ambiguousMappings": state.totals.get("ambiguous", 0),
        "skippedUnsafe": state.totals.get("skipped", 0),
        "workerId": worker_id,
    }
