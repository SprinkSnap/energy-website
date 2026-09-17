"""Resumable scan state and navigation graph persistence."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_models import FINGERPRINT_VERSION, RECORDER_VERSION, SCHEMA_VERSION
from catalog_scan_accounting import classify_scan_result


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ScanState:
    scan_id: str = ""
    hot2000_version: str | None = None
    fixture: str = "baseline-general.h2k"
    status: str = "pending"  # pending|running|paused|complete|complete_with_gaps|partial|failed|stopped_partial
    control: str = "running"  # running|paused|stopped
    started_at: str = ""
    updated_at: str = ""
    current_screen_key: str | None = None
    current_dialog_title: str | None = None
    navigation_path: list[str] = field(default_factory=list)
    visited_screens: dict[str, int] = field(default_factory=dict)
    screens: dict[str, dict[str, Any]] = field(default_factory=dict)
    edges: list[dict[str, Any]] = field(default_factory=list)
    pending: list[dict[str, Any]] = field(default_factory=list)
    failed: list[dict[str, Any]] = field(default_factory=list)
    blocked_unsafe: list[dict[str, Any]] = field(default_factory=list)
    audit_trail: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    totals: dict[str, int] = field(default_factory=dict)
    allow_medium_confidence: bool = False
    crawl_counters: dict[str, int] = field(default_factory=dict)
    current_action: str | None = None
    completion_reason: str | None = None
    progress_percent: int = 0
    hot2000_pid: int | None = None
    actions: dict[str, dict[str, Any]] = field(default_factory=dict)
    visited_state_digests: dict[str, int] = field(default_factory=dict)
    inaccessible_records: list[dict[str, Any]] = field(default_factory=list)
    continuation_of: str | None = None
    parent_job_id: str | None = None
    last_screen: str | None = None
    last_window: str | None = None
    last_action: str | None = None
    fixture_hash: str | None = None
    coverage_report: dict[str, Any] = field(default_factory=dict)
    state_records: dict[str, dict[str, Any]] = field(default_factory=dict)
    engine_state: dict[str, Any] = field(default_factory=dict)
    live_execution_state: dict[str, Any] = field(default_factory=dict)
    event_feed: list[dict[str, Any]] = field(default_factory=list)
    dependency_evidence: list[dict[str, Any]] = field(default_factory=list)
    last_ui_change_at: str | None = None
    section_id: str | None = None
    section_label: str | None = None
    scan_mode: str = "full"
    crawl_started: bool = False

    @classmethod
    def new(cls, *, hot2000_version: str | None, fixture: str) -> ScanState:
        return cls(
            scan_id=uuid.uuid4().hex,
            hot2000_version=hot2000_version,
            fixture=fixture,
            status="running",
            control="running",
            started_at=_now_iso(),
            updated_at=_now_iso(),
        )

    @classmethod
    def from_navigation_dict(cls, data: dict[str, Any]) -> ScanState:
        state = cls()
        mapping = {
            "scanId": "scan_id",
            "hot2000Version": "hot2000_version",
            "fixture": "fixture",
            "status": "status",
            "control": "control",
            "startedAt": "started_at",
            "updatedAt": "updated_at",
            "currentScreenKey": "current_screen_key",
            "currentDialogTitle": "current_dialog_title",
            "navigationPath": "navigation_path",
            "visitedScreens": "visited_screens",
            "screens": "screens",
            "edges": "edges",
            "pending": "pending",
            "failed": "failed",
            "blockedUnsafe": "blocked_unsafe",
            "auditTrail": "audit_trail",
            "warnings": "warnings",
            "totals": "totals",
            "crawlCounters": "crawl_counters",
            "currentAction": "current_action",
            "completionReason": "completion_reason",
            "progressPercent": "progress_percent",
            "hot2000Pid": "hot2000_pid",
            "actions": "actions",
            "visitedStateDigests": "visited_state_digests",
            "inaccessibleRecords": "inaccessible_records",
            "continuationOf": "continuation_of",
            "parentJobId": "parent_job_id",
            "lastScreen": "last_screen",
            "lastWindow": "last_window",
            "lastAction": "last_action",
            "fixtureHash": "fixture_hash",
            "coverage": "coverage_report",
            "stateRecords": "state_records",
            "engineState": "engine_state",
            "liveExecutionState": "live_execution_state",
            "eventFeed": "event_feed",
            "dependencyEvidence": "dependency_evidence",
            "lastUiChangeAt": "last_ui_change_at",
            "sectionId": "section_id",
            "sectionLabel": "section_label",
            "scanMode": "scan_mode",
            "crawlStarted": "crawl_started",
        }
        for src, dest in mapping.items():
            if src in data:
                setattr(state, dest, data[src])
        return state

    @classmethod
    def load(cls, path: Path) -> ScanState | None:
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            state = cls()
            for key, value in data.items():
                if hasattr(state, _to_snake(key)):
                    setattr(state, _to_snake(key), value)
            return state
        except Exception:
            return None

    def _serialize_pending(self) -> list[dict[str, Any]]:
        serializable: list[dict[str, Any]] = []
        for item in self.pending:
            copy = {k: v for k, v in item.items() if k != "target"}
            serializable.append(copy)
        return serializable

    def save(self, raw_dir: Path) -> None:
        raw_dir.mkdir(parents=True, exist_ok=True)
        self.updated_at = _now_iso()
        nav_payload = self.to_navigation_dict()
        nav_payload["pending"] = self._serialize_pending()
        nav_path = raw_dir / "navigation.json"
        nav_path.write_text(json.dumps(nav_payload, indent=2) + "\n", encoding="utf-8")
        state_payload = self.to_state_dict()
        state_payload["pending"] = self._serialize_pending()
        state_path = raw_dir / "scan-state.json"
        state_path.write_text(json.dumps(state_payload, indent=2) + "\n", encoding="utf-8")

    def to_navigation_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "fingerprintVersion": FINGERPRINT_VERSION,
            "hot2000Version": self.hot2000_version,
            "scanId": self.scan_id,
            "recorderVersion": RECORDER_VERSION,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
            "status": self.status,
            "control": self.control,
            "screens": self.screens,
            "edges": self.edges,
            "pending": self.pending,
            "failed": self.failed,
            "blockedUnsafe": self.blocked_unsafe,
            "warnings": self.warnings,
            "totals": self.totals,
            "crawlCounters": self.crawl_counters,
            "currentAction": self.current_action,
            "completionReason": self.completion_reason,
            "progressPercent": self.progress_percent,
            "hot2000Pid": self.hot2000_pid,
            "actions": self.actions,
            "visitedStateDigests": self.visited_state_digests,
            "inaccessibleRecords": self.inaccessible_records,
            "continuationOf": self.continuation_of,
            "parentJobId": self.parent_job_id,
            "lastScreen": self.last_screen,
            "lastWindow": self.last_window,
            "lastAction": self.last_action,
            "fixtureHash": self.fixture_hash,
            "coverage": self.coverage_report,
            "stateRecords": self.state_records,
            "engineState": self.engine_state,
            "liveExecutionState": self.live_execution_state,
            "eventFeed": self.event_feed[-200:],
            "dependencyEvidence": self.dependency_evidence[-200:],
            "lastUiChangeAt": self.last_ui_change_at,
            "sectionId": self.section_id,
            "sectionLabel": self.section_label,
            "scanMode": self.scan_mode,
        }

    def to_state_dict(self) -> dict[str, Any]:
        return {
            **self.to_navigation_dict(),
            "fixture": self.fixture,
            "currentScreenKey": self.current_screen_key,
            "currentDialogTitle": self.current_dialog_title,
            "navigationPath": self.navigation_path,
            "visitedScreens": self.visited_screens,
            "auditTrail": self.audit_trail[-200:],
            "allowMediumConfidence": self.allow_medium_confidence,
        }

    def record_screen(
        self,
        screen_key: str,
        *,
        title: str,
        status: str,
        source_file: str | None = None,
        section: str | None = None,
        reachability: str = "automatic",
        controls: int = 0,
        dropdowns: int = 0,
        options: int = 0,
        inaccessible: int = 0,
    ) -> None:
        existing = self.screens.get(screen_key, {})
        self.screens[screen_key] = {
            **existing,
            "title": title,
            "status": status,
            "section": section,
            "sourceFile": source_file,
            "reachability": reachability,
            "controls": controls,
            "dropdowns": dropdowns,
            "options": options,
            "inaccessible": inaccessible,
            "updatedAt": _now_iso(),
        }
        self.visited_screens[screen_key] = self.visited_screens.get(screen_key, 0) + 1

    def should_visit(self, screen_key: str) -> bool:
        return self.visited_screens.get(screen_key, 0) < 3

    def enqueue(self, item: dict[str, Any]) -> None:
        key = item.get("actionKey")
        if key and any(p.get("actionKey") == key for p in self.pending):
            return
        self.pending.append(item)

    def pop_pending(self) -> dict[str, Any] | None:
        if not self.pending:
            return None
        return self.pending.pop(0)

    def record_edge(
        self,
        from_key: str,
        to_key: str,
        action: dict[str, Any],
        status: str,
    ) -> None:
        edge = {
            "from": from_key,
            "to": to_key,
            "action": action,
            "status": status,
            "at": _now_iso(),
        }
        if not any(
            e.get("from") == from_key
            and e.get("to") == to_key
            and e.get("action", {}).get("label") == action.get("label")
            for e in self.edges
        ):
            self.edges.append(edge)

    def record_audit(
        self,
        *,
        from_screen: str,
        action: dict[str, Any],
        result: str,
        destination: str | None = None,
        error: str | None = None,
        duration_ms: int | None = None,
    ) -> None:
        self.audit_trail.append(
            {
                "timestamp": _now_iso(),
                "fromScreen": from_screen,
                "action": action,
                "result": result,
                "destinationScreen": destination,
                "error": error,
                "durationMs": duration_ms,
            }
        )

    def update_totals(self) -> None:
        controls = sum(int(s.get("controls", 0)) for s in self.screens.values())
        dropdowns = sum(int(s.get("dropdowns", 0)) for s in self.screens.values())
        options = sum(int(s.get("options", 0)) for s in self.screens.values())
        inaccessible = sum(int(s.get("inaccessible", 0)) for s in self.screens.values())
        captured = sum(
            1 for s in self.screens.values() if s.get("status") in {"captured", "guided-captured"}
        )
        partial = sum(1 for s in self.screens.values() if s.get("status") == "partial")
        counters = self.crawl_counters or {}
        action_discovered = int(counters.get("actions_discovered", len(self.actions)))
        action_completed = int(counters.get("actions_completed", 0))
        action_failed = int(counters.get("actions_failed", 0))
        action_skipped = int(counters.get("actions_skipped", 0))
        action_pending = int(counters.get("actions_pending", max(0, action_discovered - action_completed - action_failed - action_skipped)))
        state_discovered = int(counters.get("states_discovered", len(self.state_records)))
        state_completed = int(counters.get("states_completed", 0))
        state_failed = int(counters.get("states_failed", 0))
        state_skipped = int(counters.get("states_skipped", 0))
        state_pending = int(counters.get("states_pending", max(0, state_discovered - state_completed - state_failed - state_skipped)))
        self.totals = {
            "screensDiscovered": len(self.screens),
            "screensCaptured": captured,
            "screensPartial": partial,
            "controlsCaptured": controls,
            "dropdownsCaptured": dropdowns,
            "optionsCaptured": options,
            "inaccessibleControls": inaccessible,
            "navigationFailures": len(self.failed),
            "blockedUnsafeActions": len(self.blocked_unsafe),
            "loopsPrevented": sum(
                1 for count in self.visited_screens.values() if count >= 3
            ),
            "statesDiscovered": state_discovered,
            "statesCompleted": state_completed,
            "statesFailed": state_failed,
            "statesSkipped": state_skipped,
            "statesPending": state_pending,
            "actionsDiscovered": action_discovered,
            "actionsCompleted": action_completed,
            "actionsFailed": action_failed,
            "actionsSkipped": action_skipped,
            "actionsPending": action_pending,
            "tabsVisited": int(counters.get("tabs_visited", 0)),
            "combosOpened": int(counters.get("combos_opened", 0)),
            "comboOptionsCaptured": int(counters.get("combo_options_captured", counters.get("combo_options_seen", 0))),
            "checkboxBranchesExplored": int(counters.get("checkbox_states_explored", 0)),
            "radioChoicesExplored": int(counters.get("radio_choices_explored", 0)),
            "dialogsVisited": int(counters.get("dialogs_visited", 0)),
            "scrollRegionsCompleted": int(counters.get("scroll_regions_completed", 0)),
            "completionPercentage": self.progress_percent,
        }

    def build_progress_meta(self, worker_id: str) -> dict[str, Any]:
        self.update_totals()
        counters = self.crawl_counters or {}
        return {
            "scanId": self.scan_id,
            "scanStatus": self.status,
            "hot2000Version": self.hot2000_version,
            "workerId": worker_id,
            "capturedAt": self.updated_at,
            "completionPercentage": self.progress_percent,
            "screensDiscovered": self.totals.get("screensDiscovered", 0),
            "screensCaptured": self.totals.get("screensCaptured", 0),
            "controlsDiscovered": self.totals.get("controlsCaptured", 0),
            "dropdownOptions": counters.get("combo_options_discovered", self.totals.get("optionsCaptured", 0)),
            "inaccessibleControls": self.totals.get("inaccessibleControls", 0),
            "navigationFailures": self.totals.get("navigationFailures", 0),
            "blockedUnsafeActions": self.totals.get("blockedUnsafeActions", 0),
            "currentAction": self.current_action,
            "hot2000Pid": self.hot2000_pid,
            "resultClassification": classify_scan_result(self),
            "lastScreen": self.last_screen,
            "lastWindow": self.last_window,
            "lastAction": self.last_action,
            "liveExecutionState": self.live_execution_state,
            "liveEventFeed": self.event_feed[-50:],
            "windowTitle": self.live_execution_state.get("window") or self.last_window,
            "tabBreadcrumb": self.live_execution_state.get("tabBreadcrumb") or self.navigation_path,
            "currentControl": self.live_execution_state.get("control"),
            "currentOption": self.live_execution_state.get("option"),
            "optionIndex": self.live_execution_state.get("optionIndex"),
            "optionCount": self.live_execution_state.get("optionCount"),
            "branchDisplay": self.live_execution_state.get("branchDisplay"),
            "textFieldsDiscovered": counters.get("text_fields_discovered", 0),
            "textFieldsVisited": counters.get("text_fields_visited", 0),
            "tabsDiscovered": counters.get("tabs_total", 0),
            "tabsVisited": counters.get("tabs_visited", 0),
            "combosDiscovered": counters.get("combos_total", 0),
            "combosOpened": counters.get("combos_opened", 0),
            "combosCompleted": counters.get("combos_completed", 0),
            "comboOptionsDiscovered": counters.get(
                "combo_options_discovered", counters.get("combo_options_captured", 0)
            ),
            "comboOptionsTested": counters.get("combo_options_tested", 0),
            "comboOptionsCaptured": counters.get("combo_options_captured", 0),
            "comboOptionsSeen": counters.get("combo_options_discovered", counters.get("combo_options_captured", 0)),
            "checkboxBranchesDiscovered": counters.get("checkboxes_total", 0),
            "checkboxBranchesCompleted": counters.get("checkbox_states_explored", 0),
            "checkboxBranchesExplored": counters.get("checkbox_states_explored", 0),
            "radioChoicesDiscovered": counters.get("radio_groups_discovered", counters.get("radio_groups_total", 0)),
            "radioChoicesCompleted": counters.get("radio_choices_explored", 0),
            "radioChoicesExplored": counters.get("radio_choices_explored", 0),
            "buttonsDiscovered": counters.get("buttons_total", 0),
            "buttonsVisited": counters.get("buttons_visited", 0),
            "dialogsDiscovered": counters.get("dialogs_total", 0),
            "dialogsVisited": counters.get("dialogs_visited", 0),
            "statesDiscovered": self.totals.get("statesDiscovered", 0),
            "statesCompleted": self.totals.get("statesCompleted", 0),
            "actionsDiscovered": self.totals.get("actionsDiscovered", 0),
            "actionsCompleted": self.totals.get("actionsCompleted", 0),
            "actionsPending": self.totals.get("actionsPending", 0),
            "elapsedSeconds": self.totals.get("elapsedSeconds", 0),
            "crawlStarted": self.crawl_started,
            "lastUiChangeAt": self.last_ui_change_at,
            "sectionId": self.section_id,
            "sectionLabel": self.section_label,
            "section": self.section_id,
            "scanMode": self.scan_mode,
            "foreignSectionControlsIgnored": (self.engine_state or {}).get(
                "foreignSectionControlsIgnored", 0
            ),
            "foreignSectionActionsBlocked": (self.engine_state or {}).get(
                "foreignSectionActionsBlocked", 0
            ),
            "sectionBoundaryViolations": (self.engine_state or {}).get(
                "sectionBoundaryViolations", 0
            ),
            "sectionRestorations": (self.engine_state or {}).get("sectionRestorations", 0),
            "sectionScopeLock": (self.engine_state or {}).get("sectionScopeLock"),
            **{k: v for k, v in self.totals.items() if k not in {"completionPercentage"}},
        }

    def finalize_status(self) -> None:
        self.status = classify_scan_result(self)
        if self.status == "complete" and self.completion_reason not in {None, "", "queue_drained"}:
            self.status = "partial"
        self.control = "stopped" if self.status in {
            "complete",
            "complete_with_gaps",
            "partial",
            "failed",
            "stopped_partial",
            "completed_with_limits",
        } else self.control

    def record_inaccessible(self, record: dict[str, Any]) -> None:
        self.inaccessible_records.append(record)


def _to_snake(name: str) -> str:
    out = []
    for ch in name:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out).lstrip("_")
