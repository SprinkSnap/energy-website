"""
Automatic HOT2000 Desktop catalog scan orchestrator (Phase 2).

Breadth-first navigation with safe action classification, resumable state,
dialog discovery, scrolling, and incremental persistence.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from catalog_coverage import write_coverage_reports
from catalog_models import RECORDER_VERSION, CapturedControl, SectionCapture
from catalog_navigation import (
    MAX_ACTION_RETRIES,
    MAX_DIALOG_DEPTH,
    MAX_NAV_DEPTH,
    classify_action,
    compute_screen_key,
    discover_navigation_targets,
    get_selected_tab_labels,
    is_safe_to_invoke,
    list_dialog_windows,
    safe_close_dialog,
    safe_invoke,
    scroll_container_controls,
    wait_for_ui_stability,
)
from catalog_recorder import (
    COMBO_TYPES,
    _capture_control,
    _collect_labels,
    _desktop_window,
    _infer_section_from_title,
    _save_incremental,
    _summarize_capture,
)
from catalog_scan_state import ScanState
from hot2000_lifecycle import (
    Hot2000Session,
    close_hot2000,
    detect_hot2000_version,
    open_h2k_fixture,
    wait_for_model_ready,
)

ProgressFn = Callable[[str, str, str | None], None]
ControlCheckFn = Callable[[], str]


class ScanStopped(Exception):
    pass


class ScanPaused(Exception):
    pass


def _check_control(control: str) -> None:
    if control == "stopped":
        raise ScanStopped("Scan stopped by operator.")
    if control == "paused":
        raise ScanPaused("Scan paused by operator.")


def _capture_window_tree(
    window,
    session: Hot2000Session,
    worker_id: str,
    *,
    section_hint: str | None = None,
    dialog_title: str | None = None,
    reachability: str = "automatic",
) -> SectionCapture:
    window_title = window.window_text()
    selected_tabs = get_selected_tab_labels(window)
    section = section_hint or _infer_section_from_title(dialog_title or window_title)
    hot2000_version = detect_hot2000_version()

    capture = SectionCapture(
        recorder_version=RECORDER_VERSION,
        hot2000_version=hot2000_version,
        captured_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        worker=worker_id,
        section=section,
        window_title=window_title,
        dialog_title=dialog_title,
    )

    descendants = list(window.descendants())
    scrollable = [d for d in descendants if "Scroll" in str(getattr(d, "friendly_class_name", ""))]
    if scrollable:
        for container in scrollable[:6]:
            descendants.extend(scroll_container_controls(container))

    labels = _collect_labels(descendants)
    seen: set[str] = set()
    order = 0
    for desc in descendants:
        try:
            ctype = str(desc.element_info.control_type)
            if ctype in {"Pane", "Window", "TitleBar", "MenuBar", "ToolBar", "Text", "Label"}:
                continue
            if not desc.is_visible():
                continue
            key = f"{ctype}:{desc.element_info.automation_id}:{desc.window_text()}"
            if key in seen:
                continue
            seen.add(key)
            result = _capture_control(desc, order, labels, section, window_title)
            order += 1
            if isinstance(result, CapturedControl):
                capture.controls.append(result)
            else:
                capture.inaccessible_controls.append(result)
        except Exception as exc:
            capture.inaccessible_controls.append(
                {
                    "stableId": f"inaccessible:{order}",
                    "verification": "inaccessible",
                    "error": str(exc),
                    "section": section,
                }
            )
            order += 1

    if reachability == "guided":
        capture.warnings.append("Screen captured via guided Capture Current Screen.")
    return capture


def _screen_context(window, hot2000_version: str | None) -> tuple[str, str, list[str]]:
    title = window.window_text()
    tabs = get_selected_tab_labels(window)
    key = compute_screen_key(
        hot2000_version=hot2000_version,
        window_title=title,
        selected_tabs=tabs,
        key_labels=tabs[:6],
    )
    section = _infer_section_from_title(title)
    return key, section, tabs


def _persist_unknown_controls(raw_dir: Path, entries: list[dict[str, Any]]) -> None:
    if not entries:
        return
    path = raw_dir / "unknown-controls.json"
    existing: list[dict[str, Any]] = []
    if path.is_file():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    existing.extend(entries)
    path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")


def hydrate_scan_state(
    job_dir: Path,
    *,
    resume: bool,
    continuation_payload: dict[str, Any] | None = None,
) -> ScanState | None:
    raw_dir = job_dir / "raw-desktop"
    state_path = raw_dir / "scan-state.json"
    if resume and continuation_payload:
        state = ScanState.from_navigation_dict(continuation_payload)
        state.save(raw_dir)
        return state
    if resume:
        return ScanState.load(state_path)
    return None


def _assert_scan_callbacks(
    *,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    checkpoint: Callable[[str, dict[str, Any], dict[str, Any]], None] | None = None,
    progress_with_pct: Callable[[str, str, str | None, int | None], None] | None = None,
) -> None:
    if not callable(progress):
        raise TypeError(f"progress must be callable, got {type(progress).__name__}")
    if not callable(control_check):
        raise TypeError(f"control_check must be callable, got {type(control_check).__name__}")
    if checkpoint is not None and not callable(checkpoint):
        raise TypeError(f"checkpoint must be callable, got {type(checkpoint).__name__}")
    if progress_with_pct is not None and not callable(progress_with_pct):
        raise TypeError(
            f"progress_with_pct must be callable, got {type(progress_with_pct).__name__}"
        )


def run_automatic_full_scan(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    resume: bool = False,
    allow_medium_confidence: bool = True,
    checkpoint: Callable[[str, dict[str, Any], dict[str, Any]], None] | None = None,
    progress_with_pct: Callable[[str, str, str | None, int | None], None] | None = None,
    continuation_payload: dict[str, Any] | None = None,
    worker_build: str | None = None,
) -> tuple[str, dict[str, Any]]:
    _assert_scan_callbacks(
        progress=progress,
        control_check=control_check,
        checkpoint=checkpoint,
        progress_with_pct=progress_with_pct,
    )
    from catalog_ui_crawler import run_stateful_ui_crawl

    raw_dir = job_dir / "raw-desktop"
    state = hydrate_scan_state(job_dir, resume=resume, continuation_payload=continuation_payload)
    session = open_h2k_fixture(job_id, job_dir, "baseline-general.h2k", progress)
    unknown_controls: list[dict[str, Any]] = []

    try:
        wait_for_model_ready(session, job_id, progress)
        if state is None:
            state = ScanState.new(
                hot2000_version=detect_hot2000_version(),
                fixture="baseline-general.h2k",
            )
            state.allow_medium_confidence = allow_medium_confidence
        if continuation_payload:
            state.parent_job_id = continuation_payload.get("parentJobId") or state.parent_job_id

        progress(job_id, "scanning", "Starting stateful HOT2000 UI crawl…")
        state.status = "running"
        state, _engine = run_stateful_ui_crawl(
            job_id,
            job_dir,
            worker_id,
            session,
            state,
            progress,
            lambda: _check_control(control_check()),
            checkpoint=checkpoint,
            progress_with_pct=progress_with_pct,
        )
        state.save(raw_dir)
        docs_dir = job_dir.parents[2] / "h2k-web-editor" / "docs" if len(job_dir.parents) > 2 else Path("docs")
        try:
            repo_docs = Path(__file__).resolve().parents[2] / "h2k-web-editor" / "docs"
            report = write_coverage_reports(
                state, raw_dir, repo_docs, job_id=job_id, worker_id=worker_id, worker_build=worker_build
            )
        except Exception:
            report = write_coverage_reports(
                state, raw_dir, job_dir / "docs", job_id=job_id, worker_id=worker_id, worker_build=worker_build
            )
        state.finalize_status()

        progress(job_id, "closing", "Closing HOT2000…")
        close_hot2000(session, job_dir)
        progress(job_id, "extracting", "Uploading catalog scan results…")
        _persist_unknown_controls(raw_dir, unknown_controls)
        payload = state.to_navigation_dict()
        payload["coverage"] = report
        meta = {
            **state.build_progress_meta(worker_id),
            "scanStatus": state.status,
            "resultClassification": state.status,
            "lastScreen": state.last_screen,
            "lastWindow": state.last_window,
            "lastAction": state.last_action,
        }
        return json.dumps(payload), meta

    except ScanStopped:
        state.status = "stopped-partial"
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            "scanStatus": "stopped-partial",
            "workerId": worker_id,
        }
    except ScanPaused:
        state.status = "paused"
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            "scanStatus": "paused",
            "workerId": worker_id,
        }
    except Exception:
        close_hot2000(session, job_dir)
        raise


def run_guided_capture_merge(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
) -> tuple[str, dict[str, Any]]:
    """Capture current screen and merge into existing scan state."""
    _assert_scan_callbacks(progress=progress, control_check=control_check)
    raw_dir = job_dir / "raw-desktop"
    state = ScanState.load(raw_dir / "scan-state.json") or ScanState.new(
        hot2000_version=detect_hot2000_version(),
        fixture="baseline-general.h2k",
    )
    session = open_h2k_fixture(job_id, job_dir, "baseline-general.h2k", progress)
    try:
        wait_for_model_ready(session, job_id, progress)
        _check_control(control_check())
        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        wait_for_ui_stability(main_window)
        screen_key, section, _ = _screen_context(main_window, state.hot2000_version)
        capture = _capture_window_tree(
            main_window,
            session,
            worker_id,
            section_hint=section,
            reachability="guided",
        )
        _save_incremental(job_dir, capture)
        summary = _summarize_capture(capture)
        state.record_screen(
            screen_key,
            title=capture.window_title,
            status="guided-captured",
            source_file=f"{capture.section}.json",
            section=capture.section,
            reachability="guided",
            controls=summary["controlsDiscovered"],
            dropdowns=summary["comboBoxes"],
            options=summary["dropdownOptions"],
            inaccessible=summary["inaccessibleControls"],
        )
        state.update_totals()
        state.save(raw_dir)
        repo_docs = Path(__file__).resolve().parents[2] / "h2k-web-editor" / "docs"
        write_coverage_reports(state, raw_dir, repo_docs)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            **summary,
            "scanStatus": "guided-captured",
            "screenKey": screen_key,
        }
    except Exception:
        close_hot2000(session, job_dir)
        raise


def retry_inaccessible_controls(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    continuation_payload: dict[str, Any] | None = None,
    worker_build: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Revisit screens with inaccessible controls and retry capture strategies."""
    _assert_scan_callbacks(progress=progress, control_check=control_check)
    raw_dir = job_dir / "raw-desktop"
    state = hydrate_scan_state(job_dir, resume=True, continuation_payload=continuation_payload)
    if not state:
        state = ScanState.load(raw_dir / "scan-state.json")
    if not state:
        raise RuntimeError("No scan state found to retry inaccessible controls.")
    unresolved = [r for r in state.inaccessible_records if r.get("status") != "resolved"]
    if not unresolved and not any(int(s.get("inaccessible", 0)) > 0 for s in state.screens.values()):
        raise RuntimeError("No unresolved inaccessible controls to retry.")

    session = open_h2k_fixture(job_id, job_dir, state.fixture, progress)
    retried = 0
    try:
        wait_for_model_ready(session, job_id, progress)
        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        targets = {r.get("screenKey") for r in unresolved if r.get("screenKey")}
        for screen_key, screen in list(state.screens.items()):
            if screen_key not in targets and int(screen.get("inaccessible", 0)) <= 0:
                continue
            _check_control(control_check())
            progress(job_id, "capturing", f"Retrying inaccessible controls on {screen_key}")
            wait_for_ui_stability(main_window)
            capture = _capture_window_tree(main_window, session, worker_id, section_hint=screen.get("section"))
            _save_incremental(job_dir, capture, screen_key=screen_key)
            summary = _summarize_capture(capture)
            prior = int(screen.get("inaccessible", 0))
            if summary["inaccessibleControls"] < prior:
                retried += 1
            for record in state.inaccessible_records:
                if record.get("screenKey") == screen_key and summary["inaccessibleControls"] < prior:
                    attempts = list(record.get("attempts") or [])
                    attempts.append({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "result": "improved"})
                    record["attempts"] = attempts
                    if summary["inaccessibleControls"] == 0:
                        record["status"] = "resolved"
            state.record_screen(
                screen_key,
                title=screen.get("title", screen_key),
                status="partial" if summary["inaccessibleControls"] else "captured",
                source_file=screen.get("sourceFile"),
                section=screen.get("section"),
                controls=summary["controlsDiscovered"],
                dropdowns=summary["comboBoxes"],
                options=summary["dropdownOptions"],
                inaccessible=summary["inaccessibleControls"],
            )
        state.update_totals()
        state.finalize_status()
        report = write_coverage_reports(
            state, raw_dir, job_dir / "docs", job_id=job_id, worker_id=worker_id, worker_build=worker_build
        )
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        payload = state.to_navigation_dict()
        payload["coverage"] = report
        return json.dumps(payload), {
            "retriedScreens": retried,
            "workerId": worker_id,
            "scanStatus": state.status,
            "resultClassification": state.status,
        }
    except Exception:
        close_hot2000(session, job_dir)
        raise
