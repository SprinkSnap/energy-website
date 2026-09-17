"""Compact scan event model and live execution state for Phase 2 crawler."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_clock(ts: str | None = None) -> str:
    value = ts or _now_iso()
    try:
        return value[11:19]
    except Exception:
        return value


@dataclass
class ScanEvent:
    kind: str
    timestamp: str = field(default_factory=_now_iso)
    scan_id: str = ""
    lineage_id: str = ""
    window: str = ""
    section: str = ""
    tab_breadcrumb: list[str] = field(default_factory=list)
    action_kind: str = ""
    logical_control_id: str = ""
    label: str = ""
    option_label: str = ""
    option_index: int | None = None
    option_count: int | None = None
    branch_path: list[dict[str, Any]] = field(default_factory=list)
    result: str = ""
    duration_ms: int | None = None
    counters: dict[str, int] = field(default_factory=dict)
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "timestamp": self.timestamp,
            "scanId": self.scan_id,
            "lineageId": self.lineage_id,
            "window": self.window,
            "section": self.section,
            "tabBreadcrumb": self.tab_breadcrumb,
            "actionKind": self.action_kind,
            "logicalControlId": self.logical_control_id,
            "label": self.label,
            "optionLabel": self.option_label,
            "optionIndex": self.option_index,
            "optionCount": self.option_count,
            "branchPath": self.branch_path,
            "result": self.result,
            "durationMs": self.duration_ms,
            "counters": self.counters,
            "message": self.message,
            "clock": _format_clock(self.timestamp),
        }


class ScanEventFeed:
    def __init__(self, max_events: int = 200) -> None:
        self.max_events = max_events
        self.events: list[ScanEvent] = []
        self.last_ui_change_at: str | None = None

    def restore(self, events: list[dict[str, Any]] | None, last_ui_change_at: str | None = None) -> None:
        self.events = []
        for raw in events or []:
            if isinstance(raw, dict):
                self.events.append(
                    ScanEvent(
                        kind=str(raw.get("kind") or ""),
                        timestamp=str(raw.get("timestamp") or _now_iso()),
                        scan_id=str(raw.get("scanId") or ""),
                        lineage_id=str(raw.get("lineageId") or ""),
                        window=str(raw.get("window") or ""),
                        section=str(raw.get("section") or ""),
                        tab_breadcrumb=list(raw.get("tabBreadcrumb") or []),
                        action_kind=str(raw.get("actionKind") or ""),
                        logical_control_id=str(raw.get("logicalControlId") or ""),
                        label=str(raw.get("label") or ""),
                        option_label=str(raw.get("optionLabel") or ""),
                        option_index=raw.get("optionIndex"),
                        option_count=raw.get("optionCount"),
                        branch_path=list(raw.get("branchPath") or []),
                        result=str(raw.get("result") or ""),
                        duration_ms=raw.get("durationMs"),
                        counters=dict(raw.get("counters") or {}),
                        message=str(raw.get("message") or raw.get("display") or ""),
                    )
                )
        self.last_ui_change_at = last_ui_change_at

    def emit(self, event: ScanEvent) -> None:
        self.events.append(event)
        self.last_ui_change_at = event.timestamp
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events :]

    def export(self) -> list[dict[str, Any]]:
        return [event.to_dict() for event in self.events]

    def display_lines(self, limit: int = 12) -> list[str]:
        lines: list[str] = []
        for event in reversed(self.events[-limit:]):
            breadcrumb = " > ".join(event.tab_breadcrumb) if event.tab_breadcrumb else event.section
            prefix = f"{_format_clock(event.timestamp)} {breadcrumb}".strip()
            if event.option_label and event.option_count and event.option_index is not None:
                detail = (
                    f'{event.label or event.logical_control_id}: testing '
                    f'"{event.option_label}" ({event.option_index}/{event.option_count})'
                )
            elif event.message:
                detail = event.message
            else:
                detail = event.label or event.action_kind or event.kind
            lines.append(f"{prefix}\n             {detail}")
        return lines


def build_live_execution_state(
    *,
    scan_id: str,
    window: str,
    section: str,
    tab_breadcrumb: list[str],
    action_kind: str,
    control_label: str,
    logical_control_id: str,
    option_label: str = "",
    option_index: int | None = None,
    option_count: int | None = None,
    branch_path: list[dict[str, Any]] | None = None,
    phase: str = "before",
    counters: dict[str, int] | None = None,
    pending_actions: int = 0,
    last_ui_change_at: str | None = None,
) -> dict[str, Any]:
    branch = branch_path or []
    branch_display = " > ".join(
        f'{entry.get("label") or entry.get("controlId")}={entry.get("option")}'
        for entry in branch
        if entry.get("option")
    )
    action_label = action_kind.replace("_", " ")
    combos_completed = int((counters or {}).get("combos_completed", 0))
    combos_total = int((counters or {}).get("combos_total", 0))
    if action_kind == "combo_select" and option_label:
        action_label = "Testing dropdown option"
    elif action_kind == "combo_open":
        action_label = "Capturing dropdown options"
    elif action_kind == "text_field_focus":
        action_label = "Focusing text field"
    elif action_kind == "tab_select":
        action_label = "Selecting tab"
    return {
        "scanId": scan_id,
        "phase": phase,
        "window": window,
        "section": section,
        "tabBreadcrumb": tab_breadcrumb,
        "actionKind": action_kind,
        "action": action_label,
        "control": control_label,
        "logicalControlId": logical_control_id,
        "option": option_label,
        "optionIndex": option_index,
        "optionCount": option_count,
        "branchPath": branch,
        "branchDisplay": branch_display,
        "pendingActions": pending_actions,
        "lastUiChangeAt": last_ui_change_at,
        "counters": counters or {},
        "combosCompleted": combos_completed,
        "combosTotal": combos_total,
        "updatedAt": _now_iso(),
    }
