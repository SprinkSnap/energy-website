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


def run_automatic_full_scan(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    resume: bool = False,
    allow_medium_confidence: bool = True,
) -> tuple[str, dict[str, Any]]:
    raw_dir = job_dir / "raw-desktop"
    state_path = raw_dir / "scan-state.json"
    state = ScanState.load(state_path) if resume else None
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

        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        progress(job_id, "scanning", "Starting automatic HOT2000 navigation scan…")

        start_key, start_section, _ = _screen_context(main_window, state.hot2000_version)
        state.enqueue(
            {
                "screenKey": start_key,
                "section": start_section,
                "depth": 0,
                "actionKey": f"root:{start_key}",
                "fromScreen": None,
                "action": {"label": "root", "controlType": "root", "classification": "SAFE_NAVIGATION"},
            }
        )

        while state.pending:
            _check_control(control_check())
            item = state.pop_pending()
            if not item:
                break
            screen_key = item["screenKey"]
            depth = int(item.get("depth", 0))
            if depth > MAX_NAV_DEPTH:
                state.warnings.append(f"Max navigation depth exceeded at {screen_key}")
                continue
            if not state.should_visit(screen_key):
                state.warnings.append(f"Loop prevented for screen {screen_key}")
                continue

            state.current_screen_key = screen_key
            state.navigation_path = (state.navigation_path or [])[:depth] + [screen_key]
            state.status = "navigating"
            state.save(raw_dir)

            progress(job_id, "scanning", f"Navigating to {screen_key}…")
            action = item.get("action")
            target = item.get("target")
            if action and item.get("fromScreen") and target is not None:
                for attempt in range(MAX_ACTION_RETRIES):
                    started = time.time()
                    ok, err = safe_invoke(target)
                    state.record_audit(
                        from_screen=item["fromScreen"],
                        action=action,
                        result="success" if ok else "failed",
                        destination=screen_key if ok else None,
                        error=err,
                        duration_ms=int((time.time() - started) * 1000),
                    )
                    if ok:
                        wait_for_ui_stability(main_window)
                        break
                    state.failed.append({**action, "screenKey": screen_key, "error": err})

            progress(job_id, "capturing", f"Capturing screen {screen_key}…")
            wait_for_ui_stability(main_window)
            capture = _capture_window_tree(
                main_window,
                session,
                worker_id,
                section_hint=item.get("section"),
            )
            progress(job_id, "enumerating", "Enumerating dropdown options…")
            _save_incremental(job_dir, capture)
            summary = _summarize_capture(capture)
            status = "partial" if summary["inaccessibleControls"] else "captured"
            state.record_screen(
                screen_key,
                title=capture.window_title,
                status=status,
                source_file=f"{capture.section}.json",
                section=capture.section,
                controls=summary["controlsDiscovered"],
                dropdowns=summary["comboBoxes"],
                options=summary["dropdownOptions"],
                inaccessible=summary["inaccessibleControls"],
            )
            if item.get("fromScreen"):
                state.record_edge(item["fromScreen"], screen_key, item.get("action", {}), "success")

            # Discover dialogs
            if depth < MAX_DIALOG_DEPTH:
                for dialog in list_dialog_windows(desktop):
                    dialog_title = dialog.window_text()
                    dialog_key = compute_screen_key(
                        hot2000_version=state.hot2000_version,
                        window_title=main_window.window_text(),
                        dialog_title=dialog_title,
                    )
                    if state.should_visit(dialog_key):
                        dialog_capture = _capture_window_tree(
                            main_window,
                            session,
                            worker_id,
                            section_hint=capture.section,
                            dialog_title=dialog_title,
                        )
                        dialog_file = raw_dir / "dialogs" / f"{dialog_key.replace('::', '_')}.json"
                        dialog_file.parent.mkdir(parents=True, exist_ok=True)
                        dialog_file.write_text(
                            json.dumps(dialog_capture.to_dict(), indent=2) + "\n",
                            encoding="utf-8",
                        )
                        state.record_screen(
                            dialog_key,
                            title=dialog_title,
                            status="captured",
                            source_file=f"dialogs/{dialog_file.name}",
                            section=capture.section,
                            controls=len(dialog_capture.controls),
                            dropdowns=sum(1 for c in dialog_capture.controls if c.control_type in COMBO_TYPES),
                            options=sum(len(c.options) for c in dialog_capture.controls),
                            inaccessible=len(dialog_capture.inaccessible_controls),
                        )
                        safe_close_dialog(dialog)

            # Discover navigation targets
            targets = discover_navigation_targets(
                main_window,
                depth=depth + 1,
                allow_medium=state.allow_medium_confidence,
            )
            for target in targets:
                classification, confidence = target.classification, target.confidence
                if not is_safe_to_invoke(classification, confidence, allow_medium=state.allow_medium_confidence):
                    state.blocked_unsafe.append(target.to_dict())
                    continue
                dest_key = compute_screen_key(
                    hot2000_version=state.hot2000_version,
                    window_title=main_window.window_text(),
                    selected_tabs=get_selected_tab_labels(main_window) + [target.label],
                    key_labels=[target.label],
                )
                state.enqueue(
                    {
                        "screenKey": dest_key,
                        "section": _infer_section_from_title(target.label),
                        "depth": depth + 1,
                        "fromScreen": screen_key,
                        "action": target.to_dict(),
                        "actionKey": f"{screen_key}:{target.label}:{target.control_type}",
                        "target": target,
                    }
                )

            state.update_totals()
            state.save(raw_dir)
            progress(
                job_id,
                "scanning",
                f"Scanned {summary['controlsDiscovered']} controls on {capture.section}",
            )

        state.status = "complete"
        state.save(raw_dir)
        docs_dir = job_dir.parents[2] / "h2k-web-editor" / "docs" if len(job_dir.parents) > 2 else Path("docs")
        try:
            repo_docs = Path(__file__).resolve().parents[2] / "h2k-web-editor" / "docs"
            write_coverage_reports(state, raw_dir, repo_docs)
        except Exception:
            write_coverage_reports(state, raw_dir, job_dir / "docs")

        progress(job_id, "closing", "Closing HOT2000…")
        close_hot2000(session, job_dir)
        progress(job_id, "extracting", "Uploading catalog scan results…")
        _persist_unknown_controls(raw_dir, unknown_controls)
        payload = state.to_navigation_dict()
        meta = {
            **state.totals,
            "section": state.current_screen_key,
            "windowTitle": state.screens.get(state.current_screen_key or "", {}).get("title"),
            "hot2000Version": state.hot2000_version,
            "workerId": worker_id,
            "capturedAt": state.updated_at,
            "scanId": state.scan_id,
            "scanStatus": state.status,
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
) -> tuple[str, dict[str, Any]]:
    """Revisit screens with inaccessible controls and retry capture strategies."""
    raw_dir = job_dir / "raw-desktop"
    state = ScanState.load(raw_dir / "scan-state.json")
    if not state:
        raise RuntimeError("No scan state found to retry inaccessible controls.")

    session = open_h2k_fixture(job_id, job_dir, state.fixture, progress)
    retried = 0
    try:
        wait_for_model_ready(session, job_id, progress)
        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        for screen_key, screen in list(state.screens.items()):
            if int(screen.get("inaccessible", 0)) <= 0:
                continue
            _check_control(control_check())
            progress(job_id, "capturing", f"Retrying inaccessible controls on {screen_key}")
            wait_for_ui_stability(main_window)
            capture = _capture_window_tree(main_window, session, worker_id, section_hint=screen.get("section"))
            _save_incremental(job_dir, capture)
            summary = _summarize_capture(capture)
            if summary["inaccessibleControls"] < int(screen.get("inaccessible", 0)):
                retried += 1
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
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            "retriedScreens": retried,
            "workerId": worker_id,
            "scanStatus": state.status,
        }
    except Exception:
        close_hot2000(session, job_dir)
        raise
