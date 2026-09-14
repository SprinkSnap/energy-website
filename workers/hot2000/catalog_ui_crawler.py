"""
Stateful HOT2000 UI crawler — Phase 2 exploration engine.

Queue-based BFS with one-variable-at-a-time branching, restoration, and checkpoints.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

from catalog_combo_enumeration import enumerate_combo_options
from catalog_control_locator import build_control_locator, build_screen_id
from catalog_coverage import build_full_coverage_report, write_coverage_reports
from catalog_models import RECORDER_VERSION
from catalog_scan_accounting import classify_scan_result
from catalog_scan_events import ScanEvent, ScanEventFeed, build_live_execution_state
from catalog_ui_dependency import compute_dependency_delta, snapshot_controls
from catalog_navigation import (
    classify_action,
    classify_button,
    get_selected_tab_labels,
    is_safe_to_invoke,
    list_dialog_windows,
    safe_close_dialog,
    wait_for_ui_stability,
)
from catalog_recorder import (
    COMBO_TYPES,
    CHECK_TYPES,
    RADIO_TYPES,
    _capture_control,
    _collect_labels,
    _desktop_window,
    _enumerate_combo_options,
    _infer_section_from_title,
    _read_value,
    _save_incremental,
    _summarize_capture,
)
from catalog_scan_state import ScanState
from catalog_ui_crawler_engine import CrawlEngine, CrawlLimits, PlannedAction
from catalog_ui_fingerprint import ControlSnapshot, StateFingerprint, build_action_key
from catalog_ui_interaction import (
    expand_combo,
    focus_text_field,
    invoke_button,
    read_toggle_state,
    restore_combo_value,
    select_combo_option,
    select_radio,
    select_tab_item,
    scroll_container,
    toggle_checkbox,
)
from catalog_models import SectionCapture
from hot2000_lifecycle import Hot2000Session, close_hot2000, detect_hot2000_version

ProgressFn = Callable[[str, str, str | None], None]
ControlCheckFn = Callable[[], str]
CheckpointFn = Callable[[str, dict[str, Any], dict[str, Any]], None] | None


def _limits_from_env() -> CrawlLimits:
    def _int(name: str, default: int) -> int:
        try:
            return int(os.environ.get(name, default))
        except ValueError:
            return default

    return CrawlLimits(
        max_scan_minutes=_int("MAX_SCAN_MINUTES", 120),
        max_states=_int("MAX_STATES", 500),
        max_actions=_int("MAX_ACTIONS", 5000),
        max_action_retries=_int("MAX_ACTION_RETRIES", 2),
        max_depth=_int("MAX_DEPTH", 16),
    )


def _control_snapshots(window, hot2000_version: str | None) -> list[ControlSnapshot]:
    snapshots: list[ControlSnapshot] = []
    try:
        for desc in window.descendants():
            if not desc.is_visible():
                continue
            ctype = str(desc.element_info.control_type)
            if ctype in {"Pane", "Window", "TitleBar", "MenuBar", "ToolBar"}:
                continue
            label = (desc.window_text() or desc.element_info.name or "").strip()
            value = _read_value(desc, ctype) or ""
            checked = ""
            if ctype in CHECK_TYPES:
                checked = read_toggle_state(desc)
            selected = ""
            if ctype in RADIO_TYPES:
                selected = "true" if read_toggle_state(desc) == "checked" else "false"
            snapshots.append(
                ControlSnapshot(
                    control_type=ctype,
                    automation_id=str(desc.element_info.automation_id or ""),
                    class_name=str(desc.element_info.class_name or ""),
                    name=label,
                    label=label,
                    value=value,
                    checked=checked,
                    selected=selected,
                    enabled=bool(desc.is_enabled()),
                    visible=True,
                )
            )
    except Exception:
        pass
    return snapshots


def build_fingerprint(
    window,
    *,
    hot2000_version: str | None,
    dialog_title: str | None = None,
    process_id: int | None = None,
) -> StateFingerprint:
    return StateFingerprint(
        process_id=process_id or getattr(window, "process_id", lambda: None)(),
        window_class=str(getattr(window.element_info, "class_name", "") or ""),
        window_title=window.window_text() or "",
        dialog_title=dialog_title or "",
        selected_tabs=get_selected_tab_labels(window),
        controls=_control_snapshots(window, hot2000_version),
        hot2000_version=hot2000_version,
    )


class PywinautoUiSurface:
    """Live HOT2000 window adapter for CrawlEngine."""

    def __init__(
        self,
        window,
        desktop,
        hot2000_version: str | None,
        worker_id: str,
        *,
        target_section_id: str | None = None,
        target_section_label: str | None = None,
    ) -> None:
        self.window = window
        self.desktop = desktop
        self.hot2000_version = hot2000_version
        self.worker_id = worker_id
        self.target_section_id = target_section_id
        self.target_section_label = target_section_label
        self._control_map: dict[str, Any] = {}
        self._locator_map: dict[str, dict[str, Any]] = {}

    def _context(self) -> tuple[str, str, list[str]]:
        window_title = self.window.window_text() or "HOT2000"
        section = self.target_section_id or _infer_section_from_title(window_title)
        tab_breadcrumb = get_selected_tab_labels(self.window)
        if self.target_section_label:
            tab_breadcrumb = [self.target_section_label, *tab_breadcrumb]
        return window_title, section, tab_breadcrumb

    def _register(self, control, cid: str) -> str:
        window_title, section, tab_breadcrumb = self._context()
        locator = build_control_locator(
            control,
            window_title=window_title,
            section=section,
            tab_breadcrumb=tab_breadcrumb,
        )
        logical_id = locator.logical_control_id
        self._control_map[cid] = control
        self._control_map[logical_id] = control
        self._locator_map[cid] = locator.to_dict()
        self._locator_map[logical_id] = locator.to_dict()
        return cid

    def fingerprint(self) -> StateFingerprint:
        return build_fingerprint(
            self.window,
            hot2000_version=self.hot2000_version,
            process_id=self.window.process_id(),
        )

    def screen_id(self) -> str:
        window_title, section, tab_breadcrumb = self._context()
        return build_screen_id(
            window_title=window_title,
            section=section,
            tab_breadcrumb=tab_breadcrumb,
        )

    def list_tabs(self) -> list[dict[str, Any]]:
        tabs: list[dict[str, Any]] = []
        try:
            for tab in self.window.descendants(control_type="TabItem"):
                if not tab.is_visible():
                    continue
                label = (tab.window_text() or tab.element_info.name or "").strip()
                cid = self._register(tab, f"tab:{label}:{tab.element_info.automation_id}")
                tabs.append(
                    {
                        "id": cid,
                        "label": label,
                        "selected": bool(tab.is_selected()),
                        "logicalControlId": self._locator_map.get(cid, {}).get("logicalControlId", cid),
                    }
                )
        except Exception:
            pass
        return tabs

    def list_combos(self, *, metadata_only: bool = True) -> list[dict[str, Any]]:
        combos: list[dict[str, Any]] = []
        try:
            for desc in self.window.descendants():
                ctype = str(desc.element_info.control_type)
                if ctype not in COMBO_TYPES or not desc.is_visible():
                    continue
                label = (desc.window_text() or desc.element_info.name or "").strip()
                cid = self._register(desc, f"combo:{label}:{desc.element_info.automation_id}")
                entry: dict[str, Any] = {
                    "id": cid,
                    "label": label,
                    "current": _read_value(desc, ctype),
                    "controlType": ctype,
                    "logicalControlId": self._locator_map.get(cid, {}).get("logicalControlId", cid),
                }
                if not metadata_only:
                    options, warnings, status = enumerate_combo_options(desc, ctype, expand=True)
                    entry["options"] = [{"label": o.label, "index": o.index} for o in options]
                    entry["enumerationStatus"] = status
                    entry["warnings"] = warnings
                combos.append(entry)
        except Exception:
            pass
        return combos

    def enumerate_combo(self, control_id: str) -> dict[str, Any]:
        control = self._control_map.get(control_id)
        if control is None:
            return {"status": "failed", "error": "combo control not found", "options": []}
        ctype = str(control.element_info.control_type)
        options, warnings, enum_status = enumerate_combo_options(control, ctype, expand=True)
        return {
            "status": "completed" if options else "failed",
            "enumerationStatus": enum_status,
            "warnings": warnings,
            "options": [{"label": o.label, "index": o.index} for o in options],
        }

    def list_checkboxes(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        try:
            for desc in self.window.descendants(control_type="CheckBox"):
                if not desc.is_visible():
                    continue
                label = (desc.window_text() or desc.element_info.name or "").strip()
                cid = self._register(desc, f"checkbox:{label}:{desc.element_info.automation_id}")
                items.append(
                    {
                        "id": cid,
                        "label": label,
                        "checked": read_toggle_state(desc),
                        "logicalControlId": self._locator_map.get(cid, {}).get("logicalControlId", cid),
                    }
                )
        except Exception:
            pass
        return items

    def list_radio_groups(self) -> list[dict[str, Any]]:
        groups: dict[str, dict[str, Any]] = {}
        try:
            for desc in self.window.descendants(control_type="RadioButton"):
                if not desc.is_visible():
                    continue
                label = (desc.window_text() or desc.element_info.name or "").strip()
                parent = str(desc.element_info.automation_id or label)
                gid = f"group:{parent}"
                group = groups.setdefault(gid, {"id": gid, "choices": [], "selected": None})
                cid = self._register(desc, f"radio:{label}:{desc.element_info.automation_id}")
                choice = {
                    "id": cid,
                    "label": label,
                    "logicalControlId": self._locator_map.get(cid, {}).get("logicalControlId", cid),
                }
                group["choices"].append(choice)
                if read_toggle_state(desc) == "checked":
                    group["selected"] = label
        except Exception:
            pass
        return list(groups.values())

    def list_buttons(self) -> list[dict[str, Any]]:
        buttons: list[dict[str, Any]] = []
        try:
            for desc in self.window.descendants(control_type="Button"):
                if not desc.is_visible() or not desc.is_enabled():
                    continue
                label = (desc.window_text() or desc.element_info.name or "").strip()
                classification = classify_button(desc)
                cid = self._register(desc, f"button:{label}:{desc.element_info.automation_id}")
                buttons.append({"id": cid, "label": label, "classification": classification})
        except Exception:
            pass
        return buttons

    def list_text_fields(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        try:
            for desc in self.window.descendants():
                ctype = str(desc.element_info.control_type)
                if ctype not in {"Edit", "Document", "Text"} or not desc.is_visible():
                    continue
                label = (desc.window_text() or desc.element_info.name or "").strip()
                cid = self._register(desc, f"text:{label}:{desc.element_info.automation_id}")
                read_only = False
                try:
                    read_only = not bool(desc.is_enabled())
                except Exception:
                    pass
                items.append(
                    {
                        "id": cid,
                        "label": label,
                        "controlType": ctype,
                        "readOnly": read_only,
                        "logicalControlId": self._locator_map.get(cid, {}).get("logicalControlId", cid),
                    }
                )
        except Exception:
            pass
        return items

    def list_scroll_regions(self) -> list[dict[str, Any]]:
        regions: list[dict[str, Any]] = []
        try:
            for desc in self.window.descendants():
                class_name = str(desc.element_info.class_name or "")
                ctype = str(desc.element_info.control_type)
                if "Scroll" not in ctype and "Scroll" not in class_name:
                    continue
                cid = self._register(desc, f"scroll:{ctype}:{desc.element_info.automation_id}")
                regions.append({"id": cid})
        except Exception:
            pass
        return regions

    def list_dialogs(self) -> list[dict[str, Any]]:
        dialogs: list[dict[str, Any]] = []
        pid = self.window.process_id()
        for dialog in list_dialog_windows(self.desktop, parent_pid=pid):
            title = dialog.window_text() or "dialog"
            cid = f"dialog:{title}"
            dialogs.append({"id": cid, "title": title, "control": dialog})
        return dialogs

    def capture_controls(self) -> list[dict[str, Any]]:
        section = _infer_section_from_title(self.window.window_text())
        descendants = list(self.window.descendants())
        labels = _collect_labels(descendants)
        controls: list[dict[str, Any]] = []
        order = 0
        for desc in descendants:
            try:
                if not desc.is_visible():
                    continue
                result = _capture_control(desc, order, labels, section, self.window.window_text())
                order += 1
                if hasattr(result, "to_dict"):
                    controls.append(result.to_dict())
                else:
                    controls.append(result)
            except Exception:
                continue
        return controls

    def execute_action(self, action: PlannedAction) -> dict[str, Any]:
        control = self._control_map.get(action.control_id)
        if action.action_kind == "dialog_visit":
            for dialog in self.list_dialogs():
                if dialog.get("id") == action.control_id:
                    dlg = dialog.get("control")
                    if dlg is not None:
                        return {"status": "completed", "dialog": dialog.get("title")}
            return {"status": "failed", "error": "dialog not found"}

        if control is None:
            return {"status": "failed", "error": "control not found"}

        kind = action.action_kind
        if kind == "tab_select":
            ok, err = select_tab_item(control)
            return {"status": "completed" if ok else "failed", "error": err}
        if kind == "combo_open":
            ctype = str(control.element_info.control_type)
            options, warnings, enum_status = enumerate_combo_options(control, ctype, expand=True)
            return {
                "status": "completed" if options or enum_status == "success" else "failed",
                "enumerationStatus": enum_status,
                "warnings": warnings,
                "options": [{"label": o.label, "index": o.index} for o in options],
            }
        if kind == "combo_select":
            original = _read_value(control, "ComboBox")
            ok, err = select_combo_option(control, action.target_value, original)
            if not ok:
                return {"status": "failed", "error": err}
            return {
                "status": "completed",
                "restore": {"kind": "combo", "control_id": action.control_id, "original": original},
            }
        if kind == "checkbox_toggle":
            original = read_toggle_state(control)
            ok, err = toggle_checkbox(control, action.target_value)
            if not ok:
                return {"status": "failed", "error": err}
            return {
                "status": "completed",
                "restore": {"kind": "checkbox", "control_id": action.control_id, "original": original},
            }
        if kind == "radio_select":
            ok, err = select_radio(control)
            return {"status": "completed" if ok else "failed", "error": err}
        if kind == "text_field_focus":
            ok, err = focus_text_field(control)
            return {"status": "completed" if ok else "failed", "error": err}
        if kind == "scroll_down":
            added, exhausted = scroll_container(control)
            return {"status": "completed", "revealed_controls": [f"scroll+{added}"], "exhausted": exhausted}
        if kind == "button_invoke":
            ok, err = invoke_button(control)
            return {"status": "completed" if ok else "failed", "error": err}
        return {"status": "skipped", "error": f"unsupported action {kind}"}


def _capture_window_tree(
    window,
    session: Hot2000Session,
    worker_id: str,
    *,
    section_hint: str | None = None,
    dialog_title: str | None = None,
) -> SectionCapture:
    from catalog_auto_scan import _capture_window_tree as capture_fn

    return capture_fn(
        window,
        session,
        worker_id,
        section_hint=section_hint,
        dialog_title=dialog_title,
    )


def _apply_restore(surface: PywinautoUiSurface, restore: dict[str, Any]) -> str:
    control = surface._control_map.get(restore.get("control_id", ""))
    if control is None:
        return "skipped"
    kind = restore.get("kind")
    original = restore.get("original")
    if kind == "combo":
        return restore_combo_value(control, original)
    if kind == "checkbox":
        toggle_checkbox(control, original)
        return "direct"
    return "skipped"


def _write_scan_report(state: ScanState, engine: CrawlEngine, raw_dir: Path) -> None:
    report = {
        "scanId": state.scan_id,
        "recorderVersion": RECORDER_VERSION,
        "hot2000Version": state.hot2000_version,
        "completionReason": engine.completion_reason or state.status,
        "durationSeconds": state.totals.get("elapsedSeconds"),
        "counters": engine.counters.to_dict(),
        "warnings": state.warnings + engine.warnings,
        "failedActions": [a.to_dict() for a in engine.actions.values() if a.status == "failed"],
        "blockedDestructive": engine.counters.blocked_destructive,
        "inaccessibleControls": engine.counters.inaccessible_controls,
        "statesDiscovered": engine.counters.states_discovered,
        "actionsCompleted": engine.counters.actions_completed,
    }
    report_dir = raw_dir
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "scan-report.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )


def _assert_crawler_callbacks(
    *,
    progress: Callable[..., Any],
    control_check: Callable[..., Any],
    checkpoint: Callable[..., Any] | None = None,
    progress_with_pct: Callable[..., Any] | None = None,
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


def _append_job_diagnostic(job_dir: Path, lines: list[str]) -> None:
    path = job_dir / "worker-error.log"
    try:
        existing = path.read_text(encoding="utf-8") if path.is_file() else ""
        block = "\n".join(lines) + "\n"
        path.write_text(existing + block, encoding="utf-8")
    except Exception:
        pass


def _sync_engine_to_state(
    state: ScanState,
    engine: CrawlEngine,
    *,
    surface: PywinautoUiSurface | None = None,
) -> None:
    state.crawl_counters = engine.counters.to_dict()
    state.current_action = engine.current_action_label()
    state.last_action = state.current_action
    state.completion_reason = engine.completion_reason
    state.progress_percent = engine.progress_percent()
    state.pending = [a.to_dict() for a in engine.pending]
    state.actions = {k: v.to_dict() for k, v in engine.actions.items()}
    state.visited_state_digests = engine.state_records
    state.state_records = engine.state_records
    state.engine_state = engine.export_state()
    if surface is not None:
        window_title, section, tab_breadcrumb = surface._context()
        state.last_window = window_title
        state.last_screen = surface.screen_id()
        state.current_screen_key = surface.screen_id()
        state.navigation_path = tab_breadcrumb
    state.update_totals()


TRANSIENT_ACTION_KINDS = frozenset({"combo_select", "checkbox_toggle", "radio_select"})


def run_stateful_ui_crawl(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    session: Hot2000Session,
    state: ScanState,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    checkpoint: CheckpointFn = None,
    progress_with_pct: Callable[..., None] | None = None,
    target_section_id: str | None = None,
    target_section_label: str | None = None,
    scan_mode: str = "full",
) -> tuple[ScanState, CrawlEngine]:
    """Run the stateful UI crawler until queue drains or a hard limit is hit."""
    _assert_crawler_callbacks(
        progress=progress,
        control_check=control_check,
        checkpoint=checkpoint,
        progress_with_pct=progress_with_pct,
    )
    crawler_step = "init"
    raw_dir = job_dir / "raw-desktop"
    try:
        crawler_step = "restore-engine"
        engine = CrawlEngine(_limits_from_env())
        engine.target_section_id = target_section_id or state.section_id
        state.scan_mode = scan_mode
        state.section_id = target_section_id or state.section_id
        state.section_label = target_section_label or state.section_label
        if state.engine_state:
            engine.restore_from_state(state.engine_state)
        elif state.actions:
            engine.restore_from_state(
                {
                    "actions": state.actions,
                    "stateRecords": state.state_records,
                    "pending": state.pending,
                    "crawlCounters": state.crawl_counters,
                }
            )
        engine.started_monotonic = time.monotonic()
        resumed = bool(state.engine_state or state.actions)

        crawler_step = "attach-window"
        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        hot2000_version = state.hot2000_version or detect_hot2000_version()
        state.hot2000_pid = main_window.process_id()
        surface = PywinautoUiSurface(
            main_window,
            desktop,
            hot2000_version,
            worker_id,
            target_section_id=engine.target_section_id,
            target_section_label=target_section_label or state.section_label,
        )

        event_feed = ScanEventFeed(max_events=200)
        if state.event_feed:
            event_feed.restore(state.event_feed, state.last_ui_change_at)
        dependency_evidence: list[dict[str, Any]] = list(state.dependency_evidence or [])
        controls_before_action: list[dict[str, Any]] | None = None

        def emit_live_progress(
            stage: str,
            message: str,
            action: PlannedAction | None = None,
            *,
            phase: str = "before",
        ) -> None:
            pct = engine.progress_percent()
            window_title, section, tab_breadcrumb = surface._context()
            if action is not None:
                state.live_execution_state = build_live_execution_state(
                    scan_id=state.scan_id,
                    window=window_title,
                    section=section,
                    tab_breadcrumb=tab_breadcrumb,
                    action_kind=action.action_kind,
                    control_label=action.control_label,
                    logical_control_id=action.logical_control_id or action.control_id,
                    option_label=action.target_value if action.action_kind == "combo_select" else "",
                    option_index=action.option_index,
                    option_count=action.option_count,
                    branch_path=action.branch_path or engine.branch_path,
                    phase=phase,
                    counters=engine.counters.to_dict(),
                    pending_actions=len(engine.pending),
                    last_ui_change_at=event_feed.last_ui_change_at,
                )
            _sync_engine_to_state(state, engine, surface=surface)
            meta = state.build_progress_meta(worker_id)
            if progress_with_pct:
                progress_with_pct(job_id, stage, message, pct, meta)
            else:
                progress(job_id, stage, message)

        if not resumed:
            crawler_step = "initial-fingerprint"
            fp = surface.fingerprint()
            crawler_step = "initial-capture-controls"
            engine.record_state(fp, {"controls": surface.capture_controls()})
            crawler_step = "initial-plan-actions"
            engine.plan_actions_for_surface(surface, fp, screen_id=surface.screen_id())
            event_feed.emit(
                ScanEvent(
                    kind="scan_started",
                    scan_id=state.scan_id,
                    window=surface._context()[0],
                    section=surface._context()[1],
                    tab_breadcrumb=surface._context()[2],
                    message=(
                        f"Section crawl started for {target_section_label or target_section_id}"
                        if scan_mode == "section"
                        else "Automatic full scan started"
                    ),
                )
            )

        while True:
            crawler_step = "control-check"
            control_check()
            elapsed_min = (time.monotonic() - engine.started_monotonic) / 60.0
            state.totals["elapsedSeconds"] = int(time.monotonic() - engine.started_monotonic)
            if engine.should_terminate(elapsed_min):
                break

            action = engine.pop_next()
            if not action:
                engine.completion_reason = "queue_drained"
                break

            engine.current_action = action
            action.status = "running"
            _append_job_diagnostic(
                job_dir,
                [
                    f"crawler_step=execute-action",
                    f"action_kind={action.action_kind}",
                    f"action_control_id={action.control_id}",
                    f"action_control_label={action.control_label}",
                    f"action_key={action.action_key}",
                ],
            )
            emit_live_progress(
                "scanning",
                engine.current_action_label() or "Exploring UI…",
                action,
                phase="before",
            )
            event_feed.emit(
                ScanEvent(
                    kind=f"{action.action_kind}_started",
                    scan_id=state.scan_id,
                    window=surface._context()[0],
                    section=surface._context()[1],
                    tab_breadcrumb=surface._context()[2],
                    action_kind=action.action_kind,
                    logical_control_id=action.logical_control_id or action.control_id,
                    label=action.control_label,
                    option_label=action.target_value if action.action_kind == "combo_select" else "",
                    option_index=action.option_index,
                    option_count=action.option_count,
                    branch_path=action.branch_path or engine.branch_path,
                    counters=engine.counters.to_dict(),
                    message=engine.current_action_label() or action.action_kind,
                )
            )

            crawler_step = "execute-action"
            wait_for_ui_stability(main_window)
            if action.action_kind == "combo_select":
                controls_before_action = surface.capture_controls()
            result = surface.execute_action(action)
            wait_for_ui_stability(main_window)

            status = result.get("status", "failed")
            terminal_status = status if status in {"completed", "skipped", "blocked"} else "failed"
            engine.mark_action(
                action.action_key,
                terminal_status,
                revealed_controls=result.get("revealed_controls") or [],
                restore_strategy=result.get("restore_strategy"),
            )

            restore = result.get("restore")
            if restore and terminal_status == "completed":
                strategy = _apply_restore(surface, restore)
                action.restore_strategy = strategy
                wait_for_ui_stability(main_window)

            if terminal_status == "completed":
                if action.action_kind == "tab_select":
                    engine.counters.tabs_visited += 1
                    engine.ledger.mark_completed(
                        action.logical_control_id or action.control_id,
                        action.prerequisite_signature or engine.prerequisite_signature(),
                        action_kind=action.action_kind,
                    )
                elif action.action_kind == "combo_open":
                    engine.counters.combos_opened += 1
                    engine._opened_combos.add((action.screen_id, action.control_id))
                    options = result.get("options") or []
                    engine.register_combo_options(action.control_id, options)
                    engine.plan_combo_select_actions(
                        action.state_digest,
                        action.control_id,
                        action.control_label,
                        options,
                        action.action_key,
                        screen_id=action.screen_id,
                        logical_control_id=action.logical_control_id or action.control_id,
                    )
                    event_feed.emit(
                        ScanEvent(
                            kind="combo_options_captured",
                            scan_id=state.scan_id,
                            section=surface._context()[1],
                            tab_breadcrumb=surface._context()[2],
                            label=action.control_label,
                            option_count=len(options),
                            message=f'{action.control_label}: option list captured ({len(options)})',
                        )
                    )
                elif action.action_kind == "combo_select":
                    controls_after = surface.capture_controls()
                    if controls_before_action is not None:
                        delta = compute_dependency_delta(
                            snapshot_controls(controls_before_action),
                            snapshot_controls(controls_after),
                            source_control_id=action.logical_control_id or action.control_id,
                            source_label=action.control_label,
                            selected_option_label=action.target_value,
                            selected_option_ui_index=action.option_index,
                        )
                        dependency_evidence.append(delta)
                        state.dependency_evidence = dependency_evidence[-500:]
                    engine.ledger.mark_option_completed(
                        action.logical_control_id or action.control_id,
                        action.prerequisite_signature or engine.prerequisite_signature(),
                        action.target_value,
                        failed=False,
                    )
                    fp = surface.fingerprint()
                    engine.plan_newly_revealed_controls(
                        surface,
                        fp,
                        screen_id=surface.screen_id(),
                    )
                elif action.action_kind == "checkbox_toggle":
                    engine.counters.checkbox_states_explored += 1
                    engine.ledger.mark_completed(
                        action.logical_control_id or action.control_id,
                        action.prerequisite_signature or engine.prerequisite_signature(),
                        action_kind=action.action_kind,
                    )
                elif action.action_kind == "radio_select":
                    engine.counters.radio_choices_explored += 1
                    engine.ledger.mark_completed(
                        action.logical_control_id or action.control_id,
                        action.prerequisite_signature or engine.prerequisite_signature(),
                        action_kind=action.action_kind,
                    )
                elif action.action_kind == "text_field_focus":
                    engine.counters.text_fields_visited += 1
                    engine.ledger.mark_focused(
                        action.logical_control_id or action.control_id,
                        action.prerequisite_signature or engine.prerequisite_signature(),
                    )
                    event_feed.emit(
                        ScanEvent(
                            kind="text_field_focused",
                            scan_id=state.scan_id,
                            section=surface._context()[1],
                            tab_breadcrumb=surface._context()[2],
                            label=action.control_label,
                            message=f'focused field "{action.control_label}"',
                        )
                    )
                elif action.action_kind == "dialog_visit":
                    engine.counters.dialogs_visited += 1
                elif action.action_kind == "scroll_down":
                    engine.counters.scroll_regions_completed += 1

                if action.action_kind not in TRANSIENT_ACTION_KINDS and action.action_kind != "combo_open":
                    crawler_step = "post-action-fingerprint"
                    new_fp = surface.fingerprint()
                    digest = engine.record_state(
                        new_fp,
                        {"controls": surface.capture_controls()},
                    )
                    crawler_step = "capture-window-tree"
                    capture = _capture_window_tree(main_window, session, worker_id)
                    screen_key = new_fp.key()
                    _save_incremental(job_dir, capture, screen_key=screen_key)
                    summary = _summarize_capture(capture)
                    for inaccessible in capture.inaccessible_controls:
                        state.record_inaccessible({**inaccessible, "screenKey": screen_key})
                    engine.counters.inaccessible_controls = len(state.inaccessible_records)
                    state.record_screen(
                        screen_key,
                        title=capture.window_title,
                        status="partial" if summary["inaccessibleControls"] else "captured",
                        source_file=f"{capture.section}.json",
                        section=capture.section,
                        controls=summary["controlsDiscovered"],
                        dropdowns=summary["comboBoxes"],
                        options=summary["dropdownOptions"],
                        inaccessible=summary["inaccessibleControls"],
                    )
                    engine.plan_actions_for_surface(
                        surface,
                        new_fp,
                        base_digest=digest,
                        screen_id=surface.screen_id(),
                    )

                    for dialog in surface.list_dialogs():
                        dlg = dialog.get("control")
                        if dlg is None:
                            continue
                        dlg_capture = _capture_window_tree(
                            dlg,
                            session,
                            worker_id,
                            section_hint=capture.section,
                            dialog_title=dialog.get("title"),
                        )
                        dialog_file = raw_dir / "dialogs" / f"{dialog.get('id', 'dialog').replace(':', '_')}.json"
                        dialog_file.parent.mkdir(parents=True, exist_ok=True)
                        dialog_file.write_text(
                            json.dumps(dlg_capture.to_dict(), indent=2) + "\n",
                            encoding="utf-8",
                        )
                        safe_close_dialog(dlg)

            emit_live_progress(
                "scanning",
                engine.current_action_label() or "Exploring UI…",
                action,
                phase="after",
            )
            state.event_feed = event_feed.export()
            state.last_ui_change_at = event_feed.last_ui_change_at
            _sync_engine_to_state(state, engine, surface=surface)
            state.save(raw_dir)
            crawler_step = "checkpoint"
            if checkpoint:
                coverage_report = build_full_coverage_report(
                    state, job_id=job_id, worker_id=worker_id
                )
                payload = state.to_navigation_dict()
                payload["coverage"] = coverage_report
                meta = state.build_progress_meta(worker_id)
                checkpoint(job_id, payload, meta)

        crawler_step = "coverage"
        _sync_engine_to_state(state, engine)
        state.finalize_status()
        state.save(raw_dir)
        _write_scan_report(state, engine, raw_dir)
        return state, engine
    except Exception as exc:
        raise RuntimeError(
            f"Phase 2 crawler failed at {crawler_step}: {type(exc).__name__}: {exc}"
        ) from exc
