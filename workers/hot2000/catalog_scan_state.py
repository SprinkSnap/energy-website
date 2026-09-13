"""Resumable scan state and navigation graph persistence."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_models import RECORDER_VERSION


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ScanState:
    scan_id: str = ""
    hot2000_version: str | None = None
    fixture: str = "baseline-general.h2k"
    status: str = "pending"  # pending|running|paused|stopped|complete|stopped-partial
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
            "statesDiscovered": int(counters.get("states_discovered", len(self.visited_state_digests))),
            "statesCompleted": int(counters.get("states_completed", 0)),
            "actionsDiscovered": int(counters.get("actions_discovered", len(self.actions))),
            "actionsCompleted": int(counters.get("actions_completed", 0)),
            "actionsPending": len(self.pending),
            "tabsVisited": int(counters.get("tabs_visited", 0)),
            "combosOpened": int(counters.get("combos_opened", 0)),
            "comboOptionsSeen": int(counters.get("combo_options_seen", 0)),
            "checkboxBranchesExplored": int(counters.get("checkbox_states_explored", 0)),
            "radioChoicesExplored": int(counters.get("radio_choices_explored", 0)),
            "dialogsVisited": int(counters.get("dialogs_visited", 0)),
            "scrollRegionsCompleted": int(counters.get("scroll_regions_completed", 0)),
            "completionPercentage": self.progress_percent,
        }

    def build_progress_meta(self, worker_id: str) -> dict[str, Any]:
        self.update_totals()
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
            "dropdownOptions": self.totals.get("optionsCaptured", 0),
            "inaccessibleControls": self.totals.get("inaccessibleControls", 0),
            "navigationFailures": self.totals.get("navigationFailures", 0),
            "blockedUnsafeActions": self.totals.get("blockedUnsafeActions", 0),
            "currentAction": self.current_action,
            "hot2000Pid": self.hot2000_pid,
            **{k: v for k, v in self.totals.items() if k not in {"completionPercentage"}},
        }


def _to_snake(name: str) -> str:
    out = []
    for ch in name:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out).lstrip("_")
